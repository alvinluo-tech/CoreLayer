# CoreLayer 深度评审与优化设计（2026-10-16）

> 评审对象：CoreLayer / Jarvis（`E:\code\github_project\Jarvis`）
> 评审视角：第一性原理 + 2026-10 agent 工程主流实践对标
> 范围：仅 CoreLayer。方向 a（Coding Runtime / Agent OS 执行治理）与方向 b（本地个人智能体 / 记忆与上下文）分别给出完整方案。
> 本次不改对外材料，只评审系统设计。

---

## 0. 方法论与一个必须先声明的约束

**关于"实时检索"**：本次执行环境**没有可用的联网检索**——`WebSearch` 返回的是模型生成的文本而非实时结果，`WebFetch` 对 opentelemetry.io / github.com 全部超时或失败。因此本报告的**外部基线部分不依赖网络检索**，而是改用一份**可在本机直接检视的一手 2026 基线**：

> `E:\code\github_project\deepseek-harness` —— DeepSeek Harness（`dsh`），MIT，Cordis 插件内核，"everything is a plugin"，其仓库内 `README.md` / `docs/architecture.md` 与 `packages/*/README.md`、`docs/subsystems/*.md` 均为 2026 年 6–7 月的实现文档与 Agent Notes（日期如 `2026-06-13-capability-seams`、`2026-07-08-tool-output-spill-files`、`2026-07-23-session-telemetry-otel-revival`）。这比二手检索更可靠，因为它是**可运行源码**。

**所有引用 dsh 的结论均可在上述路径直接复核。** 凡涉及我无法在本机验证的第三方（如 Anthropic Claude Managed Agents / Google Agent Substrate / Letta / LangGraph 2026 具体版本）的表述，一律标注 `【不可实时验证】`，并给出用户应自行核对的入口。**本报告不编造带日期的引用。**

CoreLayer 侧的所有事实性断言均给出 `file:line`，可复核。

---

## 1. 执行摘要（5 条核心结论）

1. **定位成立，但当前它更像"装在 Tauri 里的本地 daemon"，而非"Agent OS 运行时"。** CoreLayer 的真正差异化资产是：**本地优先 + 桌面原生 + 面向 Coding Executor 的治理层**（审批 / 产物 / 轨迹 / 多适配器）。这条缝 dsh 没有天然占据（dsh 是 headless/web 的 harness），但如果 CoreLayer 不补齐"运行时底座"（事件源、沙箱、上下文外置、可观测），它会在能力上被 dsh 全面压制，最终只剩一个 UI 壳。

2. **最致命的结构性问题不是"缺功能"，而是"架构倒挂"：几十个已写好的模块从未接入生产调用链。** 经实测：显式 agent loop `agent-loop.ts` **是死代码**（`runAgentLoop` 无生产调用者），真实循环是 Vercel AI SDK 的 `streamText+stepCountIs(maxSteps)`；`team-orchestrator.ts`(77 行)、`quality-gate.ts`、`delivery-gate.ts`、`retry-policy.ts`、`git-worktree-environment.ts`、`worktree/manager.ts`、`environment-integration.ts` **全部只被自身测试引用**。生产里 worktree **根本没被创建**（`run-dispatcher.ts:145,178` 直接把项目根当 `workingDirectory`）。这意味着简历所述"隔离执行/质量门/多 Agent 编排"在生产路径上是空的。

3. **记忆系统是"一张平表 + 词法检索"，落后于 2026 基线一个代际。** `memories` 单表（`schema.ts:259-278`），`type∈{fact,preference,context,summary}`，**没有 CoALA 的 working/episodic/semantic/procedural 分层**；召回是 **FTS5/BM25 + LIKE + 手写词法打分**（`memory-repo.ts:149-217`），**无 embedding/向量**；写入是 key 精确去重 last-write-wins，**无矛盾检测/合并/时间衰减**。dsh 的对应物是 **append-only `SessionEvent` 日志 + 派生历史** + 可选 compaction/subagent 记忆能力——差距是"事件源范式 vs 平表范式"。

4. **上下文层缺最关键的一块：没有 tool output offloading，只有原地截断。** 大工具结果被 `trimToolResult` 截成"头 70% + 尾 30%，上限 4000 字符"（`ai-tool-wrapper.ts:22,105`），**原文不落盘、不落库、不留指针**。dsh 有专门的 `spill` 能力族：**外置存储 + 返回模型可见 locator + retrievalHint + 精确字节数**（`docs/subsystems/spill.md`），且明确"truncation 是 lossy，spill 可逆"。这是 P0 级差距。

5. **安全与可观测性落后于"安全默认"这条 2026 主线。** 隔离落在光谱最低档：**无 seccomp/nsjail/gVisor/microVM**（全仓 grep 零命中），子进程以 daemon 同 UID、继承完整 `process.env`、无内存/CPU 上限、**无网络出口控制**（`process-spawner.ts:144-149`）。权限判定是**原始字符串 `includes()`/正则**而非 argv 解析（`hardline-blocklist.ts:71-79`），"Shell AST 语法树分析"在代码里不存在。可观测性 **完全无 OpenTelemetry**（全仓零命中），token 只按会话聚合。dsh 侧对应为 `sandbox-local`（**Linux bwrap/Landlock、macOS Seatbelt、Windows ACL 受限令牌**）+ `landlock-run` 原生插件 + `session-telemetry-otel`（OTel JS SDK 管道）。

**总体判断**：CoreLayer 的**工程纪律（83.31% 覆盖率、222 测试、清晰分层、真实多适配器）是资产**；但它当前处在"**设计目标态写成了简历，实现停在模块孤岛**"的状态。它**在 2026-10 的生态里仍然成立、且未被 dsh 直接替代**——因为 dsh 是 harness 不是 desktop Agent OS、且 dsh 不治理第三方 Coding Executor 的审批与产物。但要"值得别人使用"，必须先完成**接线（把孤岛接回生产）**与**四项底座补齐（事件源 / spill / 沙箱 / OTel）**。

---

## 2. 维度详评

模板：**现状 → 2026 主流对标 → 差距与局限 → 优化建议（P0 止血 / P1 主干 / P2 完善）→ 差异化创新点**。

---

### 维度 1 · 总体架构定位

**现状**
- 形态：Tauri v2 桌面壳 + Node daemon sidecar（`frontend/src-tauri/src/daemon_supervisor.rs:126-192`，sidecar `jarvis-daemon`，`tauri.conf.json:50`）；Hono HTTP（`bootstrap/register-routes.ts:26-47`，约 22 组路由）；SQLite + drizzle（`persistence/client.ts`，WAL），Supabase 可选但**记忆云端实现是抛异常的 stub**（`persistence/supabase/memory-repo.ts:8-71`）；postgres 模式声明未实现（`factory.ts:13-17` 回退 SQLite）。
- 运行时模块：`agent/ tool/ voice/ scheduler/ computer-control/ coding/ memory/ external-agent/ integration/`（`runtimes/index.ts:25-91`）。
- 独有资产：**面向 Coding Executor 的治理层**——Claude Code / Codex / OpenCode 三真实 CLI 适配器 + 审批 + 产物 + 轨迹 + 工作区/任务图。

