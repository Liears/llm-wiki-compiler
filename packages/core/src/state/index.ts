import * as path from "path";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import type {
  CompileState,
  TopicState,
  ConceptState,
  FileState,
  TaskRecord,
  TaskStatus,
  TaskProgress,
} from "@llm-wiki-compiler/types";
import { generateId, formatDate } from "@llm-wiki-compiler/shared";

// ============================================================================
// Compile State Store
// ============================================================================

const COMPILE_STATE_FILENAME = ".compile-state.json";

export interface CompileStateStore {
  load(projectRoot: string, outputDir: string): Promise<CompileState | null>;
  save(projectRoot: string, outputDir: string, state: CompileState): Promise<void>;
  initialize(projectRoot: string, outputDir: string): Promise<CompileState>;
  updateFileState(
    projectRoot: string,
    outputDir: string,
    filePath: string,
    fileState: FileState
  ): Promise<void>;
  updateTopicState(
    projectRoot: string,
    outputDir: string,
    topicState: TopicState
  ): Promise<void>;
  isStateChanged(projectRoot: string, outputDir: string, filePath: string, mtimeMs: number): Promise<boolean>;
}

export class FileSystemCompileStateStore implements CompileStateStore {
  async load(projectRoot: string, outputDir: string): Promise<CompileState | null> {
    const statePath = this.getStatePath(projectRoot, outputDir);

    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const content = await fs.readFile(statePath, "utf-8");
      return JSON.parse(content) as CompileState;
    } catch (error) {
      console.warn(`Failed to load compile state from ${statePath}:`, error);
      return null;
    }
  }

  async save(projectRoot: string, outputDir: string, state: CompileState): Promise<void> {
    const statePath = this.getStatePath(projectRoot, outputDir);
    const stateDir = path.dirname(statePath);

    // Ensure directory exists
    await fs.mkdir(stateDir, { recursive: true });

    await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
  }

  async initialize(projectRoot: string, outputDir: string): Promise<CompileState> {
    const now = formatDate(new Date());

    const state: CompileState = {
      last_compiled: now,
      files: {},
      topics: [],
      concepts: [],
    };

    await this.save(projectRoot, outputDir, state);
    return state;
  }

  async updateFileState(
    projectRoot: string,
    outputDir: string,
    filePath: string,
    fileState: FileState
  ): Promise<void> {
    const state = await this.load(projectRoot, outputDir);

    if (!state) {
      throw new Error("Compile state does not exist. Call initialize first.");
    }

    state.files[filePath] = fileState;
    await this.save(projectRoot, outputDir, state);
  }

  async updateTopicState(
    projectRoot: string,
    outputDir: string,
    topicState: TopicState
  ): Promise<void> {
    const state = await this.load(projectRoot, outputDir);

    if (!state) {
      throw new Error("Compile state does not exist. Call initialize first.");
    }

    const existingIndex = state.topics.findIndex((t) => t.slug === topicState.slug);

    if (existingIndex >= 0) {
      state.topics[existingIndex] = topicState;
    } else {
      state.topics.push(topicState);
    }

    await this.save(projectRoot, outputDir, state);
  }

  async isChanged(
    projectRoot: string,
    outputDir: string,
    filePath: string,
    mtimeMs: number
  ): Promise<boolean> {
    const state = await this.load(projectRoot, outputDir);

    if (!state) {
      return true; // First run, everything is new
    }

    const fileState = state.files[filePath];

    if (!fileState) {
      return true; // New file
    }

    return fileState.mtimeMs !== mtimeMs;
  }

  private getStatePath(projectRoot: string, outputDir: string): string {
    return path.resolve(projectRoot, outputDir, COMPILE_STATE_FILENAME);
  }
}

// ============================================================================
// Task Store
// ============================================================================

export interface TaskStore {
  create(task: Omit<TaskRecord, "id" | "createdAt">): Promise<string>;
  update(id: string, task: Partial<TaskRecord>): Promise<void>;
  get(id: string): Promise<TaskRecord | null>;
  list(projectRoot: string): Promise<TaskRecord[]>;
  updateProgress(id: string, progress: TaskProgress): Promise<void>;
  setStatus(id: string, status: TaskStatus): Promise<void>;
  setError(id: string, code: string, message: string, details?: unknown): Promise<void>;
  delete(id: string): Promise<void>;
}

export class FileSystemTaskStore implements TaskStore {
  private tasksDir: string;

  constructor(tasksDir?: string) {
    this.tasksDir = tasksDir || path.join(process.cwd(), ".wiki-compiler", "tasks");
  }

  async create(task: Omit<TaskRecord, "id" | "createdAt">): Promise<string> {
    const id = generateId();
    const now = new Date().toISOString();

    const taskRecord: TaskRecord = {
      ...task,
      id,
      createdAt: now,
    };

    await this.save(id, taskRecord);
    return id;
  }

  async update(id: string, task: Partial<TaskRecord>): Promise<void> {
    const existing = await this.get(id);

    if (!existing) {
      throw new Error(`Task ${id} not found`);
    }

    await this.save(id, { ...existing, ...task });
  }

  async get(id: string): Promise<TaskRecord | null> {
    const taskPath = this.getTaskPath(id);

    if (!existsSync(taskPath)) {
      return null;
    }

    try {
      const content = await fs.readFile(taskPath, "utf-8");
      return JSON.parse(content) as TaskRecord;
    } catch {
      return null;
    }
  }

