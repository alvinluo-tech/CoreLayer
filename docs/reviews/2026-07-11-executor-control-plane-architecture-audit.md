# Jarvis 执行器控制平面架构审计

- 日期：2026-07-11
- 范围：TaskGraph、Workspace Orchestrator、Agent Profile、Queue/Dispatcher、Claude Code/Codex/OpenCode Adapter、权限、审批、恢复、验证、Runtime Protocol
- 结论：`high_risk`
- 主故障模式：统一 Executor 生命周期已定义但未接入生产主链，真实执行仍依赖一次性 CLI 子进程、内存状态和轮询
- 最紧急修复：只保留一条持久化执行主链，并把 Task、Run、Attempt、Executor Session、Process 分开

## 1. 架构判断

Jarvis 的产品方向是合理的，但当前实现还不是可靠的“多执行器控制平面”。它更接近：

```text
目标 -> LLM 拆任务 -> TaskGraph 解依赖 -> 选 AgentProfile 中的 executor 字段
     -> 直接启动某个 CLI -> 轮询内存 Map -> 以退出码判成功
```

目标形态应是：

```text
Goal / Workspace
  -> versioned Plan + TaskGraph
  -> Scheduler（约束、能力、历史表现、资源）
  -> durable Run
  -> one or more durable Attempts
  -> Executor Adapter（Claude / Codex / OpenCode / future）
  -> native Session + Turn + Event stream
  -> Artifact + Verification + Review + Delivery gate
  -> Task / Workspace completion invariant
```

Jarvis 应定位为执行器控制平面，而不是再造 Claude Code、Codex、OpenCode 内部的 agent loop。OpenClaw/Hermes 值得借鉴的是 Gateway 所有权、Session 隔离、队列、事件、恢复和扩展机制；不应照搬它们“自有 agent runtime”的产品边界。

## 2. 严重度排序的问题

### Critical 1：生产调度绕过统一 Executor 协议

`@jarvis/runtime-protocol` 已有 `ExecutorAdapter`、细粒度状态、事件和 capability profile；`CodingExecutorAdapterWrapper` 也已经存在。但 Code Graph 显示 wrapper 只有自身工厂调用，没有生产调用者。实际调度仍直接依赖 `CodingAgentAdapter.createRun()`，然后每秒查询 Adapter 内存状态。

证据：

- `daemon/src/workflow/run-dispatcher.ts:81-85, 99-188`
- `daemon/src/runtimes/coding/executor-adapter-wrapper.ts:30-205`
- `packages/runtime-protocol/src/executor-lifecycle.ts`
- `dispatchWithEnvironment` 没有生产调用者
- `runVerification` 只有测试调用者
- `evaluateDeliveryGate` 只有测试调用者

后果：环境、`executor_runs`、统一事件、验证、交付门、清理都不是完成任务的必经路径。现在的抽象属于“测试存在，生产未接线”。

修复：Dispatcher 只能依赖 coding runtime 的 `public-api` 和统一 Executor port；禁止再直接导入具体 Adapter 或 `CodingTask`。

### Critical 2：运行状态不可恢复，Daemon 重启会产生孤儿任务

三个 CLI Adapter 都把运行状态和 PID 放在模块级 `Map` 中。Dispatcher 的 SlotManager 也是内存态，完成检测还是进程内的未持久化 polling closure。`agent_runs` 没有 lease、heartbeat、owner、attempt 或原生 session ID。

证据：

- `daemon/src/runtimes/coding/adapters/claude-code/cli-adapter.ts:33-36`
- `daemon/src/runtimes/coding/adapters/codex/cli-adapter.ts:28-31`
- `daemon/src/runtimes/coding/adapters/opencode/cli-adapter.ts:29-32`
- `daemon/src/workflow/run-dispatcher.ts:163-188`
- `daemon/src/persistence/sqlite/agent-run-repo.ts:99-147`

后果：重启后数据库可能永久保留 `running`；外部进程可能继续运行但 Jarvis 已失去控制；也可能被人工 retry 后重复执行副作用。

修复：持久化 Attempt，使用原子 claim + lease + heartbeat；启动时 reconcile 所有非终态 Attempt，通过原生 session/process 重新附着，无法附着时明确标记 `lost`/`failed`，绝不静默当作 running。