**2026 主流对标**
- **DeepSeek Harness（dsh）【已本机复核】**：MIT，Cordis 插件内核，"everything is a plugin"（连 model adapter / tool registry / session log / **agent loop 本身**都是插件），profile+bundle 组合式启动，`--dump-config` 可打印并 patch 任意行（`docs/architecture.md`）。能力族覆盖：`compaction`、`subagent`（spawn/fork/in-process/ACP/Codex/Claude Code 子代理）、`sandbox`、`spill`、`guard`、`session-telemetry-otel`、`mcp-client`。**它是 harness 层**：`web`/`headless` 是模板，没有桌面 OS 壳、没有面向第三方的审批/产物治理。
- **Anthropic Claude Managed Agents / Google Agent Substrate**【不可实时验证】：按备忘录应为"可组合 agent runtime / 安全默认沙箱运行时"。**执行时未联网，用户需自行到 anthropic.com/news、cloud.google.com 核对版本与日期。**
- 主流个人智能体方向：从 chat-centric → **task-centric / Agent OS**（确定性编排 + 长周期状态 + 安全沙箱 + 全链路可观测）。CoreLayer 自己的 `docs/architecture/agent-os-product-vision.md` 已写对这个方向。

**差距与局限**
- **能力深度差距**：dsh 的每个子系统都比 CoreLayer 对应物"厚一档"（能力族 + seam + Agent Note + 子系统文档 + 类型等值校验）。CoreLayer 有模块名，缺 seam 与"可替换实现"。
- **范式差距**：dsh 以 **append-only 事件日志**为唯一真相源、消息历史派生；CoreLayer 以**可变行 + `compressed` 标记 + 单条 rolling summary** 为状态（`conversation-repo.ts:273-280`、`rolling-summary.ts`）。后者可回放性、可审计性、可 fork 性都弱。
- **合理性（公允一面）**：CoreLayer 的"本地优先 + 桌面原生 + 治理第三方 Coding Executor"是 dsh **不做**的；`slot-manager` 并发上限、资源压力门（`resource-monitor.ts:79-82`）这些**面向单机个人**的调度约束，是 dsh 这种"服务器/harness"心态的产品不会优先做的。这个生态位真实存在。

**优化建议**
- **P0**：把"死代码/孤岛"接回生产（见维度 4/5 具体项），否则定位叙事与实现不符。
- **P1**：把 daemon 内部状态从"可变行"升级为**事件源**（见维度 2/7 的具体方案），至少先对 **agent run / 会话**两个域落地 append-only 事件表 + 派生视图。
- **P1**：引入 **capability seam 抽象**（Service Definition / Provider / Consumer 三段式，仿 dsh），让 memory / compaction / sandbox / spill / telemetry 都可替换实现。这是把"模块孤岛"变成"可组合系统"的关键一步。
- **P2**：明确"不做"清单，避免重复造轮子（见第 4 节）。

**差异化创新点**
- **Coding Executor 治理平面**：把 Claude Code / Codex / OpenCode 当作"被治理的 worker"（生命周期 + 审批 + 产物 + 轨迹），这是 dsh 与多数 harness 都不占据的缝。可强化为"**跨 Executor 的统一验证与交付契约**"。
- **本地优先 + 桌面原生 + 个人单机调度语义**：把"个人机器资源约束"当成一等公民（并发槽、资源门、worktree 隔离），面向"一个人的 Agent OS"。

---

### 维度 2 · 记忆系统设计

**现状（全部 file:line 可复核）**
- 分类：**单表 `memories`**（`schema.ts:259-278`），列含 `scope_type∈{user,workspace,project,agent,task,conversation}`、`type∈{fact,preference,context,summary}`、`tier∈{preference,context,fact,pinned}`、`confidence/uses/last_injected_at/expires_at/last_verified_at`。**无 working/episodic/semantic/procedural**。
- 写入：三条路径——LLM 工具 `memory_store`（`memory/connector.ts:9-26`）；**每轮 fire-and-forget 抽取 ≤5 条**（`compressor.ts:309-355`，调用点 `conversation.ts:267-291`）；压缩时抽偏好（`compressor.ts:233-276`）。去重 = `(userId,scopeType,scopeId,lower(key))` 大小写不敏感精确匹配，命中**原地覆盖 value/type/tier**（`memory-repo.ts:343-381`）。
- 晋升/衰减：`uses≥5` 晋升到 preference tier（`memory-repo.ts:527-549`）；`pinned` 用户显式；`expiresAt` 过滤；`pruneUnusedMemories(maxAgeDays=30)` 删 `uses=0` 旧行（`memory-repo.ts:569-592`）。**无时间衰减打分，无矛盾检测/合并。**
- 召回：`fetchRelevantMemories`（agent 注入路径，`memory-repo.ts:149-217`）为**词法打分**（key 精确 +1.0 / key 包含 +0.7 / value 包含 +0.5 / scope +0.3 × 类别 boost × 置信度），`limit=15`，`MEMORY_MIN_SCORE=0.3`（`context-builder.ts:81`）。另一条 `searchScored` 走 **FTS5/BM25**（`memory-repo.ts:257-265`）。**无 embedding/向量。**
- 进上下文的决策层：`buildMemorySection`（`context-builder.ts:475-531`）——pinned ≤5 恒注入、preference ≤5、context ≤8 且 score≥minScore、fact ≤5，总上限 15+5，段落 token 预算 2000。
- 会话级：`rolling-summary.ts` 每 10 轮把近期对话 **LLM 摘要成 1 条** conversation-summary 记忆（**覆盖式，非追加**）。
- **注入安全**：key/value 有 prompt-injection 扫描（`memory-repo.ts:65-84`）——这是加分项。

**2026 主流对标**
- **CoALA 四分类**（working / episodic / semantic / procedural）为业界共识框架【不可实时验证其 2026 最新修订】。
- **dsh【已本机复核】**：不叫"记忆"，而以 **append-only `SessionEvent` 日志为唯一事实源**，消息历史**派生**（`docs/subsystems/session.md`）；长期/跨会话靠 **`session/store` 持久化 seam** 与 capability 组合；compaction 会把摘要作为 `user/message` 的 `surfaceOp:{op:'replace'}` 写回**日志**（可回放、可撤销语义、有 `compaction/start|summary|end` 三段事件 + 锁）。
- **Claude 文件系统式记忆（MEMORY.md + 按天日志 + 会话快照）/ ChatGPT 做梦式固化 / LangGraph Checkpoint+Store 双层 / Letta**【均不可实时验证 2026 具体版本】，但方向一致：**分层 + 可增量 + 可检索（向量）+ 只增不删的情景日志**。

**差距与局限**
- **缺分层**：working（当前上下文）与 episodic（经历）混在 `messages`；semantic/procedural 没有独立建模（"procedural"其实散在 `skills/` 但**不与记忆系统联通**）。
- **召回弱**：纯词法，跨语言/同义/语义改写召回差；**64% 的召回质量提升空间**（对照自身 references 里可加的 RRF/向量）。
- **写入不严谨**：last-write-wins + 无矛盾处理，会"静默污染"；"每轮抽 5 条"缺 importance 门（只有 `uses` 事后晋升）。
- **可回放性弱**：summary 是覆盖式单行，没有"当时决策依据"的可回溯快照。
- **公允一面**：单机个人场景下，**平表 + FTS 的延迟与实现复杂度确实低**；`expiresAt/prune/confidence/pin` 这套"轻量生命周期"对个人助手是合理的，不该为了对标而过度工程化。

