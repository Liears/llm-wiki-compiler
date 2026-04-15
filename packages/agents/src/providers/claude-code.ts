import { execa, ExecaChildProcess } from "execa";
import type {
  AgentCapabilities,
  AgentRunInput,
  AgentRunResult,
} from "@llm-wiki-compiler/types";
import { BaseAgentAdapter } from "../base/adapter";

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  readonly name = "claude-code";
  readonly capabilities: AgentCapabilities = {
    supportsSystemPrompt: true,
    supportsFileContext: true,
    supportsJsonMode: true,
    supportsStreaming: true,
  };

  constructor(private command = "claude") {
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
    const args = this.buildClaudeArgs(input);

    this.logger.debug(`Executing: ${this.command} ${args.join(" ")}`);

    const timeout = input.timeoutMs || 120000;
    const child = execa(this.command, args, {
      cwd: input.cwd,
      timeout,
      reject: false,
      env: {
        ...process.env,
        // Disable interactive prompts
        CLAUDE_INTERACTIVE: "false",
      },
    });

    // Handle streaming output if needed
    if (this.capabilities.supportsStreaming) {
      child.stdout!.on("data", (data) => {
        // Emit streaming events if needed
      });
    }

    const result = await child;

    return {
      text: result.stdout,
      rawStdout: result.stdout,
      rawStderr: result.stderr || "",
      exitCode: result.exitCode,
    };
  }

  private buildClaudeArgs(input: AgentRunInput): string[] {
    const args: string[] = [];

    // Add system prompt if provided
    if (input.systemPrompt) {
      args.push("--system", input.systemPrompt);
    }

    // Add inline mode for non-interactive use
    args.push("--no-interactive", "--no-color");

    // Add file context
    if (input.files && input.files.length > 0) {
      for (const file of input.files) {
        args.push("--file", file);
      }
    }

    // Add user prompt
    args.push(input.userPrompt);

    // Request JSON output if specified
    if (input.expectJson) {
      args.push("--format", "json");
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
