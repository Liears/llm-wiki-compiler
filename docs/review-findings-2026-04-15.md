# Review Findings

Date: 2026-04-15

Commit reviewed:

- `145dea5 feat: implement agent-based compilers for topics and concepts`

## Summary

本轮 review 结论：

- 当前重构方向正确，但仓库还没有达到可编译、可运行、可验证的状态
- 代码中存在多处确定性的 TypeScript/逻辑错误，不是单纯依赖未安装导致
- `compile` 主流程仍未真正产出 wiki 文件，存在“显示成功但没有实际编译”的功能缺失
- 自动化测试体系尚未建立，当前无法提供回归保障

已实际执行的验证：

- `pnpm install`
  - 成功
- `pnpm build`
  - 失败，原因是 `turbo.json` 仍使用 Turbo 1.x 的 `pipeline` 字段
- `pnpm test`
  - 失败，原因同上
- `pnpm exec tsc -p tsconfig.json --noEmit`
  - 失败，暴露出进一步的 TypeScript 和模块设计问题

## Newly Verified Build/Test Blockers

### A. `turbo.json` 配置与当前 Turbo 版本不兼容

- 文件：`turbo.json`
- 当前使用：
  - `pipeline`
- 但安装后的 Turbo 版本是 2.x
- Turbo 2.x 要求字段名为：
  - `tasks`

这会直接导致：

- `pnpm build` 失败
- `pnpm test` 失败

在修复此项之前，无法进入 workspace 真正的 build/test 阶段。

### B. workspace 模块解析仍未打通

实际执行 `pnpm exec tsc -p tsconfig.json --noEmit` 后确认，多个 workspace 包之间仍无法正确解析：

- `apps/cli/src/index.ts`
  - 找不到 `@llm-wiki-compiler/agents`
  - 找不到 `@llm-wiki-compiler/shared`
- `apps/server/src/config/index.ts`
  - 找不到 `@llm-wiki-compiler/agents`
- `apps/server/src/*`
  - 多处找不到 `@llm-wiki-compiler/shared`
- `packages/agents/src/*`
  - 多处从 `@llm-wiki-compiler/types` 导入了并不存在的类型

这说明当前 monorepo 在以下至少一个层面仍未完成：

- package exports
- tsconfig paths / project references
- workspace build order
- package `main/types` 指向策略

### C. CLI 参数定义与 `cac` 类型签名不匹配

`apps/cli/src/index.ts` 出现这些错误：

- `Type 'string' has no properties in common with type 'OptionConfig'`

典型位置：

- `cli.option(..., process.cwd())`
- `option("-o, --output <dir>", ..., "./wiki")`
- `option("-l, --limit <num>", ..., "10")`

说明当前对 `cac` 的 `.option()` 使用方式不符合其类型定义，需要改成正确签名。

### D. `@llm-wiki-compiler/types` 与使用方接口不一致

已确认以下类型从 `@llm-wiki-compiler/types` 中并不存在，但代码在导入使用：

- `AgentAdapter`
- `ArticleWriter`
- `IndexBuilder`
- `SchemaManager`
- `IndexBuildInput`
- `SchemaUpdateInput`

这说明存在设计与实现脱节：

- 要么这些接口应该在 `types` 包中补齐
- 要么使用方不该从 `types` 包导入，而应从定义它们的实际 package 导入

### E. agents 适配层接口实现不完整

已验证问题：

- `packages/agents/src/providers/claude-code.ts`
- `packages/agents/src/providers/codex.ts`
- `packages/agents/src/providers/openclaw.ts`

它们返回的对象缺少：

- `durationMs`
- `success`

但 `AgentRunResult` 明确要求这些字段。

这不是运行时细节，而是当前接口约束没有被实现。

### F. graph / task / wiki 层还有编译期错误

已确认：

- `apps/server/src/routes/graph.ts`
  - `edges` 的 `type` 被推断为 `string`
  - 不满足 `GraphEdge["type"]` 的联合类型约束

- `apps/server/src/tasks/index.ts`
  - `taskStore.get(taskId)!` 的返回值类型不成立
  - 当前实现里 `get()` 明确可能返回 `null`

- `packages/core/src/wiki/index.ts`
  - 引用了未声明依赖 `fs-extra`
  - `parseTopicFile()` / `parseConceptFile()` 返回值缺少必需字段 `title`


## Priority 0

### 1. 修复 TypeScript 硬错误，恢复仓库可编译状态

以下问题属于确定性代码错误，必须优先修复：

- `apps/server/src/index.ts`
  - 以 named export 方式导入 `wikiRoutes/projectRoutes/compileRoutes/searchRoutes/agentRoutes/graphRoutes`
  - 但各 route 文件实际是 `default export`
  - 需要统一成默认导入或统一改为命名导出

- `packages/agents/src/factory.ts`
  - `PROVIDER_CAPABABILITIES` 拼写错误
  - 实际定义的是 `PROVIDER_CAPABILITIES`

- `packages/agents/src/base/adapter.ts`
  - timeout 分支中使用了未定义变量 `timeoutMs`
  - 应改为当前作用域的 `timeout`

- `packages/core/src/compile/index.ts`
  - 对象字面量中写成了 `error = ...`
  - 这是语法错误，必须改为 `error: ...`
  - 同文件还存在 `ArticlKind` 拼写错误