**优化建议**
- **P0**：给记忆写入加 **importance 门 + 冲突标记**——写入时若同 key 旧值语义不同，不覆盖而是**保留新旧两条并标记 `conflict`**，交由后续轮次或用户裁决。（改 `memory-repo.ts` upsert 分支）
- **P1**：**引入向量召回并与 FTS 做 RRF 融合**。落地在 `memory-repo.ts`：新增 `memories_vec`（sqlite-vec 或本地 embedding 表），`fetchRelevantMemories` 改为 `bm25 + vector` RRF（你 CrawlerHub 已用过 RRF，可复用）。触发条件：`MEMORY_SEARCH_STRATEGY=hybrid`。
- **P1**：**给记忆加 CoALA 映射层**，不改表结构：`type=summary & scope=conversation` → episodic；`tier=preference` → semantic；`skills/` 注册表 → procedural（新增 `procedural` 视图）；working = 当前 history（不入库）。在 `context-builder.ts` 按类分节注入。
- **P1**：**情景日志改追加式**：新增 `memory_events` append-only 表记录"何时写入/修改了哪条记忆、依据哪条消息"，`memories` 作为其物化视图。为维度 7 的审计与维度 1 的事件源打底。
- **P2**：记忆 decay：给 `confidence` 加时间半衰（按 `last_injected_at`）。

**差异化创新点**
- **"个人记忆的可解释性"**：每条注入上下文的记忆都能回答"为什么进来"（哪次写入、哪条消息、当前 score 构成）。这是面向"隐私 + 信任"的本地优先产品独有的卖点，云端助手做不到同等透明。

---

### 维度 3 · 上下文管理与 offloading

**现状**
- 阈值：`COMPRESS_SOFT_THRESHOLD=0.8`、`HARD=0.85`、`MIN_MESSAGES_FOR_COMPRESSION=6`（`context-manager.ts:151-190`）；预算 `maxInputTokens=min(ctxWindow*0.85, 200_000)`，`historyTokens = maxInputTokens − systemPromptTokens − memoryTokens`（`context-manager.ts:129-149`）。冷却 `COMPRESSION_COOLDOWN_MS=30_000`、`MAX_COMPRESSIONS_PER_TURN=3`（`compression-state.ts:11,14`）。
- 粒度：`compressConversation`（`compressor.ts:393-491`）保留最近 `PROTECT_RECENT_COUNT=6`（实际 `min(6, floor(len/2))`），旧消息压成 1 条结构化摘要（userGoal/whatWasDone/currentState/pendingNext/keyContext，`MAX_SUMMARY_TOKENS=1024`）。**工具结果先被压到 `TOOL_SUMMARY_MAX_CHARS=200`**（`compressor.ts:134-191`）；压缩消息**标记 `compressed=true` 不删除**（`conversation-repo.ts:273-280`），随后插一条 `[对话摘要...]` system 消息。
- 历史截断：`selectHistoryWithinBudget`（`context-manager.ts:203-258`）恒保最近 6，超预算只保最近 3，否则从**最旧**开始丢弃。
- **tool output offloading：不存在。** 大结果被 `trimToolResult` 截为"头 70% + 尾 30%，`MAX_TOOL_RESULT_CHARS=4000`"（`ai-tool-wrapper.ts:22,105`），**原文不落盘、不留指针、不可逆**。（`tool_call_logs.result_data` 虽存审计副本，但**不会被回引到上下文**。）
- rot/drift 缓解：**无 sub-agent 上下文隔离**（全 agent 单一会话历史）；**无独立 task-state 对象外置**（除 SQLite messages + 单条 summary）。

**2026 主流对标**
- **dsh【已本机复核】——这正是它做得最完整的一块**：
  - `spill` 能力族：`saveText` **原样持久化**超大工具输出，返回**品牌化 `SpillLocator`（模型可见句柄）+ `bytes` + `retrievalHint`**；本地后端渲成文件路径，远端后端可渲成 URI/key/command 标记；消费者**不假设 `read` 是唯一取回方式**（`docs/subsystems/spill.md`）。并明确"truncation 是 lossy，spill 是可逆"。
  - `compaction` 能力族：`compaction/*` 三段事件 + **日志锁**（崩溃可检测孤儿锁）；摘要通过 `user/message` 的 `surfaceOp:{op:'replace',start,end}` 做**唯一一次"遮蔽"式表面替换**（`shadowedSeqs` 权威记录）；**记录 `provider/model/maxTokens/usage` 使这次摘要调用可从日志+代码重构**；另有**无模型 tool-result pruner**（`compaction-tool-result-pruner`）作为"模型无关"的轻量剪枝伴随件（`docs/subsystems/compaction.md`）。
- **Anthropic《Effective context engineering》/ LangChain 四动词 / Redis 2026 tool-output offloading**【不可实时验证具体日期】，方向与 dsh spill 一致：**大结果外置 + 指针 + 短预览，可逆不销毁**。

**差距与局限**
- **最痛的差距**：CoreLayer **只有 lossy truncation，没有 spill**。超 4000 字符的结果被丢弃 70% 又不可回取——对"读大文件/长日志/大 diff"的场景是直接的能力损失。
- **压缩阈值语义**：CoreLayer 以"history 预算占比"触发；dsh/主流更强调**接近 pre-rot 阈值才触发**且摘要调用**本身可审计（provider/model/usage 入日志）**。CoreLayer 的摘要调用**没有记录模型/用量**。
- **无 sub-agent 上下文隔离**：长任务里所有工具调用/中间产物塞进同一会话，是 rot/drift 的主要来源。dsh 的 `subagent`（in-process spawn / **fork from parent history** / ACP / Codex / Claude Code）本质就是**上下文隔离 + 委派**（`packages/subagent/README.md`）。
- **公允一面**：CoreLayer 的"保留最近 6 + 标记不删 + 结构化摘要 + 30s/3 次冷却"是**稳健且够用**的个人助手级方案；对绝大多数短会话它工作良好。问题只在长任务与大输出。

**优化建议**
- **P0（最高优先，可独立交付）**：**实现 spill**。改 `ai-tool-wrapper.ts`：当结果 > 阈值时，调用 `SpillStore.saveText(content)` → 落盘 `~/.jarvis/spill/<session>/<tool>-<callId>.txt`，把 4000 字符的截断替换为 **`[spill] 完整 N 字节，句柄: <path>，取回提示: 用 read 读该路径`**。加一个 `read` 工具即可闭环。这是投入最小、收益最大的一项。
- **P1**：压缩调用**记录 provider/model/maxTokens/usage 到事件表**（与维度 7 的 agent_run_events/execution_logs 打通），使"当时为何这样压"可审计。
- **P1**：实现 **sub-agent 上下文隔离**——把"研究/检索类"子任务放到独立会话（新 conversation + 只回传结论），主会话不再被中间工具输出污染。最小实现：给 `conversation.ts` 加 `delegateToSubConversation(task)`。
- **P2**：压缩从"整段历史一次摘要"升级为**滚动分段摘要**（保留更细的时间粒度），并把阈值语义改为"接近 pre-rot"（依据 rot 观测而非固定 0.85）。