### Critical 3：审批只管“启动 CLI”，没有真正管住执行器内部行为

当前 broker 审批的是 `claude --print ...`、`codex exec ...`、`opencode ...` 这个启动动作。启动后，执行器在自己的 sandbox/permission 规则下运行，Jarvis 的 AgentProfile `permissions` 并未投影到执行器内部工具权限。

证据：

- `daemon/src/runtimes/coding/adapters/claude-code/cli-adapter.ts:104-133`
- `daemon/src/runtimes/coding/adapters/codex/cli-adapter.ts:93-122`
- `daemon/src/runtimes/coding/adapters/opencode/cli-adapter.ts:94-123`
- Codex 固定使用 `--sandbox workspace-write`：`daemon/src/runtimes/coding/adapters/codex/cli-adapter.ts:175-183`
- OpenCode 仅写入 workDir：`daemon/src/runtimes/coding/adapters/opencode/cli-adapter.ts:170-175`

后果：UI 上配置的权限会形成错误安全预期。Jarvis 允许启动，不等于 Jarvis 审批了执行器随后的每个 shell/file/network 动作。

修复：把规范化 Policy 编译到每个原生执行器的权限机制；Claude 使用 SDK/permission callback 或 `--permission-prompt-tool`，Codex 使用 app-server approval/permission profile，OpenCode 使用 server/SDK permission 事件与每 Agent 权限配置。无法桥接时，必须依赖真正的 OS/container/worktree 隔离，并把该 Adapter 标为 `coarse_grained_permissions`。

### Critical 4：审批恢复设计未持久化，也未连接 CLI pending run

数据库 schema 已有 `pending_actions`，但 `resume-service.ts` 仍使用内存 Map，并注明“will be DB-backed”。Adapter 返回 `pending` 后没有生产路径在批准后继续该原生 session；Dispatcher 最终只会 polling 到超时。

证据：

- `daemon/src/approvals/resume-service.ts:59-60`
- `daemon/src/approvals/resume-service.ts:65-133`
- `daemon/src/runtimes/coding/adapters/claude-code/cli-adapter.ts:121-133`
- `daemon/src/runtimes/coding/executor-adapter-wrapper.ts:60-63`

后果：高风险任务最重要的“暂停—批准—原位恢复”链条在重启和真实 CLI 执行中都不成立。

修复：Approval 必须关联 `attemptId + nativeSessionId + nativeTurnId + actionId`，持久化幂等 fingerprint；Adapter 明确实现 `respondToApproval()` 或声明不支持，不能用泛化的 `prompted_reentry` 假装原位恢复。

### High 1：TaskGraph 只解决依赖，不等于任务生命周期

`TaskGraph` 的依赖检查、解锁和环检测有价值，应保留。但它不应该管理执行器进程生命周期。当前 Orchestrator 建了多个 Agent，真实执行却只选择一个 Agent 处理所有 root task；下游又沿用上一个 run 的 Agent。`team-orchestrator`、性能选择和 review/delivery 逻辑基本只有测试调用。

证据：

- `daemon/src/services/workspace-orchestrator.ts` 中 `executorAgent` 和 root task enqueue
- `daemon/src/workflow/run-dispatcher.ts:211-230`
- `daemon/src/runtimes/coding/team-orchestrator.ts`
- `daemon/src/runtimes/coding/agent-spec.ts:88-107`
- Code Graph：`assignTasks` 只有测试调用，`selectBestAgent` 无调用者

后果：Team、Reviewer、Tester 目前更多是展示数据，不是执行保证；Workspace 也没有在所有必要 Task 通过后自动进入 `succeeded`。

修复：TaskGraph 只负责拓扑、readiness 和 plan version；RunController 负责运行；CompletionPolicy 负责验收和 Workspace 收口。

### High 2：上游执行器的原生能力被降级为文本 CLI

当前：

- Claude：`claude --print <prompt>`，没有结构化输出、session resume、模型/skills/tools/权限投影。
- Codex：`codex exec --sandbox workspace-write --color never <prompt>`，stdout 被当作普通消息，没有 thread/turn/item。
- OpenCode：使用 `opencode --prompt`；当前官方自动化入口是 `opencode run` 或 `opencode serve`，支持 session、JSON 输出、SSE/OpenAPI。

官方能力：

