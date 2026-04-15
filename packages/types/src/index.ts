// ============================================================================
// Common Types
// ============================================================================

export type ProjectMode = "knowledge" | "codebase";

export type AgentProvider = "claude-code" | "codex" | "openclaw";

export type LinkStyle = "obsidian" | "markdown";

export type AutoUpdate = "off" | "prompt" | "always";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type CoverageLevel = "high" | "medium" | "low";

export type ServiceDiscovery = "auto" | "manual";

export type ArticleKind = "service" | "module" | "cross-cutting" | "knowledge-topic";

export type TaskType = "compile" | "query" | "lint" | "ingest";

// ============================================================================
// Project Configuration
// ============================================================================

export interface ProjectConfig {
  version: number;
  name: string;
  mode: ProjectMode;
  sources: SourceConfig[];
  output: string;
  service_discovery?: ServiceDiscovery;
  knowledge_files?: string[];
  deep_scan?: boolean;
  code_extensions?: string[];
  topic_hints?: string[];
  article_sections?: ArticleSectionConfig[];
  link_style?: LinkStyle;
  auto_update?: AutoUpdate;
  agent?: AgentProviderConfig;
  app?: AppConfig;
}

export interface SourceConfig {
  path: string;
  exclude?: string[];
}

export interface ArticleSectionConfig {
  name: string;
  description: string;
  required?: boolean;
}

export interface AgentProviderConfig {
  provider: AgentProvider;
  command?: string;
  args?: string[];
  timeout_ms?: number;
  max_concurrency?: number;
}

export interface AppConfig {
  port?: number;
  host?: string;
}

// ============================================================================
// Compile State
// ============================================================================

export interface CompileState {
  last_compiled: string;
  files: Record<string, FileState>;
  topics: TopicState[];
  concepts: ConceptState[];
}

export interface FileState {
  path: string;
  mtimeMs: number;
  hash?: string;
}

export interface TopicState {
  slug: string;
  title: string;
  sourceFiles: string[];
  lastCompiled: string;
}

export interface ConceptState {
  slug: string;
  title: string;
  topicSlugs: string[];
  lastCompiled: string;
}

// ============================================================================
// Topics and Concepts
// ============================================================================

export interface TopicCandidate {
  slug: string;
  title: string;
  sourceFiles: string[];
  kind: ArticleKind;
  aliases?: string[];
}

export interface ConceptCandidate {
  slug: string;
  title: string;
  topicSlugs: string[];
}

export interface TopicArticle {
  slug: string;
  title: string;
  content: string;
  frontmatter: TopicFrontmatter;
  sourceFiles: string[];
  kind: ArticleKind;
}

export interface TopicFrontmatter {
  topic: string;
  last_compiled: string;
  source_count: number;
  status: "active" | "stale";
  coverage?: Record<string, CoverageLevel>;
}

export interface ConceptArticle {
  slug: string;
  title: string;
  content: string;
  frontmatter: ConceptFrontmatter;
  topicSlugs: string[];
  pattern: string;
  instances: ConceptInstance[];
  meaning: string;
}

export interface ConceptFrontmatter {
  concept: string;
  last_compiled: string;
  topics_connected: string[];
  status: "active";
}

export interface ConceptInstance {
  date: string;
  topicSlug: string;
  description: string;
}

// ============================================================================
// Source Files
// ============================================================================

export interface SourceFile {
  path: string;
  mtimeMs: number;
  content: string;
  title?: string;
  language?: string;
}

export interface ScanResult {
  files: SourceFile[];
  mode: ProjectMode;
  projectRoot: string;
}

// ============================================================================
// Schema
// ============================================================================

export interface SchemaDocument {
  version: number;
  topics: SchemaTopic[];
  concepts: SchemaConcept[];
  naming_conventions: NamingConvention[];
  evolution_log: SchemaEvolutionEntry[];
}

export interface SchemaTopic {
  slug: string;
  title: string;
  kind: ArticleKind;
  aliases?: string[];
}

export interface SchemaConcept {
  slug: string;
  title: string;
}

export interface NamingConvention {
  scope: string;
  pattern: string;
  description: string;
}

export interface SchemaEvolutionEntry {
  date: string;
  action: string;
  details?: string;
}

// ============================================================================
// Compile Plan
// ============================================================================

export interface CompilePlan {
  mode: "incremental" | "full" | "topic-only";
  topicsToCompile: TopicCompilePlanItem[];
  conceptsEnabled: boolean;
  maxConcurrency: number;
}

export interface TopicCompilePlanItem {
  slug: string;
  title: string;
  sourceFiles: string[];
  isNew: boolean;
  hasChanges: boolean;
}

export interface CompilePlanInput {
  config: ProjectConfig;
  state: CompileState | null;
  scanResult: ScanResult;
}

export interface CompileResult {
  topicsUpdated: string[];
  topicsCreated: string[];
  conceptsUpdated: string[];
  conceptsCreated: string[];
  sourcesScanned: number;
  sourcesChanged: number;
  durationMs: number;
  errors: CompileError[];
}

export interface CompileError {
  topicSlug: string;
  error: string;
  phase: string;
}

// ============================================================================
// Graph
// ============================================================================

export interface GraphResponse {
  name: string;
  totalTopics: number;
  totalConcepts: number;
  totalSources: number;
  topics: GraphTopicNode[];
  concepts: GraphConceptNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "topic" | "concept";
  coverage?: "high" | "medium" | "low";
  status?: "active" | "stale";
}