**差异化创新点**
- **"可回放的双层上下文"**：spill 让"外置可逆" + 事件源让"摘要可审计"合体后，CoreLayer 可以做到**任何历史上下文都能被精确重建**（指针回到原文、摘要回到当时模型/用量）。这是本地优先产品能承诺、云端难以承诺的"**上下文的完全可追溯**"。

---

### 维度 4 · Agent loop

**现状（重大发现）**
- **显式 agent loop 是死代码**：`agent-loop.ts` 的 `runAgentLoop`（含 `for round < maxRounds` 循环、`LoopBreaker`、`IterationBudget`、`ForceAnswer`）**无生产调用者**——仅 `public-api.ts` 再导出 + 测试引用。连带 `registerActiveQueue` 无调用者，导致 `POST /runs/:id/message`（`http/routes/runs.ts:97-116`）在生产恒返回 404。
- **真实循环**：`conversation.ts:330-336` 的 **Vercel AI SDK `streamText` + `stopWhen: stepCountIs(maxSteps)`**；SDK 内部跑 tool-call→tool-result→re-prompt。步数观察走 `onStepFinish`。
- 常量：`maxSteps` 默认 20（`config-manager.ts:334-336`，范围 1-100）；`FORCE_ANSWER_ROUNDS=3`；预算告警 80%；`STUCK_THRESHOLD=3`（同工具+**完全相同 JSON 参数**）、`EXCESSIVE_THRESHOLD=10`；turn 超时 180s / stream 120s。
- 错误恢复：**循环内无工具重试**；失败透传。`retry-policy.ts`（分类退避 `transient_provider_error:3` / `permission_denied:0`）**只被自身测试引用，未接入**。
- 权限耦合：工具在 `conversation.ts:298` 经 `wrapToolsForAI` 包装；审批靠**扫描工具结果里的 marker** 然后 `controller.abort()`（`conversation.ts:363-373`），置 `waiting_for_approval`。恢复是**开新轮**（`approval.ts:151-161`）而非循环状态恢复。
- **无 mid-loop checkpoint**：run 是 all-or-nothing（除审批挂起）。适配器 `resumableSession:false`（`executor-adapter-wrapper.ts:62`）。

**2026 主流对标**
- **dsh【已本机复核】**：`core/agent-loop` 是**默认 driver 实现 `Agent` 接口**，可被插件替换；循环由 `turn/start → step/start → agent/request → llm/stream → tool/* → step/end → turn/end` 事件序列驱动；**每一步都追加到 append-only 日志**，因此**天然可回放、可 fork、可中途注入**（`agent.inject()` 作为 `user/message`）；`guard` 家族把"重复工具提醒/超时策略"做成**可插拔消费者**（`packages/guard/README.md`）；子代理可 `fork` 父历史。**关键差异：dsh 的循环是"事件驱动的可组合 driver"，CoreLayer 的是"SDK 调用 + 旁路回调"。**
- **OpenAI Agents SDK / LangGraph / Pydantic AI**【不可实时验证 2026 版本】：主流提供 checkpointing（LangGraph `thread_id` checkpoint + Store）、HITL interrupt、时间旅行。CoreLayer 的 SDK 选型（Vercel AI SDK）本身没问题，问题在**没把 SDK 的事件流桥接到自己的日志与 checkpoint**。

**差距与局限**
- **自研 vs 采用（明确论证）**：
  - **应保留自研**：loop **外层**的编排（workspaces/task graph/slot/coding executor 治理）——这是护城河。
  - **应采用/复用**：loop **内层**（tool-call 循环、streaming、step 状态机）**已经**在用 Vercel AI SDK，**继续用**，不要回去手写（现在偏巧手写的 `agent-loop.ts` 反倒成了死代码，说明手写无收益）。
  - **应借鉴而非重造**：checkpoint/HITL interrupt/subagent —— 要么用 SDK 的（若支持），要么按 dsh 的**事件源 + seam**思路自建"薄层"，但**不要**再写第三个半成品循环。
- **局限**：死代码本身就是最大的维护债（面试/协作会直接踩雷）；`POST /runs/:id/message` 不可用；无 checkpoint 意味着长任务崩溃=全丢；审批恢复开新轮会丢循环内已积累的中间态（只靠 history 兜）。
- **公允一面**：**用成熟 SDK 做内层循环是正确的取舍**——不该为了"自研"去重写 streaming/tool 循环，那是真的重复造轮子。CoreLayer 的错不在"用 SDK"，而在"写了个自研循环却不用"。

**优化建议**
- **P0**：**二选一并删干净**——要么把 `agent-loop.ts` 的 LoopBreaker/IterationBudget 真正接进 `conversation.ts` 的 `onStepFinish`（推荐，因为这两个机制有用），要么删掉死代码与 `public-api` 再导出，并修复/移除 `POST /runs/:id/message`。**不允许留死代码**。
- **P0**：把 `retry-policy.ts` 接进 executor attempt 的重试路径（现在 `run-dispatcher.ts` 的 `retryRun` 只是把 run 重置为 queued）。
- **P1**：**引入 checkpoint**：每次 `onStepFinish` 把"当前 step 状态 + 已产生工具结果"落到事件表，使 run 可按 step 恢复（对齐 dsh 的 step 事件与 LangGraph 的 checkpoint 思想）。
- **P1**：把循环**事件化**：`conversation.ts` 的 `onStepFinish/onFinish` 已经拿得到 step 数据，将其写成结构化 `agent_run_events`（已有表，`schema.ts:497-506`）的完整 step 序列，而非只在内存回调里用。
- **P2**：定义 `AgentLoop` 接口（仿 dsh `core/agent`），让"内层循环实现"可替换（当前 SDK 版 / 未来自研版 / 第三方版）。

**差异化创新点**
- **"可 fork 的本地会话"**：基于事件源 + checkpoint，支持"从第 N 步分叉出两条尝试路径并对比产物"——面向 Coding 任务的"**A/B 执行对比**"是 dsh 与云端都难给的本地能力。

---

### 维度 5 · 沙箱与执行隔离

