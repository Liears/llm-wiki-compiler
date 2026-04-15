import type { FastifyInstance } from "fastify";
import { createConfigLoader, createScanner, createTopicDiscovery } from "@llm-wiki-compiler/core";
import { taskManager } from "../tasks";
import { createLogger } from "@llm-wiki-compiler/shared";

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

            return {
              topicsCompiling: topics.length,
              sourcesScanned: scanResult.files.length,
              topics: topics.map((t) => ({
                slug: t.slug,
                title: t.title,
                sourceFiles: t.sourceFiles.length,
              })),
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