export interface GraphTopicNode extends GraphNode {
  type: "topic";
  kind: ArticleKind;
  sourceCount: number;
  lastCompiled: string;
}

export interface GraphConceptNode extends GraphNode {
  type: "concept";
  connectedTopics: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "topic-concept" | "topic-topic";
}

// ============================================================================
// Search and Query
// ============================================================================

export interface SearchInput {
  query: string;
  limit?: number;
  types?: ("topic" | "concept")[];
}

export interface SearchResult {
  type: "topic" | "concept";
  slug: string;
  title: string;
  summary: string;
  relevance: number;
  sections?: SearchSection[];
}

export interface SearchSection {
  heading: string;
  snippet: string;
  coverage: CoverageLevel;
}

export interface QueryInput {
  question: string;
  contextLimit?: number;
}

export interface QueryResult {
  answer: string;
  sources: QuerySource[];
  confidence: "high" | "medium" | "low";
}

export interface QuerySource {
  type: "topic" | "concept" | "file";
  slug: string;
  title: string;
  relevance: number;
  excerpt: string;
}

// ============================================================================
// Lint
// ============================================================================

export interface LintInput {
  checks?: LintCheckType[];
}

export type LintCheckType =
  | "stale"
  | "orphan"
  | "cross-ref"
  | "low-coverage"
  | "contradiction"
  | "schema-drift";

export interface LintReport {
  timestamp: string;
  total_issues: number;
  issues: LintIssue[];
  summary: LintSummary;
}

export interface LintIssue {
  type: LintCheckType;
  severity: "error" | "warning" | "info";
  articleSlug: string;
  articleTitle: string;
  message: string;
  location?: string;
  suggestions?: string[];
}

export interface LintSummary {
  errors: number;
  warnings: number;
  info: number;
  by_type: Record<LintCheckType, number>;
}

// ============================================================================
// Tasks
// ============================================================================

export interface TaskRecord {
  id: string;
  type: TaskType;
  projectRoot: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: TaskProgress;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: TaskError;
}

export interface TaskProgress {
  phase: string;
  completed: number;
  total: number;
  message?: string;
  items?: TaskProgressItem[];
}

export interface TaskProgressItem {
  id: string;
  label: string;
  status: "pending" | "in-progress" | "completed" | "failed";
}

export interface TaskError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// Index
// ============================================================================

export interface IndexDocument {
  name: string;
  lastCompiled: string;
  totalTopics: number;
  totalSources: number;
  topics: IndexTopic[];
  concepts?: IndexConcept[];
  recentChanges: IndexChange[];
}

export interface IndexTopic {
  slug: string;
  title: string;
  aliases?: string;
  sourceCount: number;
  lastUpdated: string;
  status: "active" | "stale";
}

export interface IndexConcept {
  slug: string;
  title: string;
  connectsTo: string[];
  lastUpdated: string;
}

export interface IndexChange {
  date: string;
  description: string;
}

// ============================================================================
// Agent System
// ============================================================================

export interface AgentCapabilities {
  supportsSystemPrompt: boolean;
  supportsFileContext: boolean;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
}

export interface AgentRunInput {
  cwd: string;
  systemPrompt?: string;
  userPrompt: string;
  files?: string[];
  timeoutMs?: number;
  expectJson?: boolean;
  metadata?: Record<string, string>;
}

export interface AgentRunResult {
  text: string;
  rawStdout: string;
  rawStderr: string;
  exitCode: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Config Loader
// ============================================================================

export interface GlobalConfig {
  defaultAgent?: AgentProvider;
  projectsPath?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
}

// ============================================================================
// Errors
// ============================================================================

export class WikiCompilerError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "WikiCompilerError";
  }
}

export const ErrorCodes = {
  // Config errors
  CONFIG_INVALID: "CONFIG_INVALID",
  CONFIG_MISSING: "CONFIG_MISSING",
  CONFIG_VERSION_MISMATCH: "CONFIG_VERSION_MISMATCH",

  // Scanner errors
  SCAN_FAILED: "SCAN_FAILED",
  SCAN_PATH_NOT_FOUND: "SCAN_PATH_NOT_FOUND",

  // Discovery errors
  DISCOVERY_FAILED: "DISCOVERY_FAILED",
  DISCOVERY_NO_TOPICS: "DISCOVERY_NO_TOPICS",

  // Compile errors
  COMPILE_FAILED: "COMPILE_FAILED",
  COMPILE_PLAN_INVALID: "COMPILE_PLAN_INVALID",
  COMPILE_ARTICLE_INVALID: "COMPILE_ARTICLE_INVALID",

  // Agent errors
  AGENT_UNAVAILABLE: "AGENT_UNAVAILABLE",
  AGENT_TIMEOUT: "AGENT_TIMEOUT",
  AGENT_ERROR: "AGENT_ERROR",
  AGENT_INVALID_OUTPUT: "AGENT_INVALID_OUTPUT",

  // File system errors
  FS_READ_FAILED: "FS_READ_FAILED",
  FS_WRITE_FAILED: "FS_WRITE_FAILED",
  FS_PATH_INVALID: "FS_PATH_INVALID",

  // Task errors
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_ALREADY_RUNNING: "TASK_ALREADY_RUNNING",
  TASK_CANCEL_FAILED: "TASK_CANCEL_FAILED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
