import type {
  AgentAdapter,
  AgentCapabilities,
  AgentRunInput,
  AgentRunResult,
  AgentProvider,
} from "@llm-wiki-compiler/types";

export type { AgentAdapter, AgentCapabilities, AgentRunInput, AgentRunResult, AgentProvider };

export interface AgentAdapterFactory {
  get(provider: AgentProvider): AgentAdapter;
  getProviderConfig(provider: AgentProvider): ProviderConfig;
  testProvider(config: ProviderConfig): Promise<AgentTestResult>;
}

export interface ProviderConfig {
  provider: AgentProvider;
  command?: string;
  args?: string[];
  timeoutMs?: number;
  maxConcurrency?: number;
  env?: Record<string, string>;
}

export interface AgentTestResult {
  available: boolean;
  version?: string;
  error?: string;
  responseTime?: number;
}

export interface AgentHealthCheckOptions {
  timeoutMs?: number;
}

export class AgentUnavailableError extends Error {
  constructor(
    public provider: AgentProvider,
    message: string
  ) {
    super(message);
    this.name = "AgentUnavailableError";
  }
}

export class AgentTimeoutError extends Error {
  constructor(public timeoutMs: number, message?: string) {
    super(message || `Agent operation timed out after ${timeoutMs}ms`);
    this.name = "AgentTimeoutError";
  }
}
