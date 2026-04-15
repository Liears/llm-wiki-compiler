# LLM Wiki Compiler 独立应用

## 详细技术设计文档 v1

## 1. 文档目的

本文档定义将当前 `llm-wiki-compiler` 从 Claude Code 插件重构为独立应用的第一版技术方案。目标是形成可实施的系统设计，支持：

- 命令行使用
- Web 前端使用
- 调用多种外部 Agent CLI
- 以本地文件系统为主的数据存储方式
- 保留现有 prompt/template 资产

本文档面向实现阶段，重点覆盖：

- 系统边界
- 模块划分
- 数据结构
- 核心流程
- API 设计
- 前端设计
- 任务模型
- 迁移策略

## 2. 背景与现状

当前仓库主要由以下几类资产组成：

- `plugin/commands/*.md`
  - 定义插件命令的执行规范
- `plugin/skills/wiki-compiler/SKILL.md`
  - 定义 wiki 编译算法
- `plugin/templates/*.md`
  - 定义 topic/index/schema 模板
- `plugin/hooks/*`
  - 定义 SessionStart hook
- `plugin/visualize/*`
  - 定义知识图谱可视化服务与前端

当前实现方式的本质是：

- 插件宿主负责命令调度
- LLM 通过 prompt/skill 驱动工作流
- hook 负责把 wiki 上下文注入会话

该形态存在以下限制：

- 强依赖 Claude Code 插件生态
- 无法统一支持 `codex`、`openclaw` 等其他 CLI
- 缺少独立后端、任务系统和统一 API
- 前端能力仅限单独的图谱页面，无法覆盖初始化、编译、搜索、问答、lint 等流程

因此需要重构为独立应用。

## 3. 设计目标

### 3.1 功能目标

- 提供独立 CLI：
  - `wiki init`
  - `wiki compile`
  - `wiki ingest`
  - `wiki search`
  - `wiki query`
  - `wiki lint`
  - `wiki serve`
  - `wiki graph`
- 提供 Web UI：
  - 项目初始化
  - 编译控制台
  - Wiki 浏览器
  - 图谱视图
  - 搜索和问答
  - Lint 结果查看
- 支持多个 Agent Provider：
  - `claude code`
  - `codex`
  - `openclaw`
- 保留现有 Markdown 输出物：
  - `wiki/INDEX.md`
  - `wiki/schema.md`
  - `wiki/topics/*.md`
  - `wiki/concepts/*.md`
  - `wiki/.compile-state.json`

### 3.2 技术目标

- 业务逻辑与 Agent CLI 解耦
- CLI 与 Web 共用同一套后端核心逻辑
- 可观测的异步任务执行模型
- 文件系统优先，不引入数据库作为首版前提
- 提示词资产可复用、可演进、可测试

### 3.3 非目标

- 首版不构建托管云服务
- 首版不实现多用户权限系统
- 首版不依赖向量数据库
- 首版不做实时协同编辑

## 4. 系统边界

### 4.1 系统负责

- 扫描源文件
- 读取与校验项目配置
- 发现变更
- 构建 topic/concept 编译计划
- 调用 Agent CLI 进行内容综合与生成
- 写入 wiki 文件
- 更新 index/schema/state/log
- 提供 API 与前端页面
- 提供图谱数据
- 提供任务与日志视图

### 4.2 系统不负责

- 自行实现底层大模型推理
- 托管模型 API 计费与鉴权
- 替代现有 IDE/编辑器
- 强制管理用户的 `CLAUDE.md` 或 `AGENTS.md`

## 5. 总体架构

系统采用单仓库多包结构，逻辑划分为五层：

1. `apps/cli`
   - 提供命令行入口
2. `apps/server`
   - 提供 HTTP API、任务管理和静态资源服务
3. `apps/web`
   - 提供前端界面
4. `packages/core`
   - 提供核心业务逻辑
