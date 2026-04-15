import type { FastifyInstance } from "fastify";
import { agentFactory } from "../config";
import { AgentHealthCheck } from "@llm-wiki-compiler/agents";
import { createLogger } from "@llm-wiki-compiler/shared";

const logger = createLogger("AgentRoutes");

export default async function agentRoutes(fastify: FastifyInstance, opts: Record<string, unknown>) {
  // List available providers
  fastify.get("/providers", async (request, reply) => {
    try {
      const providers = agentFactory.listProviders();
      const healthCheck = new AgentHealthCheck(agentFactory);

      const results = await Promise.all(
        providers.map(async (provider) => {
          const config = agentFactory.getProviderConfig(provider);
          const health = await healthCheck.check(config);
          return {
            provider,
            name: provider.charAt(0).toUpperCase() + provider.slice(1),
            available: health.available,
            capabilities: agentFactory.getCapabilities(provider),
          };
        })
      );

      return { providers: results };
    } catch (error) {
      logger.error("Failed to list providers:", error);
      reply.code(500).send({
        error: "Failed to list providers",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Test a specific provider
  fastify.get<{
    Params: { provider: string };
  }>("/providers/:provider/test", async (request, reply) => {
    const { provider } = request.params;

    try {
      const config = agentFactory.getProviderConfig(provider as any);
      const healthCheck = new AgentHealthCheck(agentFactory);
      const result = await healthCheck.check(config);

      return {
        provider,
        available: result.available,
        version: result.version,
        responseTime: result.responseTime,
        error: result.error,
      };
    } catch (error) {
      logger.error("Failed to test provider:", error);
      reply.code(500).send({
        error: "Failed to test provider",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get provider capabilities
  fastify.get<{
    Params: { provider: string };
  }>("/providers/:provider/capabilities", async (request, reply) => {
    const { provider } = request.params;

    try {
      const capabilities = agentFactory.getCapabilities(provider as any);
      return {
        provider,
        capabilities,
      };
    } catch (error) {
      logger.error("Failed to get provider capabilities:", error);
      reply.code(404).send({
        error: "Provider not found",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
