import { execa } from "execa";
import type {
  AgentCapabilities,
  AgentRunInput,
  AgentRunResult,
} from "@llm-wiki-compiler/types";
import { BaseAgentAdapter } from "../base/adapter";

export class OpenClawAdapter extends BaseAgentAdapter {
  readonly name = "openclaw";
  readonly capabilities: AgentCapabilities = {
    supportsSystemPrompt: true,
    supportsFileContext: true,
    supportsJsonMode: false,
    supportsStreaming: false,
  };

  constructor(private command = "openclaw") {
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
    const args = this.buildOpenClawArgs(input);

    this.logger.debug(`Executing: ${this.command} ${args.join(" ")}`);

    const timeout = input.timeoutMs || 120000;
    const result = await execa(this.command, args, {
      cwd: input.cwd,
      timeout,
      reject: false,
      env: {
        ...process.env,
        INTERACTIVE: "false",
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

  private buildOpenClawArgs(input: AgentRunInput): string[] {
    const args: string[] = [];

    // Add system prompt
    if (input.systemPrompt) {
      args.push("-s", input.systemPrompt);
    }

    // Set quiet mode
    args.push("-q", "--no-color");

    // Add file context
    if (input.files && input.files.length > 0) {
      for (const file of input.files) {
        args.push("-f", file);
      }
    }

    // Add user prompt
    args.push(input.userPrompt);

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
