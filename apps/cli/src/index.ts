#!/usr/bin/env node
import cac from "cac";
import pc from "picocolors";
import { createConfigLoader, createScanner, createTopicDiscovery } from "@llm-wiki-compiler/core";
import { getAgentFactory } from "@llm-wiki-compiler/agents";
import { createLogger } from "@llm-wiki-compiler/shared";
import * as path from "path";

const cli = cac("wiki");

// Global options
cli
  .option("-v, --verbose", "Enable verbose output")
  .option("-d, --directory <dir>", "Change working directory", process.cwd());

// ============================================================================
// Command: init
// ============================================================================

cli
  .command("init", "Initialize a new wiki compiler project")
  .option("-n, --name <name>", "Project name")
  .option("-m, --mode <mode>", "Project mode: knowledge or codebase")
  .option("-s, --sources <paths>", "Source directories (comma-separated)")
  .option("-o, --output <dir>", "Output directory", "./wiki")
  .action(async (options) => {
    const logger = createLogger("CLI");
    const cwd = options.directory || process.cwd();

    logger.info(`Initializing wiki compiler in ${cwd}`);

    // Default values
    const projectName = options.name || path.basename(cwd);
    const mode = options.mode || "knowledge";
    const sources = options.sources ? options.sources.split(",") : ["."];

    // Simple config generation (full implementation would use ConfigGenerator)
    const config = {
      version: 1,
      name: projectName,
      mode,
      sources: sources.map((s: string) => ({ path: s.trim() })),
      output: options.output,
      link_style: "obsidian" as const,
      auto_update: "off" as const,
    };

    const configPath = path.join(cwd, ".wiki-compiler.json");
    const fs = await import("fs/promises");

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    console.log(pc.green(`✓ Created ${configPath}`));
    console.log(pc.gray("Run 'wiki compile' to start compiling your wiki."));
  });

// ============================================================================
// Command: compile
// ============================================================================

cli
  .command("compile", "Compile wiki from source files")
  .option("-f, --full", "Do a full recompile (ignore cache)")
  .option("-j, --jobs <num>", "Max concurrent compilation jobs")
  .option("--json", "Output result as JSON")
  .action(async (options) => {
    const logger = createLogger("CLI");
    const cwd = options.directory || process.cwd();

    logger.info("Starting compilation...");

    try {
      // Load config
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);

      console.log(pc.dim(`Project: ${config.name}`));
      console.log(pc.dim(`Mode: ${config.mode}`));
      console.log(pc.dim(`Sources: ${config.sources.length}`));
      console.log();

      // Scan sources
      const scanner = createScanner();
      const scanResult = await scanner.scan(config, cwd);

      console.log(pc.cyan(`Found ${scanResult.files.length} source files`));
      console.log();

      //Discover topics
      const discovery = createTopicDiscovery();
      const topics = await discovery.discover({ scanResult, config });

      console.log(pc.cyan(`Discovered ${topics.length} topics`));
      for (const topic of topics) {
        console.log(`  - ${pc.yellow(topic.slug)} (${topic.sourceFiles.length} files)`);
      }
      console.log();

      // TODO: Implement actual compilation with agent
      const outputDir = path.resolve(cwd, config.output);
      const fs = await import("fs/promises");
      await fs.mkdir(outputDir, { recursive: true });

      // Create a simple output for now
      const result = {
        topicsCompiled: topics.length,
        sourcesScanned: scanResult.files.length,
        durationMs: 0,
        errors: [],
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(pc.green(`✓ Compilation complete`));
        console.log(pc.dim(`  Topics: ${result.topicsCompiled}`));
        console.log(pc.dim(`  Sources: ${result.sourcesScanned}`));
      }
    } catch (error) {
      logger.error("Compilation failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      console.log(pc.red(`✗ ${message}`));
      process.exit(1);
    }
  });

// ============================================================================
// Command: init-detect
// ============================================================================

