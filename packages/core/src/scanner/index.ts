import * as path from "path";
import * as fs from "fs/promises";
import { glob } from "fast-glob";
import type { ProjectConfig, SourceFile, ScanResult, SourceConfig } from "@llm-wiki-compiler/types";
import { WikiCompilerError, ErrorCodes } from "@llm-wiki-compiler/types";
import { isMarkdownFile, isCodeFile, getFileExtension } from "@llm-wiki-compiler/shared";

// ============================================================================
// Scanner Service
// ============================================================================

export interface ScannerService {
  scan(config: ProjectConfig, projectRoot: string): Promise<ScanResult>;
  scanSource(config: SourceConfig, projectRoot: string): Promise<SourceFile[]>;
}

export class Scanner implements ScannerService {
  private readonly DEFAULT_EXCLUDE_PATTERNS = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.pytest_cache/**",
    "**/__pycache__/**",
    "**/vendor/**",
    "**/.cache/**",
    "**/.turbo/**",
  ];

  async scan(config: ProjectConfig, projectRoot: string): Promise<ScanResult> {
    const allSourceFiles: SourceFile[] = [];

    for (const source of config.sources) {
      const sourceFiles = await this.scanSource(source, projectRoot);
      allSourceFiles.push(...sourceFiles);
    }

    // Deduplicate by path
    const seen = new Set<string>();
    const uniqueFiles: SourceFile[] = [];
    for (const file of allSourceFiles) {
      if (!seen.has(file.path)) {
        seen.add(file.path);
        uniqueFiles.push(file);
      }
    }

    return {
      files: uniqueFiles,
      mode: config.mode,
      projectRoot,
    };
  }

  async scanSource(source: SourceConfig, projectRoot: string): Promise<SourceFile[]> {
    const basePath = path.isAbsolute(source.path) ? source.path : path.join(projectRoot, source.path);

    // Check if base path exists
    try {
      const stats = await fs.stat(basePath);
      if (!stats.isDirectory() && !stats.isFile()) {
        throw new WikiCompilerError(
          ErrorCodes.SCAN_PATH_NOT_FOUND,
          `Source path is not a valid file or directory: ${basePath}`
        );
      }
    } catch (error) {
      throw new WikiCompilerError(
        ErrorCodes.SCAN_PATH_NOT_FOUND,
        `Cannot access source path: ${basePath}`,
        error
      );
    }

    // Build pattern for glob
    const patterns = this.buildGlobPatterns(basePath, source.exclude);

    try {
      const filePaths = await glob(patterns, {
        cwd: projectRoot,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
      });

      const sourceFiles: SourceFile[] = [];

      for (const filePath of filePaths) {
        try {
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, "utf-8");

          sourceFiles.push({
            path: path.relative(projectRoot, filePath),
            mtimeMs: stats.mtimeMs,
            content,
            title: this.extractTitle(content, filePath),
            language: this.detectLanguage(filePath, content),
          });
        } catch (error) {
          console.warn(`Failed to read file ${filePath}:`, error);
          // Continue with other files even if one fails
        }
      }

      return sourceFiles;
    } catch (error) {
      throw new WikiCompilerError(
        ErrorCodes.SCAN_FAILED,
        `Failed to scan source path: ${basePath}`,
        error
      );
    }
  }

  private buildGlobPatterns(basePath: string, excludePatterns?: string[]): string[] {
    const isFile = basePath.endsWith(".md") || basePath.match(/\.[a-z]{2,4}$/i);
    const relativePath = path.isAbsolute(basePath) ? path.relative(process.cwd(), basePath) : basePath;

    if (isFile) {
      return [relativePath];
    }

    // Build pattern: basePath/**/*.<ext>
    const pattern = path.join(relativePath, "**", "*");

    return [pattern];
  }

  protected shouldExclude(filePath: string, excludePatterns?: string[]): boolean {
    const allExcludes = [...this.DEFAULT_EXCLUDE_PATTERNS, ...(excludePatterns || [])];

    for (const pattern of allExcludes) {
      // Convert glob pattern to regex for matching
      const regex = this.globToRegex(pattern);
      if (regex.test(filePath)) {
        return true;
      }
    }

    return false;
  }

  private globToRegex(glob: string): RegExp {
    const pattern = glob
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\./g, "\\.");
    return new RegExp(`^${pattern}(/|$)`);
  }

  protected extractTitle(content: string, filePath: string): string | undefined {
    if (!isMarkdownFile(filePath)) {
      return undefined;
    }

    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() || undefined;
  }

  protected detectLanguage(filePath: string, content: string): string | undefined {
    const ext = getFileExtension(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      go: "go",
      rs: "rust",
      java: "java",
      kt: "kotlin",
      swift: "swift",
      rb: "ruby",
      php: "php",
      cs: "csharp",
      cpp: "cpp",
      c: "c",
      h: "c",
      cppm: "cpp",
      md: "markdown",
      markdown: "markdown",
      yaml: "yaml",
      yml: "yaml",
      json: "json",
      xml: "xml",
      html: "html",
      css: "css",
      scss: "scss",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      sql: "sql",
      proto: "protobuf",
      graphql: "graphql",
      gql: "graphql",
    };

    return languageMap[ext] || undefined;
  }

  private isKnowledgeFile(filename: string, knowledgePatterns: string[]): boolean {
    const baseName = path.basename(filename).toLowerCase();

    // Exact filename matches
    if (knowledgePatterns.some(p => p.toLowerCase() === baseName)) {
      return true;
    }

    // Glob pattern matches
    for (const pattern of knowledgePatterns) {
      if (pattern.startsWith("**")) {
        const patternWithoutStars = pattern.replace(/\*\*/g, "");
        if (baseName && baseName.includes(patternWithoutStars)) {
          return true;
        }
      } else if (pattern.endsWith(".md")) {
        const patternWithoutExt = pattern.slice(0, -3).toLowerCase();
        if (baseName && baseName.startsWith(patternWithoutExt)) {
          return true;
        }
      }
    }

    return false;
  }
}