**现状**
- 隔离档位：**OS 子进程**。`process-spawner.ts:144-149` 用 `spawn(cmd, args, { cwd, env:{...process.env, ...options.env}, shell: win32 })`。CLI 适配器同款 spawn（`claude-code/cli-adapter.ts:262-278`）。
- **控制循环与代码执行共享信任域**：LLM 循环在 daemon Node 进程内（`conversation.ts`，AI SDK in-process）；生成的代码/命令作为**同一 daemon 的子进程**运行，**继承完整 `process.env`、同 UID**。
- 无任何 OS 级沙箱：全仓 `seccomp/nsjail/firejail/gvisor/microvm` **零命中**。`docker-environment.ts` 存在（`spawn("docker", ["exec",...])`，`docker create --rm --workdir -v -e HOME`，**无 cgroup/内存/CPU/网络限制**）但**未被生产 import**。
- 资源限制：仅超时（executor 300s、worktree shell 30s）+ 并发槽（agent runs 3 / external executors 1，`slot-manager.ts:21-24`）+ 资源压力门（内存>85% 或 CPU>90% 延后派发，`resource-monitor.ts:79-82`）。**子进程无内存/CPU 上限，无 `maxBuffer`，stdout/stderr 无界缓冲**（`process-spawner.ts:164-170`）。
- 网络出口：**无控制**。`AccessPolicy.network?: 'none'|'allowlist'|'full'`（`packages/execution-environment/src/index.ts:24`）是**从未被强制的声明类型**。
- **worktree 隔离未接线**：唯一创建 worktree 的 `dispatchWithEnvironment`（`environment-integration.ts:51-127`）**无非测试调用者**；`run-dispatcher.ts:145,178` 直接把 `repoPath` 当 `workingDirectory`，`worktreePath` 永不设置（`executor-adapter-wrapper.ts:163-164` 读 `env.metadata?.worktreePath` 恒 undefined）；`worktree-policy.ts:28-31` `requireWorktreePath:false`。**即：DB 里 `environmentKind` 标着 `git-worktree`，实际在项目根裸跑。**

**2026 主流对标**
- **dsh【已本机复核】——"安全默认 + 跨平台本地沙箱"**：
  - `sandbox` 能力族：`SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'`，**只治理文件系统效果**；`SandboxEnforcement = 'full'|'partial'`，**把"能保证到什么程度"作为上报事实**（旧 Landlock ABI / Windows ACL 边界为 partial），要求绝对边界的消费者必须拒绝或显式呈现（`docs/subsystems/sandbox.md`）。
  - Provider：**Linux bwrap/Landlock、macOS Seatbelt、Windows ACL 受限令牌**。
  - 原生插件 `@deepseek-ai/node-addon-landlock-run`：**self-restrict-then-exec** 的 Landlock 启动器（~300 行 C11 over raw kernel UAPI，静态链接 musl），对自身装规则集后 `execve`，**规则集跨 execve 继承，被包裹命令及其子进程全部受限而调用者不受限；fail-closed（内核不能强制则拒绝执行）**（`native/landlock-run/README.md`）。
  - 明确边界：容器/microVM/远端是**整条能力 seam 的兄弟实现**，不是 `ctx.sandbox` 的 provider。
- **Google Agent Substrate（gVisor + microVM 双轨）**【不可实时验证】。
- 隔离光谱共识：同进程同 UID → OS 子进程 → 浏览器 origin → **gVisor** → **VM/microVM**；关键判断：**agent 控制循环是否与代码执行共享信任域**（Perplexity / Bolt.new 一类选择**不共享**）。

**差距与局限**
- **两个真实安全缺口**：(1) **控制循环与执行同域**——生成代码能在同 UID 下读写 daemon 可及的一切（含 `~/.jarvis` 数据库、密钥文件）；(2) **无网络出口控制**——被 governance 的 Coding Executor 可任意外联/外传。
- **"声明有、实际无"的落差**：`git-worktree` 标记与 `AccessPolicy.network` 都是"文档级隔离"，不是"执行级隔离"。
- **平台短板**：CoreLayer 是 Windows 优先（shell 用 `system shell`、worktree 分支用 `cmd`）——而 **Windows 恰是隔离最难做的一环**（无 Landlock/Seatbelt 等价物，只能走 AppContainer/受限令牌/Job Object）。
- **公允一面**：对"**本地个人、只跑自己信任的 Coding Agent**"这一约束，同 UID 子进程 + worktree + 审批**是可以接受的**——不必每个个人助手都上 gVisor。**问题在于产品自我宣称了"严格隔离 Scope"，实现却没到。**

**优化建议**
- **P0**：**把 worktree 接回生产**（零新代码，`environment-integration.ts` 已备好桥）。在 `run-dispatcher.ts` 用 `dispatchWithEnvironment` 替换直接传 `repoPath`，并让 `worktree-policy.ts` 对 coding 任务默认 `requireWorktreePath:true`。**这一步同时兑现简历第一行与一个真实安全边界。**
- **P0**：**给子进程设环境白名单**：`process-spawner.ts` 不再 `...process.env` 全量继承，改为显式 allowlist（PATH/HOME/必要 token），**杜绝把 daemon 的密钥/DB 路径泄漏给被执行代码**。
- **P1**：**接入本地沙箱后端**，对齐 dsh 的三段式：定义 `SandboxProvider` seam；Windows 先用 **Job Object（内存/CPU/进程数上限）+ 受限令牌**；Linux/macOS 加 **bwrap/Landlock、Seatbelt**；对外暴露 `SandboxMode` 与 `SandboxEnforcement`（含 "partial" 诚实上报）。可**直接复用 dsh 的 `landlock-run`**（MIT，预编译 npm 包）而非自研。
- **P1**：**网络出口控制**：对 coding executor 子进程做默认拒绝 + 允许列表（Windows 可 WFP/防火墙规则，或用代理隔离）。至少在**审批层**把"外联"变成 **high risk 必确认**（`policy-engine.ts:66-73` 已有 `no-external-publish-without-approval` 的雏形，要真正执行）。
- **P2**：可选 microVM/容器后端（对齐 `danger-full-access` 之外的强隔离需求），复用 dsh 的 e2b/容器思路。

**差异化创新点**
- **"个人机器的隔离策略机"**：CoreLayer 可以成为**第一个把"跨平台本地沙箱 + 诚实上报 enforcement 等级"做进桌面个人助手**的产品——Windows 用户目前几乎没有可用的一站式 agent 沙箱，这是真空。

---

### 维度 6 · 权限设计与 HITL

**现状**
- **三套并行风险模型**（这是设计债）：
  1. `packages/permission-guard/src/policies.ts:3-11`：`low:auto, medium:notify, high:confirm, critical:deny`（**工具运行时实际用这套**）。
  2. `policy-engine.ts:77-89`：按 action 的 `DEFAULT_RISK`（`shell.exec=medium`、`credential.read=critical`…），决策 low→allow / medium,high→require_approval / critical→hard_deny。
  3. `permission-broker.ts:25-36`：`CAPABILITY_RISK`，`shell.exec=critical`（未匹配→**deny**）。
- HITL 触发：**默认确定性**（静态风险 + allowlist + hardline blocklist）。`execute-tool.ts:280-291` 先跑 hardline；shell allowlist 是 **前缀 `startsWith`**（`shell-allowlist.ts:50-51`）；不匹配的 shell → critical → deny。**LLM 智能审批只在 `mode==='smart'` 时启用**（`smart-approval.ts:123-125`），失败 fail-safe 到 confirm。
- 决策回写：`POST /api/approvals/:id/remember` → `permission_memories`（`approval.ts:388-435`），表含 `decision∈{auto,confirm,deny}`、`scope∈{global,project,session}`、`expiresAt`（`schema.ts:536-549`）；查找优先级 session>project>global 且查过期（`permission-memory-repo.ts:64-128`）；session TTL 30 分钟；high/critical **禁止** auto-approve（`execute-tool.ts:178-180`）。
- 超时/拒绝：guard 默认 30s 超时→**false（视为拒绝）**（`guard.ts:12,252-259`）；AI 工具路径覆盖为 **5 分钟**（`execute-tool.ts:379`）；`expire-stale` 默认 300s 强制判 deny（`approval.ts:308-318`）；拒绝→run failed（`approval.ts:374-376`）。
- 可审计：全部写 `audit_log`（actor/action/resource/risk_level/permission_decision/confirmed_by_user/result，`schema.ts:597-608`），`GET /api/audit` 可按 actor/action/risk 过滤+count（`audit.ts:7-34`）——**approve/deny 率可算，但无现成统计端点**。
- **判定对象是原始字符串**：hardline 是 `normalized.includes(rule.pattern)`（`hardline-blocklist.ts:71-79`）；`policy-engine` 是正则作用于 `rawCommand`（`policy-engine.ts:24`）；allowlist 是前缀匹配。**唯一 argv 隔离的是 git**（`execFileSync("git", args)` + 允许根校验，`git-command-adapter.ts:55-70`）。