- Claude CLI 支持 `--output-format stream-json`、`--resume`、`--allowedTools`、`--disallowedTools`、`--permission-prompt-tool`；Agent SDK 提供程序化消息与 Session 能力。
- Codex TypeScript SDK 提供 Thread、`runStreamed()`、structured output 和 `resumeThread()`；app-server 提供稳定 JSONL/JSON-RPC、thread/turn/item、interrupt、approval 和 schema generation。
- OpenCode 提供 headless server、OpenAPI 3.1、SSE event stream、session API，以及 `opencode run --format json --session/--continue/--attach`。

后果：无法可靠区分最终回答、工具调用、文件变更、审批请求、token usage 和进度；恢复与 steer 只能靠文本猜测。

修复：优先使用结构化长连接/SDK；CLI 只作为兼容 fallback，并要求 JSON/stream-json。

### High 3：退出码先判成功，验证结果不控制任务完成

Adapter 在进程 `code === 0` 时立即设置 `succeeded`，之后才异步运行 test commands；统一 verification 和 delivery gate 没有接入。Dispatcher 看到 succeeded 后直接完成 Task 并解锁下游。

证据：

- `daemon/src/runtimes/coding/adapters/codex/cli-adapter.ts:220-273`
- Claude/OpenCode Adapter 存在同构逻辑
- `daemon/src/workflow/run-dispatcher.ts:167-183, 194-230`
- `daemon/src/runtimes/coding/verification.ts`
- `daemon/src/runtimes/coding/delivery-gate.ts`

后果：测试失败仍可能让 Task 和 Workspace 看起来成功，“0 到完成”没有可验证语义。

修复：`executor completed` 只代表 Attempt 执行结束；必须经过 `collecting_artifacts -> verifying -> review/delivery gate` 后，Run 才能 succeeded，Task 才能 completed。

### High 4：队列缺少原子 claim、幂等键和 lease

`getQueued()` 先查，随后 `updateStatus()`；没有带期望旧状态的条件更新，也没有 attempt number/idempotency key。当前单进程 SlotManager 缓解了同一 run 的并发，但不能覆盖多进程、崩溃恢复或未来分布式 worker。

证据：

- `daemon/src/persistence/sqlite/agent-run-repo.ts:99-147`
- `daemon/src/workflow/run-dispatcher.ts:46-85`

修复：SQLite 事务中执行 `queued -> dispatching` 条件更新并写入 `lease_owner/lease_expires_at`；受影响行数为 1 才获得执行权。

### High 5：Agent 定义是“配置存储”，不是“运行时快照”

AgentProfile 保存了 capabilities、skills、tools、knowledgeScopes、permissions、memoryScopes、modelPolicy 和 executorPolicy。生产调度主要读取 `executorPolicy.executor/workDir`；任务执行未固化 Agent 版本，也没有把其余字段编译为 Executor request。

证据：

- `daemon/src/persistence/repository/agent.ts:75-111`
- `daemon/src/shared/agent-profile-types.ts`
- `daemon/src/workflow/run-dispatcher.ts:106-157`

后果：修改 AgentProfile 会影响未来行为，但历史 Run 无法复现；UI 配置的 skills/tools/permissions/model policy 可能没有实际效果。

修复：Run 创建时保存不可变 `AgentSnapshot`，包含 profile revision、resolved skills/tools/policy、executor requirements 和 digest。AgentProfile 是模板，不是运行态。

### Medium 1：状态词汇漂移

Task 类型、数据库 enum、前后端 helper 同时保留 canonical 和 legacy 状态；helper 定义了 `needs_review`，数据库和 `TaskRow` 却没有。AgentRun、ExecutorRun、Runtime Run 又各有不同状态集合。

证据：

- `daemon/src/workspaces/task-status.ts:8-35`
- `daemon/src/persistence/schema.ts:109-137`
- `daemon/src/persistence/repository/task.ts`
- `daemon/src/persistence/repository/agent.ts`
- `daemon/src/persistence/repository/executor-run.ts`

修复：每层只保留一套状态机；legacy alias 只在 HTTP migration adapter 出现，并设置删除版本。

### Medium 2：架构边界测试存在正则盲区

边界测试只匹配 `node:child_process` 的静态 import。实际 Adapter 使用 bare `child_process`，Workspace Orchestrator 使用动态 import，因此测试通过但不能证明 OS authority 只存在于 capability adapter。

