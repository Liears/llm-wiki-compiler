import { createTaskStore, type TaskRecord, TaskStatus } from "@llm-wiki-compiler/core";
import { createLogger } from "@llm-wiki-compiler/shared";

const logger = createLogger("TaskManager");
const taskStore = createTaskStore();

export interface TaskOptions {
  type: string;
  projectRoot: string;
  input: Record<string, unknown>;
  executor: () => Promise<Record<string, unknown>>;
}

export class TaskManager {
  private runningTasks = new Map<string, AbortController>();

  async createTask(options: TaskOptions): Promise<TaskRecord> {
    const taskId = await taskStore.create({
      type: options.type as any,
      projectRoot: options.projectRoot,
      status: "queued",
      input: options.input,
    });

    // Start the task
    this.executeTask(taskId, options).catch((err) => {
      logger.error(`Task ${taskId} execution failed:`, err);
    });

    const task = await taskStore.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not created successfully`);
    }
    return task;
  }

  private async executeTask(taskId: string, options: TaskOptions) {
    const controller = new AbortController();
    this.runningTasks.set(taskId, controller);

    try {
      await taskStore.setStatus(taskId, "running");
      const result = await options.executor();

      await taskStore.update(taskId, {
        status: "completed",
        result,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Check if cancelled
      const task = await taskStore.get(taskId);
      if (task?.status === "cancelled") {
        return;
      }

      logger.error(`Task ${taskId} error:`, error);

      await taskStore.update(taskId, {
        status: "failed",
        error: {
          code: "TASK_ERROR",
          message: error instanceof Error ? error.message : String(error),
          details: error,
        },
        finishedAt: new Date().toISOString(),
      });
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  async cancelTask(taskId: string) {
    const controller = this.runningTasks.get(taskId);
    if (controller) {
      controller.abort();
      this.runningTasks.delete(taskId);
    }

    await taskStore.update(taskId, {
      status: "cancelled",
      finishedAt: new Date().toISOString(),
    });
  }

  async getTask(taskId: string) {
    return taskStore.get(taskId);
  }

  async listTasks(projectRoot: string) {
    return taskStore.list(projectRoot);
  }

  async getRunningTasks(projectRoot: string) {
    const tasks = await this.listTasks(projectRoot);
    return tasks.filter((t) => t.status === "running");
  }
}

export const taskManager = new TaskManager();
