import type { FastifyInstance } from "fastify";
import {
  createConfigLoader,
  createScanner,
  createTopicDiscovery,
  createAgentTopicCompiler,
  createAgentConceptCompiler,
  createArticleWriter,
  createIndexBuilder,
  createSchemaManager,
  createCompileStateStore,
} from "@llm-wiki-compiler/core";
import { getAgentFactory } from "@llm-wiki-compiler/agents";
import { taskManager } from "../tasks";
import { createLogger } from "@llm-wiki-compiler/shared";
import * as path from "path";

const logger = createLogger("CompileRoutes");

export default async function compileRoutes(fastify: FastifyInstance, opts: Record<string, unknown>) {
  // Start compilation
  fastify.post<{ Body: { force?: boolean; concurrency?: number } }>(
    "/start",
    async (request, reply) => {
      const { force, concurrency } = request.body || {};
      const cwd = (request.query as any).projectRoot || process.cwd();

      logger.info(`Starting compilation (force=${force}, concurrency=${concurrency})`);

      try {
        const task = await taskManager.createTask({
          type: "compile",
          projectRoot: cwd,
          input: { force, concurrency },
          executor: async () => {
            // Load config
            const configLoader = createConfigLoader();
            const config = await configLoader.loadProjectConfig(cwd);

            // Scan sources
            const scanner = createScanner();
            const scanResult = await scanner.scan(config, cwd);

            // Discover topics
            const discovery = createTopicDiscovery();
            const topics = await discovery.discover({ scanResult, config });

            // Create output directory
            const outputDir = path.resolve(cwd, config.output);
            const fs = await import("fs/promises");
            await fs.mkdir(outputDir, { recursive: true });

            // Set up compiler services
            const agentFactory = getAgentFactory();
            const agentConfig = config.agent || { provider: "claude-code", timeout_ms: 120000 };
            const agentAdapter = agentFactory.get(agentConfig.provider);

            const topicCompiler = createAgentTopicCompiler(agentAdapter, agentConfig, ".");
            const conceptCompiler = createAgentConceptCompiler(agentAdapter, agentConfig);
            const articleWriter = createArticleWriter(outputDir, config.link_style);
            const indexBuilder = createIndexBuilder(outputDir);
            const schemaManager = createSchemaManager(outputDir);
            const stateStore = createCompileStateStore();

            const topicsCreated: string[] = [];
            const topicsUpdated: string[] = [];
            const conceptsCreated: string[] = [];
            const errors: any[] = [];

            // Compile topics
            for (const topic of topics) {
              try {
                const article = await topicCompiler.compile(topic);
                await articleWriter.writeTopic(article);

                if (await articleWriter.exists(topic.slug, "topic")) {
                  topicsCreated.push(topic.slug);
                } else {
                  topicsUpdated.push(topic.slug);
                }
              } catch (error) {
                errors.push({
                  topicSlug: topic.slug,
                  error: error instanceof Error ? error.message : String(error),
                  phase: "topic-compile",
                });
              }
            }

            // Compile concepts
            if (topicsCreated.length + topicsUpdated.length > 0) {
              try {
                const allTopicSlugs = topicsCreated.concat(topicsUpdated);
                const conceptResults = await conceptCompiler.compile(allTopicSlugs);

                for (const result of conceptResults) {
                  if (result.isNew) {
                    conceptsCreated.push(result.slug);
                  }
                }
              } catch (error) {
                // Continue even if concept compilation fails
              }
            }

            // Build index
            try {
              await indexBuilder.build({
                config,
                scanResult,
                topics: topics.map((t) => ({
                  slug: t.slug,
                  title: t.title,
                  sourceCount: t.sourceFiles.length,
                  lastUpdated: new Date().toISOString(),
                })),
              });
            } catch (error) {
              logger.error("Failed to build index:", error);
            }

            // Update state
            try {
              await stateStore.saveCompileState({
                last_compiled: new Date().toISOString(),
                files: {},
                topics: topics.map((t) => ({
                  slug: t.slug,
                  title: t.title,
                  sourceFiles: t.sourceFiles,
                  lastCompiled: new Date().toISOString(),
                })),
                concepts: [],
              });
            } catch (error) {
              logger.error("Failed to save state:", error);
            }

            return {
              topicsCompiled: topicsCreated.length + topicsUpdated.length,
              topicsCreated,
              topicsUpdated,
              conceptsCreated,
              sourcesScanned: scanResult.files.length,
              errors,
            };
          },
        });

        reply.code(202).send({
          taskId: task.id,
          status: "queued",
        });
      } catch (error) {
        logger.error("Failed to start compilation:", error);
        reply.code(500).send({
          error: "Failed to start compilation",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // Get compile plan
  fastify.get("/plan", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);

      const scanner = createScanner();
      const scanResult = await scanner.scan(config, cwd);

      const discovery = createTopicDiscovery();
      const topics = await discovery.discover({ scanResult, config });

      const plan = {
        mode: "incremental",
        topicsToCompile: topics.map((t) => ({
          slug: t.slug,
          title: t.title,
          sourceFiles: t.sourceFiles,
          isNew: true,
          hasChanges: false,
        })),
        conceptsEnabled: true,
        maxConcurrency: config.agent?.max_concurrency || 2,
      };

      return plan;
    } catch (error) {
      logger.error("Failed to get compile plan:", error);
      reply.code(500).send({
        error: "Failed to get compile plan",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Compilation status
  fastify.get("/status", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const tasks = await taskManager.listTasks(cwd);
      const runningTask = tasks.find((t) => t.status === "running");

      if (!runningTask) {
        return {
          compiling: false,
          lastTask: tasks[0] || null,
        };
      }

      return {
        compiling: true,
        task: {
          id: runningTask.id,
          status: runningTask.status,
          progress: runningTask.progress,
          createdAt: runningTask.createdAt,
          startedAt: runningTask.startedAt,
        },
      };
    } catch (error) {
      logger.error("Failed to get compile status:", error);
      reply.code(500).send({
        error: "Failed to get compile status",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
