// ============================================================================
// Utilities
// ============================================================================

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .trim();
}

export function kebabCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function resolveRelativePath(from: string, to: string): string {
  const fromParts = from.split("/").filter(Boolean);
  const toParts = to.split("/").filter(Boolean);

  // Remove common prefix
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < fromParts.length &&
    commonPrefixLength < toParts.length &&
    fromParts[commonPrefixLength] === toParts[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }

  const fromRemaining = fromParts.slice(commonPrefixLength);
  const toRemaining = toParts.slice(commonPrefixLength);

  const upSegments = Array.from({ length: fromRemaining.length }, () => "..");
  const downSegments = toRemaining;

  return [...upSegments, ...downSegments].join("/") || ".";
}

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

export function isMarkdownFile(filename: string): boolean {
  const ext = getFileExtension(filename).toLowerCase();
  return ["md", "markdown"].includes(ext);
}

export function isCodeFile(filename: string, extensions: string[] = []): boolean {
  const ext = getFileExtension(filename).toLowerCase();
  const defaultCodeExtensions = [
    "js",
    "ts",
    "tsx",
    "jsx",
    "py",
    "go",
    "rs",
    "java",
    "kt",
    "swift",
    "rb",
    "php",
    "cs",
    "cpp",
    "c",
    "h",
    "cppm",
  ];
  const allowedExtensions = extensions.length > 0 ? extensions : defaultCodeExtensions;
  return allowedExtensions.includes(ext);
}

// ============================================================================
// Path Resolution
// ============================================================================

export class PathResolver {
  constructor(private projectRoot: string) {}

  resolve(path: string): string {
    if (path.startsWith("/")) {
      return path;
    }
    return /^[a-zA-Z]:/.test(path) ? path : `${this.projectRoot}/${path}`;
  }

  relative(path: string): string {
    const absolute = this.resolve(path);
    return resolveRelativePath(this.projectRoot, absolute);
  }

  join(...parts: string[]): string {
    return parts
      .join("/")
      .replace(/\/+/g, "/")
      .replace(/^\//, "")
      .replace(/\/$/, "");
  }
}

// ============================================================================
// Logger
// ============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private logLevel: LogLevel;

  constructor(
    private context: string,
    level: LogLevel = LogLevel.INFO
  ) {
    this.logLevel = level;
  }

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private formatMessage(level: string, message: string, meta?: unknown): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level}] [${this.context}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: unknown): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.error(this.formatMessage("DEBUG", message, meta));
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(this.formatMessage("INFO", message, meta));
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage("WARN", message, meta));
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage("ERROR", message, meta));
    }
  }
}

export function createLogger(context: string, level?: LogLevel): Logger {
  // Read from global config if available, otherwise use default
  return new Logger(context, level ?? LogLevel.INFO);
}

// ============================================================================
// Id Generation
// ============================================================================

export function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Timeout
// ============================================================================

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// ============================================================================
// Retry
// ============================================================================

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    delayMs,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

// ============================================================================
// Debounce and Throttle
// ============================================================================

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCallTime >= delayMs) {
      lastCallTime = now;
      fn(...args);
    }
  };
}

// ============================================================================
// Object Utilities
// ============================================================================

export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof result[key] === "object" &&
        !Array.isArray(result[key]) &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        (result[key] as Record<string, unknown>) = deepMerge(
          result[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        (result[key] as unknown) = source[key];
      }
    }
  }

  return result;
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

// ============================================================================
// String Utilities
// ============================================================================

export function truncate(str: string, maxLength: number, suffix = "..."): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}

export function wordCount(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// ============================================================================
// Array Utilities
// ============================================================================

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function asyncMap<T, U>(
  array: T[],
  fn: (item: T, index: number) => Promise<U>,
  concurrency?: number
): Promise<U[]> {
  if (concurrency === undefined || concurrency < 1) {
    return Promise.all(array.map(fn));
  }

  const results: U[] = new Array(array.length);
  const executing: Promise<unknown>[] = [];

  for (let i = 0; i < array.length; i++) {
    const promise = fn(array[i], i).then((result) => {
      results[i] = result;
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.indexOf(promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
}

export function unique<T>(array: T[], key?: keyof T): T[] {
  if (!key) {
    return [...new Set(array)];
  }
  const seen = new Set<unknown>();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