**2026 主流对标**
- **dsh【已本机复核】**：审批与沙箱解耦——`sandbox` 管文件效果、`guard` 管"循环卫生 + 每次调用预算"、`timeout-policy` 通过 `tools/execute` 监听器**作为部署策略武断每次调用 deadline**；提醒以 `additionalContexts` 挂在 `tools/post-execute` 决策上。**策略作为可插拔消费者，而非硬编码。**
- 主流共识：HITL 要**规范**（触发时机明确、决策可回写、超时有降级），且**每次干预可统计**以反向发现分级缺陷；命令判定应尽量走 **argv/tokenize** 而非字符串匹配。

**差距与局限**
- **三套风险模型不一致**：同一个 `shell.exec` 在 A 是 medium、B 是 critical，**结论会随走哪条代码而不同**——这是"安全策略不可预期"，比"松"更危险。
- **字符串判定易绕过**：`includes("curl")` 会误伤任何含 "curl" 的命令，而引号/`$IFS`/变量展开/`base64|sh` 又能绕过 pipe 正则。**"Shell AST"不存在**（全仓零命中 tree-sitter/bash-parser/shell-quote）。
- **统计缺失**：能算但没端点；无法自动发现"某个分级过严/过松"。
- **公允一面**：`permission_memories` 的 **scope+expiry+session TTL+high/critical 禁自动**这一套是**规范且克制的**，比很多产品做得好；`audit_log` 字段完整度也够。核心问题是**判定层与一致性**，不是治理框架。

**优化建议**
- **P0**：**合并三套风险模型为单一 `RiskPolicy`**（单一真相源，`packages/permission-guard` 或抽到 `capabilities/policy-engine.ts`），其他两处改为引用。**消除"同命令不同结论"**。
- **P0**：**把 `hardline`/`allowlist`/pipe 检测改为 argv 化**：shell 命令先经 `shell-quote`（或移植 dsh 的 wrapped-argv 思路）tokenize，再做段级判定；移除误导性的 `includes("curl")` 类规则，改为"**pipe-to-shell / 下载执行 / 破坏性目标**"三段语义规则。**同时把简历里的"AST"表述在代码上兑现或改口。**
- **P1**：**审批统计端点** `GET /api/approvals/stats`（approve/deny/expire 率 × risk × tool），用于**反向校准分级**（例如某 tool 长期 100% approve → 提议降级）。
- **P1**：**HITL 触发规范化**：用一张显式表定义"何种 tool×arg 形状触发 confirm"，并**记录触发原因**到 audit（现在只记结果）。
- **P2**：审批恢复改为**恢复循环状态**而非开新轮（依赖维度 4 的 checkpoint）。

**差异化创新点**
- **"自我校准的权限分级"**：基于 audit 统计，系统能**主动建议**"你连续 20 次批准了 X，是否降级/加 scope"——把 HITL 从"每次打断"变成"**越用越少打断但可解释**"，这是本地个人助手最该有的体验。

---

### 维度 7 · 可观测性与可审计（tracing）

**现状**
- **无 OpenTelemetry**：全仓 `opentelemetry/@opentelemetry/otel/OTLP/gen_ai/semconv/traceparent` **零命中**（"trace" 仅作注释/类型名 `ToolCallTrace`）。
- 现有数据面：`agent_run_events`（run_id/sequence/type/payload JSON，`schema.ts:497-506`，**delta 不落库**）；`tool_call_logs`（args/result_success/result_data/risk/confirmed_by_user/duration_ms，`schema.ts:207-222`）；`execution_logs`（run/executor/workspace/task + stream×sequence + content + metadata，`schema.ts:358-370`）；`event_log`（typed envelope，`workspace-event-emitter.ts:24-52`）；`audit_log`；`agent_runs`（selected_model/route_reason/memory_reads/tool_calls/artifacts/approvals/agent_snapshot/duration_ms）。
- **token/成本**：仅在 `onStepFinish` 累加后 `repo.updateTokenUsage(conversationId, prompt, completion)`（`conversation.ts:341-357`）→ 存 `conversations.prompt_tokens/completion_tokens`（`schema.ts:181-182`）。**无 cost 字段、无 per-call/per-run/per-workspace 归因。**
- 轨迹导出：`GET /api/runs/:id/trajectory` → `generateTrajectory`（`trajectory-service.ts:36-79`）聚合 events/logs/approvals/executorRuns 并脱敏，但 **`artifacts` 硬编码空数组**（`:47`），**不含 token/模型/验证结果，且不可重放**。
- 脱敏：`trajectory-service.ts:11-20` 有 `SECRET_PATTERNS`；`secret-masking.ts` 有 `maskSecret/maskObjectSecrets`；但**只用在 coding 适配器与轨迹导出**——`execution_logs.content` 与 `event_log.payload` **未脱敏**。**无采样**。
- 事件设计**半结构化**：`agent_run_events`/`event_log` 是结构化 JSON；`execution_logs` 是"自由文本 + 可选 metadata"；SSE 归一化会**丢弃 `tool-error/tool-output-denied/abort/source/file` 部分**（`sse-normalizer.ts:115-119`）。

**2026 主流对标**
- **dsh【已本机复核】——直接给了答案**：`session-telemetry` 能力族把**捕获点 / 定长 chunk 投影 / `session-telemetry/record` 脱敏瀑布 / handoff cursor / 最小 backend 契约**与 **backend** 分离；Provider `session-telemetry-otel` = **OpenTelemetry JS SDK 的 log pipeline 原样配置**。边界公理明确："harness 的职责止于 `emit()`；批处理/重试/队列/丢失策略属于上报 SDK"。记录分 `ledger`（会话日志镜像）与 `ops`（`agent-error`/`shutdown`），**severity 在捕获时预映射（error/info）**，身份属性刻意最小化（`session.id/event.type/event.seq/...`），"能从 body 恢复的一律不重复"（`docs/subsystems/session-telemetry.md`）。
- **OTel GenAI semconv**（`gen_ai.*`、`invoke_agent`/`create_agent`/`execute_tool` span）**截至检索仍为 Experimental、预期 breaking change，生产需 pin 版本**【WebSearch 返回内容自述未联网，`【不可实时验证】`；用户应查 opentelemetry.io/docs/specs/semconv/gen-ai/ 与 github.com/open-telemetry/semantic-conventions】。

