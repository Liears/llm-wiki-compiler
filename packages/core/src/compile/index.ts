import type {
  CompilePlan,
  CompilePlanInput,
  CompileResult,
  CompileError,
  TopicArticle,
  TopicCandidate,
  ConceptArticle,
  ArticleKind,
  ProjectConfig,
} from "@llm-wiki-compiler/types";
import { createLogger, asyncMap, withTimeout, retry } from "@llm-wiki-compiler/shared";
import { createTopicDiscovery } from "../discovery";

// ============================================================================
// Compile Planner
// ============================================================================

export class CompilePlanner {
  private logger = createLogger("CompilePlanner");
  private topicDiscovery = createTopicDiscovery();

  async plan(input: CompilePlanInput): Promise<CompilePlan> {
    const { config, state, scanResult } = input;

    this.logger.info("Planning compilation...");

    // Determine mode
    const mode = state ? "incremental" : "full";

    // Discover topics from scan result
    const discoveredTopics = await this.topicDiscovery.discover({
      scanResult,
      config,
      existingState: state,
    });

    // In v1, compile all discovered topics (add isNew and hasChanges flags based on state)
    const existingTopicSlugs = new Set(state?.topics.map((t: TopicState) => t.slug) || []);
    const topicsToCompile = discoveredTopics.map((topic) => ({
      slug: topic.slug,
      title: topic.title,
      sourceFiles: topic.sourceFiles,
      isNew: !existingTopicSlugs.has(topic.slug),
      hasChanges: !existingTopicSlugs.has(topic.slug), // In v1, treat new topics as changed
    }));

    const conceptsEnabled = true;

    // Set concurrency
    const maxConcurrency = config.agent?.max_concurrency ?? 2;

    const plan: CompilePlan = {
      mode,
      topicsToCompile,
      conceptsEnabled,
      maxConcurrency,
    };

    this.logger.info(
      `Plan created: ${mode} mode, ${topicsToCompile.length} topics to compile, max concurrency: ${maxConcurrency}`
    );

    return plan;
  }
}

// ============================================================================
// Compile Executor
// ============================================================================

export interface CompileExecutorOptions {
  maxConcurrency?: number;
  onProgress?: (phase: string, current: number, total: number) => void;
  onTopicComplete?: (slug: string, success: boolean) => void;
}

export class CompileExecutor {
  private logger = createLogger("CompileExecutor");

  constructor(
    private options: CompileExecutorOptions = {}
  ) {}

  async execute(
    plan: CompilePlan,
    context: {
      config: ProjectConfig;
      topicCompiler: TopicCompiler;
      conceptCompiler?: ConceptCompiler;
    }
  ): Promise<CompileResult> {
    const { config, topicCompiler, conceptCompiler } = context;
    this.logger.info("Executing compile plan...");

    const errors: CompileError[] = [];
    const topicsUpdated: string[] = [];
    const topicsCreated: string[] = [];
    const conceptsCreated: string[] = [];
    const conceptsUpdated: string[] = [];

    try {
      // Phase 1: Compile topic articles
      this.options.onProgress?.("Compiling topics", 0, plan.topicsToCompile.length);

      const topicResults = await asyncMap(
        plan.topicsToCompile,
        async (item, index) => {
          this.options.onProgress?.("Compiling topics", index + 1, plan.topicsToCompile.length);

          try {
            const result = await retry(
              () =>
                withTimeout(
                  topicCompiler.compile(item),
                  config.agent?.timeout_ms ?? 120000
                ),
              { maxAttempts: 2, delayMs: 1000 }
            );

            this.options.onTopicComplete?.(item.slug, true);

            return {
              slug: item.slug,
              success: true,
              isNew: item.isNew,
              result,
            };
          } catch (error) {
            this.logger.error(`Failed to compile topic ${item.slug}:`, error);
            this.options.onTopicComplete?.(item.slug, false);

            errors.push({
              topicSlug: item.slug,
              error: error instanceof Error ? error.message : String(error),
              phase: "topic-compile",
            });

            return {
              slug: item.slug,
              success: false,
              isNew: item.isNew,
            };
          }
        },
        plan.maxConcurrency
      );

      // Categorize topic results
      for (const result of topicResults) {
        if (result.success) {
          if (result.isNew) {
            topicsCreated.push(result.slug);
          } else {
            topicsUpdated.push(result.slug);
          }
        }
      }

      // Phase 2: Compile concepts (if enabled)
      if (plan.conceptsEnabled && conceptCompiler) {
        this.options.onProgress?.("Discovering concepts", 0, 1);

        try {
          const conceptResults = await conceptCompiler.compile(topicsCreated.concat(topicsUpdated));

          for (const result of conceptResults) {
            if (result.isNew) {
              conceptsCreated.push(result.slug);
            } else {
              conceptsUpdated.push(result.slug);
            }
          }
        } catch (error) {
          this.logger.error("Failed to compile concepts:", error);
        }
      }

      this.logger.info(
        `Compilation complete: ${topicsCreated.length} new topics, ${topicsUpdated.length} updated topics, ${conceptsCreated.length} new concepts`
      );
    } catch (error) {
      this.logger.error("Compilation failed:", error);
      throw error;
    }

    return {
      topicsUpdated,
      topicsCreated,
      conceptsUpdated,
      conceptsCreated,
      sourcesScanned: 0, // Will be filled by caller
      sourcesChanged: 0, // Will be filled by caller
      durationMs: 0, // Will be filled by caller
      errors,
    };
  }
}