5. `packages/agents`
   - 提供对外部 Agent CLI 的统一适配

辅助包：

- `packages/prompts`
- `packages/templates`
- `packages/shared`

逻辑关系如下：

```text
CLI / Web UI
    ↓
Server / Use Cases
    ↓
Pipelines
    ↓
Core Domain + Agent Adapters
    ↓
Filesystem + External CLI Processes
```

## 6. 技术选型

### 6.1 后端

- 运行时：Node.js
- 语言：TypeScript
- API 框架：Fastify
- 子进程调用：`execa` 或 Node `child_process`
- Markdown 处理：`gray-matter`、`remark`、`markdown-it` 任选其一组合
- 文件扫描：`fast-glob`
- Schema 校验：`zod`

选择 Node.js + TypeScript 的原因：

- 现有可视化服务已是 Node 实现
- 文件系统和子进程编排能力充足
- CLI、API、前端共享类型更直接
- 后续桌面封装和前端整合成本更低

### 6.2 CLI

- 推荐使用 `commander` 或 `cac`

### 6.3 前端

- React + Vite + TypeScript
- 路由：React Router
- 状态管理：TanStack Query + 局部 Zustand
- Markdown 渲染：`react-markdown`
- 图谱视图：自绘 Canvas 或继续复用现有 Canvas 方案

### 6.4 测试

- 单元测试：Vitest
- 接口测试：Supertest
- E2E：Playwright

## 7. 目录结构

推荐目录结构如下：

```text
llm-wiki-compiler/
  apps/
    cli/
      src/
        index.ts
        commands/
          init.ts
          compile.ts
          ingest.ts
          search.ts
          query.ts
          lint.ts
          serve.ts
          graph.ts
          doctor.ts
          agents.ts
    server/
      src/
        index.ts
        app.ts
        routes/
          project.ts
          compile.ts
          tasks.ts
          wiki.ts
          graph.ts
          search.ts
          query.ts
          lint.ts
          agents.ts
    web/
      src/
        main.tsx
        app/
        pages/
        features/
        components/
        lib/
        styles/
  packages/
    core/
      src/
        config/
        scanner/
        discovery/
        compile/
        wiki/
        query/
        search/
        lint/
        state/
        types/
    agents/
      src/
        providers/
        base/
        health/
    prompts/
      assets/
        commands/
        skills/
      src/
    templates/
      assets/
    shared/
      src/
  docs/
    technical-design-v1.md
```

## 8. 模块设计

## 8.1 `packages/core`

`core` 负责全部确定性逻辑，不直接关心具体 Agent CLI 实现细节。

### 8.1.1 config

职责：

- 读取项目配置 `.wiki-compiler.json`
- 读取全局应用配置
- 解析相对路径
- 校验 schema
- 提供默认值填充

关键接口：

```ts
export interface ConfigLoader {
  loadProjectConfig(cwd: string): Promise<ProjectConfig>
  loadGlobalConfig(): Promise<GlobalConfig>
}
```

### 8.1.2 scanner

职责：

- 扫描源目录
- 过滤排除路径
- 根据 mode 选择扫描策略
- 输出候选源文件列表

关键接口：

```ts
export interface ScanResult {
  files: SourceFile[]
  mode: "knowledge" | "codebase"
}

export interface ScannerService {
  scan(config: ProjectConfig): Promise<ScanResult>
}
```

### 8.1.3 discovery

职责：

- 基于目录结构、manifest 和知识文件发现 topics
- 从已编译文章中识别跨 topic concepts
- 复用 schema 中已有命名约束

关键接口：

```ts
export interface TopicDiscoveryService {
  discover(input: TopicDiscoveryInput): Promise<TopicCandidate[]>
}

export interface ConceptDiscoveryService {
  discover(input: ConceptDiscoveryInput): Promise<ConceptCandidate[]>
}
```

注意：

- topic 发现可以是“本地启发式 + Agent 辅助”
- concept 发现通常更依赖 Agent 综合

