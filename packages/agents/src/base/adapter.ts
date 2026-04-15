import type {
  AgentCapabilities,
  AgentRunInput,
  AgentRunResult,
} from "@llm-wiki-compiler/types";
import { withTimeout, TimeoutError } from "@llm-wiki-compiler/shared";
import { createLogger } from "@llm-wiki-compiler/shared";

export abstract class BaseAgentAdapter {
  protected logger = createLogger("AgentAdapter");

  abstract readonly name: string;
  abstract readonly capabilities: AgentCapabilities;

  abstract isAvailable(): Promise<boolean>;

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startTime = Date.now();
    const timeout = input.timeoutMs || 120000; // Default 2 minutes

    this.logger.info(
      `Running agent ${this.name} with ${input.files?.length || 0} files (timeout: ${timeout}ms)`
    );

    try {
      const result = await withTimeout(
        this.execute(input),
        timeout,
        `Agent ${this.name} timed out after ${timeout}ms`
      );

      const durationMs = Date.now() - startTime;
      this.logger.info(
        `Agent ${this.name} completed in ${durationMs}ms (exit code: ${result.exitCode})`
      );

      return {
        ...result,
        durationMs,
        success: result.exitCode === 0,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof TimeoutError) {
        this.logger.error(`Agent ${this.name} timed out after ${timeoutMs}ms`);
        return {
          text: "",
          rawStdout: "",
          rawStderr: `Timeout: ${error.message}`,
          exitCode: 124, // Standard timeout exit code
          durationMs,
          success: false,
          error: error.message,
        };
      }

      this.logger.error(`Agent ${this.name} failed:`, error);

      return {
        text: "",
        rawStdout: "",
        rawStderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        durationMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  protected abstract execute(input: AgentRunInput): Promise<AgentRunResult>;

  protected buildCommandArgs(input: AgentRunInput): string[] {
    const args: string[] = [];

    if (input.systemPrompt && this.capabilities.supportsSystemPrompt) {
      args.push("-s", input.systemPrompt);
    }

    if (input.files && input.files.length > 0 && this.capabilities.supportsFileContext) {
      // Add file context
      for (const file of input.files) {
        args.push("-f", file);
      }
    }

    args.push("-p", input.userPrompt);

    return args;
  }

  protected validateResult(result: AgentRunResult): void {
    if (result.exitCode !== 0) {
      throw new Error(
        `Agent exited with code ${result.exitCode}: ${result.rawStderr || "no error message"}`
      );
    }

    if (!result.text || result.text.trim().length === 0) {
      throw new Error("Agent returned empty output");
    }
  }
}