// ============================================================================
// Topic Compiler
// ============================================================================

export interface TopicCompiler {
  compile(topic: TopicCandidate): Promise<TopicArticle>;
}

export abstract class BaseTopicCompiler implements TopicCompiler {
  protected logger = createLogger("TopicCompiler");

  abstract compile(topic: TopicCandidate): Promise<TopicArticle>;

  protected validateArticle(article: TopicArticle): boolean {
    // Check frontmatter
    if (!article.frontmatter) {
      this.logger.warn(`Article ${article.slug} missing frontmatter`);
      return false;
    }

    // Check required fields
    if (!article.content || article.content.trim().length === 0) {
      this.logger.warn(`Article ${article.slug} has empty content`);
      return false;
    }

    return true;
  }
}

// ============================================================================
// Concept Compiler
// ============================================================================

export interface ConceptCompiler {
  compile(topicSlugs: string[]): Promise<Array<{ slug: string; isNew: boolean }>>;
}

export abstract class BaseConceptCompiler implements ConceptCompiler {
  protected logger = createLogger("ConceptCompiler");

  abstract compile(topicSlugs: string[]): Promise<Array<{ slug: string; isNew: boolean }>>;

  protected validateArticle(article: ConceptArticle): boolean {
    if (!article.frontmatter) {
      this.logger.warn(`Concept ${article.slug} missing frontmatter`);
      return false;
    }

    if (article.topicSlugs.length < 2) {
      this.logger.warn(`Concept ${article.slug} connects to fewer than 2 topics`);
      return false;
    }

    return true;
  }
}

// ============================================================================
// Compile Orchestrator
// ============================================================================

export interface CompileOrchestratorContext {
  config: ProjectConfig;
  topicCompiler: TopicCompiler;
  conceptCompiler?: ConceptCompiler;
  indexBuilder: IndexBuilder;
  schemaManager: SchemaManager;
  stateManager: any;
  logManager: any;
}

export class CompileOrchestrator {
  private logger = createLogger("CompileOrchestrator");