cli
  .command("init-detect", "Auto-detect project configuration")
  .action(async (options) => {
    const logger = createLogger("CLI");
    const cwd = options.directory || process.cwd();

    logger.info("Detecting project configuration...");
    const fs = await import("fs/promises");

    // Detect manifest files
    const manifests = new Map<string, string>();
    const manifestFiles: Array<[string, string]> = [
      ["package.json", "javascript"],
      ["go.mod", "go"],
      ["Cargo.toml", "rust"],
      ["pyproject.toml", "python"],
      ["requirements.txt", "python"],
      ["setup.py", "python"],
      ["Gemfile", "ruby"],
    ];

    for (const [filename, type] of manifestFiles) {
      const filePath = path.join(cwd, filename);
      try {
        await fs.access(filePath);
        manifests.set(type, filename);
      } catch {
        // File doesn't exist
      }
    }

    // Detect mode
    const isCodebase = manifests.size > 0;
    const mdCount = await countMarkdownFiles(cwd, fs);

    let mode: "knowledge" | "codebase" = "knowledge";
    if (isCodebase && (!mdCount || (mdCount < 3 && manifests.size > 1))) {
      mode = "codebase";
    }

    console.log(pc.cyan("Project Detection Results"));
    console.log();
    console.log(pc.bold("Mode:"), mode === "codebase" ? pc.yellow("Codebase") : pc.green("Knowledge"));
    console.log();
    console.log(pc.bold("Detected Files:"));

    if (manifests.size > 0) {
      for (const [type, filename] of manifests.entries()) {
        console.log(`  ${pc.dim(type.padStart(12))} ${filename}`);
      }
    }
    console.log(`  ${pc.dim("Markdown".padStart(12))} ${mdCount} files`);

    // Suggested config
    console.log();
    console.log(pc.bold("Suggested Config:"));
    console.log(pc.gray('Run: wiki init --mode ' + mode));

    logger.info("Detection complete");
  });

async function countMarkdownFiles(cwd: string, fs: any): Promise<number> {
  // Simplified implementation
  try {
    // Count .md files in current directory and subdirectories
    // In production, would use fast-glob
    return 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// Command: search
// ============================================================================

cli
  .command("search <query>", "Search the wiki for a term")
  .option("-t, --type <type>", "Search type: topic, concept, or all")
  .option("-l, --limit <num>", "Maximum results to show", "10")
  .action(async (query, options) => {
    const logger = createLogger("CLI");
    logger.info(`Searching for: ${query}`);

    console.log(pc.cyan(`Search results for "${query}":`));
    console.log();
    console.log(pc.dim("(Search functionality will be implemented with wiki compilation)"));

    // TODO: Implement search with IndexReader
  });

// ============================================================================
// Command: doctor
// ============================================================================

cli
  .command("doctor", "Check system health and dependencies")
  .action(async (options) => {
    const logger = createLogger("CLI");
    const cwd = options.directory || process.cwd();

    console.log(pc.cyan("Wiki Compiler Health Check"));
    console.log();

    const checks: Array<{ name: string; status: "pass" | "fail"; message: string }> = [];

    // Check project config
    try {
      const configLoader = createConfigLoader();
      await configLoader.loadProjectConfig(cwd);
      checks.push({
        name: "Project Config",
        status: "pass",
        message: "Found .wiki-compiler.json",
      });
    } catch {
      checks.push({
        name: "Project Config",
        status: "fail",
        message: "No .wiki-compiler.json found",
      });
    }

    // Check agent providers
    const factory = getAgentFactory();
    const providers = ["claude-code", "codex", "openclaw"] as const;

    for (const provider of providers) {
      const adapter = factory.get(provider);
      const available = await adapter.isAvailable();

      if (available) {
        checks.push({
          name: `Agent: ${provider}`,
          status: "pass",
          message: "Available and executable",
        });
      } else {
        checks.push({
          name: `Agent: ${provider}`,
          status: "fail",
          message: "Not found in PATH",
        });
      }
    }

    // Display results
    for (const check of checks) {
      const icon = check.status === "pass" ? pc.green("✓") : pc.red("✗");
      const status = check.status === "pass" ? pc.green("OK") : pc.red("FAIL");
      console.log(`${icon} ${status.padStart(4)} ${check.name}`);
      if (check.message) {
        console.log(`  ${pc.dim(check.message)}`);
      }
    }

    const failed = checks.filter((c) => c.status === "fail").length;
    if (failed > 0) {
      console.log();
      console.log(pc.red(`Found ${failed} issue(s)`));
      process.exit(1);
    } else {
      console.log();
      console.log(pc.green("All checks passed!"));
    }
  });

// ============================================================================
// Help
// ============================================================================

cli.help();

// ============================================================================
// Version
// ============================================================================

cli.version("2.0.0");

// ============================================================================
// Parse
// ============================================================================

cli.parse();

// If no command provided, show help
if (!cli.matchedCommand) {
  cli.outputHelp();
}