### 8.1.4 compile

职责：

- 生成 compile plan
- 执行 topic article 编译
- 执行 concept article 编译
- 控制并发、重试、失败收敛

关键接口：

```ts
export interface CompilePlanner {
  plan(input: CompilePlanInput): Promise<CompilePlan>
}

export interface CompileExecutor {
  execute(plan: CompilePlan): Promise<CompileResult>
}
```

### 8.1.5 wiki

职责：

- 写入 topic/concept article
- 解析现有 markdown
- 生成 `INDEX.md`
- 生成/更新 `schema.md`
- 生成图谱数据

关键接口：

```ts
export interface ArticleWriter {
  writeTopic(article: TopicArticle): Promise<void>
  writeConcept(article: ConceptArticle): Promise<void>
}

export interface IndexBuilder {
  build(input: IndexBuildInput): Promise<string>
}

export interface SchemaManager {
  load(path: string): Promise<SchemaDocument | null>
  update(input: SchemaUpdateInput): Promise<SchemaDocument>
}
```

### 8.1.6 search / query / lint

职责：

- search：关键词检索 wiki 文章
- query：选择相关文章并调用 Agent 综合回答
- lint：对 stale/orphan/coverage/contradiction/schema drift 做检查

关键接口：

```ts
export interface SearchService {
  search(input: SearchInput): Promise<SearchResult[]>
}

export interface QueryService {
  answer(input: QueryInput): Promise<QueryResult>
}

export interface LintService {
  run(input: LintInput): Promise<LintReport>
}
```

### 8.1.7 state

职责：

- 管理 `.compile-state.json`
- 管理任务记录
- 管理运行日志

关键接口：

```ts
export interface CompileStateStore {
  load(projectRoot: string, outputDir: string): Promise<CompileState | null>
  save(projectRoot: string, outputDir: string, state: CompileState): Promise<void>
}

export interface TaskStore {
  create(task: TaskRecord): Promise<void>
  update(task: TaskRecord): Promise<void>
  get(id: string): Promise<TaskRecord | null>
  list(projectRoot: string): Promise<TaskRecord[]>
}
```

## 8.2 `packages/agents`

该模块负责对不同 Agent CLI 做统一抽象。

### 8.2.1 设计原则

- pipeline 只能依赖抽象接口，不能直接拼 CLI 命令
- 所有 provider 都输出统一结果结构
- provider 差异通过 `capabilities` 描述
- 所有 provider 都要支持 availability check

### 8.2.2 核心接口

```ts
export interface AgentCapabilities {
  supportsSystemPrompt: boolean
  supportsFileContext: boolean
  supportsJsonMode: boolean
  supportsStreaming: boolean
}

export interface AgentRunInput {
  cwd: string
  systemPrompt?: string
  userPrompt: string
  files?: string[]
  timeoutMs?: number
  expectJson?: boolean
  metadata?: Record<string, string>
}

export interface AgentRunResult {
  text: string
  rawStdout: string
  rawStderr: string
  exitCode: number
  durationMs: number
}

export interface AgentAdapter {
  name: string
  capabilities: AgentCapabilities
  isAvailable(): Promise<boolean>
  run(input: AgentRunInput): Promise<AgentRunResult>
}
```

### 8.2.3 Provider 实现

初版提供：

- `ClaudeCodeAdapter`
- `CodexAdapter`
- `OpenClawAdapter`

每个 provider 负责：

- CLI 路径解析
- 参数拼装
- 非交互调用
- 超时控制
- stdout/stderr 处理
- 错误码映射

### 8.2.4 Agent 工厂

```ts
export interface AgentFactory {
  get(provider: AgentProviderConfig): AgentAdapter
}
```

## 8.3 `packages/prompts`

职责：

- 加载 prompt 模板
- 渲染变量
- 提供按 use case 分类的 prompt 访问接口

现有资产迁移路径：