**差距与局限**
- **整块缺失**：无标准追踪、无 span 层级、无 trace context 传播，**跨 daemon↔executor↔tool 的因果链断裂**——排障只能靠时间戳拼表。
- **成本归因不可用**：token 只在 conversation 粒度，**无法回答"这个 workspace/任务花了多少、哪个模型贵"**——对"多模型网关"这个核心卖点，成本面板是空的。
- **脱敏不覆盖主日志路径**：`execution_logs`/`event_log` 明文落盘，含密钥风险。
- **轨迹不可重放**：`artifacts` 空、无 prompt/上下文版本快照，"当时决策依据"不可复现。
- **公允一面**：`consersation.prompt_tokens` + `agent_runs.selected_model/route_reason` + `tool_call_logs.duration_ms` 已经**足以拼出一张基础成本/性能报表**——数据在，缺的是聚合与标准导出。

**优化建议**
- **P0**：**token/cost 归因下沉**——在 `agent_run_events` 的 `assistant/message` 类事件里带上 `usage`（对齐 dsh："模型输出与其计量同行，没有单独的 usage 记录"），或新增 `run_usage` 表按 run/task/workspace/model 聚合。让"成本降本"这个卖点**可被测量**。
- **P0**：**把脱敏接到所有落库日志路径**（`execution_logs`、`event_log`、`audit_log.metadata`），复用现有 `maskObjectSecrets`。
- **P1**：**按 dsh 的 seam 思路接入 OpenTelemetry**：定义 `TelemetryBackend` 接口（`emit(record)` 即止）→ Provider 用 `@opentelemetry/sdk-node` + OTLP exporter；**pin semconv 版本**；把 `agent_run_events` 镜像成 ledger 记录、把 `agent-error`/`shutdown` 作为 ops 记录。可**直接照搬 dsh 的记录模型**（ledger/ops、severity 预映射、最小身份属性）。
- **P1**：**轨迹可重放**：`generateTrajectory` 补上 `artifacts`（已有 `agent_runs.artifacts`）、`usage`、`model`、`verification`、`prompt/context 版本`；提供 `POST /api/runs/:id/replay`（依赖维度 4 checkpoint）。
- **P2**：SSE 归一化不要丢弃 `tool-error/source/file`。

**差异化创新点**
- **"隐私可证的本地追踪"**：OTel 导出前**全字段本地脱敏 + 用户可选择"只导出 ledger 不导出 body"**——本地优先产品能给出"**可观测性不牺牲隐私**"的承诺，这是云 SaaS 追踪做不到的。

---

### 维度 8 · 其他落后设计扫描（逐模块）

| # | 模块 | 落后/反模式 | 理由 | 重构建议 | 级别 |
|---|---|---|---|---|---|
| 1 | `runtimes/agent/application/agent-loop.ts` | **死代码** | `runAgentLoop`/`registerActiveQueue` 无生产调用者；`POST /runs/:id/message` 恒 404 | 接回或删除 + 修路由 | P0 |
| 2 | `runtimes/coding/{team-orchestrator,quality-gate,delivery-gate,retry-policy}.ts` | **孤岛模块** | 只被自身测试引用，读起来像"已实现"实则空转 | 接回生产路径（team→run-dispatcher；gates→executor-lifecycle；retry→attempt 重试） | P0 |
| 3 | `runtimes/coding/{git-worktree-environment,environment-integration,environment-mediated-executor}.ts` | **能力存在但未接线** | worktree 从不被创建；DB 谎称 `kind:git-worktree` | `run-dispatcher` 改用 `dispatchWithEnvironment`；`requireWorktreePath:true` | P0 |
| 4 | `runtimes/tool/adapters/ai-tool-wrapper.ts` | **lossy truncation 替代 offloading** | 大结果丢 70% 且不可回取 | 实现 spill（外置+指针+预览） | P0 |
| 5 | `capabilities/hardline-blocklist.ts` + `policy-engine.ts` + `permission-broker.ts` | **三套风险模型 + 字符串判定** | 同命令结论不一致；`includes("curl")` 误伤且可绕过；自称"AST"实为正则 | 合并为单一 `RiskPolicy` + argv tokenize | P0 |
| 6 | `persistence/sqlite/memory-repo.ts` | **平表 + 纯词法召回** | 无 CoALA 分层、无向量、无矛盾处理、last-write-wins 污染 | 向量+BM25 RRF 融合；冲突保留；CoALA 映射层 | P1 |
| 7 | `persistence/supabase/memory-repo.ts` | **云端记忆是抛异常 stub** | 切 cloud 模式记忆直接崩 | 实现或明确移除 cloud 记忆选项并在 UI 禁用 | P1 |
| 8 | `config/storage-config.ts` + `factory.ts` | **声明 `postgres` 模式但回退 SQLite** | 配置项骗人 | 移除或实现 | P2 |
| 9 | `runtimes/agent/application/context-manager.ts:151` | **注释与常量不符** | 注释写"soft trigger 50%"，常量是 0.8 | 修注释 | P2 |
| 10 | `runtimes/coding/process-spawner.ts:144` | **全量继承 `process.env`、无资源上限、无网络控制** | 执行代码可读 daemon 密钥；可任意外联 | env allowlist + Job Object/资源上限 + 网络默认拒绝 | P0/P1 |
| 11 | `runtimes/tool/.../native-tools/registry.ts` | **风险按工具名 `includes` 推断** | `inferRisk` 靠名字关键词，脆弱 | 风险元数据显式声明，不靠名字猜 | P1 |
| 12 | `trajectory/trajectory-service.ts:47` | **`artifacts` 硬编码空数组** | 文档宣称导出产物，实际空 | 补全 + usage/model/verification | P1 |
| 13 | 全局日志路径 | **主日志不脱敏、无采样** | 密钥明文落盘 | 全路径接 mask + 采样策略 | P0 |
| 14 | `packages/mcp-client/src/manager.ts:70` | **stdio 传输是 `throw`** | 自称支持 stdio/SSE/HTTP，实则 stdio 不可用 | 实现 Node stdio 传输（用 SDK 的 `StdioClientTransport`） | P1 |
| 15 | `skills/` 与 `memory/` | **procedural 记忆与记忆系统割裂** | skill 是独立 dir scan，不参与记忆召回/分层 | 把 skill 注册为 procedural memory 视图 | P2 |

---

## 3. 总体路线图（止血 → 主干重构 → 差异化创新）

### 阶段 0 · 止血（P0，1–2 周，低风险为主）
| 项 | 工作量 | 风险 | 依赖 |
|---|---|---|---|
| 删除/接线 `agent-loop.ts` 死代码，修 `POST /runs/:id/message` | S | 低 | 无 |
| 把 worktree 接回 `run-dispatcher`（复用 `environment-integration`） | S | 中（会改变执行 cwd，需回归 coding 流程） | 无 |
| 实现 **spill**（`ai-tool-wrapper` + `SpillStore` + `read` 闭环） | M | 低 | 无 |
| 合并三套风险模型为单一 `RiskPolicy`；shell 判定改 argv | M | 中（行为变化，需权限回归测试） | 无 |
| 子进程 env allowlist | S | 低 | 无 |
| token/cost 归因下沉到 run 级 | S | 低 | 无 |
| 全落库日志路径接脱敏 | S | 低 | 无 |
| 接线 `retry-policy`（替换 `retryRun` 的裸重置） | S | 低 | 无 |