  async list(projectRoot: string): Promise<TaskRecord[]> {
    await this.ensureTasksDir();

    try {
      const files = await fs.readdir(this.tasksDir);
      const tasks: TaskRecord[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const id = file.slice(0, -5); // Remove .json extension
          const task = await this.get(id);

          if (task && task.projectRoot === projectRoot) {
            tasks.push(task);
          }
        } catch (error) {
          console.warn(`Failed to read task file ${file}:`, error);
        }
      }

      return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  async updateProgress(id: string, progress: TaskProgress): Promise<void> {
    await this.update(id, { progress });
  }

  async setStatus(id: string, status: TaskStatus): Promise<void> {
    const updates: Partial<TaskRecord> = { status };

    if (status === "running") {
      updates.startedAt = new Date().toISOString();
    } else if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.finishedAt = new Date().toISOString();
    }

    await this.update(id, updates);
  }

  async setError(id: string, code: string, message: string, details?: unknown): Promise<void> {
    await this.update(id, {
      status: "failed",
      finishAt: new Date().toISOString(),
      error: {
        code,
        message,
        details,
      },
    });
  }

  async delete(id: string): Promise<void> {
    const taskPath = this.getTaskPath(id);

    if (existsSync(taskPath)) {
      await fs.unlink(taskPath);
    }
  }

  private async save(id: string, task: TaskRecord): Promise<void> {
    await this.ensureTasksDir();
    const taskPath = this.getTaskPath(id);
    await fs.writeFile(taskPath, JSON.stringify(task, null, 2), "utf-8");
  }

  private getTaskPath(id: string): string {
    return path.join(this.tasksDir, `${id}.json`);
  }

  private async ensureTasksDir(): Promise<void> {
    await fs.mkdir(this.tasksDir, { recursive: true });
  }
}

// ============================================================================
// Log Manager
// ============================================================================

export interface LogManager {
  append(projectRoot: string, outputDir: string, entry: LogEntry): Promise<void>;
  read(projectRoot: string, outputDir: string, limit?: number): Promise<LogEntry[]>;
  clear(projectRoot: string, outputDir: string): Promise<void>;
}

export interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  details?: unknown;
}

export class FileSystemLogManager implements LogManager {
  private readonly LOG_FILENAME = "log.md";

  async append(projectRoot: string, outputDir: string, entry: LogEntry): Promise<void> {
    const logPath = path.resolve(projectRoot, outputDir, this.LOG_FILENAME);
    const logDir = path.dirname(logPath);

    await fs.mkdir(logDir, { recursive: true });

    const timestamp = new Date(entry.timestamp).toISOString();
    const entryText = this.formatEntry(timestamp, entry.level, entry.message, entry.details);

    if (existsSync(logPath)) {
      await fs.appendFile(logPath, `${entryText}\n`, "utf-8");
    } else {
      await fs.writeFile(logPath, `# Wiki Compiler Log\n\n${entryText}\n`, "utf-8");
    }
  }

  async read(projectRoot: string, outputDir: string, limit?: number): Promise<LogEntry[]> {
    const logPath = path.resolve(projectRoot, outputDir, this.LOG_FILENAME);

    if (!existsSync(logPath)) {
      return [];
    }

    try {
      const content = await fs.readFile(logPath, "utf-8");
      return this.parseLog(content, limit);
    } catch (error) {
      console.warn(`Failed to read log from ${logPath}:`, error);
      return [];
    }
  }

  async clear(projectRoot: string, outputDir: string): Promise<void> {
    const logPath = path.resolve(projectRoot, outputDir, this.LOG_FILENAME);

    if (existsSync(logPath)) {
      await fs.unlink(logPath);
    }
  }

  private formatEntry(
    timestamp: string,
    level: string,
    message: string,
    details?: unknown
  ): string {
    let entry = `## ${timestamp} [${level.toUpperCase()}]\n\n${message}`;

    if (details) {
      entry += `\n\n\`\`\`\njson\n${JSON.stringify(details, null, 2)}\n\`\`\``;
    }

    return entry;
  }

  private parseLog(content: string, limit?: number): LogEntry[] {
    const entries: LogEntry[] = [];

    // Split by "## " which marks the start of each entry
    const entryMarker = "## ";
    const sections = content.split(entryMarker).slice(1); // Skip empty first split

    let entriesToProcess = limit ? sections.slice(-limit) : sections;

    for (const section of entriesToProcess) {
      try {
        // Extract timestamp from first line
        const firstLineEnd = section.indexOf("]");
        const timestamp = section.slice(0, firstLineEnd);

        // Extract level
        const levelStart = section.indexOf("[", firstLineEnd) + 1;
        const levelEnd = section.indexOf("]", levelStart);
        const level = section.slice(levelStart, levelEnd).toLowerCase() as LogEntry["level"];

        // Extract message (everything until a code block or end)
        const messageEnd = section.search(/(\n\n```|\n\n##)/);
        const message = section
          .slice(levelEnd + 2, messageEnd >= 0 ? messageEnd : section.length)
          .trim();

        // Extract details from code block if present
        const codeBlockStart = section.indexOf("```json");
        let details: unknown = undefined;

        if (codeBlockStart > 0) {
          const codeBlockEnd = section.indexOf("```", codeBlockStart + 7);
          try {
            const jsonStr = section.slice(codeBlockStart + 7, codeBlockEnd).trim();
            details = JSON.parse(jsonStr);
          } catch {
            // Ignore JSON parse errors
          }
        }

        entries.push({
          timestamp: new Date(timestamp).toISOString(),
          level,
          message,
          details,
        });
      } catch (error) {
        console.warn("Failed to parse log entry:", error);
      }
    }

    return entries;
  }
}

// ============================================================================
// Factories
// ============================================================================

export function createCompileStateStore(): CompileStateStore {
  return new FileSystemCompileStateStore();
}

export function createTaskStore(tasksDir?: string): TaskStore {
  return new FileSystemTaskStore(tasksDir);
}

export function createLogManager(): LogManager {
  return new FileSystemLogManager();
}