- `plugin/commands/*.md` -> `packages/prompts/assets/commands/*.md`
- `plugin/skills/wiki-compiler/SKILL.md` -> `packages/prompts/assets/skills/wiki-compiler.md`

关键接口：

```ts
export interface PromptLoader {
  load(name: string): Promise<string>
}

export interface PromptRenderer {
  render(template: string, variables: Record<string, unknown>): string
}
```

要求：

- prompt 文件只做内容模板
- 业务流程不嵌在 prompt loader 中
- provider-neutral，不出现插件专属上下文假设

## 8.4 `packages/templates`

职责：

- 保存 Markdown 模板资产
- 向 `core/wiki` 提供模板读取能力

迁移资产：

- `plugin/templates/article-template.md`
- `plugin/templates/codebase-article-template.md`
- `plugin/templates/index-template.md`
- `plugin/templates/schema-template.md`

## 8.5 `apps/server`

`server` 是 CLI 与 Web 共用的后端 API 层。

职责：

- 提供 REST API
- 管理长任务生命周期
- 提供项目状态读取能力
- 提供图谱、搜索、问答、lint 接口
- 承载前端静态资源

任务执行原则：

- 编译、问答、lint 全部建模为任务
- 任务状态写入磁盘
- API 返回任务 ID
- 前端或 CLI 再轮询获取状态

## 8.6 `apps/cli`

职责：

- 提供终端入口
- 参数解析
- 展示简洁的人类友好输出
- 支持 `--json`
- 在需要时转调 server 或直接调用 use case

建议：

- 简单命令可直接调用 core
- 长任务命令优先统一走 server 任务模型

## 8.7 `apps/web`

职责：

- 提供完整交互式界面
- 提供初始化向导、编译控制台、wiki 浏览器、图谱、搜索、问答、lint 面板

前端不直接操作文件系统，只通过 API 与 server 通信。

## 9. 数据模型

## 9.1 项目配置

```ts
export interface ProjectConfig {
  version: number
  name: string
  mode: "knowledge" | "codebase"
  sources: SourceConfig[]
  output: string
  service_discovery?: "auto" | "manual"
  knowledge_files?: string[]
  deep_scan?: boolean
  code_extensions?: string[]
  topic_hints?: string[]
  article_sections?: ArticleSectionConfig[]
  link_style?: "obsidian" | "markdown"
  auto_update?: "off" | "prompt" | "always"
  agent?: AgentProviderConfig
  app?: AppConfig
}
```

## 9.2 源配置

```ts
export interface SourceConfig {
  path: string
  exclude?: string[]
}
```

## 9.3 Agent 配置

```ts
export interface AgentProviderConfig {
  provider: "claude-code" | "codex" | "openclaw"
  command?: string
  args?: string[]
  timeout_ms?: number
  max_concurrency?: number
}
```

## 9.4 编译状态

```ts
export interface CompileState {
  last_compiled: string
  files: Record<string, FileState>
  topics: TopicState[]
  concepts: ConceptState[]
}

export interface FileState {
  path: string
  mtimeMs: number
  hash?: string
}
```

## 9.5 Topic / Concept

```ts
export interface TopicCandidate {
  slug: string
  title: string
  sourceFiles: string[]
  kind: "service" | "module" | "cross-cutting" | "knowledge-topic"
}

export interface ConceptCandidate {
  slug: string
  title: string
  topicSlugs: string[]
}
```

## 9.6 任务模型

```ts
export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export interface TaskRecord {
  id: string
  type: "compile" | "query" | "lint" | "ingest"
  projectRoot: string
  status: TaskStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  progress?: TaskProgress
  input: Record<string, unknown>
  result?: Record<string, unknown>
  error?: TaskError
}

export interface TaskProgress {
  phase: string
  completed: number
  total: number
  message?: string
  items?: TaskProgressItem[]
}
```

## 10. 核心流程设计

## 10.1 `init` 流程