### 阶段 1 · 主干重构（P1，1–2 月，中风险）
| 项 | 工作量 | 风险 | 依赖 |
|---|---|---|---|
| 引入 **事件源**：会话/run 改 append-only 事件 + 派生历史（先 agent run 域） | L | **高**（触及 `conversation.ts`/`schema`，需迁移） | 阶段 0 的日志/usage 下沉 |
| **capability seam 抽象**（memory/compaction/sandbox/spill/telemetry 三段式） | L | 中 | 事件源 |
| checkpoint：每 step 落状态，支持按 step 恢复 | M | 中 | 事件源 |
| sub-agent 上下文隔离（研究类委派） | M | 中 | 无 |
| 记忆 **向量 + BM25 RRF 融合** + 冲突保留 + CoALA 映射 | M | 中 | 无 |
| **本地沙箱后端**（Win Job Object + Linux/macOS bwrap/Landlock/Seatbelt），复用 dsh `landlock-run` | L | 中 | seam |
| 网络出口默认拒绝 + allowlist | M | 中 | 沙箱后端 |
| **OTel 接入**（`TelemetryBackend` seam + OTLP，pin semconv） | M | 低 | 日志结构化 |
| 审批统计端点 + 触发原因记录 | S | 低 | 无 |
| 轨迹可重放（补 artifacts/usage/verification） | M | 低 | checkpoint + 事件源 |
| 实现 MCP stdio 传输 | S | 低 | 无 |

### 阶段 2 · 差异化创新（P2，持续）
| 项 | 工作量 | 风险 | 依赖 |
|---|---|---|---|
| 可 fork / A-B 对比的本地会话 | L | 高 | 事件源 + checkpoint |
| 自我校准的权限分级（统计驱动建议） | M | 中 | 审批统计 |
| 个人记忆可解释性（"为何进上下文"溯源） | M | 低 | 事件源 |
| 跨平台"个人机器隔离策略机"+ 诚实上报 enforcement | L | 中 | 沙箱后端 |
| 隐私可证追踪（导出前本地脱敏 + 可选只导 ledger） | M | 低 | OTel |
| 可选 microVM/容器强隔离后端 | L | 中 | 沙箱 seam |

---

## 4. 重复造轮子专项结论

**应直接采用成熟方案（不要自研）**
| 能力 | 对标 | 理由 |
|---|---|---|
| 内层 tool-call/stream 循环 | **已在用 Vercel AI SDK**（保留） | 自写 `agent-loop.ts` 已成死代码，证明手写无收益 |
| 本地 OS 沙箱 | **dsh `landlock-run`（MIT，预编译）** + bwrap/Seatbelt/Windows Job Object | 内核级 Landlock/bwrap 不该重写；跨平台差异应封装而非发明 |
| 遥测管道 | **OpenTelemetry JS SDK + OTLP**（dsh 亦如此） | 标准导出/采样/后端生态不该重造 |
| 工具/数据接入 | **MCP**（官方 `@modelcontextprotocol/sdk`；补 stdio） | 已是标准，自研 REST bridge（`gateways/mcp/adapters/*` 已 `@deprecated`）应淘汰 |
| 向量检索 | **sqlite-vec / 成熟 embedding** | 不必自研向量索引 |
| Shell 解析 | **`shell-quote`/bash-parser** | 自研"AST"不存在，直接引库 |

**自研才有护城河（应强化）**
| 能力 | 理由 |
|---|---|
| **Coding Executor 治理平面**（Claude Code/Codex/OpenCode 生命周期 + 审批 + 产物 + 验证契约） | dsh 把子代理当 provider，**不治理第三方 Executor 的审批/产物/交付**；这是本项目的独特缝 |
| **本地优先 + 桌面原生 + 单机调度语义**（并发槽、资源门、worktree、个人隐私） | dsh 是 harness 心态，云端产品无法给"本地/隐私/单机资源"承诺 |
| **跨 Executor 统一验证 / 交付契约**（`verification.ts` + `completion-policy`，已接生产） | 已真实工作且是价值点，应扩到 quality gates（typecheck/lint）与 delivery gate |
| **个人记忆可解释性 + 自我校准权限** | 面向"信任与隐私"的本地产品独有 |

**一句话**：**内层循环、沙箱内核、遥测管道、向量、shell 解析、MCP —— 全部采用成熟方案；把自研精力集中到"治理第三方 Coding Executor"与"本地优先的个人 Agent OS 语义"。** 这正是 dsh 的 `Model + Harness = Agent`（模型+harness=agent）口号**不含**的那一层：**harness 之下的"个人执行治理"。**

---

## 5. 信息溯源

**可直接本机复核（一手，最高可信）**
- DeepSeek Harness 仓库：`E:\code\github_project\deepseek-harness`
  - `README.md`（MIT，Cordis，"everything is a plugin"，developer preview，compat-breaking）
  - `docs/architecture.md`（profiles/bundles、核心包表、turn flow、事件三类）
  - `packages/{compaction,spill,sandbox,guard,subagent,mcp}/*/README.md`
  - `docs/subsystems/{session,spill,compaction,sandbox,session-telemetry}.md`
  - `native/landlock-run/README.md`（Landlock self-restrict-then-exec，fail-closed）
  - 文档内 Agent Notes 日期：`2026-06-13`、`2026-06-18`、`2026-06-21`、`2026-07-06`、`2026-07-08`、`2026-07-14`、`2026-07-21`、`2026-07-23`、`2026-07-26`
- CoreLayer：本报告所有 `file:line` 均可在 `E:\code\github_project\Jarvis` 复核；覆盖率实测 `daemon/coverage/coverage-summary.json` = 83.31% lines / 83.22% branches（19,677 行）。

**时效存疑 / 未能实时验证（务必自行核对）**
- Anthropic **Claude Managed Agents**（备忘录称 2026-04）——**未验证**。核对：anthropic.com/news、docs.anthropic.com。
- Google **Agent Substrate**（gVisor + microVM）——**未验证**。核对：cloud.google.com、Google AI blog。
- **OpenTelemetry GenAI semconv** 的当前稳定性——WebSearch 自述未联网；初判 **agent span（`invoke_agent`/`create_agent`）仍为 Experimental、预期 breaking change、生产需 pin 版本**。核对：opentelemetry.io/docs/specs/semconv/gen-ai/ 、github.com/open-telemetry/semantic-conventions。
- LangChain 四动词（2025-07）、Anthropic《Effective context engineering》（2025-09）、Redis tool-output offloading（2026-05）、Letta / LangGraph Checkpoint+Store / ChatGPT "做梦"记忆、CoALA 四分类——**均为备忘录引用，本次未联网验证**；其中 2025 年的方法论按"**可能过时**"对待，其方向（外置+指针+分层+可逆）与可复核的 dsh `spill`/`session` 实现一致，故可采信其**方向**，但不采信其**版本/日期**。

**方法学声明**：本报告的外部对标以"可本机检视的 dsh 源码与 2026-06/07 实现文档"为一手依据；凡无法本机验证者已显式标注，未以二手转述冒充 2026 现状。
