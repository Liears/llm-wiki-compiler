import { execa } from "execa";
import type {
  AgentCapabilities,
  AgentRunInput,
  AgentRunResult,
} from "@llm-wiki-compiler/types";
import { BaseAgentAdapter } from "../base/adapter";

export class CodexAdapter extends BaseAgentAdapter {
  readonly name = "codex";
  readonly capabilities: AgentCapabilities = {
    supportsSystemPrompt: true,
    supportsFileContext: true,
    supportsJsonMode: true,
    supportsStreaming: true,
  };

  constructor(private command = "codex") {
    super();
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await execa(this.command, ["--version"], {
        timeout: 5000,
        reject: false,
      });

      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  protected async execute(input: AgentRunInput): Promise<AgentRunResult> {
    const args = this.buildCodexArgs(input);

    this.logger.debug(`Executing: ${this.command} ${args.join(" ")}`);

    const timeout = input.timeoutMs || 120000;
    const result = await execa(this.command, args, {
      cwd: input.cwd,
      timeout,
      reject: false,
      env: {
        ...process.env,
        CODEX_INTERACTIVE: "false",
        NO_COLOR: "1",
      },
    });

    return {
      text: result.stdout,
      rawStdout: result.stdout,
      rawStderr: result.stderr || "",
      exitCode: result.exitCode,
    };
  }

  private buildCodexArgs(input: AgentRunInput): string[] {
    const args: string[] = [];

    // Add system prompt
    if (input.systemPrompt) {
      args.push("--system", input.systemPrompt);
    }

    // Set output format
    args.push("--mode", "inline", "--no-color");

    // Add file context
    if (input.files && input.files.length > 0) {
      args.push("--files", input.files.join(","));
    }

    // Add user prompt
    args.push("--prompt", input.userPrompt);

    // JSON output
    if (input.expectJson) {
      args.push("--json");
    }

    return args;
  }

  getVersion(): Promise<string | null> {
    return (async () => {
      try {
        const result = await execa(this.command, ["--version"], {
          timeout: 5000,
        });
        return result.stdout.trim();
      } catch {
        return null;
      }
    })();
  }
}
