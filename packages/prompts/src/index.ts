import * as path from "path";
import * as fs from "fs/promises";
import { PathResolver } from "@llm-wiki-compiler/shared";

// ============================================================================
// Prompt Types
// ============================================================================

export interface PromptLoadOptions {
  variables?: Record<string, string | number | boolean>;
}

export interface PromptLoader {
  load(name: string, options?: PromptLoadOptions): Promise<string>;
  loadRaw(name: string): Promise<string>;
}

export interface PromptTemplate {
  name: string;
  content: string;
  variables: string[];
}

// ============================================================================
// Prompt Asset Loader
// ============================================================================

export class AssetPromptLoader implements PromptLoader {
  private assetsPath: string;
  private cache = new Map<string, string>();

  constructor(assetsPath: string) {
    this.assetsPath = path.resolve(assetsPath);
  }

  private resolveAssetPath(name: string, type: "commands" | "skills"): string {
    const possiblePaths = [
      path.join(this.assetsPath, type, `${name}.md`),
      path.join(this.assetsPath, type, `${name.toUpperCase()}.md`),
      path.join(this.assetsPath, type, name),
      path.join(this.assetsPath, "skills", `${name}.md`),
      path.join(this.assetsPath, "commands", `${name}.md`),
    ];

    return possiblePaths.find((p) => p.endsWith(".md")) || possiblePaths[0];
  }

  async loadRaw(name: string): Promise<string> {
    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // Determine if it's a skill or command
    const isSkill = name.includes("skill") || name.includes("compiler");
    const type = isSkill ? "skills" : "commands";
    const assetPath = this.resolveAssetPath(name, type);

    try {
      const content = await fs.readFile(assetPath, "utf-8");
      this.cache.set(name, content);
      return content;
    } catch (error) {
      throw new Error(`Failed to load prompt "${name}" from ${assetPath}: ${error}`);
    }
  }

  async load(name: string, options?: PromptLoadOptions): Promise<string> {
    const content = await this.loadRaw(name);

    if (!options?.variables || Object.keys(options.variables).length === 0) {
      return content;
    }

    return this.render(content, options.variables);
  }

  private render(content: string, variables: Record<string, string | number | boolean>): string {
    let rendered = content;

    // Replace {{variable_name}} patterns
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      rendered = rendered.replace(pattern, String(value));
    }

    return rendered;
  }

  clearCache(): void {
    this.cache.clear();
  }

  listAvailablePrompts(): { skills: string[]; commands: string[] } {
    return {
      skills: this.listAssetsInDir(path.join(this.assetsPath, "skill*")),
      commands: this.listAssetsInDir(path.join(this.assetsPath, "cmd*")),
    };
  }

  private listAssetsInDir(pattern: string): string[] {
    try {
      const dir = path.dirname(pattern);
      const glob = path.basename(pattern);
      // Simple implementation - in production use fast-glob or similar
      return [];
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPromptLoader(): PromptLoader {
  // Resolve path relative to this package
  const packagePath = __dirname;
  const assetsPath = path.join(packagePath, "..", "assets");
  return new AssetPromptLoader(assetsPath);
}

// ============================================================================
// Prompt Names (constants for type safety)
// ============================================================================

export const PromptNames = {
  // Commands
  INIT: "wiki-init",
  COMPILE: "wiki-compile",
  INGEST: "wiki-ingest",
  SEARCH: "wiki-search",
  QUERY: "wiki-query",
  LINT: "wiki-lint",
  VISUALIZE: "wiki-visualize",

  // Skills
  WIKI_COMPILER: "wiki-compiler",
} as const;

export type PromptName = (typeof PromptNames)[keyof typeof PromptNames];

// ============================================================================
// Prompt Manager
// ============================================================================

export class PromptManager {
  private loader: PromptLoader;
  private templates = new Map<string, PromptTemplate>();

  constructor(loader?: PromptLoader) {
    this.loader = loader || createPromptLoader();
  }

  async load(name: string, options?: PromptLoadOptions): Promise<string> {
    return this.loader.load(name, options);
  }

  async loadTemplate(name: string): Promise<PromptTemplate> {
    const content = await this.loader.loadRaw(name);
    const variables = this.extractVariables(content);

    const template: PromptTemplate = {
      name,
      content,
      variables,
    };

    this.templates.set(name, template);
    return template;
  }

  private extractVariables(content: string): string[] {
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;

    while ((match = variablePattern.exec(content)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }
}
