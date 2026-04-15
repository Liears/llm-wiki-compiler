import Fastify from "fastify";
import autoload from "@fastify/autoload";
import { configLoader } from "./config";
import { taskManager } from "./tasks";
import { wikiRoutes } from "./routes/wiki";
import { projectRoutes } from "./routes/project";
import { compileRoutes } from "./routes/compile";
import { searchRoutes } from "./routes/search";
import { agentRoutes } from "./routes/agents";
import { graphRoutes } from "./routes/graph";
import { createLogger } from "@llm-wiki-compiler/shared";

const logger = createLogger("Server");

export async function buildServer(options: Record<string, unknown> = {}) {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
    ...options,
  });

  // Register plugins
  await server.register(import("@fastify/cors"), {
    origin: true,
    credentials: true,
  });

  // Register static file serving for web app
  await server.register(import("@fastify/static"), {
    root: `${__dirname}/../../web/dist`,
    prefix: "/",
    decorateReply: false,
  });

  // Register routes
  await server.register(wikiRoutes, { prefix: "/api/wiki" });
  await server.register(projectRoutes, { prefix: "/api/project" });
  await server.register(compileRoutes, { prefix: "/api/compile" });
  await server.register(searchRoutes, { prefix: "/api/search" });
  await server.register(agentRoutes, { prefix: "/api/agents" });
  await server.register(graphRoutes, { prefix: "/api/graph" });
  await server.register(autoload, {
    dir: `${__dirname}/routes`,
    options: { prefix: "/api" },
  });

  // Task routes
  server.get("/api/tasks", async (request, reply) => {
    const projectRoot = (request.query as any).projectRoot || process.cwd();
    const tasks = await taskManager.listTasks(projectRoot);
    return tasks;
  });

  server.get("/api/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await taskManager.getTask(id);

    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    return task;
  });

  server.post("/api/tasks/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    await taskManager.cancelTask(id);
    return { success: true };
  });

  // SPA fallback - serve index.html for all non-API routes
  server.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found" });
    } else {
      reply.sendFile("index.html");
    }
  });

  // Health check
  server.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return server;
}

export async function startServer(port = 3000, host = "0.0.0.0") {
  const server = await buildServer();
  const address = await server.listen({ port, host });

  logger.info(`Server listening at ${address}`);
  logger.info(`Web UI available at http://${host}:${port}`);
  logger.info(`API health check: http://${host}:${port}/health`);

  return server;
}

// Start server if running directly
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";

  startServer(port, host).catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