// ============================================================================
// Codebase Scanner (for codebase mode)
// ============================================================================

export enum KnowledgeFileType {
  DOCUMENTATION = "documentation",
  API_CONTRACT = "api_contract",
  ARCHITECTURE = "architecture",
  INFRASTRUCTURE = "infrastructure",
  OPERATIONS = "operations",
}

export class CodebaseScanner extends Scanner {
  private readonly DEFAULT_KNOWLEDGE_PATTERNS = [
    "README.md",
    "CLAUDE.md",
    "AGENTS.md",
    "ARCHITECTURE.md",
    "ARCHITECTURE",
    "CONTRIBUTING.md",
    "DESIGN.md",
    "docs/**/*.md",
    "*.proto",
    "*.graphql",
    "openapi.yaml",
    "openapi.json",
    "ADR-*.md",
    "docs/adr/*.md",
    "docker-compose.yml",
    "Dockerfile",
    "k8s/**/*.yaml",
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    "CHANGELOG.md",
    ".env.example",
  ];

  async scanKnowledgeFiles(
    config: ProjectConfig,
    projectRoot: string,
    topicDirectory: string
  ): Promise<SourceFile[]> {
    const knowledgePatterns = config.knowledge_files || this.DEFAULT_KNOWLEDGE_PATTERNS;
    const result: SourceFile[] = [];

    for (const pattern of knowledgePatterns) {
      // Convert pattern to glob format
      const globPattern = this.normalizePattern(pattern, topicDirectory);

      try {
        const files = await glob(globPattern, {
          cwd: projectRoot,
          absolute: true,
          onlyFiles: true,
          followSymbolicLinks: false,
        });

        for (const filePath of files) {
          if (this.shouldExclude(filePath, config.sources[0].exclude)) {
            continue;
          }

          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, "utf-8");

          result.push({
            path: path.relative(projectRoot, filePath),
            mtimeMs: stats.mtimeMs,
            content,
            title: this.extractTitle(content, filePath),
            language: this.detectLanguage(filePath, content),
          });
        }
      } catch (error) {
        console.warn(`Failed to scan glob pattern ${globPattern}:`, error);
      }
    }

    return result;
  }

  async scanSourceFiles(
    config: ProjectConfig,
    projectRoot: string,
    topicDirectory: string,
    maxFiles: number = 20
  ): Promise<SourceFile[]> {
    const codeExtensions = config.code_extensions || ["ts", "js", "py", "go", "rs", "java"];
    const result: SourceFile[] = [];

    // Key file patterns to include
    const keyFilePatterns = [
      "index.ts",
      "main.ts",
      "app.ts",
      "package.json",
      "tsconfig.json",
      "types.ts",
      "models.ts",
      "routes.ts",
      "index.js",
      "main.js",
      "models.py",
      "routes.py",
      "types.go",
      "handlers.go",
      "*.go",
    ];

    for (const pattern of keyFilePatterns) {
      const globPattern = path.join(topicDirectory, pattern);

      try {
        const files = await glob(globPattern, {
          cwd: projectRoot,
          absolute: true,
          onlyFiles: true,
          followSymbolicLinks: false,
        });

        for (const filePath of files) {
          if (result.length >= maxFiles) break;

          const ext = getFileExtension(filePath).toLowerCase();
          if (!codeExtensions.includes(ext) && !pattern.includes("*")) continue;

          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, "utf-8");

          result.push({
            path: path.relative(projectRoot, filePath),
            mtimeMs: stats.mtimeMs,
            content,
            language: this.detectLanguage(filePath, content),
          });
        }
      } catch (error) {
        // Silently skip failed patterns
      }

      if (result.length >= maxFiles) break;
    }

    return Promise.resolve(result);
  }

  private normalizePattern(pattern: string, basePath: string): string {
    if (pattern.startsWith("**/")) {
      return pattern;
    }
    if (pattern.includes("*")) {
      return pattern;
    }
    return path.join(basePath, pattern);
  }

  detectProjectType(projectRoot: string): string | null {
    const manifestFiles = {
      "package.json": "javascript",
      "go.mod": "go",
      "Cargo.toml": "rust",
      "pyproject.toml": "python",
      "requirements.txt": "python",
      "setup.py": "python",
      "Gemfile": "ruby",
      "*.sln": "csharp",
      "*.csproj": "csharp",
      "Package.swift": "swift",
      "pom.xml": "java",
      "build.gradle": "java",
    };

    for (const [file, type] of Object.entries(manifestFiles)) {
      // This would require actual file system check
      // Omitted for brevity
    }

    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createScanner(): ScannerService {
  return new Scanner();
}

export function createCodebaseScanner(): CodebaseScanner {
  return new CodebaseScanner();
}
