import { AgentAdapterFactory, ProviderConfig, AgentTestResult } from "../types";
import { createLogger } from "@llm-wiki-compiler/shared";

export class AgentHealthCheck {
  private logger = createLogger("AgentHealthCheck");

  constructor(private factory: AgentAdapterFactory) {}

  async check(config: ProviderConfig): Promise<AgentTestResult> {
    const startTime = Date.now();
    const adapter = this.factory.get(config.provider);

    this.logger.info(`Checking availability of ${config.provider}...`);

    try {
      const available = await adapter.isAvailable();
      const responseTime = Date.now() - startTime;

      if (!available) {
        this.logger.warn(`${config.provider} is not available`);
        return {
          available: false,
          error: `Agent ${config.provider} not found or not executable`,
          responseTime,
        };
      }

      this.logger.info(`${config.provider} is available (${responseTime}ms)`);

      return {
        available: true,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`Failed to check ${config.provider}:`, error);

      return {
        available: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async checkAll(configs: ProviderConfig[]): Promise<Record<string, AgentTestResult>> {
    const results: Record<string, AgentTestResult> = {};

    await Promise.all(
      configs.map(async (config) => {
        const result = await this.check(config);
        results[config.provider] = result;
      })
    );

    return results;
  }

  async findAvailableProvider(
    preferredProvider?: string
  ): Promise<ProviderConfig | null> {
    const providers = ["claude-code", "codex", "openclaw"] as const;

    // Check preferred provider first
    if (preferredProvider) {
      const config = this.factory.getProviderConfig(preferredProvider);
      const result = await this.check(config);

      if (result.available) {
        this.logger.info(`Using preferred provider: ${preferredProvider}`);
        return config;
      }
    }

    // Check all providers in order
    for (const provider of providers) {
      const config = this.factory.getProviderConfig(provider);
      const result = await this.check(config);

      if (result.available) {
        this.logger.info(`Available provider found: ${provider}`);
        return config;
      }
    }

    this.logger.error("No available agent provider found");
    return null;
  }
}