目标：

- 自动检测 mode
- 让用户确认 sources/output/agent
- 生成 `.wiki-compiler.json`

流程：

1. 读取工作目录
2. 检测 manifest files 和 markdown-heavy directories
3. 判断是 `knowledge`、`codebase` 或混合
4. 生成默认建议
5. CLI 交互或 Web 向导确认配置
6. 写入 `.wiki-compiler.json`
7. 初始化输出目录与空状态文件

## 10.2 `compile` 流程

这是系统核心流程。

### 10.2.1 高层步骤

1. 读取 config
2. 读取旧的 compile state
3. 扫描源文件
4. 识别变更
5. 发现 topics
6. 生成 compile plan
7. 并发编译 topic articles
8. 发现并编译 concept articles
9. 更新 schema
10. 更新 index
11. 更新 compile state
12. 写 log
13. 返回 compile result

### 10.2.2 详细任务流转

```text
compile request
  -> create task
  -> load config
  -> scan source files
  -> diff against compile state
  -> discover topics
  -> build compile plan
  -> for each topic:
       dispatch agent task
       collect topic article
       validate article
       write file
  -> collect all compiled topics
  -> dispatch concept discovery
  -> write concept files
  -> update schema/index/state/log
  -> mark task completed
```

### 10.2.3 Compile Plan

```ts
export interface CompilePlan {
  mode: "incremental" | "full" | "topic-only"
  topicsToCompile: TopicCompilePlanItem[]
  conceptsEnabled: boolean
  maxConcurrency: number
}
```

`CompilePlan` 由应用决定，而不是由 Agent 决定。

## 10.3 `ingest` 流程

目标：

- 针对单个文件增量更新相关 topic

流程：

1. 校验 file path
2. 读取 file 内容
3. 加载 schema 和现有 topic
4. 调用 Agent 判断关联 topics
5. 必要时创建新 topic
6. 调用 Agent 更新相关 articles
7. 更新 schema/index/state/log

## 10.4 `search` 流程

目标：

- 快速定位相关 topic / concept / section

流程：

1. 先扫 `INDEX.md`
2. 若不足，全文 grep `topics/` 与 `concepts/`
3. 返回匹配项、摘要、coverage、文件路径

## 10.5 `query` 流程

目标：

- 使用 wiki 内容综合回答问题

流程：

1. 读取 index 和 schema
2. 选择 1-3 个最相关 topics
3. 读取 topics
4. 调用 Agent 综合回答
5. 返回结构化答案与引用
6. 可选写回 article

## 10.6 `lint` 流程

检查项：

- stale articles
- orphan pages
- missing cross references
- low coverage
- contradictions
- schema drift

输出：

- 结构化 lint report
- 可读摘要
- 问题明细列表

## 11. Prompt 运行模型

系统不再把 prompt 当成“命令执行本身”，而是把 prompt 作为业务流程中的一个输入资产。

建议分类：

- `topic-discovery`
- `topic-compile`
- `concept-discovery`
- `concept-compile`
- `query-answer`
- `ingest-update`

每个 prompt 由以下内容构成：

- system 指令
- 任务说明
- 输入数据摘要
- 输出格式要求

建议强制结构化输出：

- 优先要求 JSON 或受限 Markdown
- 程序侧做结果校验

## 12. 文章生成与校验

topic/concept article 在写入前必须经过校验。

校验内容：

- frontmatter 是否存在
- 标题是否存在
- 必需 section 是否齐全
- coverage tag 格式是否正确
- sources section 是否存在
- source file 路径是否有效

若校验失败：

- 记录失败原因
- 可进行一次重试
- 最终失败则任务标记为 partial failure

## 13. API 设计

## 13.1 项目 API

- `GET /api/project`
- `POST /api/project/init`
- `POST /api/project/validate`

## 13.2 编译 API