- `packages/core/src/scanner/index.ts`
  - `scanKnowledgeFiles` / `scanSourceFiles` 使用了 `await`，但方法本身不是 `async`
  - 需要修正函数签名
  - 子类还调用了父类的 `private` 方法，如 `shouldExclude`、`extractTitle`、`detectLanguage`
  - 这些方法若要被子类复用，应改为 `protected`

- `packages/core/src/state/index.ts`
  - 接口定义的是 `isStateChanged`
  - 实现类写的是 `isChanged`
  - 名称必须统一
  - `setError` 中写的是 `finishAt`
  - 其余代码用的是 `finishedAt`
  - 字段需要统一为 `finishedAt`

- `apps/server/src/routes/project.ts`
  - 使用了 `path.join(...)`，但没有导入 `path`

- `packages/core/src/index.ts`
  - `./compile` 与 `./wiki` 的 re-export 存在命名冲突
  - `MarkdownIndexBuilder` / `SchemaManager` 重复导出，需要拆分或显式命名

## Priority 1

### 2. 修复 compile 流程“假成功”问题

当前 `compile` 相关逻辑还没有真正完成编译：

- `apps/cli/src/index.ts`
  - `wiki compile` 只做了：
    - 加载 config
    - 扫描 sources
    - topic discovery
    - 创建 output 目录
  - 然后直接输出 `Compilation complete`
  - 但没有：
    - 调用 topic compiler
    - 调用 concept compiler
    - 写 `wiki/topics/*.md`
    - 写 `wiki/concepts/*.md`
    - 写 `INDEX.md`
    - 写 `schema.md`
    - 写 `.compile-state.json`

- `apps/server/src/routes/compile.ts`
  - `/api/compile/start` 任务执行器也只返回扫描与 topic 列表
  - 并未真正执行编译

需要让 CLI 与 API 都接入真正的 compile orchestrator，并以产物存在作为成功标准。

### 3. 修复项目状态接口逻辑错误

`apps/server/src/routes/project.ts` 还有路径逻辑问题：

- 当前把相对 `output` 处理成 `/${config.output}`
- 这会把相对路径错误地转成绝对路径语义
- 然后再与 `cwd` 组合，最终路径判断不可靠

建议统一使用：

- `path.resolve(cwd, config.output)`

来判断 wiki 输出目录和 topics 目录是否存在。

## Priority 2

### 4. 修复 tsconfig / workspace 配置，使 monorepo 能正常 build

当前从结构上看，workspace 配置还不完整：

- 根 `tsconfig.json` 没有 project references
- `packages/types` 缺少 `tsconfig.json`
- 各 package 的 `main/types` 仍指向 `src/index.ts`
  - 如果目标是构建产物消费，建议改为 `dist/index.js` / `dist/index.d.ts`
- 根配置 `lib` 只有 `ES2022`
  - Node 端编译需要安装并正确使用 `@types/node`
- 前端 `apps/web/tsconfig.json`
  - `jsxImportSource` 指向 `@emotion/react`
  - 但当前 package.json 未声明该依赖
  - 如果并未使用 Emotion，应移除该配置

建议：

- 给每个 package 补齐独立 `tsconfig.json`
- 增加 project references 或采用 turbo + 每包独立编译
- 统一 package export / main / types 指向

## Priority 3

### 5. 清理未完成实现与接口不一致问题

需要继续清理以下问题：

- `apps/cli/src/index.ts`
  - `countMarkdownFiles` 直接返回 `0`
  - 这会让 `init-detect` 结果失真

- `apps/server/src/tasks/index.ts`
  - `AbortController` 创建了，但没有真正传给 executor 或 provider 子进程
  - 当前“取消任务”并不能可靠中断底层执行

- `packages/core/src/wiki/index.ts`
  - 依赖 `fs-extra`，但对应 package 里没有声明这个依赖

- `packages/core/src/search/index.ts`
  - 存在 `path` 未导入却使用的问题

- `packages/agents/src/providers/*`
  - CLI 参数假设过强
  - 需要核对 `claude` / `codex` / `openclaw` 的真实 non-interactive 参数是否正确
  - 当前实现更像占位适配器，不应宣称“已完成第二阶段”

## Testing Gaps

当前仓库几乎没有测试基础设施：

- 根脚本有 `test: turbo run test`
- 但 workspace 中没有任何 package 定义 `test` script

建议至少补以下测试：

- `packages/core`
  - config loader
  - scanner
  - topic discovery
  - compile planner
  - state store
- `apps/server`
  - `/api/project/status`
  - `/api/compile/plan`
  - `/api/wiki/topics`
- `packages/agents`
  - provider health checks
  - command arg builder

## Acceptance Criteria For Next Round

下一轮提交至少应满足：

- `pnpm install` 成功
- `pnpm build` 全绿
- `pnpm test` 至少有最小测试集且能通过
- `wiki compile` 真正产出：
  - `wiki/topics/*.md`
  - `wiki/concepts/*.md`
  - `wiki/INDEX.md`
  - `wiki/schema.md`
  - `wiki/.compile-state.json`
- `/api/compile/start` 能创建真实 compile task，而不是只返回扫描摘要
- `/api/project/status` 路径判断正确

## Suggested Fix Order

建议 Claude 按下面顺序修：

1. 修复编译硬错误与命名错误
2. 修复 tsconfig / workspace / package exports
3. 接通真实 compile pipeline
4. 修复 server 路由与状态接口
5. 补最小测试
6. 再跑一次完整 smoke test