证据：

- `daemon/src/architecture/__tests__/import-boundaries.test.ts:399-425`
- `daemon/src/runtimes/coding/adapters/claude-code/cli-adapter.ts:8`
- `daemon/src/services/workspace-orchestrator.ts` 的动态 `import("node:child_process")`

修复：AST/ESLint import restriction 同时覆盖 bare specifier、`node:` specifier、require 和 dynamic import；Workspace 初始化也必须走 ExecutionEnvironment/Capability port。

## 3. 正确的领域边界

### 3.1 不要混为一谈的五个身份

| 实体             | 含义                                             | 生命周期               |
| ---------------- | ------------------------------------------------ | ---------------------- |
| Task             | 用户目标分解后的可验收工作单元                   | 跨多次执行，长期持久化 |
| Run              | 一次完成 Task 的控制平面意图                     | 可包含多个 Attempt     |
| Attempt          | 某次由某执行器实际尝试                           | 重试/切换执行器就新建  |
| Executor Session | Claude session / Codex thread / OpenCode session | 可跨多个 turn 恢复     |
| Process          | 本地 CLI/app-server OS 进程                      | 可重启、重附着或丢失   |

不能再把 DB run ID 同时当作 Adapter run ID、session ID 和 process identity。

### 3.2 Agent 与 Executor 分离

```text
AgentProfile
  persona + role + skills + tools + knowledge + model policy + permission intent

ExecutorProfile
  adapter id + transport + executable/endpoint + auth ref + version + capabilities

RunSnapshot
  resolved AgentProfile revision
  + resolved ExecutorProfile revision
  + compiled permission policy
  + environment snapshot
```

Agent 表达“谁以及如何工作”；Executor 表达“用什么执行引擎运行”。未来增加 Gemini CLI、Aider、Hermes、远程 worker 时，不需要扩展 AgentProfile 的字符串 union。

### 3.3 TaskGraph 的职责上限

TaskGraph 负责：

- DAG 完整性、同一 Plan/Project 边界、依赖存在性
- readiness 计算
- required/optional task
- plan version 和 replan 后的 supersede 关系

TaskGraph 不负责：

- 启动进程
- 轮询 Adapter
- 审批恢复
- 验证命令
- 计算 PID/timeout

这些属于 RunController / AttemptRunner。

## 4. 统一执行器协议

现有 `ExecutorAdapter` 思路正确，但 `prepare()` 内部已经启动 CLI、`start()` 变成 no-op，说明合同切分不符合真实上游协议。建议收敛为以下最小 port：

```ts
interface AgentExecutorAdapter {
  readonly id: string;
  probe(): Promise<ExecutorDescriptor>;
  createSession(input: CreateSessionInput): Promise<NativeSessionRef>;
  resumeSession(ref: NativeSessionRef): Promise<NativeSessionRef>;
  startTurn(input: StartTurnInput): Promise<NativeTurnRef>;
  events(ref: NativeTurnRef, cursor?: string): AsyncIterable<ExecutorEvent>;
  respondToApproval(input: ApprovalResponse): Promise<void>;
  steer(input: SteerInput): Promise<void>;
  interrupt(ref: NativeTurnRef): Promise<void>;
  snapshot(ref: NativeSessionRef): Promise<ExecutorSnapshot>;
  collectArtifacts(ref: NativeTurnRef): Promise<ExecutorArtifacts>;
  dispose(ref: NativeSessionRef): Promise<void>;
}
```

Adapter capability 必须真实声明，不得乐观写死：

```text
structuredEvents | resumableSession | nativeApproval | steer | interrupt
sessionFork | durableServer | toolPolicy | modelOverride | skillInjection
workspaceIsolation | remoteExecution | usageEvents
```

不支持的方法由 capability gate 在调度前拒绝，而不是执行到一半才 fallback。

## 5. 三类执行器接入策略

| 执行器      | Primary                                                      | Fallback                                             | Jarvis 必须保存的原生 ID                     |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------- |
| Claude Code | `@anthropic-ai/claude-agent-sdk` / permission callback       | `claude -p --output-format stream-json --resume ...` | session id、message/result id                |
| Codex       | `@openai/codex-sdk`；需要完整宿主能力时用 `codex app-server` | `codex exec --json` 类一次性模式                     | thread id、turn id、item id                  |
| OpenCode    | `opencode serve` + generated SDK/OpenAPI + SSE               | `opencode run --format json --session ...`           | server instance、session id、message/part id |

