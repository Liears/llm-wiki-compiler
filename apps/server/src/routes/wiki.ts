import type { FastifyInstance } from "fastify";
import { createConfigLoader, createArticleWriter, createIndexBuilder, createSchemaManager } from "@llm-wiki-compiler/core";
import * as path from "path";
import { createLogger } from "@llm-wiki-compiler/shared";

const logger = createLogger("WikiRoutes");

export default async function wikiRoutes(fastify: FastifyInstance, opts: Record<string, unknown>) {
  // Get wiki index
  fastify.get("/index", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);
      const indexPath = path.resolve(cwd, config.output, "INDEX.md");

      const fs = await import("fs/promises");
      const content = await fs.readFile(indexPath, "utf-8");

      reply.type("text/markdown").send(content);
    } catch (error) {
      logger.error("Failed to read index:", error);
      reply.code(404).send({
        error: "Index not found",
        message: "Run 'wiki compile' to generate the wiki index",
      });
    }
  });

  // List topics
  fastify.get("/topics", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);
      const articleWriter = createArticleWriter(
        path.resolve(cwd, config.output),
        config.link_style || "obsidian"
      );

      const topics = await articleWriter.listTopics();
      return { topics };
    } catch (error) {
      logger.error("Failed to list topics:", error);
      reply.code(500).send({
        error: "Failed to list topics",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get specific topic
  fastify.get<{ Params: { slug: string } }>("/topics/:slug", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();
    const { slug } = request.params;

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);
      const articleWriter = createArticleWriter(
        path.resolve(cwd, config.output),
        config.link_style || "obsidian"
      );

      const topic = await articleWriter.readTopic(slug);

      if (!topic) {
        reply.code(404).send({ error: "Topic not found" });
        return;
      }

      reply.type("text/markdown").send(topic.content);
    } catch (error) {
      logger.error("Failed to read topic:", error);
      reply.code(500).send({
        error: "Failed to read topic",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // List concepts
  fastify.get("/concepts", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);
      const articleWriter = createArticleWriter(
        path.resolve(cwd, config.output),
        config.link_style || "obsidian"
      );

      const concepts = await articleWriter.listConcepts();
      return { concepts };
    } catch (error) {
      logger.error("Failed to list concepts:", error);
      reply.code(500).send({
        error: "Failed to list concepts",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get schema
  fastify.get("/schema", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);

      const outputDir = path.resolve(cwd, config.output);
      const schemaPath = path.join(outputDir, "schema.md");

      const fs = await import("fs/promises");
      try {
        const content = await fs.readFile(schemaPath, "utf-8");
        reply.type("text/markdown").send(content);
      } catch {
        // Schema doesn't exist yet
        const emptySchema = {
          version: 1,
          topics: [],
          concepts: [],
          naming_conventions: [],
          evolution_log: [],
        };
        return emptySchema;
      }
    } catch (error) {
      logger.error("Failed to read schema:", error);
      reply.code(500).send({
        error: "Failed to read schema",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get wiki stats
  fastify.get("/stats", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);
      const articleWriter = createArticleWriter(
        path.resolve(cwd, config.output),
        config.link_style || "obsidian"
      );

      const [topics, concepts] = await Promise.all([
        articleWriter.listTopics(),
        articleWriter.listConcepts(),
      ]);

      const fs = await import("fs/promises");
      const statePath = path.join(cwd, config.output, ".compile-state.json");

      let state = null;
      try {
        const content = await fs.readFile(statePath, "utf-8");
        state = JSON.parse(content as string);
      } catch {
        // State doesn't exist
      }

      return {
        topicsCount: topics.length,
        conceptsCount: concepts.length,
        lastCompiled: state?.last_compiled || null,
        version: state?.version || 0,
      };
    } catch (error) {
      logger.error("Failed to get wiki stats:", error);
      reply.code(500).send({
        error: "Failed to get wiki stats",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
