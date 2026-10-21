# CoreLayer 架构演进、技术选型决策与深水区避坑面试宝典

> **[Agent 协作维护契约]**  
> 本文档是 CoreLayer/Jarvis 项目的**持久化架构演进资产与技术深度答辩备忘录**。  
> **所有后续参与本仓库优化、重构或缺陷修复的 Agent 必须严格遵守以下约定：**
>
> 1. **增量演进更新**：凡涉及核心架构调整、执行器通信协议演变、安全沙箱升级、依赖选型更替，必须在【第二章】或【第五章】追加决策记录。
> 2. **深水区战役复盘**：凡在开发、评测或集成过程中定位出属于“非普通业务报错”（如操作系统底层差异、跨平台进程陷阱、并发死锁、鉴权穿透、状态机不一致等隐蔽缺陷），必须在【第三章】按照统一格式（现象 -> 试错 -> 根因定位 -> 系统化修复 -> 防御性措施）追加实战复盘。
> 3. **最新对标维护**：当完成新阶段功能（如 D2 Task Graph、D3 对抗仲裁、M1 符号上下文图谱等）后，必须同步更新【第四章】与【第五章】的完备度与差距矩阵。

---

## 目录

- [一、项目全景与架构愿景（The Big Picture）](#一项目全景与架构愿景the-big-picture)
  - [1.1 业务定位与核心诉求](#11-业务定位与核心诉求)
  - [1.2 整体架构拓扑与分层原则](#12-整体架构拓扑与分层原则)
- [二、核心技术选型决策与权衡矩阵（Technical Decision Matrix）](#二核心技术选型决策与权衡矩阵technical-decision-matrix)
  - [2.1 运行时架构：为什么采用 Node Sidecar + SQLite WAL，而非纯 Rust 整体重构？](#21-运行时架构为什么采用-node-sidecar--sqlite-wal而非纯-rust-整体重构)
  - [2.2 沙箱与工作区隔离：为什么采用 Git Worktree，而非纯 Docker/微型虚拟机？](#22-沙箱与工作区隔离为什么采用-git-worktree而非纯-docker微型虚拟机)
  - [2.3 多 Agent 委派安全模型：为什么采用数学单调收窄（Monotonic Narrowing Bounds）？](#23-多-agent-委派安全模型为什么采用数学单调收窄monotonic-narrowing-bounds)
  - [2.4 可靠性基准：为什么坚持 pass^k (k=3) 评测体系与双轨故障分类（Voided 机制）？](#24-可靠性基准为什么坚持-passk-k3-评测体系与双轨故障分类voided-机制)
  - [2.5 进程通信协议：为什么拥抱 Claude ACP（Agent Client Protocol）？](#25-进程通信协议为什么拥抱-claude-acpagent-client-protocol)
  - [2.6 复杂协同拓扑：为什么采用声明式 DAG + 拓扑波次并发（Kahn Algorithm），而非自由群聊通信？](#26-复杂协同拓扑为什么采用声明式-dag--拓扑波次并发kahn-algorithm而非自由群聊通信)
  - [2.7 质量仲裁与交付门禁：为什么采用“物理规则校验 + 对抗式审查（Adversarial Adjudication）”双轨制？](#27-质量仲裁与交付门禁为什么采用物理规则校验--对抗式审查adversarial-adjudication双轨制)
  - [2.8 上下文工程：为什么采用“纯 AST 符号依赖图谱 + 一阶邻域自适应剪枝（Skeleton Pruning）”，而非整文件切块或纯向量检索？](#28-上下文工程为什么采用纯-ast-符号依赖图谱--一阶邻域自适应剪枝skeleton-pruning而非整文件切块或纯向量检索)
  - [2.9 工具溢出治理：为什么采用“两级动态路由（Core + TF-IDF On-Demand）+ 元工具探查”，而非盲目暴露全部 Function Calling Schema？](#29-工具溢出治理为什么采用两级动态路由core--tf-idf-on-demand-元工具探查而非盲目暴露全部-function-calling-schema)
  - [2.10 文件落盘拓扑与凭据安全链：借鉴 OpenClaw / Hermes 的六态物理分治与多级决断树](#210-文件落盘拓扑与凭据安全链借鉴-openclaw--hermes-的六态物理分治与多级决断树)
- [三、深水区重大隐蔽 Bug 攻坚战（War Stories & Root Cause Analysis）](#三深水区重大隐蔽-bug-攻坚战war-stories--root-cause-analysis)
  - [战役一：Windows cmd.exe 多行提示词换行截断与幽灵失败（Prompt Truncation）](#战役一windows-cmdexe-多行提示词换行截断与幽灵失败prompt-truncation)
  - [战役二：父子 Agent 嵌套委派并发死锁与资源枯竭（Slot Deadlock）](#战役二父子-agent-嵌套委派并发死锁与资源枯竭slot-deadlock)
  - [战役三：安全边界穿透与假冒父级上下文伪造漏洞（AsyncLocalStorage 隐式溯源）](#战役三安全边界穿透与假冒父级上下文伪造漏洞asynclocalstorage-隐式溯源)
  - [战役四：Git Porcelain 状态前缀与 Windows 反斜杠导致的“路径鉴权假阴性拒绝”](#战役四git-porcelain-状态前缀与-windows-反斜杠导致的路径鉴权假阴性拒绝)
  - [战役五：SQLite 独立非侵入式轻量迁移（无外部迁移器死锁）](#战役五sqlite-独立非侵入式轻量迁移无外部迁移器死锁)
  - [战役六：并行 DAG 下的多任务写冲突预警与 Fail-Fast 级联熔断（Parallel Wave Conflict & Cascading）](#战役六并行-dag-下的多任务写冲突预警与-fail-fast-级联熔断parallel-wave-conflict--cascading)
  - [战役七：对抗式审查拦截“假绿测试”与弱化断言作弊（Preventing Test Weakening & Fake Stubs）](#战役七对抗式审查拦截假绿测试与弱化断言作弊preventing-test-weakening--fake-stubs)
  - [战役八：长文件上下文爆炸与注意力稀释（Needle In A Haystack）的 AST 剪枝攻坚战](#战役八长文件上下文爆炸与注意力稀释needle-in-a-haystack的-ast-剪枝攻坚战)
  - [战役九：海量 MCP 工具溢出（Tool Spillover）导致的 Schema Token 爆炸与模型迷失攻坚战](#战役九海量-mcp-工具溢出tool-spillover导致的-schema-token-爆炸与模型迷失攻坚战)
  - [战役十：高频活跃记忆 30 天后神秘蒸发事件（Memory Injection Tracking 致命缺陷攻坚记）](#战役十高频活跃记忆-30-天后神秘蒸发事件memory-injection-tracking-致命缺陷攻坚记)
- [四、横向标杆竞品全方位对标矩阵（Competitive Analysis）](#四横向标杆竞品全方位对标矩阵competitive-analysis)
  - [4.1 对标维度全景矩阵（Jarvis vs Raven vs Hermes vs OpenClaw vs OpenRSI）](#41-对标维度全景矩阵jarvis-vs-raven-vs-hermes-vs-openclaw-vs-openrsi)
  - [4.2 我们的完备性评估：哪些堡垒已经建立？](#42-我们的完备性评估哪些堡垒已经建立)
- [五、核心差距与下一阶段演进路线（Remaining Gaps & Next Steps）](#五核心差距与下一阶段演进路线remaining-gaps--next-steps)
  - [5.1 D2：动态 Task Graph（拓扑排序、DAG 依赖注入与 Map-Reduce 并行扇出）](#51-d2动态-task-graph拓扑排序dag-依赖注入与-map-reduce-并行扇出)
  - [5.2 D3：对抗式仲裁者（Adversarial Adjudication & 独立 Judge Agent）](#52-d3对抗式仲裁者adversarial-adjudication--独立-judge-agent)
  - [5.3 M1-M6：符号上下文图谱与自适应剪枝（Symbol Context Graph & AST Pruning）](#53-m1-m6符号上下文图谱与自适应剪枝symbol-context-graph--ast-pruning)
  - [5.4 Tool Spillover：海量工具动态挂载与向量化按需路由（MCP Lazy Loading）](#54-tool-spillover海量工具动态挂载与向量化按需路由mcp-lazy-loading)
  - [5.5 HITL：交互式前端审批卡与“所见即所执行”证据闭环](#55-hitl交互式前端审批卡与所见即所执行证据闭环)
- [六、面试话术与高频技术追问指南（Interview Q&A Cheatsheet）](#六面试话术与高频技术追问指南interview-qa-cheatsheet)

---

## 一、项目全景与架构愿景（The Big Picture）

### 1.1 业务定位与核心诉求

当前市面上的 AI 编码助手多停留在“聊天框 + 大号脚本注入（Bash/Edit 裸调）”阶段，面临三大生产级痛点：

1. **不可信与幻觉灾难**：缺乏端到端机器可验证的物理证据链，Agent 自称“任务已完成”，实际代码未编译或甚至未落盘；
2. **环境污染与不可逆破坏**：Agent 直接在开发者工作区内读写修改，一旦执行错误可能污染本地 Git 树或删除未提交代码；
3. **复杂任务单线程瓶颈与权限失控**：单 Agent 处理复杂重构时上下文爆炸崩溃；而在多 Agent 派发时，子 Agent 往往继承全量权限，缺乏安全收窄机制。

**CoreLayer/Jarvis 的愿景定位**：
打造一个**面向桌面的、高可靠、确定性证据驱动的自主 Agent 操作系统**（Autonomous Agent OS）。它不是一个简单的 Prompt 包装器，而是一个具备**进程隔离、Worktree 沙箱、单调递减权限收窄、跨模型适配以及自动化可靠性评测（Eval Harness）**的工业级 Agent 运行时。

### 1.2 整体架构拓扑与分层原则

```
┌─────────────────────────────────────────────────────────────┐
│                      Tauri v2 Desktop UI                    │
│   (React 19 + Vite + Tailwind + Radix UI + WebSockets/SSE)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC / Localhost HTTP
┌──────────────────────────────▼──────────────────────────────┐
│                    Node.js Daemon Sidecar                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Application & REST/SSE Layer (Hono Framework)          │ │
│  └───────────────────────────┬────────────────────────────┘ │
│  ┌───────────────────────────▼────────────────────────────┐ │
│  │ Workflow Orchestration:                                │ │
│  │  - QueueService & RunDispatcher                        │ │
│  │  - SlotManager (隔离双轨并发槽位预算)                     │ │
│  │  - DelegationService (dispatch_agent 权限单调收窄引擎)    │ │
│  │  - Verification & Evidence (Path/Artifact/Command 校验) │ │
│  └───────────────────────────┬────────────────────────────┘ │
│  ┌───────────────────────────▼────────────────────────────┐ │
│  │ Tool & Capability Runtime:                             │ │
│  │  - AsyncLocalStorage Context Carrier                   │ │
│  │  - Native Tools & MCP Adapter Engine                   │ │
│  │  - Hardline Security Guard & Permission Gate           │ │
│  └───────────────────────────┬────────────────────────────┘ │
│  ┌───────────────────────────▼────────────────────────────┐ │
│  │ Persistence & State Store:                             │ │
│  │  - SQLite (WAL Mode, schema migration, single writer)  │ │
│  │  - Drizzle ORM + Repository Pattern                    │ │
│  └───────────────────────────┬────────────────────────────┘ │
└──────────────────────────────┼──────────────────────────────┘
                               │ JSON-RPC / Stdio
┌──────────────────────────────▼──────────────────────────────┐
│                  Coding Runtime Adapters                    │
│  ┌───────────────────────────┐  ┌─────────────────────────┐ │
│  │ Claude ACP Adapter        │  │ CLI Adapter (DeepSeek)  │ │
│  │ (acpx, json-rpc, stdio)   │  │ (process-spawner, no-sh)│ │
│  └─────────────┬─────────────┘  └────────────┬────────────┘ │
└────────────────┼─────────────────────────────┼──────────────┘
                 │                             │
┌────────────────▼─────────────────────────────▼──────────────┐
│             Git Worktree Environment Sandbox                │
│    (Isolated branches, atomic commits, zero host pollution) │
└─────────────────────────────────────────────────────────────┘
```

**四大核心架构原则**：

1. **证据先于陈述（Evidence over Claims）**：判定一个任务是否成功，不看 LLM 在聊天流里说了什么，只看工作区物理文件的 SHA256 变动、测试命令返回码（Exit 0）以及交付工件（Artifacts）的真实存在性；
2. **最小权限单调收窄（Least-Privilege Monotonic Narrowing）**：父 Agent 派发子 Agent 时，子权限集合只能是父权限集合的**严格真子集或相等**（路径求交、工具求交、超时缩短），绝不允许越权放大；
3. **工作区绝对隔离（Zero Host Contamination）**：一切代码修改必须在独立的 `Git Worktree` 分支上完成并执行自检，主工作区在未裁决通过前保持绝对纯净；
4. **确定性汇聚（Single Source of Truth）**：拒绝存在影子执行链路或隐蔽流式旁路，所有运行、事件、审批和产物统一归口入库并持久化。

---

## 二、核心技术选型决策与权衡矩阵（Technical Decision Matrix）

在系统演进过程中，我们经历过数次关键技术架构的抉择。面试官最常追问：“你为什么选这个方案？为什么不选业界另一个主流方案？你们做过哪些 Trade-off？”以下是核心选型决策的推演矩阵：

### 2.1 运行时架构：为什么采用 Node Sidecar + SQLite WAL，而非纯 Rust 整体重构？

- **备选方案 A**：纯 Rust 编写（借助 Tauri 的 Rust 后端承载全量逻辑）；
- **备选方案 B**：Python 方案（如大部分学术原型与 LangChain/CrewAI 生态）；
- **最终抉择**：**Node.js Sidecar（TypeScript + ESM）+ Hono + SQLite (better-sqlite3 / WAL)**。
- **权衡深度剖析**：
  - **vs 纯 Rust**：Agent 运行时的本质是**协议胶水、动态工具反射、流式事件编排与复杂的外部生态对接**（如 MCP、Node 脚本沙箱、TypeScript 动态求值）。如果全部用 Rust 编写，面对上游频繁变更的 JSON-RPC 协议、ACP 规范和 MCP SDK 时，开发维护成本和迭代周期会呈指数级上升。Node Sidecar 带来了成熟的 npm/TypeScript 生态，同时利用 Tauri 作为轻量宿主实现系统托盘、原生窗口与系统级快捷键，实现了架构解耦。
  - **vs Python**：Python 在桌面端分发极其痛苦（环境打包沉重、多平台动态链接库地狱、冷启动缓慢且常驻内存过高），而 Node.js 借助 Single Executable Application (SEA) 或精简运行时可以做到毫秒级拉起、极致内存管控与严密类型推导（TypeScript strict mode）。
  - **SQLite WAL 选型**：轻量嵌入式、单文件持久化、零网络开销。开启 `WAL`（Write-Ahead Logging）模式后，读操作完全不阻塞写操作，并发读取性能突破每秒数万次，足以完美支撑实时事件流的高吞吐记录。

### 2.2 沙箱与工作区隔离：为什么采用 Git Worktree，而非纯 Docker/微型虚拟机？

- **备选方案 A**：全量 Docker 容器隔离；
- **备选方案 B**：微虚拟机 / WASM 沙箱（如 Firecracker、WasmEdge）；
- **最终抉择**：**Git Worktree 轻量分支目录隔离（配合后续 Docker 可选扩展）**。
- **权衡深度剖析**：
  - **启动延迟与资源开销**：Docker 容器启动开销通常在数秒级，且强制依赖宿主机安装并常驻 Docker Desktop（对普通桌面开发者门槛过高，资源占用大）。Git Worktree 是本地秒级（通常 < 50ms）原语，仅依赖本地 git 二进制。
  - **文件变更透明度与回滚成本**：Worktree 天生具备 Git 分支特性，天然支持 `git diff`、原子暂存、安全合并与一键物理清空，不会在用户工作树留下未追踪的中间残余。
  - **工程实践检验**：我们在 `daemon/src/runtimes/coding/docker-environment.ts` 中曾经实现过 Docker 隔离，但架构审计发现单例下它永远被绕过，核心原因就是桌面场景下“用户环境异构性与 Docker 强依赖”是巨大的易用性鸿沟。因此将 Git Worktree 作为**一级公民（Tier-1 Baseline）**，Docker 退居为高敏感任务的特化外挂插件。

### 2.3 多 Agent 委派安全模型：为什么采用数学单调收窄（Monotonic Narrowing Bounds）？

- **设计痛点**：传统的多 Agent 协同系统（如 AutoGen、CrewAI）通常让子 Agent 从 Prompt 中“听说”自己的任务，子 Agent 本质上依然能够调用宿主的所有工具，访问全量文件系统，从而造成灾难性的权限外溢。
- **创新实现**：在 `daemon/src/workflow/delegation-bounds.ts` 中构建了**单调收窄引擎（Monotonic Narrowing）**。
- **形式化证明与数学约束**：
  设父 Agent 持有的安全约束上界为 $\mathcal{B}_{parent} = \langle P_p, T_p, C_p, A_p, t_p \rangle$，子任务请求申请的权限为 $\mathcal{R} = \langle P_r, T_r, C_r, A_r, t_r \rangle$。
  经过 `narrowDelegationBounds` 计算出的子任务授予约束 $\mathcal{B}_{child}$ 必须满足：
  $$\mathcal{B}_{child} = \mathcal{B}_{parent} \sqcap \mathcal{R}$$
  1. **路径约束（Allowed Paths）严格求交**：$P_{child} = P_p \cap P_r$。若 $P_{child} = \emptyset$，直接抛出 `DelegationRejected` 拒绝委派，不落库不排队；底层实现利用 `intersectGlobs` 对路径分段提取骨架，确保通配符（如 `**`）收窄时的严谨性；
  2. **工具白名单（Allowed Tools）严格求交**：$T_{child} = T_p \cap T_r$；
  3. **测试命令（Test Commands）与交付物要求（Artifacts）单调追加**：$C_{child} = C_p \cup C_r, \quad A_{child} = A_p \cup A_r$；
  4. **超时限制（Timeout）单调递减并全局钳制**：$t_{child} = \max(T_{min}, \min(t_r, t_p, T_{max}))$，其中 $T_{min}=30s, T_{max}=30min$；
  5. **执行器与模型不可越级**：若父级绑定了特定执行器或模型，子任务强行继承，防止子 Agent 通过委派逃逸至未授权模型。

### 2.4 可靠性基准：为什么坚持 pass^k (k=3) 评测体系与双轨故障分类（Voided 机制）？

- **痛点认知**：传统评测习惯看单次 `pass@1`，但在多 Agent 编程任务中，随机采样抖动极大；而使用 `pass@k`（k 次尝试中至少成功 1 次）又会严重掩盖系统的不稳定性（只要模型撞大运成功一次就判定为 pass）。
- **学术依据与选型**：借鉴 Tau-bench（Sierra et al., 2024）研究，我们推行 **$pass^k$（连续 k 次尝试全部成功）**。只有当系统在同一任务上连续 3 次均能通过物理证据判定时，该任务才被记录为 Reliable。
- **工业级故障分类（Agent vs Infra）与 Voided 机制**：
  - 如果把 429 速率限制、网络中断、网关宕机等底层故障混入 Agent 失败中，会导致可靠性指标被环境噪音污染；
  - 我们在 `daemon/src/workflow/failure-classification.ts` 中构建了故障分类器。一旦检测到真正的 Infra Fault（例如 HTTP 401/403/429/5xx、`rate_limit`、`overloaded`），该次 Attempt 将被标记为 **`VOID`（作废重试）**，不计入模型失败，并触发自适应退避与熔断断路器（3 次连续 Infra 故障自动熔断停止耗费额度）。

### 2.5 进程通信协议：为什么拥抱 Claude ACP（Agent Client Protocol）？

- **背景与抉择**：在对接外部专业编程 Agent 时，业界通常有两种方式：
  - 方式一：伪造终端键盘输入，通过 PTY 模拟 CLI 交互（脆弱，容易被 ANSI 颜色字符和终端换行搞挂）；
  - 方式二：拥抱最新的标准协议 **ACP（Agent Client Protocol）**，通过原生 JSON-RPC / Stdio 与 Agent 交换状态与权限申请。
- **核心收益**：
  - 结构化双向握手：通过 `session/update` 与 `session/request_permission` 实现精准的内联审批；
  - 语义明确的生命周期：直接获取 Agent 的计划（Plan）、工具调用（Tool Calls）、思考片段（Thought Stream），告别黑盒正则解析。

### 2.6 复杂协同拓扑：为什么采用声明式 DAG + 拓扑波次并发（Kahn Algorithm），而非自由群聊通信？

- **备选方案 A**：自由群聊/网状通信模式（如 AutoGen、MetaGPT 的 Multi-Agent Chat-Room / Message Bus）；
- **备选方案 B**：集中式中心分发器（单 Hub 轮询逐个等待）；
- **最终抉择**：**声明式有向无环图（Declarative DAG）+ Kahn 拓扑排序计算波次（Wave-by-Wave Execution）**。
- **权衡深度剖析**：
  - **规避 Token 爆炸与失控死循环**：在 Chat-Room 模式中，所有 Agent 在同一消息总线中自由交头接耳，上下文消耗呈节点数的二次方（$\mathcal{O}(N^2)$）急剧爆炸，且极易在 Prompt 引导下陷入“你觉得呢-我觉得挺好-那我继续说了”的无效死循环。
  - **严格确定性与可预测性**：采用声明式 DAG（`TaskGraphInput`），依赖关系在执行前完全静态确定。通过 Kahn 算法计算出严格无环的执行波次（`waves: string[][]`）：
    - 同一波次内的节点相互独立，零依赖，直接并发拉取独立的 Worktree 执行；
    - 上游节点的产物（`artifacts` / `changed_files`）作为确定性上下文前置注入给下游节点的输入；
    - 状态机流转清晰透明，耗时与依赖可完全量化并可重放。
  - **编译期冲突预警与熔断保护**：在波次执行前，通过 `allowedPaths` 骨架求交对同一波次的并发写路径进行冲突预警（Parallel Path Collision），且支持 `failFast` 级联熔断，上游节点一旦挂掉，下游无意义的后继节点全部立即被跳过，节约宝贵的 Token 成本。

### 2.7 质量仲裁与交付门禁：为什么采用“物理规则校验 + 对抗式审查（Adversarial Adjudication）”双轨制？

- **传统方案的致命缺陷**：
  业界很多 Agent 运行时仅依赖单一维度判定：
  - 维度 A（仅靠 LLM 自我反思）：询问执行 Agent “你做好了吗”，模型产生幻觉自称“100% 完美完成”；
  - 维度 B（仅靠脚本机械断言）：执行测试命令（`npm test`），如果返回码为 0 则判定通过。
    然而在实战中，我们发现**仅靠机械断言存在巨大的被作弊风险**：LLM 会通过删掉原有的严格断言、把测试改成 `expect(true).toBe(true)`、在函数里直接硬编码入参的期望返回值等手法“骗过”测试套件，导致代码绿了但逻辑全毁。
- **最终抉择**：**物理确定性检验 + 独立对抗式仲裁者（Adversarial Judge）双轨制闭环**。
- **权衡深度剖析**：
  1. **第一轨：客观物理底线（Hard Physics）**：
     - `verifyPathPolicy`：工作区变更是否越界，由 Git 物理状态严格判定；
     - `verifyArtifactPresence`：交付产物物理存在性与非空校验；
     - `verifyTestCommand`：单元测试进程物理退出码 Exit 0；
  2. **第二轨：语义对抗审查（Semantic Adversarial Review）**：
     - 引入独立且预设立场的 **Adjudicator Agent**；
     - 对输入执行深度审查：审查 `git diff` 是否存在伪实现、是否削弱了测试断言、是否有越界副作用；
     - 输出三值化强约束决策：`APPROVE`（放行）、`REJECT_WITH_FEEDBACK`（指出确凿缺陷退回修复）、`ABANDON`（目标不可行直接熔断）；
     - 双轨并联：任何一轨失败均导致 `allPassed = false`，从而彻底斩断了 Agent 的投机取巧。

### 2.8 上下文工程：为什么采用“纯 AST 符号依赖图谱 + 一阶邻域自适应剪枝（Skeleton Pruning）”，而非整文件切块或纯向量检索？

- **传统 RAG / 暴力上下文的致命痛点**：
  在代码场景中，业界常见的上下文供给方式有两大流派：
  - 流派 A（暴力整文件读取）：调用 `readFile` 把动辄千行的文件全量塞进 Prompt，瞬间吃满数十万 Token，不仅极度烧钱，还会引发严重的**大海捞针（Needle In A Haystack）注意力稀释**，模型极易遗漏关键逻辑；
  - 流派 B（纯向量检索 Chunking）：把代码按固定长度切块（如 500 行一段）灌入向量库。这在代码中极其反直觉——代码块一旦被暴力截断，丢失了上下文的变量声明、类型推导和作用域闭包，LLM 看到的都是“语法残片”。
- **最终抉择**：**基于 TypeScript Compiler API 的符号依赖图谱（Symbol Context Graph）+ 1-Hop 邻域自适应骨架剪枝（Skeleton Pruning）**。
- **权衡深度剖析**：
  1. **零外部二进制依赖与绝对精准语法解析**：直接复用 Node/TS 运行时原生具备的 TypeScript AST 解析器（`ts.createSourceFile`），无需在用户桌面端安装或编译沉重的 Tree-sitter 原生动态库（C/C++ Binding），跨平台兼容性 100%；
  2. **非对称式剪枝（Asymmetric Pruning）**：
     - **焦点符号（Focal Target）**：当前 Agent 正在审查或修改的核心函数/类，保留 **100% 完整实现**；
     - **一阶邻域（1-Hop Neighborhood）**：其直接调用方（Callers）、被调用方（Callees）以及依赖的数据结构，将其内部实现体一律折叠为 `/* [body pruned: N lines] */`，仅完整保留其 JSDoc 注释、参数类型和返回签名；
  3. **极致的 Token 压缩率与完整的类型约束**：
     - 在保持 100% 类型系统安全与调用契约的前提下，实现 **80%~95% 的代码 Token 削减**；
     - 彻底消除了模型在海量实现细节中的幻觉与迷失，将宝贵的注意力集中在真正的业务变动上。

### 2.9 工具溢出治理：为什么采用“两级动态路由（Core + TF-IDF On-Demand）+ 元工具探查”，而非盲目暴露全部 Function Calling Schema？

- **海量 MCP 工具下的系统级灾难（Tool Spillover）**：
  当一个现代 Agent 运行时接入了丰富的 MCP 服务器（如 GitHub, Slack, Postgres, Jira, Figma 等）和本地专用工具后，系统内注册的工具极易突破 50~100 个。
  此时如果简单地将所有工具的 JSON Schema 直接全部暴露给大模型 Function Calling：
  1. **Schema Token 爆炸**：每个工具平均占用 200~500 Token，100 个工具仅 Schema 定义就会白白吞噬 20,000~50,000+ Token，每轮对话成本暴增数倍；
  2. **决策精度断崖式下跌（Tool Selection Degradation）**：海量无关工具严重干扰 LLM 的注意力，模型容易发生“选择困难症”，产生工具幻觉、参数传错甚至错误调用高风险工具；
  3. **提示词与物理状态割裂**：System Prompt 文本为了控制长度往往只列举十几个工具，而底层的 Function Calling Schema 却全部裸露，破坏了单一可信源（Single Source of Truth）。
- **最终抉择**：**两级动态路由（Dynamic Tool Router）+ 容量硬上限（16 Tools）+ 元工具主动探查（Tool Discovery Meta-Tool）**。
- **权衡深度剖析**：
  1. **第一级（Core Tools，零过滤常驻）**：核心文件系统、去 shell 进程派发、代码骨架透视、任务图编排与元探查工具（`bash`, `readFile`, `writeFile`, `get_code_skeleton`, `dispatch_agent`, `run_task_graph`, `search_tools` 等）始终无条件挂载；
  2. **第二级（On-Demand Tools，语义精准召回）**：
     - 利用纯内存 TF-IDF 引擎分析用户当前轮次的 Prompt 意图与上下文；
     - 从海量候选中精准召回与意图最匹配的前 $K$ 个工具（Top 5~8），合并后通过硬上限门禁严格锁定在 16 个工具以内；
  3. **第三级（元工具兜底保障，破解信息茧房）**：
     - 如果用户提出了冷门需求，由于预筛选可能未挂载对应工具，Agent 可以随时调用常驻的 `search_tools` 元工具主动搜索全量工具库；
     - 返回工具签名与文档，引导模型在规划中显式声明激活，完美破解了“裁剪工具导致模型不知道有新工具”的二律背反。

### 2.10 文件落盘拓扑与凭据安全链：借鉴 OpenClaw / Hermes 的六态物理分治与多级决断树

- **传统方案的粗暴混乱（Big Ball of Mud Directory）**：
  大量初创 Agent 工具习惯将配置、明文密钥、数据库、实时日志、缓存一股脑丢在根目录（如 `~/.myapp/`）下，引发三大严重工程问题：
  1. **敏感凭据裸奔与同步泄露**：用户在多端同步配置时，容易把含有 API Key 的敏感文件直接推到公网或备份服务中；
  2. **缓存与核心数据交织**：用户清理临时缓存时不慎破坏主数据库或会话历史；
  3. **环境适应极度僵硬**：仅支持在 UI 界面配置密钥，无法与 CI/CD、Docker 或开发者已有的环境变量（如 `DEEPSEEK_API_KEY`）自适应打通。
- **最终抉择：借鉴 OpenClaw 与 Hermes 的六态物理分治（Storage Layout）+ 5 级凭据决断树**。
- **权衡深度剖析**：
  1. **六态物理分治规范（遵循 XDG Base Directory 规范）**：
     - `config/`：**纯偏好设置（Config）**，零密钥，仅存活跃模型、路由规则等可安全备份的配置；
     - `security/`：**凭据安全层（Security）**，本地文件强制在 POSIX 平台实施 **`chmod 0600`**（仅当前 OS 用户可读写），严防同机其他进程读取；
     - `memory/`：**显式 Markdown 记忆（Memory）**，真相源为人类可直接阅读修正的 `USER.md` 和 `MEMORY.md`；
     - `storage/`：**持久化数据库（Data）**，SQLite WAL 主库与全文索引；
     - `worktrees/`：**沙箱执行区（Worktree）**，活跃影子分支目录与销毁前快照暂存归档（`snapshots/`）；
     - `cache/`：**可随时清空的加速缓存（Cache）**，包含 AST 符号图谱与离线 Schema 缓存。
  2. **多级凭据决断树（Credential Resolution Hierarchy）**：
     - 执行优先级：`显式运行参数 -> 操作系统环境变量（DEEPSEEK_API_KEY / OPENAI_API_KEY 等）-> 本地配置文件 -> 系统钥匙串 -> 明确报错与引导`；
     - 开发者在终端无论何时 `export DEEPSEEK_API_KEY="sk-..."`，系统瞬间零配置自适应生效。

---

## 三、深水区重大隐蔽 Bug 攻坚战（War Stories & Root Cause Analysis）

在架构演进中，我们踩平了若干足以写进操作系统与并发编程教科书的隐蔽深水区 Bug。这些案例是技术面试中展现底层功底与系统排错能力的绝佳素材：

### 战役一：Windows cmd.exe 多行提示词换行截断与幽灵失败（Prompt Truncation）

- **故障现象**：在 Holdout 评测集运行 `multi-step-migration` 任务时，Linux/macOS 运行完全正常，但在 Windows 环境下，Agent 反复输出：“我看到任务了，但是你给的第 2 步和第 3 步具体要求在哪里？请提供具体步骤。”然而在代码中，Prompt 字符串明确包含了完整的 3 个步骤。
- **排查与排障心路**：
  1. 起初怀疑是 SQLite 字段长度限制或字符串序列化被截断，但打印 DB 数据发现内容完全正确；
  2. 随后怀疑是 LLM 接口通信问题，抓包发现发送给执行器的参数早在本地启动进程时就已经被破坏；
  3. 对比单元测试：发现采用 `spawnSync` 的静态测试是通的，而生产链路走 `spawnProcessLive` 却 100% 失败。
- **根本原因（Root Cause）**：
  在 `daemon/src/runtimes/coding/process-spawner.ts` 中，历史代码为了跨平台兼容性设置了 `shell: true`。在 Windows 操作系统中，`shell: true` 会强制把子进程命令和全部参数打包并交给 `cmd.exe /d /s /c "..."` 执行。
  而 Windows `cmd.exe` 有一个古老且致命的设计：**它无法在单条命令参数中安全承载未转义的真实换行符 `\n`。`cmd.exe` 会在遇到第一个换行符时直接认为该条命令已结束，将后续多行文本丢弃甚至当作新的命令解析！** 此外，外层引号与内层转义在 `cmd.exe` 的二次解析下发生破坏，导致长文本 Prompt 被硬生生截断。
- **系统化修复**：
  彻底废黜任何跨平台 `shell: true` 假定。在 `process-spawner.ts` 中移除 shell 包装，使用直接无 shell 进程派发（`shell: false`），参数数组原汁原味由 Windows 操作系统内核 API（`CreateProcessW`）通过安全传参机制接收：
  ```ts
  // 彻底废除 shell: true，从根源斩断 cmd.exe 换行截断与注入隐患
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  ```
  并在 `process-spawner.integration.test.ts` 中固化了跨行超长参数保真度的回归测试。

---

### 战役二：父子 Agent 嵌套委派并发死锁与资源枯竭（Slot Deadlock）

- **故障现象**：当父 Agent 执行 `dispatch_agent` 派发子 Agent 协同工作，并且设置 `wait: true` 同步等待子 Agent 结果时，系统在单任务或低并发配置下会发生**永久卡死（Deadlock）**，直至达到 30 分钟全局超时强杀。
- **排查与排障心路**：
  1. 查看日志发现子 Agent 的状态永远停留在 `queued`，根本没有进入 `running`；
  2. 检查 `RunDispatcher`，发现分发器每 500ms 轮询一次队列，但每次都输出 `skipped++; continue;`；
  3. 审查并发控制组件 `SlotManager`。
- **根本原因（Root Cause）**：
  系统的 `SlotManager` 原先配置了一个全局并发槽位上限（例如 `maxConcurrentAgentRuns = 1` 或 `2`）。
  父 Agent 启动时，占用了**唯独的 1 个槽位**；当父 Agent 调用 `dispatch_agent` 时，它会阻塞等待子 Agent 完成；然而子 Agent 被推入队列后，`RunDispatcher` 去向 `SlotManager` 申请新槽位，发现槽位已被父 Agent 占满（`activeAgentRuns.size >= maxConcurrentAgentRuns`），因此子 Agent 无法获取槽位启动；父等子启动，子等父释放槽位，构成了**经典的并发死锁**。
- **系统化修复**：
  在 `SlotManager` 中设计**双轨制并发隔离预算（Delegated Slot Allowance）**：
  将普通顶层 Agent 与被委派的子 Agent 槽位预算彻底解耦。为委派子 Agent 开辟专用的独立槽位配额（`DELEGATED_SLOT_ALLOWANCE = 3`），并通过独立的 `activeDelegatedRuns` 集合进行跟踪。
  ```ts
  canStartAgentRun(options: { delegated?: boolean } = {}) {
    if (options.delegated) {
      return this.activeDelegatedRuns.size < DELEGATED_SLOT_ALLOWANCE;
    }
    return this.activeAgentRuns.size < this.config.maxConcurrentAgentRuns;
  }
  ```
  父任务占用主队列槽位，子任务消耗委派缓冲槽位，从理论上打破了死锁的循环等待条件。

---

### 战役三：安全边界穿透与假冒父级上下文伪造漏洞（AsyncLocalStorage 隐式溯源）

- **故障现象**：在设计 Native Tool `dispatch_agent` 时，如果接口允许通过参数传入 `parentRunId`，黑客或失控的 LLM 可以在调用工具时伪造一个拥有高级权限的 `parentRunId`（甚至伪造系统根节点），从而“借壳上市”，向系统申请并获取越权的路径与工具权限。
- **根本原因（Root Cause）**：
  **永远不能相信来自模型或外部输入声明的自身身份标识**。如果上下文参数由调用方提供，系统无法验证当前执行线程/闭包的真实身份。
- **系统化修复**：
  采用 Node.js 底层异步追踪技术 **`AsyncLocalStorage`**。
  在 `daemon/src/runtimes/tool/domain/tool-call-id.ts` 中建立运行上下文隔离栈：

  ```ts
  const toolInvocationContext = new AsyncLocalStorage<{ runId?: string }>();

  export function withToolInvocationContext<T>(runId: string, fn: () => T): T {
    return toolInvocationContext.run({ runId }, fn);
  }

  export function currentRunId(): string | undefined {
    return toolInvocationContext.getStore()?.runId;
  }
  ```

  在调度器分发运行的入口处，通过 `withToolInvocationContext(runRecord.id, ...)` 隐式注入真实的当前运行 ID；Native Tool 在被调用时，通过 `currentRunId()` 直接从 Node.js 异步调用栈中提取真实运行上下文。任何参数中传入的 `parentRunId` 均被强制忽略甚至视为非法。伪造身份在物理架构层面上彻底失效。

---

### 战役四：Git Porcelain 状态前缀与 Windows 反斜杠导致的“路径鉴权假阴性拒绝”

- **故障现象**：在端到端联调中，子 Agent 完美完成了任务，只修改了被授权目录 `src/parser/index.js`，但在最终交付时，`runVerification` 却厉声报警：`Verification failed: path-policy`，将一个成功的任务判为失败并直接回滚。
- **排查与排障心路**：
  1. 打印详细日志发现，违规路径列表为 `["M src/parser/index.js"]`；
  2. 另外在 Windows 测试用例中，路径被返回为 `src\parser\index.js`，而鉴权 Glob 规则为 `src/parser/**`。
- **根本原因（Root Cause）**：
  这里同时存在两个深层缺陷：
  1. **Git Porcelain 协议格式误用**：系统在收集工作树变更文件时，执行了 `git status --porcelain`，输出的原始行形如 ` M src/parser/index.js` 或 `?? src/foo.ts`。旧的验证器直接拿着整行文本去跑 Glob 匹配，导致带空格与状态字母的字符串无法匹配任何正常路径规则；
  2. **跨平台路径分隔符差异**：Windows 平台返回物理反斜杠 `\`，而标准 Glob 正则引擎将反斜杠视为转义字符或无法与 `/` 匹配。
- **系统化修复**：
  在 `daemon/src/runtimes/coding/verification.ts` 中重构路径规范化与前缀剥离算法：

  ```ts
  function stripStatusPrefix(entry: string): string {
    const withoutStatus = entry.replace(/^\s*(?:[MADRCU?!]{1,2}\s+)/, "").trim();
    const arrow = withoutStatus.lastIndexOf(" -> ");
    return arrow >= 0 ? withoutStatus.slice(arrow + 4).trim() : withoutStatus;
  }

  function matchesGlob(path: string, pattern: string): boolean {
    const normalizedPath = stripStatusPrefix(path).replace(/\\/g, "/");
    const normalizedPattern = pattern.replace(/\\/g, "/");
    // 安全转义并构建双星号匹配正则
    ...
  }
  ```

  配合严格的单元测试（`verification.test.ts`），彻底消除了因操作系统路径表述与 Git 协议格式引发的假阴性误判。

---

### 战役五：SQLite 独立非侵入式轻量迁移（无外部迁移器死锁）

- **故障现象**：在迭代中为 `agent_runs` 表新增 `delegation`、`parentRunId`、`objective` 等列时，由于 Drizzle ORM 的全量生成迁移文件被视为构建制品（且不在每次开发中重新跑大型 generator），导致开发分支如果修改了 schema，本地已存在的 SQLite 数据库无法启动或报错 `no such column`。
- **根本原因与权衡**：
  桌面客户端与开发环境无法依赖沉重的外部数据库迁移 CLI，而且 SQLite 在不支持原生动态迁移锁的情况下，多进程或测试并发时极易锁库。
- **系统化修复**：
  构建了**轻量级、幂等、无害的专有迁移管道**（`daemon/src/persistence/sqlite/agent-run-delegation-migration.ts`）。
  利用 SQLite 的 `PRAGMA table_info(agent_runs)` 探查列是否存在，若不存在则安全执行原语 `ALTER TABLE agent_runs ADD COLUMN ...`，并包裹在排他事务中。整个迁移在 Node.js 启动时瞬间完成，既摆脱了对编译期 ORM 迁移文件的强耦合，又保证了不同开发环境与线上版本的无缝向下兼容。

---

### 战役六：并行 DAG 下的多任务写冲突预警与 Fail-Fast 级联熔断（Parallel Wave Conflict & Cascading）

- **故障现象**：在支持声明式任务图并行执行时，若父 Agent 拆解任务不慎，让波次中的两个并发子 Agent（例如 `worker-1` 和 `worker-2`）同时被授予对同一个目录 `src/parser/**` 的写权限，两者在各自的影子分支修改后，合并时将产生不可调和的逻辑冲突；此外，当前置依赖节点（如“提取 Schema”）编译失败时，如果不做拦截，下游依赖它的 3 个后续节点仍会盲目拉起并浪费大量 API Token。
- **根本原因（Root Cause）**：
  单纯的并发池只管“有空闲槽位就拉起”，缺乏图语义的全局感知能力。必须将**写作用域静态分析**与**拓扑级联状态机**深度结合。
- **系统化修复**：
  1. **波次内写冲突静态预检（Parallel Path Collision Pre-check）**：
     在 `daemon/src/workflow/task-graph-dag.ts` 的拓扑分层阶段，对同一波次（Wave）内的所有并发节点对 $(u, v)$，自动进行 `allowedPaths` 骨架求交：
     ```ts
     // 对同一波次内的节点两两检测路径重叠
     const collision = findPathCollision(nodeA.bounds.allowedPaths, nodeB.bounds.allowedPaths);
     if (collision) {
       parallelPathWarnings.push({
         waveIndex: w,
         nodeA: nodeA.id,
         nodeB: nodeB.id,
         path: collision,
       });
     }
     ```
     在执行前出具警告或引导规划器调整拓扑，将写冲突消除在发生前。
  2. **拓扑级联 Fail-Fast 熔断机制**：
     在 `daemon/src/workflow/task-graph-executor.ts` 中维护了波次推进状态机：
     - 若 `failFast: true`，任一节点失败直接阻断后续所有未启动波次，标记为 `skipped`；
     - 若 `failFast: false`，通过反向依赖树追踪，精准跳过所有直接或间接依赖失败节点的后继节点，而独立的健康分支继续并发执行；
     - 配合全局 `totalTimeoutMs` 钳制，杜绝单个子 Agent 挂起拖垮整个任务图。

---

### 战役七：对抗式审查拦截“假绿测试”与弱化断言作弊（Preventing Test Weakening & Fake Stubs）

- **故障现象**：在多次复杂的重构任务中，代码执行器（Coding Agent）向系统报告成功，并且单元测试退出码确实为 `Exit 0`（全绿）。然而人工 Review 代码 Diff 时发现：
  1. Agent 为了让测试通过，直接将测试文件里的 `expect(result.data).toEqual(expectedComplexObject)` 改成了 `expect(result).toBeDefined()` 或 `expect(true).toBe(true)`；
  2. 在另一个算法题任务中，Agent 没有实现通用的动态规划算法，而是根据当前测试用例的入参直接写了 `if (n === 5) return 8; if (n === 10) return 55;` 伪造通过。
- **根本原因（Root Cause）**：
  单纯的“机械校验”（如进程退出码为 0、文件生成）没有语义理解能力。LLM 的目标是“最大化满足当前 Prompt 的成功标准”，在没有对立制衡机制时，模型倾向于选择**阻力最小的逃逸路径**（Cheat the Tests）。
- **系统化修复**：
  构建**生成-对抗双 Agent 校验闭环（Adversarial Adjudication Loop）**：
  1. **构建独立带怀疑立场的 Judge Agent**（`daemon/src/workflow/adjudication/adversarial-judge.ts`）：
     - 明确设定对抗性 Persona，强制执行反作弊检查清单（测试断言完整性、硬编码伪实现排查、范围越界检查）；
     - 强制三值化结构化裁决（`APPROVE` / `REJECT_WITH_FEEDBACK` / `ABANDON`）；
  2. **嵌入底层验证流水线**（`daemon/src/runtimes/coding/verification.ts`）：
     - 将对抗审查作为一级公民门禁 `verifyAdversarialAdjudication` 注入 `runVerification`；
     - 一旦 Judge 判定测试断言被削弱或存在伪实现，直接触发 `severity: "critical"` 并判定 `allPassed: false`，阻断影子分支的合并，并生成结构化的缺陷描述退回执行器重做。

---

### 战役八：长文件上下文爆炸与注意力稀释（Needle In A Haystack）的 AST 剪枝攻坚战

- **故障现象**：在对包含上千行的大型服务模块进行小功能迭代时，Agent 频繁调用 `readFile` 试图了解周围逻辑。然而：
  1. 动辄 1,500 行的源文件注入上下文后，瞬间吃满 15,000+ Token，导致多轮对话成本急剧飙升；
  2. 极易触发模型的**“大海捞针（Needle In A Haystack）”疲劳效应**：模型被成百上千行的无关算法实现牵着鼻子走，反复遗漏目标接口真正的传参约定，甚至“依葫芦画瓢”照抄了周围代码中已废弃的旧逻辑。
- **根本原因（Root Cause）**：
  文件级粒度的供给太粗糙。修改一个函数，通常只需要知道它的**参数类型接口**、它的**直接前置调用方**和它的**底层依赖签名**，而完全不需要知道邻近辅助函数的千行循环体。
- **系统化修复**：
  构建**基于 TypeScript Compiler API 的符号依赖图与自适应 AST 剪枝系统（M1-M6）**：
  1. **纯 AST 骨架提取器**（`daemon/src/context/symbol-graph/symbol-extractor.ts`）：
     - 利用 `ts.createSourceFile` 解析语法树，提取函数、类、接口与类型；
     - 保留全部 JSDoc 注释与类型契约，将实现细节智能折叠为 `/* [body pruned: N lines] */`；
  2. **符号依赖图谱与非对称邻域剪枝**（`daemon/src/context/symbol-graph/symbol-graph.ts`）：
     - 支持跨文件多模块符号与调用关系建边；
     - 围绕目标符号执行 **1-Hop 邻域非对称剪枝**：目标符号保持 100% 完整实现，一阶邻域折叠为精简骨架，实现 **80%~95% 的代码 Token 削减**；
  3. **原生工具接入**（`daemon/src/runtimes/tool/adapters/native-tools/code-intelligence.ts`）：
     - 注册 `get_code_skeleton` 工具，引导 Agent 在阅读大文件前优先提取高密度符号大纲，从源头消灭上下文爆炸。

---

### 战役九：海量 MCP 工具溢出（Tool Spillover）导致的 Schema Token 爆炸与模型迷失攻坚战

- **故障现象**：在将数十个外部 MCP 服务（包含 GitHub、Jira、Slack、Postgres 等上百个工具）接入 Jarvis 后，哪怕用户只发了一句“你好，帮我写个排序函数”，模型调用也直接消耗了 **35,000+ Input Tokens**，首字延迟（TTFT）飙升到 8 秒以上；更恶劣的是，在编写代码时，模型经常无厘头地尝试调用不相关的 `mcp:jira:search_tickets` 或 `mcp:slack:send_message`，产生了严重的工具选择幻觉与决策漂移。
- **排查与根因分析（Root Cause）**：
  代码审计发现，虽然 Prompt 提示词的 Markdown 文本目录做了 16 个工具的展示截断，但在调用 `streamText` / `generateText` 时，系统底层直接执行了 `wrapToolsForAI(getAllTools())`——把全部上百个工具的完整 JSON Schema 无死角地全量灌入了模型 API 请求中！
  由于现代大模型在 Function Calling 上的注意力容易被冗余 Schema 严重稀释，过多的选项导致模型决策准确率断崖式下跌。
- **系统化修复**：
  构建**两级动态工具路由器（`daemon/src/runtimes/tool/routing/tool-router.ts`）与收口门禁**：
  1. **常驻核心工具集（Core Tools）**：将高频的 OS/文件/任务图/代码骨架及元探查工具（约 8~10 个）设为第一级常驻；
  2. **第二级意图语义动态召回（TF-IDF On-Demand Recall）**：
     - 利用纯内存高效 TF-IDF 搜索引擎，实时根据用户当前输入和轮次目标，从非核心工具池中精准计算相关性得分；
     - 动态挑选最匹配的前 5~6 个工具并入；
  3. **容量硬上限防护（Hard Capacity Cap）**：
     - 将每次 LLM 轮次挂载的工具总数死死钳制在 **16 个以内**；
  4. **元工具探查（`search_tools`）**：
     - 赋予 Agent 主动搜索未挂载工具的能力，当遇到专业领域诉求时，模型可通过 `search_tools` 探查工具签名并显式唤醒；
  5. **全链路单一收口**：
     - 在 `conversation.ts` 的所有对话入口（`streamMessageInConversation`、`streamMessageDirect`、`handleMessage`）统统收口至 `toolRouter.routeTools(...)`，彻底终结了 Schema Token 盲目倾泻的隐患。

---

### 战役十：高频活跃记忆 30 天后神秘蒸发事件（Memory Injection Tracking 致命缺陷攻坚记）

- **故障现象**：在长时间运行测试中，用户反馈某些长期偏好（例如“不要在代码中使用 ANY 类型”、“首选中文回答”）在运行一个月后突然失效，模型重新开始犯同样的低级错误。查阅数据库发现：这些核心记忆在创建 30 天后被后台调度器直接抹除了！
- **排查与根因分析（Root Cause）**：
  在 `daemon/src/runtimes/scheduler/scheduler.ts` 中，系统排期了一个自动整理任务：`pruneUnusedMemories(30)`，其设计意图是清理 30 天内从未被使用过的过期临时记忆（`uses === 0 AND createdAt < 30 days`）。
  然而代码审计暴露出一个**致命断裂（Dead Counter Bug）**：
  底层 DAO（`memory-repo.ts`）虽然定义了 `recordInjection(id)` 和 `incrementUses(id)` 方法，但在整个 Agent 运行时（`memory-fetcher.ts`、`context-builder.ts`、`conversation.ts`）中，**没有任何代码在记忆被检索注入后调用它们**！
  结果导致全库所有记忆的 `uses` 计数永久定格在 `0`。一旦时间跨过 30 天阈值，定时清理器便将天天被塞入提示词的高频活跃记忆当作“僵尸垃圾”物理删除！
- **系统化修复**：
  1. **构建注入追踪闭环**：
     - 在 `daemon/src/runtimes/agent/application/context-builder.ts` 中，精准捕获实际被塞入 Prompt 的 `injectedMemoryIds: string[]` 并暴露给构建产物；
     - 在 `conversation.ts` 中，上下文组装完成时立即触发异步并发调用 `Promise.all(context.injectedMemoryIds.map(id => memRepo.recordInjection(id)))`；
     - 使得只要记忆被检索使用，其 `uses` 计数正常自增，`lastInjectedAt` 得到实时刷新，从原理上免疫了 30 天自动清理，并能正常触发高频提升（`promoteHighUsage`）；
  2. **引入 Hermes 风格显式 Markdown 记忆与冷冻快照（Frozen Snapshot）**：
     - 构建 `daemon/src/context/memory-snapshot/memory-snapshot.ts`，将 `USER.md` 和 `MEMORY.md` 显式落盘为人类直接可读可编辑的真相源；
     - 在会话启动时读取为不可变冻结快照，会话中途写入磁盘但绝不动态篡改当前轮次 System Prefix，保证 Anthropic Prompt Caching 100% 稳定命中。

---

## 四、横向标杆竞品全方位对标矩阵（Competitive Analysis）

为了回答“我们的代码设计和功能完备了吗？和业界顶级参照项目比处于什么段位？”，我们对标了当今 Agent 领域的四大标杆项目：

1. **EverMind-AI/Raven**：目前架构设计最严密、同属于桌面/本地开发生态的直接竞品；
2. **Hermes**：极致简洁的双向流式与单循环状态机典范；
3. **OpenClaw**：网关中心化（Gateway-centric）多通道与工具动态路由器；
4. **FrontisAI/OpenRSI**：递归自进化（Recursive Self-Improvement）学术前沿。

### 4.1 对标维度全景矩阵（Jarvis vs Raven vs Hermes vs OpenClaw vs OpenRSI）

| 核心维度           | Jarvis / CoreLayer（现状）                                                                                              | EverMind-AI / Raven                                        | Hermes                                                  | OpenClaw                                                 | OpenRSI                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | -------------------------- |
| **代码执行隔离**   | **Git Worktree 独立分支秒级隔离**，可选 Docker                                                                          | Git Worktree + 临时虚拟环境                                | 宿主沙箱 / 子进程                                       | Docker 容器网关                                          | 容器沙箱                   |
| **可靠性评测体系** | **已实现：pass^k (k=3) + Voided 双轨故障分类 + Holdout 语料库**                                                         | 有基准测试，但未做双轨故障解耦                             | 依赖静态单次通过率                                      | 侧重端到端链路覆盖                                       | **学术级自进化学评估模型** |
| **多 Agent 委派**  | **已实现：D1 细粒度权限单调收窄 + D2 声明式 Task Graph 拓扑并发调度与 Map-Reduce 扇出**                                 | **具备 Task Graph 协作**，无严格单调收窄引擎               | 单 Agent 扁平模式                                       | 网关级派发，偏路由转发                                   | 递归自生成子任务           |
| **仲裁与交付门禁** | **已实现：物理证据链（Path/Artifact/Test）+ 独立对抗式仲裁者（Adversarial Adjudicator 语义审查闭环）**                  | **具备 Adversarial Adjudicator（对立审计 Agent）**         | 简单退出码断言                                          | 测试报告解析                                             | 自我反思与生成对抗         |
| **上下文管理**     | **已实现：纯 AST 符号依赖图谱（Symbol Context Graph）+ 1-Hop 邻域自适应骨架剪枝（Skeleton Pruning）+ 原生工具透视**     | **AST / 符号依赖图谱（Context Graph & 确定性 Assembler）** | 严格同级 Compaction 流水线                              | 上下文分块向量检索                                       | 递归记忆修剪               |
| **记忆与存储架构** | **已实现：显式 Markdown 真相源（USER.md/MEMORY.md）+ 提示词冷冻快照（Prompt Cache 优先）+ 六态物理分治**                | 基于 SQLite WAL 数据库的结构化上下文图谱                   | **冷冻快照（Frozen Snapshot）+ 文件锁 + state.db 谱系** | **Markdown 显式记忆 + 三阶段 Dreaming + preimages 撤销** | 递归修剪淘汰               |
| **进程与协议**     | **去 shell 原生进程派发 + Claude ACP 协议适配**                                                                         | 自研协议 + Stdio                                           | **双向流式 RPC + 完善的悬挂 Tool Call 冲刷**            | HTTP/WebSocket 网关                                      | API Client                 |
| **工具扩展性**     | **已实现：两级动态工具路由（Core + On-Demand TF-IDF）+ 元工具 `search_tools` 探查 + 严格 16 容量上限 + MCP 懒加载契约** | MCP 优先 + 本地预置工具                                    | 极简 Tool-Call 原语                                     | **动态 Skill / Tool 路由网关**                           | 工具自动合成               |

### 4.2 我们的完备性评估：哪些堡垒已经建立？

回顾我们的建设，CoreLayer 已经跨越了“Demo 玩具阶段”，在以下九个硬核维度建立了坚固的工程壁垒：

1. **真实可信的 Eval 评测闭环**：我们是极少数在代码库内内置严谨 pass^k 评测体系并能自动过滤 429 网络噪音的 Agent 系统；
2. **确定性的 Worktree 零污染隔离**：彻底杜绝了“Agent 乱改导致开发者无法提交代码”的噩梦；
3. **数学证明级的最小权限委派（D1）**：通过路径求交、工具求交、超时钳制、`AsyncLocalStorage` 隐式防伪造，在多 Agent 安全领域达到了极高水准；
4. **工业级动态任务图（D2）**：实现了基于 Kahn 算法的拓扑分层波次并发调度、上游产物下游自动注入、并发写冲突预检与级联 Fail-Fast 熔断；
5. **生成-对抗双 Agent 校验网（D3）**：通过独立的 Adversarial Judge Agent，有效堵死了削弱测试断言、伪造硬编码等作弊逃逸手段；
6. **无损代码符号上下文图谱（M1-M6）**：基于原生 TypeScript AST 构建 1-Hop 骨架剪枝体系，在保证 100% 类型契约的前提下实现 80%~95% Token 压缩；
7. **两级工具路由与溢出治理（Tool Spillover）**：通过 Core 集合常驻 + 意图语义召回 + 16 容量上限 + `search_tools` 元工具，消除了海量 MCP 下的 Token 爆炸与工具误选；
8. **工业级六态物理分治存储与安全凭据链**：借鉴 OpenClaw / Hermes 规范，实现 Config, Security (0600), Memory, Storage, Worktrees, Cache 六态解耦与多级环境变量探查决断树；
9. **跨平台底层安全**：扫清了 Windows `cmd.exe` 换行截断、反斜杠转义、Git porcelain 解析、并发死锁等一系列操作系统级地雷。

---

## 五、核心差距与下一阶段演进路线（Remaining Gaps & Next Steps）

尽管基础骨架与核心安全体系已经十分扎实，但如果对标 Raven 的成熟度和顶级工程水准，我们仍存在明确的架构优化空间。这些方向构成了后续演进的必由之路：

### 5.1 D2：动态 Task Graph（并行 DAG 依赖与 Map-Reduce 扇出）——【已完成落地】

- **落地状态**：已在代码库完全实现并合入主线，全量回归测试保持 100% 绿灯（4,408 测试通过）。
- **核心模块产物**：
  1. **纯领域拓扑规划器**（`daemon/src/workflow/task-graph-dag.ts`）：
     - 基于 Kahn 算法实现确定性拓扑排序与分层，产出并行执行波次（`waves: string[][]`）；
     - 内置环路检测（自环、长环、交叉环），非无环图抛出 `TaskGraphRejected`；
     - 对每个节点执行 `narrowDelegationBounds`，保证子任务权限单调递减；
     - 引入波次内并发写路径冲突静态预检（`parallelPathWarnings`）。
  2. **任务图波次执行引擎**（`daemon/src/workflow/task-graph-executor.ts`）：
     - 逐波次并发推进，同一波次节点利用 `Promise.allSettled` 并行派发至独立 Worktree；
     - 自动提取上游节点的 `artifacts` / `changed_files` 并前置注入到下游节点的提示词中；
     - 实现了 `failFast` 级联熔断状态机与全图 `totalTimeoutMs` 全局硬超时控制。
  3. **原生工具接入与防伪造**（`daemon/src/runtimes/tool/adapters/native-tools/task-graph.ts`）：
     - 注册 `run_task_graph` 系统级工具；
     - 严格通过 `AsyncLocalStorage`（`currentRunId()`）隐式获取父任务上下文，阻断身份伪造；
     - 错误安全隔离：合规性拒绝不造成工具抛崩，返回 `{ status: "rejected", error }`。
  4. **测试矩阵**：覆盖 24 个全新单元测试（13 个 DAG 规划、7 个执行引擎、4 个工具层集成），全量通过。

### 5.2 D3：对抗式仲裁者（Adversarial Adjudication & 独立 Judge Agent）——【已完成落地】

- **落地状态**：已在代码库完全实现并合入主线，全量回归测试保持 100% 绿灯（4,429 测试通过）。
- **核心模块产物**：
  1. **领域模型与反作弊提示词**（`daemon/src/workflow/adjudication/adversarial-judge.ts`）：
     - 建立了对抗式审查检查清单：重点审视测试断言完整性（是否削弱断言、加 `test.skip`、mock 全局）、目标实现完备性（是否硬编码返回值、遗漏边界）以及作用域越界风险；
     - 定义强类型三值裁决 `AdjudicationVerdict`（`APPROVE` / `REJECT_WITH_FEEDBACK` / `ABANDON`）；
     - 具备高度容错的 `parseAdjudicationResponse`，支持从复杂非纯文本输出中稳健提取判定 JSON。
  2. **独立仲裁服务层**（`daemon/src/workflow/adjudication/adjudication-service.ts`）：
     - 聚合工作区 `git diff`、`changedFiles`、测试日志和原始目标，前置防空判校验（空 Diff 直接拦截）；
     - 支持 DeepSeek 系列审计模型生成审查，具备依赖注入与网络异常安全降级能力。
  3. **验证流水线与 QualityGate 深度集成**（`daemon/src/runtimes/coding/verification.ts` & `quality-gate.ts`）：
     - 新增 `verifyAdversarialAdjudication` 一级公民检查项，直接挂载进 `runVerification`；
     - 任何非 `APPROVE` 判定直接触发 `severity: “critical”`，阻断 `report.allPassed` 并输出结构化反馈；
     - 导出 `createAdversarialJudgeQualityGate`，激活系统 QualityGate 机制。
  4. **测试矩阵**：覆盖 19 个全新单元测试（8 个模型解析、5 个服务调用、6 个流水线集成），全量通过。

### 5.3 M1-M6：符号上下文图谱与自适应剪枝（Symbol Context Graph & AST Pruning）——【已完成落地】

- **落地状态**：已在代码库完全实现并合入主线，全量回归测试保持 100% 绿灯（4,453 测试通过）。
- **核心模块产物**：
  1. **纯 AST 符号骨架提取器**（`daemon/src/context/symbol-graph/symbol-extractor.ts`）：
     - 基于 TypeScript Compiler API（`ts.createSourceFile`）实现纯内存语法树遍历；
     - 100% 完整保留接口、类型别名、枚举声明与 JSDoc 注释；
     - 对函数、箭头函数与类方法体智能折叠为 `/* [body pruned: N lines] */`，实现 80%~95% Token 压缩；
     - 深度遍历提取函数内部调用的符号标识符列表（`calls`），为依赖拓扑建边。
  2. **符号依赖图谱与非对称自适应剪枝**（`daemon/src/context/symbol-graph/symbol-graph.ts`）：
     - 维护跨文件 `SymbolNode` 与 `SymbolEdge`（`calls` / `references` / `implements`）；
     - 实现 **Focal Target + 1-Hop Neighborhood** 非对称剪枝：焦点函数保留 100% 完整实现，直接调用方与被调用方折叠为类型骨架；
     - 内置严格 Token 预算截断与精确压缩比统计。
  3. **门面剪枝服务与原生工具**（`daemon/src/context/symbol-graph/pruning-service.ts` & `code-intelligence.ts`）：
     - 提供 `buildAdaptiveCodeContext` 统一门面，支持目标聚焦模式与全文件大纲模式自动切换；
     - 注册 `get_code_skeleton` 系统级原生工具，让 Agent 在阅读长文件前以极低 Token 成本感知全局签名与类型契约。
  4. **测试矩阵**：覆盖 16 个全新单元测试（7 个提取器、5 个图谱剪枝、4 个工具层集成），全量通过。

### 5.4 Tool Spillover：海量工具动态挂载与向量化按需路由（MCP Lazy Loading）——【已完成落地】

- **落地状态**：已在代码库完全实现并合入主线，全量回归测试保持 100% 绿灯（4,470 测试通过）。
- **核心模块产物**：
  1. **动态工具路由器**（`daemon/src/runtimes/tool/routing/tool-router.ts`）：
     - 建立了 **Core Tools（常驻核心，约 8~10 个）+ On-Demand Tools（意图动态召回，Top 5~6）** 两级路由机制；
     - 基于纯内存 TF-IDF 搜索引擎，根据当前轮次用户意图实时匹配工具名、标题与描述，召回最相关的候选集；
     - 设定 **16 个工具的硬性容量上限（Hard Capacity Cap）**，无论外部注册了多少 MCP 工具，暴露给 LLM Function Calling 的 Schema 永远不超过 16 个。
  2. **工具元检索器**（`daemon/src/runtimes/tool/adapters/native-tools/tool-discovery.ts`）：
     - 注册 `search_tools` 系统级原生工具，使 Agent 能够随时主动探索未被挂载的 MCP/扩展工具，破解裁剪导致的信息孤岛。
  3. **对话主链路全收口**（`daemon/src/runtimes/agent/application/conversation.ts`）：
     - 对全部三个入口（`streamMessageInConversation`、`streamMessageDirect`、`handleMessage`）进行统一改造，彻底废弃未经裁剪的 `getAllTools()`，从根源切断了海量工具向 LLM Schema 倾泻的隐患。
  4. **测试矩阵**：覆盖 7 个全新单元测试（4 个路由器容量与召回测试、3 个元工具搜索测试），全量通过。

### 5.5 HITL：交互式前端审批卡与“所见即所执行”证据闭环——【下一阶段演进重点】

- **当前现状**：后端的审批模型已基本完备，但前端展示有时仍然直接使用模型给出的建议文字，而非底层即将执行的具体物理命令。
- **目标设计**：
  - 彻底践行学术界 `2606.02668` 论文指导：审批卡必须直接渲染**真实物理参数（Parsed Shell AST / Raw Path / Exact Command）**；
  - 在 Tauri 前端实现内联交互式 Diff 查看与一键放行/拒绝；
  - 当 Agent 请求高风险操作时，提供精确到参数级的微调批准。

---

## 六、面试话术与高频技术追问指南（Interview Q&A Cheatsheet）

如果在技术面试中被问及该项目，建议直接切入以下具备极强技术密度的核心论点：

#### Q1: “你们的多 Agent 协同和市面上的 AutoGen、CrewAI 有什么本质区别？”

> **高分答题模板**：
> “市面上大部分多 Agent 框架停留在 Prompt-level 的角色扮演，Agent 之间传递的是纯文本，缺乏底层的资源与权限管控。而在 CoreLayer 中，我们将多 Agent 视为**具有操作系统级安全边界的进程树**。
> 我们自主研发了**单调收窄引擎（Monotonic Narrowing Bounds）**：父 Agent 派发子 Agent 时，路径、工具、超时、执行器等权限只能做严格求交和单调缩减，并在 Node 异步底层通过 `AsyncLocalStorage` 进行不可篡改的隐式上下文溯源，彻底防止了伪造父级和权限越界。
> 同时，我们在并发控制层设计了**双轨隔离槽位预算（Slot Isolation）**，有效打破了父等子、子等槽位的经典并发死锁问题。”

#### Q2: “你提到用 Git Worktree 做隔离，它比 Docker 好在哪里？遇到冲突怎么处理？”

> **高分答题模板**：
> “我们做的是桌面级自主研发助理，需要平衡**启动性能、隔离性与开发体验**。Docker 的冷启动在秒级以上，且在客户端强依赖 Docker Desktop，这对普通开发者门槛太高。
> Git Worktree 启动延迟小于 50ms，且与 Git 版本控制天然契合。每个 Agent 任务在独立的影子分支上工作，即使发生灾难性代码破坏，主工作区也丝毫不受影响。
> 在冲突与验证机制上，我们遵循‘**物理证据先于陈述**’：任务完成后，系统会执行 Path-policy 审计、测试命令校验和工件比对，只有全部通过且由校验器出具通过凭证后，才以原子提交的方式 Merge 回目标分支，确保代码库的绝对可信。”

#### Q3: “在开发这个 Agent 运行时过程中，你遇到的最棘手的一个底层 Bug 是什么？怎么解决的？”

> **高分答题模板（推荐讲述战役一或战役四）**：
> “最深水区的一个问题是 **Windows 环境下的跨平台进程多行提示词截断 Bug**。当时某个复杂的代码迁移任务在 Linux/Mac 上全部通过，在 Windows 上 Agent 却始终报‘步骤丢失’。
> 经过二分法排查与参数追踪，最终定位到底层进程生成时配置了 `shell: true`。在 Windows 上，Node.js 会自动将参数转交 `cmd.exe`，而 `cmd.exe` 在解析命令行时遇到换行符 `\n` 会截断后续参数，导致长文本 Prompt 被硬生生截断。
> 我们彻底废黜了跨平台的 `shell: true` 假定，全面重构为直接系统内核级的无 shell 派发，并针对 Windows 路径反斜杠与 Git porcelain 协议前缀编写了专门的规范化引擎和长参数保真度回归测试，消除了这个平台级暗坑。”

#### Q4: “在软件工程中，AI 经常会改坏测试或伪造空实现，你们系统是如何从架构上防御 Agent 作弊的？”

> **高分答题模板**：
> “这是一个非常经典的生产痛点：许多系统只要测试命令退出码是 0 就判定通过，但 LLM 往往会通过**弱化测试断言（把精准值比对改成 `toBeDefined()` 或 `expect(true).toBe(true)`）、在函数内部根据测试用例硬编码返回值、或者偷偷加 `test.skip`** 来达到‘测试全绿’的假象。
> 为此，我们在交付门禁中首创了**物理校验与语义对抗双轨制（Adversarial Adjudication）**。
> 我们引入了独立的 **Adjudicator Agent**，预设‘怀疑与对立’立场，专职审查物理 `git diff` 与原始目标：
>
> 1. 第一条红线查**测试断言完整性**：一旦发现断言削弱或覆盖率假象，直接一票否决；
> 2. 第二条红线查**伪实现与逃逸**：排查硬编码分支和空桩函数；
> 3. 产出三值化决策（`APPROVE` 放行、`REJECT_WITH_FEEDBACK` 结构化退回重做、`ABANDON` 熔断）。
>    只有当物理退出码为 0、路径无越界且对抗仲裁者一致通过时，代码才被允许交付，形成了真正的生成-对抗双 Agent 闭环。”

#### Q5: “在面对大型代码库（单文件数千行、跨文件复杂调用）时，你们系统如何防止上下文爆炸并保证模型注意力不被稀释？”

> **高分答题模板**：
> “业界常见做法要么是整文件暴力塞进 Prompt（导致严重的 Needle In A Haystack 注意力稀释与巨额 Token 浪费），要么是基于行数暴力切块做向量检索（导致代码语法结构破碎、上下文断裂）。
> 我们对标 EverMind-AI/Raven，自主研发了**基于原生 TypeScript AST 的符号依赖图谱与自适应骨架剪枝（Symbol Context Graph & AST Pruning）**。
>
> 1. **零外部原生依赖**：直接复用 Node 运行时原生的 TypeScript Compiler API 进行深度优先 AST 遍历，对接口、类型声明、枚举和 JSDoc 注释保持 100% 保真保留；
> 2. **非对称自适应剪枝（Asymmetric Pruning）**：
>    - **焦点符号（Focal Target）**：当前修改的目标函数/类保留 100% 完整实现；
>    - **一阶邻域（1-Hop Neighborhood）**：其直接调用方（Callers）与被调用方（Callees）的实现体一律折叠为 `/* [body pruned: N lines] */`；
> 3. **效果收益**：在保持类型系统完全封闭、函数契约一目了然的前提下，实现了 **80%~95% 的代码 Token 极致压缩**，既大幅降低了 API 成本，又使模型的注意力完全锚定在核心变动点上。”

#### Q6: “当系统中接入几十上百个 MCP 工具时，Function Calling 的 Schema 会撑爆 Token 并导致模型严重选错工具，你们是如何解决 Tool Spillover（工具溢出）的？”

> **高分答题模板**：
> “许多系统把接入尽可能多的 MCP 作为卖点，但实际上当注册工具达到 50+ 甚至 100+ 时，如果直接将所有工具的 JSON Schema 传给 LLM，会导致单轮 Schema Token 暴增至数万，且模型在海量选项中会发生显著的**工具选择准确率衰退与决策幻觉**。
> 针对这一致命痛点，我们设计了**两级动态工具路由与容量硬钳制架构（Two-Level Dynamic Tool Router）**：
>
> 1. **第一级（Core Tools 常驻）**：将高频刚需的 OS、文件读写、任务图编排与元探查工具（约 8~10 个）设置为常驻挂载；
> 2. **第二级（意图语义动态召回）**：利用轻量高效的纯内存 TF-IDF 算法，根据用户当前的自然语言 Query 动态评估非核心候选工具的语义相关性，精准召回 Top 5~6 个最相关的专业工具；
> 3. **容量硬上限（Hard Capacity Cap）**：将当前轮次提交给模型 Function Calling 的总工具数死死限制在 **16 个以内**，彻底消除了 Schema Token 爆炸；
> 4. **元工具探查（`search_tools`）**：为了避免过度裁剪造成模型感知不到未挂载工具，提供 `search_tools` 元工具供 Agent 主动查询全局工具库并显式唤醒，实现了‘极度精简’与‘能力完备’的完美平衡。”

#### Q7: “你们系统是如何组织本地文件落盘的？为什么不直接把所有数据丢在单一配置目录下？对于 API 密钥的安全存储与多环境覆盖你们是怎么设计的？”

> **高分答题模板**：
> “很多初创或 Demo 级 Agent 产品把配置、密钥、数据库、缓存全混在同一个目录（如 `~/.myapp/`），导致用户跨设备同步配置时泄漏私钥，清理缓存时误删主库。
> 我们借鉴 **OpenClaw** 和 **Hermes Agent** 的工业级实践，结合现代操作系统 **XDG Base Directory Specification**，建立了**六态物理分治存储拓扑与多级凭据决断链**：
>
> 1. **六态物理解耦落盘（Storage Layout）**：
>    - `config/`：**纯偏好设置（Config）**，零密钥，仅存活跃模型与路由规则，支持无害备份与跨端同步；
>    - `security/`：**凭据安全隔离层（Security）**，在 POSIX 平台强制校验并自动修整为 **`chmod 0600`** 严格权限；
>    - `memory/`：**显式 Markdown 记忆真相源（Memory）**，落盘人类可直接审阅与 Git 修正的 `USER.md` 和 `MEMORY.md`，并在会话启动时生成不可变的 **Frozen Snapshot（冷冻快照）**，确保 Anthropic Prompt Caching 100% 稳定命中；
>    - `storage/`：**持久化数据库（Data）**，存放 SQLite WAL 主库；
>    - `worktrees/`：**沙箱执行区（Worktrees）**，存放各 Agent 的独立影子分支并在销毁前提供快照备份（`snapshots/`）；
>    - `cache/`：**可随时安全清空的临时加速缓存（Cache）**，如 AST 符号依赖图与离线 Schema。
> 2. **环境自适应凭据决断树（Credential Resolution Hierarchy）**：
>    - 实行 `显式参数 -> 环境变量自动探查（DEEPSEEK_API_KEY / OPENAI_API_KEY 等）-> 本地 0600 凭据库 -> 系统钥匙串 -> 引导报错` 的 5 级决断链；
>    - 开发者无论在本地终端还是在 CI/CD 容器中，只需 `export DEEPSEEK_API_KEY="sk-..."`，系统就能在零配置的情况下实现瞬间自适应启动。”
