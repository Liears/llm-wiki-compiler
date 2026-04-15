import * as path from "path";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import { z } from "zod";
import type {
  ProjectConfig,
  SourceConfig,
  AgentProviderConfig,
  AutoUpdate,
  LinkStyle,
  ServiceDiscovery,
  ArticleSectionConfig,
  GlobalConfig,
  AppConfig,
} from "@llm-wiki-compiler/types";
import { WikiCompilerError, ErrorCodes } from "@llm-wiki-compiler/types";

// ============================================================================
// Schema Validation
// ============================================================================

const ArticleSectionConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
});

const SourceConfigSchema = z.object({
  path: z.string(),
  exclude: z.array(z.string()).optional(),
});

const AgentProviderConfigSchema = z.object({
  provider: z.enum(["claude-code", "codex", "openclaw"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  timeout_ms: z.number().optional(),
  max_concurrency: z.number().optional(),
});

const AppConfigSchema = z.object({
  port: z.number().optional(),
  host: z.string().optional(),
});

const TargetModeSchema = z.enum(["knowledge", "codebase"]);

const ProjectConfigSchema = z
  .object({
    version: z.number(),
    name: z.string().min(1),
    mode: TargetModeSchema,
    sources: z.array(SourceConfigSchema).min(1),
    output: z.string(),
    service_discovery: z.enum(["auto", "manual"]).optional(),
    knowledge_files: z.array(z.string()).optional(),
    deep_scan: z.boolean().optional(),
    code_extensions: z.array(z.string()).optional(),
    topic_hints: z.array(z.string()).optional(),
    article_sections: z.array(ArticleSectionConfigSchema).optional(),
    link_style: z.enum(["obsidian", "markdown"]).optional(),
    auto_update: z.enum(["off", "prompt", "always"]).optional(),
    agent: AgentProviderConfigSchema.optional(),
    app: AppConfigSchema.optional(),
  })
  .strict();

const GlobalConfigSchema = z
  .object({
    defaultAgent: z.enum(["claude-code", "codex", "openclaw"]).optional(),
    projectsPath: z.string().optional(),
    logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  })
  .strict();

// ============================================================================
// Config Loader
// ============================================================================

export interface ConfigLoader {
  loadProjectConfig(cwd: string): Promise<ProjectConfig>;
  loadGlobalConfig(): Promise<GlobalConfig>;
  validateProjectConfig(config: unknown): ProjectConfig;
}

export class FileSystemConfigLoader implements ConfigLoader {
  private readonly CONFIG_FILENAME = ".wiki-compiler.json";
  private readonly GLOBAL_CONFIG_DIR = path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".wiki-compiler"
  );
  private readonly GLOBAL_CONFIG_FILENAME = "config.json";

  async loadProjectConfig(cwd: string): Promise<ProjectConfig> {
    const configPath = this.findConfigPath(cwd);

    if (!configPath) {
      throw new WikiCompilerError(
        ErrorCodes.CONFIG_MISSING,
        `No project configuration found in ${cwd} or any parent directory`
      );
    }

    try {
      const content = await fs.readFile(configPath, "utf-8");
      const rawConfig = JSON.parse(content);
      return this.validateAndNormalize(rawConfig, path.dirname(configPath));
    } catch (error) {
      if (error instanceof WikiCompilerError) {
        throw error;
      }
      throw new WikiCompilerError(
        ErrorCodes.CONFIG_INVALID,
        `Failed to load project config from ${configPath}`,
        error
      );
    }
  }

  async loadGlobalConfig(): Promise<GlobalConfig> {
    const configPath = path.join(this.GLOBAL_CONFIG_DIR, this.GLOBAL_CONFIG_FILENAME);

    if (!existsSync(configPath)) {
      return this.getGlobalConfigDefaults();
    }

    try {
      const content = await fs.readFile(configPath, "utf-8");
      const rawConfig = JSON.parse(content);
      const validated = GlobalConfigSchema.parse(rawConfig);
      return { ...this.getGlobalConfigDefaults(), ...validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new WikiCompilerError(
          ErrorCodes.CONFIG_INVALID,
          `Invalid global config: ${error.message}`
        );
      }
      console.warn(
        `Failed to load global config from ${configPath}, using defaults: ${error}`
      );
      return this.getGlobalConfigDefaults();
    }
  }

  private findConfigPath(startDir: string): string | null {
    let currentDir = path.resolve(startDir);

    while (currentDir !== path.parse(currentDir).root) {
      const configPath = path.join(currentDir, this.CONFIG_FILENAME);
      if (existsSync(configPath)) {
        return configPath;
      }
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  private validateAndNormalize(rawConfig: unknown, projectRoot: string): ProjectConfig {
    const config = this.validateProjectConfig(rawConfig);

    // Normalize paths relative to project root
    const normalizedSources: SourceConfig[] = config.sources.map((source) => ({
      ...source,
      path: path.resolve(projectRoot, source.path),
    }));

    const normalizedOutput = path.resolve(projectRoot, config.output);

    return {
      ...config,
      sources: normalizedSources,
      output: normalizedOutput,
    };
  }

  validateProjectConfig(config: unknown): ProjectConfig {
    try {
      const parsed = ProjectConfigSchema.parse(config);

      // Additional validation
      if (parsed.version !== 1) {
        throw new WikiCompilerError(
          ErrorCodes.CONFIG_VERSION_MISMATCH,
          `Unsupported config version: ${parsed.version}. Expected: 1`
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof WikiCompilerError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new WikiCompilerError(
          ErrorCodes.CONFIG_INVALID,
          `Invalid project config: ${error.message}`
        );
      }
      throw new WikiCompilerError(
        ErrorCodes.CONFIG_INVALID,
        "Failed to validate project config",
        error
      );
    }
  }

  private getGlobalConfigDefaults(): GlobalConfig {
    return {
      defaultAgent: "claude-code",
      projectsPath: path.join(this.GLOBAL_CONFIG_DIR, "projects.json"),
      logLevel: "info",
    };
  }

  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    const configDir = this.GLOBAL_CONFIG_DIR;
    const configPath = path.join(configDir, this.GLOBAL_CONFIG_FILENAME);

    // Ensure directory exists
    await fs.mkdir(configDir, { recursive: true });

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  }
}

// ============================================================================
// Config Generator (for init command)
// ============================================================================

export interface ConfigGeneratorOptions {
  name: string;
  mode: "knowledge" | "codebase";
  sources: string[];
  output?: string;
  agent?: AgentProviderConfig;
  articleSections?: ArticleSectionConfig[];
  topicHints?: string[];
}

export class ConfigGenerator {
  generate(options: ConfigGeneratorOptions): ProjectConfig {
    const config: ProjectConfig = {
      version: 1,
      name: options.name,
      mode: options.mode,
      sources: options.sources.map((s) => ({ path: s })),
      output: options.output || "wiki",
    };

    if (options.articleSections) {
      config.article_sections = options.articleSections;
    }

    if (options.topicHints && options.topicHints.length > 0) {
      config.topic_hints = options.topicHints;
    }

    if (options.mode === "codebase") {
      config.service_discovery = "auto";
      config.knowledge_files = [
        "README.md",
        "CLAUDE.md",
        "ARCHITECTURE.md",
        "LICENSE",
        "CHANGELOG.md",
      ];
      config.deep_scan = false;
      config.code_extensions = ["ts", "tsx", "js", "jsx", "py", "go", "rs", "java"];
    }

    if (options.agent) {
      config.agent = options.agent;
    }

    return config;
  }

  async writeConfig(config: ProjectConfig, cwd: string): Promise<void> {
    const configPath = path.join(cwd, ".wiki-compiler.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConfigLoader(): ConfigLoader {
  return new FileSystemConfigLoader();
}

export function getConfigLoader(): ConfigLoader {
  return createConfigLoader();
}
