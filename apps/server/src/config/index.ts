import { createConfigLoader } from "@llm-wiki-compiler/core";
import { getAgentFactory } from "@llm-wiki-compiler/agents";

export const configLoader = createConfigLoader();
export const agentFactory = getAgentFactory();

// Server configuration
let serverPort = Number(process.env.PORT) || 3000;
let serverHost = process.env.HOST || "localhost";

export function setServerPort(port: number) {
  serverPort = port;
}

export function setServerHost(host: string) {
  serverHost = host;
}

export function getServerConfig() {
  return {
    port: serverPort,
    host: serverHost,
  };
}

// Load global config
let globalConfig: any = null;

export async function getGlobalConfig() {
  if (!globalConfig) {
    globalConfig = await configLoader.loadGlobalConfig();
  }
  return globalConfig;
}
