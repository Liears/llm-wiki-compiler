import type {
  AgentAdapter,
  AgentProvider,
  AgentCapabilities,
} from "@llm-wiki-compiler/types";
import type {
  AgentAdapterFactory,
  ProviderConfig,
  AgentTestResult,
} from "./types";
import { ClaudeCodeAdapter } from "./providers/claude-code";
import { CodexAdapter } from "./providers/codex";
import { OpenClawAdapter } from "./providers/openclaw";
import { createLogger } from "@llm-wiki-compiler/shared";
import { AgentHealthCheck } from "./health";

const PROVIDER_CAPABILITIES: Record<
  AgentProvider,
  AgentCapabilities
> = {
  "claude-code": {
    supportsSystemPrompt: true,
    supportsFileContext: true,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  codex: {
    supportsSystemPrompt: true,
    supportsFileContext: true,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  openclaw: {
    supportsSystemPrompt: true,
    supportsFileContext: true,
    supportsJsonMode: false,
    supportsStreaming: false,
  },
};

class DefaultAgentFactory implements AgentAdapterFactory {
  private adapters = new Map<AgentProvider, AgentAdapter>();
  private logger = createLogger("AgentFactory");

  constructor() {
    // Initialize default adapters
    this.adapters.set("claude-code", new ClaudeCodeAdapter());
    this.adapters.set("codex", new CodexAdapter());
    this.adapters.set("openclaw", new OpenClawAdapter());
  }

  get(provider: AgentProvider): AgentAdapter {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      // Create a new adapter for this provider
      switch (provider) {
        case "claude-code":
          return new ClaudeCodeAdapter();
        case "codex":
          return new CodexAdapter();
        case "openclaw":
          return new OpenClawAdapter();
        default:
          throw new Error(`Unknown agent provider: ${provider}`);
      }
    }

    return adapter;
  }

  getProviderConfig(provider: AgentProvider): ProviderConfig {
    return {
      provider,
      timeoutMs: 120000,
      maxConcurrency: 2,
    };
  }

  async testProvider(config: ProviderConfig): Promise<AgentTestResult> {
    const healthCheck = new AgentHealthCheck(this);
    return healthCheck.check(config);
  }

  registerAdapter(provider: AgentProvider, adapter: AgentAdapter): void {
    this.adapters.set(provider, adapter);
    this.logger.info(`Registered adapter for provider: ${provider}`);
  }

  getCapabilities(provider: AgentProvider): AgentCapabilities {
    return PROVIDER_CAPABILITIES[provider];
  }

  listProviders(): AgentProvider[] {
    return Array.from(PROVIDER_CAPABILITIES.keys());
  }
}

// Singleton instance
let factoryInstance: DefaultAgentFactory | null = null;

export function getAgentFactory(): AgentAdapterFactory {
  if (!factoryInstance) {
    factoryInstance = new DefaultAgentFactory();
  }
  return factoryInstance;
}

export function createAgentFactory(): AgentAdapterFactory {
  return new DefaultAgentFactory();
}

export { AgentHealthCheck } from "./health";
