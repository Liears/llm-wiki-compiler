import type { FastifyInstance } from "fastify";
import { createSearchService } from "@llm-wiki-compiler/core";
import { createLogger } from "@llm-wiki-compiler/shared";

const logger = createLogger("SearchRoutes");

export default async function searchRoutes(fastify: FastifyInstance, opts: Record<string, unknown>) {
  const searchService = createSearchService();

  // Search wiki
  fastify.get<{ Querystring: { q: string; limit?: string; type?: string } }>(
    "/",
    async (request, reply) => {
      const { q, limit, type } = request.query || {};

      if (!q) {
        return reply.code(400).send({
          error: "Query parameter 'q' is required",
        });
      }

      try {
        const types = type ? type.split(",") as any : ["topic", "concept"];
        const results = await searchService.search({
          query: q,
          limit: limit ? Number(limit) : 10,
          types,
        });

        return {
          query: q,
          results,
          count: results.length,
        };
      } catch (error) {
        logger.error("Search failed:", error);
        reply.code(500).send({
          error: "Search failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}
