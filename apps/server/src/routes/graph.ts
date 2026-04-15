import type { FastifyInstance } from "fastify";
import { createConfigLoader, createArticleWriter } from "@llm-wiki-compiler/core";
import type { GraphResponse, GraphTopicNode, GraphConceptNode } from "@llm-wiki-compiler/types";
import * as path from "path";
import { createLogger } from "@llm-wiki-compiler/shared";

const logger = createLogger("GraphRoutes");

/**
 * Helper function to determine coverage level
 */
function determineCoverage(coverage?: Record<string, string>): "high" | "medium" | "low" | undefined {
  if (!coverage) return undefined;

  const values = Object.values(coverage);
  const highCount = values.filter((v) => v === "high").length;
  const totalCount = values.length;

  if (highCount / totalCount >= 0.7) return "high";
  if (highCount / totalCount >= 0.3) return "medium";
  return "low";
}

/**
 * Helper function to extract connected topics from concept content
 */
function extractConnectedTopics(content: string): string[] {
  // Extract topics from frontmatter topics_connected field
  const match = content.match(/topics_connected:\s*\[(.*?)\]/);
  if (match) {
    return match[1]
      .split(",")
      .map((s) => s.trim());
  }
  return [];
}

export default async function graphRoutes(fastify: FastifyInstance, opts: Record<string, unknown>) {
  // Get graph data
  fastify.get("/data", async (request, reply) => {
    const cwd = (request.query as any).projectRoot || process.cwd();

    try {
      const configLoader = createConfigLoader();
      const config = await configLoader.loadProjectConfig(cwd);
      const articleWriter = createArticleWriter(path.resolve(cwd, config.output), config.link_style || "obsidian");

      const topicSlugs = await articleWriter.listTopics();
      const conceptSlugs = await articleWriter.listConcepts();

      const nodes: Array<GraphTopicNode | GraphConceptNode> = [];
      const edges: Array<{ source: string; target: string; type: string }> = [];

      // Build topic nodes
      for (const slug of topicSlugs) {
        const topic = await articleWriter.readTopic(slug);
        if (topic) {
          nodes.push({
            id: `topic:${slug}`,
            label: topic.frontmatter.topic,
            type: "topic",
            kind: topic.kind,
            sourceCount: topic.frontmatter.source_count || 0,
            lastCompiled: topic.frontmatter.last_compiled,
            coverage: determineCoverage(topic.frontmatter.coverage),
            status: topic.frontmatter.status,
          });
        }
      }

      // Build concept nodes and edges
      const fs = await import("fs/promises");
      for (const slug of conceptSlugs) {
        const conceptPath = path.join(cwd, config.output, "concepts", `${slug}.md`);
        try {
          const content = await fs.readFile(conceptPath, "utf-8");
          const topicsConnected = extractConnectedTopics(content);

          if (topicsConnected.length >= 2) {
            nodes.push({
              id: `concept:${slug}`,
              label: slug,
              type: "concept",
              connectedTopics: topicsConnected,
            });

            // Add edges from concept to topics
            for (const topicSlug of topicsConnected) {
              edges.push({
                source: `concept:${slug}`,
                target: `topic:${topicSlug}`,
                type: "topic-concept",
              });
            }
          }
        } catch (error) {
          logger.warn(`Failed to read concept ${slug}:`, error);
        }
      }

      const response: GraphResponse = {
        name: config.name,
        totalTopics: topicSlugs.length,
        totalConcepts: conceptSlugs.length,
        totalSources: nodes.reduce((sum, n) => sum + (n.type === "topic" ? n.sourceCount : 0), 0),
        topics: nodes.filter((n): n is GraphTopicNode => n.type === "topic"),
        concepts: nodes.filter((n): n is GraphConceptNode => n.type === "concept"),
        edges,
      };

      return response;
    } catch (error) {
      logger.error("Failed to get graph data:", error);
      reply.code(500).send({
        error: "Failed to get graph data",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