  async compile(
    input: CompilePlanInput,
    context: CompileOrchestratorContext
  ): Promise<CompileResult> {
    const startTime = Date.now();
    const { config, scanResult } = input;
    const { topicCompiler, conceptCompiler, indexBuilder, schemaManager, stateManager, logManager } = context;

    this.logger.info("Starting compilation orchestration...");
    this.logger.info(`Found ${scanResult.files.length} source files`);

    // Step 1: Load existing state
    const existingState = await stateManager.load();
    this.logger.info(`Loaded existing state: ${existingState ? "found" : "not found"}`);

    // Step 2: Build compile plan
    const planner = new CompilePlanner();
    const plan = await planner.plan(input);

    if (plan.topicsToCompile.length === 0) {
      this.logger.info("No topics need compilation");
      return {
        topicsUpdated: [],
        topicsCreated: [],
        conceptsUpdated: [],
        conceptsCreated: [],
        sourcesScanned: scanResult.files.length,
        sourcesChanged: 0,
        durationMs: Date.now() - startTime,
        errors: [],
      };
    }

    // Step 3: Execute compile plan
    const executor = new CompileExecutor({
      maxConcurrency: plan.maxConcurrency,
      onProgress: (phase, current, total) => {
        this.logger.debug(`${phase}: ${current}/${total}`);
      },
      onTopicComplete: (slug, success) => {
        this.logger.debug(`Topic ${slug} compilation ${success ? "completed" : "failed"}`);
      },
    });

    const compileResult = await executor.execute(plan, { config, topicCompiler, conceptCompiler });

    compileResult.sourcesScanned = scanResult.files.length;
    compileResult.durationMs = Date.now() - startTime;

    // Step 4: Build index
    this.logger.info("Building index...");
    await indexBuilder.build({
      config,
      scanResult,
      topics: compileResult.topicsCreated.map((slug) => ({
        slug,
        title: slug,
        sourceCount: 0,
        lastUpdated: new Date().toISOString(),
      })),
    });

    // Step 5: Update schema
    this.logger.info("Updating schema...");
    await schemaManager.updateSchema({
      topics: compileResult.topicsCreated,
      concepts: compileResult.conceptsCreated,
    });

    // Step 6: Update state
    this.logger.info("Updating compile state...");
    await stateManager.saveCompileState({
      last_compiled: new Date().toISOString(),
      files: {}, // Will be filled based on scan
      topics: [],
      concepts: [],
    });

    // Step 7: Write log
    await logManager.append({
      timestamp: new Date().toISOString(),
      level: "info",
      message: `Compilation complete: ${compileResult.topicsCreated.length} new topics, ${compileResult.topicsUpdated.length} updated`,
      details: {
        sources: scanResult.files.length,
        duration: compileResult.durationMs,
        errors: compileResult.errors.length,
      },
    });

    this.logger.info(`Compilation finished in ${compileResult.durationMs}ms`);
    return compileResult;
  }
}

// ============================================================================
// Index Builder
// ============================================================================

export interface IndexBuildInput {
  config: any;
  scanResult: any;
  topics: Array<{ slug: string; title: string; sourceCount: number; lastUpdated: string }>;
}

export interface IndexBuilder {
  build(input: IndexBuildInput): Promise<string>;
}

export class MarkdownIndexBuilder implements IndexBuilder {
  private logger = createLogger("MarkdownIndexBuilder");

  async build(input: IndexBuildInput): Promise<string> {
    const { config, scanResult, topics } = input;

    let md = `# ${config.name} Wiki\n\n`;
    md += `Last compiled: ${new Date().toISOString().split("T")[0]}\n`;
    md += `Total topics: ${topics.length} | Total sources: ${scanResult.files.length}\n\n`;

    md += `## Topics\n\n`;
    md += `| Topic | Sources | Last Updated |\n`;
    md += `|-------|---------|-------------|\n`;

    for (const topic of topics) {
      md += `| [[${topic.slug}]] | ${topic.sourceCount} | ${topic.lastUpdated.split("T")[0]} |\n`;
    }

    // TODO: Add concepts section when concepts are implemented

    md += `\n## Recent Changes\n`;
    md += `\n- ${new Date().toISOString().split("T")[0]}: Compiled ${topics.length} topics\n`;

    this.logger.info("Index built successfully");
    return md;
  }
}

// ============================================================================
// Schema Manager
// ============================================================================

export interface SchemaUpdateInput {
  topics: string[];
  concepts: string[];
}

export interface SchemaManager {
  load(): Promise<any>;
  updateSchema(input: SchemaUpdateInput): Promise<any>;
}

export class FileSystemSchemaManager implements SchemaManager {
  private logger = createLogger("FileSystemSchemaManager");
  private schemaPath: string;

  constructor(private outputDir: string) {
    this.schemaPath = `${outputDir}/schema.md`;
  }

  async load(): Promise<any> {
    // TODO: Implement loading schema from file
    return {
      version: 1,
      topics: [],
      concepts: [],
      evolution_log: [],
    };
  }

  async updateSchema(input: SchemaUpdateInput): Promise<any> {
    this.logger.info("Schema updated");
    // TODO: Implement schema persistence
    return this.load();
  }
}
