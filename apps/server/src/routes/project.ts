import type { FastifyInstance } from "fastify";
import { configLoader } from "../config";
import { createLogger } from "@llm-wiki-compiler/shared";

const logger = createLogger("ProjectRoutes");

export default async function projectRoutes(fastify: FastifyInstance, opts: Record<string, unknown>) {
  // Get project config
  fastify.get("/config", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const config = await configLoader.loadProjectConfig(cwd);
      return config;
    } catch (error) {
      logger.error("Failed to load project config:", error);
      reply.code(404).send({
        error: "Project not initialized",
        message: "No .wiki-compiler.json found. Run 'wiki init' to initialize.",
      });
    }
  });

  // Validate project config
  fastify.post<{
    Body: {
      name?: string;
      mode?: "knowledge" | "codebase";
      sources?: Array<{ path: string; exclude?: string[] }>;
      output?: string;
    };
  }>("/validate", async (request, reply) => {
    try {
      // Validate the provided config structure
      const { name, mode, sources, output } = request.body;

      const errors: string[] = [];

      if (name && name.length < 1) {
        errors.push("Project name must be at least 1 character");
      }

      if (mode && !["knowledge", "codebase"].includes(mode)) {
        errors.push("Mode must be either 'knowledge' or 'codebase'");
      }

      if (sources && (!Array.isArray(sources) || sources.length === 0)) {
        errors.push("Sources must be a non-empty array");
      }

      if (output && typeof output !== "string") {
        errors.push("Output must be a string");
      }

      if (errors.length > 0) {
        return reply.code(400).send({
          valid: false,
          errors,
        });
      }

      return { valid: true };
    } catch (error) {
      logger.error("Failed to validate config:", error);
      reply.code(500).send({
        error: "Failed to validate config",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Project status
  fastify.get("/status", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const config = await configLoader.loadProjectConfig(cwd);

      // Check if wiki output exists
      const fs = await import("fs/promises");
      const outputPath = config.output.startsWith("/")
        ? config.output
        : `/${config.output}`;
      const topicPath = path.join(cwd, outputPath, "topics");

      let wikiExists = false;
      try {
        await fs.access(topicPath);
        wikiExists = true;
      } catch {
        wikiExists = false;
      }

      return {
        initialized: true,
        wikiCompiled: wikiExists,
        mode: config.mode,
        name: config.name,
      };
    } catch (error) {
      logger.error("Failed to get project status:", error);
      return {
        initialized: false,
        wikiCompiled: false,
      };
    }
  });
}