策略原则：

1. 长任务优先长连接、可恢复的原生 session。
2. 短任务才用一次性 CLI。
3. Adapter 解析官方结构化事件，不从自然语言 stdout 猜状态。
4. 原生协议版本和 executable version 都写入 Attempt。
5. 版本差异由 Adapter conformance test 覆盖，不泄漏到 Scheduler。

## 6. 生命周期和完成语义

### Task

```text
draft -> ready -> running -> verifying -> needs_review -> completed
                 |             |             |
                 +-> blocked    +-> failed    +-> changes_requested -> ready
                 +-> cancelled
```

### Run

```text
queued -> dispatching -> active -> waiting_for_approval/input
                        -> collecting_artifacts -> verifying -> succeeded
                        -> retryable_failure -> queued(new Attempt)
                        -> failed/cancelled/timed_out
```

### Attempt

```text
created -> claimed -> provisioning -> starting -> running
        -> waiting -> terminal -> cleanup
```

完成不变量：

- executor exit code 0 != Run succeeded
- Run succeeded = terminal executor event + required artifacts + verification gates passed + required approval/delivery resolved
- Task completed = CompletionPolicy 对所有 required Runs/Reviews 判定成功
- Workspace succeeded = 当前 Plan version 的所有 required Tasks completed，且无 pending delivery/approval

## 7. 调度策略

先做硬约束，再做评分：

1. domain/capability 匹配
2. executor 可用且版本兼容
3. 所需 permission projection 可实现
4. environment 支持（local/worktree/container/remote）
5. session resume/steer 等任务强需求
6. Agent/Workspace 明确 pin
7. 再按历史成功率、当前负载、成本、延迟、session affinity 评分

每次决策写入：候选集合、拒绝原因、最终选择、policy/version snapshot。不要让 LLM 直接返回一个未经验证的 executor 字符串。

## 8. 持久化、并发与恢复

最小必需字段：

```text
runs: task_id, plan_version, agent_snapshot, status, completion_policy
attempts: run_id, attempt_no, executor_id, transport, native_session_id,
          native_turn_id, process_id, status, lease_owner, lease_expires_at,
          heartbeat_at, event_cursor, policy_snapshot, started_at, ended_at
executor_events: attempt_id, native_event_id, sequence, type, payload, occurred_at
approvals: attempt_id, native_action_id, fingerprint, status, response
artifacts/verifications: attempt_id, immutable evidence and hashes
```

恢复流程：

1. 启动时扫描非终态 Attempt。
2. lease 未过期且 owner 存活：不接管。
3. 可恢复 native session：resume + 从 event cursor 继续。
4. 进程仍在但协议不可附着：标记 `manual_intervention_required`，不盲重试。
5. 进程已丢失：关闭 Attempt，再由 RetryPolicy 决定新 Attempt。
6. 所有 event/approval/artifact 写入均按 native ID 幂等。

## 9. 对标项目应借鉴什么

- OpenClaw：Gateway 是 session source of truth；每 session 串行 lane、全局并发 lane、结构化 lifecycle/tool/assistant stream、进程感知写锁、abort 和 stuck-session recovery。其 `agent.wait` 的超时只影响等待，不误杀底层 run。
- Hermes：CLI/Gateway/Cron/ACP/API 共享同一 agent core；SessionDB 持久化完整历史和 lineage；profile 隔离 config、memory、skills、session、gateway PID；工具运行环境有 local/Docker/SSH/remote 等明确 backend。
- Jarvis 的差异化：不应和它们拼“又一个自有 loop”，而应把不同成熟执行器统一成可调度、可恢复、可审计、可验收的工作节点。

## 10. 分阶段改造顺序

### Phase 0：冻结新增平行抽象

- 不再新增第三套 Run/Runtime/Adapter 生命周期。
- 标记当前只有测试调用的模块；下一阶段接线后删除旧路径。
- 不先拆多个 OS 进程；单 daemon 足够完成语义收敛。

### Phase 1：单一执行主链（最高优先级）