- `POST /api/compile`
- `GET /api/compile/plan`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/cancel`

## 13.3 Wiki API

- `GET /api/wiki/index`
- `GET /api/wiki/topics`
- `GET /api/wiki/topics/:slug`
- `GET /api/wiki/concepts`
- `GET /api/wiki/concepts/:slug`

## 13.4 图谱 API

- `GET /api/graph`

返回：

```ts
export interface GraphResponse {
  name: string
  totalTopics: number
  totalSources: number
  topics: GraphTopicNode[]
  concepts: GraphConceptNode[]
  edges: GraphEdge[]
}
```

## 13.5 搜索 / 问答 / lint API

- `GET /api/search?q=...`
- `POST /api/query`
- `POST /api/lint`

## 13.6 Agent API

- `GET /api/agents`
- `POST /api/agents/test`

## 14. 前端设计

## 14.1 页面结构

前端提供以下页面：

- Dashboard
- Init Wizard
- Compile Center
- Wiki Explorer
- Graph View
- Search
- Query
- Lint
- Settings

## 14.2 Dashboard

展示内容：

- 当前项目名
- mode
- source 数量
- topic 数量
- concept 数量
- 最近编译时间
- 当前 provider
- 最近任务记录

操作：

- 初始化
- 开始编译
- 查看 graph
- 搜索
- 运行 lint

## 14.3 Init Wizard

采用多步骤表单：

1. 选择项目目录
2. 自动检测 mode
3. 配置 source/exclude
4. 配置 output
5. 选择 Agent provider
6. 配置 article sections
7. 确认写入配置

## 14.4 Compile Center

展示：

- compile plan
- 将要更新的 topics
- 当前 phase
- 各 topic 子任务状态
- 日志输出

操作：

- 开始
- 取消
- 重试失败 topic

## 14.5 Wiki Explorer

布局建议：

- 左侧树：topics / concepts / schema / recent changes
- 右侧阅读区：article markdown
- 顶部工具栏：search / filter / source jump

要求：

- 渲染 coverage badge
- 支持 section anchor
- 支持 sources 点击跳转

## 14.6 Graph View

基于现有 `plugin/visualize/index.html` 重构。

建议能力：

- hover 节点显示摘要
- click 节点打开侧边 article panel
- search filter
- type filter
- coverage filter
- 随窗口自适应布局

## 14.7 Search

展示：

- topic 匹配项
- concept 匹配项
- 命中 section
- coverage 提示
- 快速跳到 article

## 14.8 Query

展示：

- 输入问题
- 结果答案
- topic/section 引用
- “写回 wiki”按钮

## 14.9 Lint

结构化展示所有问题：

- stale
- orphan
- cross-ref
- low coverage
- contradiction
- drift

每个问题都可点击跳转到对应 article。

## 15. 前端状态模型

前端状态分三类：

1. 服务端状态
   - 项目数据
   - task 状态
   - wiki 内容
   - graph 数据
2. 页面临时状态
   - 表单输入
   - filter
   - 当前选中 topic
3. UI 状态
   - 侧边栏开关
   - panel 开关
   - 主题配置

建议：

- 服务端状态用 TanStack Query
- 本地 UI 状态用 Zustand 或 React state

## 16. 任务与并发模型

## 16.1 任务分类

- compile
- query
- lint
- ingest

## 16.2 并发控制

topic 编译支持并发，但应由应用控制：

- 读取 `agent.max_concurrency`
- 默认建议 2-4
- 若 provider 不稳定可自动降级

不允许：

- 让 Agent 自己在 prompt 中决定并发拓扑

## 16.3 取消语义

长任务需要支持取消：

- server 维护任务执行句柄
- 取消时尝试 kill 子进程
- 任务写入 `cancelled`

## 17. 存储设计

## 17.1 项目内文件

- `.wiki-compiler.json`
- `wiki/INDEX.md`
- `wiki/schema.md`
- `wiki/topics/*.md`
- `wiki/concepts/*.md`
- `wiki/.compile-state.json`
- `wiki/log.md`
- `.wiki-compiler/tasks/*.json` 可选

## 17.2 全局应用文件

- `~/.wiki-compiler/config.json`
- `~/.wiki-compiler/projects.json`
- `~/.wiki-compiler/logs/*.log`

## 18. 错误处理

错误分层：

- 配置错误
- 扫描错误
- Agent 调用错误
- 文章校验错误
- 写文件错误
- API 错误

要求：

- 每类错误都有稳定错误码
- CLI 输出简洁错误摘要
- API 返回结构化错误
- 任务日志保留原始 stderr

## 19. 安全与边界控制

### 19.1 文件系统边界

- 只允许写入配置定义的 `output` 目录及配置文件本身
- 源文件默认只读
- `ingest` 只更新 wiki 输出，不修改原始 source

### 19.2 外部进程边界

- Agent adapter 仅调用白名单命令
- 记录执行命令、退出码、耗时
- 超时强制终止

## 20. 可观测性

记录以下信息：

- task lifecycle
- 每次 Agent 调用的 provider、耗时、退出码
- topic 编译成功率
- article 校验失败原因
- lint 问题数量

初版使用日志文件即可，不引入遥测服务。

## 21. 测试策略

### 21.1 单元测试

覆盖：

- config 解析
- scanner 过滤
- compile planner
- markdown parser
- schema manager
- graph builder

### 21.2 集成测试

覆盖：

- compile 流程
- search/query/lint API
- agent adapter mock

### 21.3 E2E 测试

覆盖：

- Web 初始化流程
- Web 编译流程
- Graph 浏览流程

## 22. 迁移策略

采用并行迁移，不先删除旧插件目录。

阶段建议：

### 阶段 1

- 创建 `apps/` 和 `packages/`
- 迁移 prompt/template 资产
- 建立核心类型和 config loader

### 阶段 2

- 实现一个 provider
- 跑通 `init` 与 `compile`
- 输出 `wiki/`

### 阶段 3

- 引入 `apps/server`
- 打通 graph API
- 将现有 visualize 迁入统一后端

### 阶段 4

- 实现 `apps/web`
- 提供 Dashboard / Compile / Explorer / Graph

### 阶段 5

- 完成 search/query/lint
- 增加多 provider 支持
- 下线 plugin 专属逻辑

## 23. 首版交付范围

v1 必须完成：

- 独立 CLI
- 独立后端 API
- 基础 Web 前端
- 至少一个 Agent provider
- `init`
- `compile`
- `graph`
- topic/concept/index/schema/state 全链路写入

v1.1 可补：

- `search`
- `query`
- `lint`
- `ingest`

## 24. 风险与决策

### 风险 1：多 CLI 行为不一致

决策：

- 先以一个主 provider 打通
- 用 capability 模型描述差异

### 风险 2：prompt 强耦合插件语境

决策：

- 迁移时统一改写为独立应用语境

### 风险 3：长任务前后端状态不同步

决策：

- 任务状态持久化
- 前端只读任务 API，不依赖内存事件

### 风险 4：LLM 输出不稳定

决策：

- 输出结构约束
- 写前校验
- 失败重试

## 25. 后续演进方向

- 支持更多 provider
- 支持桌面打包
- 支持语义搜索后端
- 支持项目模板
- 支持多项目管理首页
- 支持增量图谱刷新

## 26. 总结

本设计的核心思想是：

- 保留现有 prompt/template 作为知识资产
- 把插件工作流重构为应用编排
- 用 `core + agents + server + web + cli` 形成稳定边界
- 让文件扫描、状态管理、写入和 API 全部由应用掌控
- 让 LLM 只负责最适合它的综合与生成工作

这份 v1 文档用于指导首轮脚手架和模块实现，后续可以继续拆分为：

- 接口设计文档
- API 契约文档
- 前端交互设计文档
- 迁移执行计划