- Dispatcher 只调用统一 AgentExecutor port。
- 引入 durable Attempt，并以事件驱动替代每秒 polling。
- 把 artifact、verification、cleanup 变成必经阶段。
- 统一 ID、状态和终态判定。
- 删除或合并未接线的 environment-mediated/wrapper 重复路径。

验收：任何 Task 从 enqueue 到 terminal 都能从数据库重放；进程退出码 0 但验证失败时 Task 不会 completed。

### Phase 2：审批和崩溃恢复

- pending_actions 真正 DB-backed。
- native session/turn/action ID 持久化。
- 原子 claim、lease、heartbeat、startup reconciliation。
- cancel/timeout/approval 全部幂等。

验收：Daemon 在 running、waiting approval、verifying 三个阶段被杀后，重启均得到确定结果。

### Phase 3：结构化原生 Adapter

- Codex SDK/app-server 先落地，因其 thread/turn/item/approval schema 最完整。
- Claude Agent SDK/stream-json。
- OpenCode server/generated SDK/SSE。
- 每个 Adapter 提供版本化 fixture replay + conformance suite。

验收：不再从普通 stdout 判断 tool、approval、artifact 和 final response。

### Phase 4：真实调度与 Team workflow

- AgentSnapshot、ExecutorProfile、硬约束 + score。
- planner/builder/reviewer/tester 作为 Task/Run policy，而非展示标签。
- replan、changes requested、executor failover、新 Attempt。
- Workspace CompletionPolicy。

### Phase 5：开源扩展面

- 稳定、版本化的 Adapter SDK 和 manifest。
- compatibility matrix、capability negotiation、golden event fixtures。
- 第三方 Adapter 在独立进程运行；Core 不加载不可信插件代码。
- 再考虑 Rust Core 拆分 supervisor/secret/OS capability，避免现在过早微服务化。

## 11. 明确保留、重构与暂缓

保留：

- TaskGraph 的 DAG 算法
- AgentProfile 的产品概念
- runtime-protocol 中的规范化状态/事件思想
- Repository、artifact、approval、worktree、audit 基础设施
- 单 daemon + Tauri supervisor 的当前部署形态

重构：

- `CodingAgentAdapter`/`ExecutorAdapter` 双合同
- Dispatcher 直接访问具体 Adapter
- Adapter 内存 Map、polling completion
- 权限仅审批 CLI launch
- verification 在 success 之后异步运行
- AgentProfile 字符串 executor union

暂缓：

- 拆成多个物理 runtime 进程
- 分布式调度/消息队列
- 复杂自动学习路由
- Marketplace
- 将 image/message/tool 等所有能力强塞进同一个 ExecutorAdapter

这些都应等单机持久化生命周期通过故障恢复测试后再做。

## 12. 验证记录

- daemon TypeScript `tsc --noEmit`：通过
- 8 个目标测试文件：通过
- 1614 tests passed，7 skipped
- Claude Code conformance 中 7 个真实执行测试被跳过
- `run-dispatcher` 测试虽然通过，但 stderr 出现 `workspace-event-emitter` repository mock 缺失，说明当前测试对异步/副作用错误容忍过高
- Code Graph 证实：wrapper、environment、verification、delivery、team selection 多项能力只有测试调用或无调用者

因此“测试全绿”只能证明局部函数成立，不能证明 0→1 生命周期闭环成立。

## 13. 官方资料

- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Managed Agents session lifecycle](https://platform.claude.com/docs/en/managed-agents/sessions)
- [Codex TypeScript SDK](https://github.com/openai/codex/blob/main/sdk/typescript/README.md)
- [Codex app-server protocol and lifecycle](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [OpenCode server/OpenAPI](https://opencode.ai/docs/server/)
- [OpenCode CLI automation and sessions](https://dev.opencode.ai/docs/cli/)
- [OpenCode agent permissions](https://opencode.ai/docs/agents/)
- [OpenClaw agent loop, queue and recovery](https://docs.openclaw.ai/agent-loop)
- [OpenClaw session source of truth](https://github.com/openclaw/openclaw/blob/main/docs/reference/session-management-compaction.md)
- [Hermes architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture/)
- [Hermes session persistence and isolation](https://hermes-agent.nousresearch.com/docs/user-guide/sessions/)
