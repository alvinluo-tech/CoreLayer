<p align="center">
  <img src="./public/assets/corelayer-hero.png" alt="CoreLayer — powered by Jarvis" width="100%" />
</p>

<br />

<p align="center">
  <img src="./public/assets/icon.png" alt="CoreLayer Icon" width="96" height="96" />
</p>

<h1 align="center">CoreLayer — powered by Jarvis</h1>

<p align="center">
  <strong>本地优先的 Agent、工具与个人工作空间 AI 执行控制层。</strong>
</p>

<p align="center">
  Jarvis 是内建的 AI 助手人格，帮助你协调工作空间、任务、Agent、工具、模型、审批、产物、MCP 应用和语音工作流。
</p>

<p align="center">
  语音原生 · MCP 优先 · 工具感知 · 权限守护 · 本地优先
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB?style=flat-square" />
  <img src="https://img.shields.io/badge/MCP--first-22D3EE?style=flat-square" />
  <img src="https://img.shields.io/badge/Model_Router-enabled-8B5CF6?style=flat-square" />
  <img src="https://img.shields.io/badge/Permission_Guard-enabled-F59E0B?style=flat-square" />
  <img src="https://img.shields.io/badge/Local--first-SQLite-10B981?style=flat-square" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README_zh.md">简体中文</a>
</p>

---

## 产品愿景

大多数 AI 产品仍然把工作放在一条聊天线程里。CoreLayer 把工作当成一个可管理的执行系统。

你给 Jarvis 一个目标。CoreLayer 会把它转化为工作空间，里面包含任务、Agent Run、审批、产物、日志、记忆和运行时状态。Claude Code、Codex、OpenCode 这类编码 Agent 不再是直接在本机裸跑的工具，而是 CoreLayer 本地优先控制平面中的受管执行器。

```text
目标
  -> 工作空间
  -> 任务图
  -> Agent Run
  -> 作用域审批
  -> 产物 + 日志
  -> 可验证交付
```

CoreLayer 的长期方向是本地优先的 Agent OS：一个桌面原生的操作层，用来管理 Agent、工具、模型运行时、权限、工作空间、记忆和可交付产物。

第一个实际落地切口是编码执行治理：

- **工作空间编排** — 目标会变成项目、任务、Agent、时间线和产物。
- **执行器治理** — Claude Code、Codex、OpenCode 通过适配器接入，并具备生命周期追踪。
- **权限优先运行时** — 高风险动作会进入审批、挂起动作、授权包和审计记录。
- **产物驱动交付** — 可交付结果与日志、转录、状态噪音分离。
- **本地优先架构** — Tauri 桌面应用、本地 daemon、SQLite-first 存储、MCP 扩展能力。

---

## 什么是 CoreLayer？

**CoreLayer** 是一个本地优先的桌面端 AI 控制平面，用来管理 Agent、工具和个人工作空间。

它不是又一个 AI 聊天窗口。
它是一个本地优先的工作空间，把目标转化为任务、Agent Run、审批、产物、记忆和可验证的执行轨迹。

内建的 AI 助手人格叫做 **Jarvis**。

Jarvis 可以帮你：

- 从高层目标创建和管理工作空间
- 将工作拆解为项目任务和 Agent Run
- 协调 Claude Code、Codex、OpenCode 等编码执行器
- 追踪审批、产物、日志和运行时间线
- 通过 MCP 控制已连接的个人应用和外部服务
- 通过权限策略安全地调用工具
- 跨不同 AI 模型路由请求
- 通过语音交互并流式播报

---

## 为什么需要 CoreLayer？

AI 助手已经足够强，但严肃工作不能只依赖一个 Prompt 输入框。

今天的 Agent 工作流经常难以信任，因为：

- 任务沉没在聊天历史里，没有变成可持久化的项目状态
- 工具调用和 shell 操作很难被一致地检查、审批和追踪
- 多个 Agent 和执行器缺少统一的工作空间、记忆和产物模型
- 最终产物经常和日志、权限提示、状态文本混在一起
- 本地编码工具很有用，但需要生命周期、权限和交付边界

CoreLayer 围绕一个更清晰的产品边界设计：

> Jarvis 管理工作，专用工具执行工作。

这个边界让 CoreLayer 能协调模型、Agent、MCP 工具、编码执行器、权限、产物和记忆，同时不被绑定到某一个模型供应商或某一个 IDE。

---

## 核心能力

<table>
  <tr>
    <td width="50%">
      <img src="./public/assets/icons/mcp.svg" width="32" />
      <h3>MCP 优先集成</h3>
      <p>通过 MCP 服务器连接个人应用和外部工具。</p>
    </td>
    <td width="50%">
      <img src="./public/assets/icons/registry.svg" width="32" />
      <h3>工作空间执行</h3>
      <p>把目标转化为工作空间、项目、任务图、Agent Run 和可持久化产物。</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./public/assets/icons/guard.svg" width="32" />
      <h3>权限运行时</h3>
      <p>分类风险操作，申请作用域审批，恢复挂起动作，并保留审计日志。</p>
    </td>
    <td width="50%">
      <img src="./public/assets/icons/models.svg" width="32" />
      <h3>模型路由</h3>
      <p>根据任务需求跨 MiMo、Groq、OpenRouter 和本地模型路由请求。</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./public/assets/icons/voice.svg" width="32" />
      <h3>语音管线</h3>
      <p>唤醒、监听、转录、流式响应、语音播报，支持打断续听。</p>
    </td>
    <td width="50%">
      <img src="./public/assets/icons/control-center.svg" width="32" />
      <h3>控制中心</h3>
      <p>管理模型、Agent、应用、工具、权限、语音配置、守护进程健康和日志。</p>
    </td>
  </tr>
</table>

---

## 架构

```text
用户目标 / 语音 / 快捷键
  ↓
CoreLayer 桌面工作空间 (Tauri + React)
  ├─ 工作空间 UI
  ├─ 任务图与时间线
  ├─ Agent / Run / Approval / Artifact 视图
  └─ 控制中心
  ↓
Jarvis Runtime Daemon (Hono + TypeScript)
  ├─ Workspace Orchestrator
  │   └─ 目标 → 项目规格 → 任务 → Agent 分配
  ├─ Agent Runtime
  │   └─ chat / voice / scheduled / workflow runs
  ├─ Coding Runtime
  │   └─ Claude Code / Codex / OpenCode 适配器
  ├─ Permission Runtime
  │   └─ 策略决策 → 审批 → 挂起动作 → 授权包
  ├─ Artifact + Log Store
  │   └─ 可交付产物、执行日志、Run 事件、审计轨迹
  ├─ Tool Runtime
  │   └─ 原生工具、MCP 工具、技能、REST 适配器
  └─ Model Gateway
      └─ MiMo / Groq / OpenRouter / Ollama / OpenAI-compatible
  ↓
本地优先数据层
  ├─ SQLite repositories
  ├─ Supabase repositories
  └─ PostgreSQL 配置（实验性）
```

---

## 认识 Coreling

<p align="center">
  <img src="./public/assets/coreling.png" alt="Coreling — Jarvis AI 核心伙伴" width="360" />
</p>

**Coreling** 是 Jarvis 的全息 AI 核心伙伴。

它代表了 CoreLayer 背后语音原生、MCP 优先、权限感知的命令控制层。

Coreling 不是产品 Logo。
产品身份是 **CoreLayer 控制系统**。
Coreling 是用于引导、语音模式、加载状态和文档中的助手头像。

---

## 功能概览

| 领域                | 说明                                                               |
| ------------------- | ------------------------------------------------------------------ |
| **桌面工作空间**    | Tauri 驱动的桌面应用，包含工作空间、任务图、运行、审批和产物视图。 |
| **Jarvis 助手人格** | 内建助手身份，支持语音和文本交互。                                 |
| **Agent 编排**      | 从目标创建工作空间，拆解任务，分配 Agent，并追踪执行结果。         |
| **编码执行器控制**  | 管理 Claude Code、Codex、OpenCode 等第三方执行器。                 |
| **MCP 集成**        | 连接外部 MCP 服务器，将工具注册到统一注册中心。                    |
| **工具注册中心**    | 统一工具层，支持原生、MCP、技能和 REST 工具。                      |
| **权限运行时**      | 基于风险的执行控制，支持异步确认、挂起恢复和审计日志。             |
| **模型网关**        | 跨 MiMo、Groq、OpenRouter、Ollama 和本地模型路由请求。             |
| **语音管线**        | 唤醒词、ASR、流式 LLM 响应、TTS 和打断。                           |
| **本地存储**        | 默认 SQLite，本地优先；Supabase 和 PostgreSQL 配置逐步完善。       |
| **执行轨迹**        | 追踪工具调用、权限、耗时、风险等级、产物、日志和结果。             |

---

## 技术栈

| 层级     | 技术                                        |
| -------- | ------------------------------------------- |
| 桌面端   | Tauri 2                                     |
| 前端     | React 19、Vite、Tailwind CSS、shadcn/ui     |
| 状态管理 | Zustand                                     |
| 守护进程 | Node.js 22+、Hono                           |
| 数据库   | SQLite、Drizzle ORM                         |
| AI SDK   | Vercel AI SDK                               |
| 模型     | MiMo、Groq、OpenRouter、Ollama、OpenAI 兼容 |
| 语音     | Web Speech API、Groq Whisper、MiMo TTS      |
| 协议     | MCP (Model Context Protocol)                |
| 执行器   | Claude Code、Codex、OpenCode 适配器         |
| 包管理器 | pnpm workspaces                             |

---

## 项目结构

```text
corelayer/
├── frontend/                    # Tauri 2.0 桌面客户端
│   ├── src/
│   │   ├── components/          # React UI 组件
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── stores/              # Zustand 状态管理
│   │   ├── lib/                 # 客户端工具库
│   │   │   ├── jarvisClient.ts  # 带重试的 HTTP 客户端
│   │   │   ├── sseParser.ts     # SSE 流式解析器
│   │   │   └── voiceProfile.ts  # 语音配置管理器
│   │   └── App.tsx
│   └── src-tauri/               # Rust 原生代码
│       └── src/
│           ├── lib.rs           # Tauri 命令
│           └── daemon_supervisor.rs
│
├── daemon/                      # Node.js runtime daemon
│   └── src/
│       ├── http/routes/         # Hono REST 端点
│       ├── runtimes/            # agent、coding、tool、voice、memory、scheduler runtimes
│       ├── workflow/            # run dispatch、队列、slot、资源监控
│       ├── services/            # 工作空间编排和详情聚合
│       ├── capabilities/        # 权限与能力策略
│       ├── approvals/           # 审批与恢复服务
│       ├── persistence/         # SQLite/Supabase 仓储
│       └── config/              # 环境与存储配置
│
├── packages/                    # 共享包
│   ├── types/                   # 共享 TypeScript 类型
│   ├── model-gateway/           # 多提供商模型路由
│   ├── mcp-client/              # MCP 服务器连接
│   ├── tool-registry/           # 统一工具注册
│   ├── runtime-core/            # 受管 runtime 基础能力
│   ├── runtime-protocol/        # runtime action、approval、lifecycle 协议
│   ├── execution-environment/   # 执行环境契约
│   └── permission-guard/        # 风险执行守卫
│
├── public/
│   └── assets/                  # 视觉资源
│       ├── corelayer-hero.png   # README 横幅
│       ├── coreling.png         # 助手头像
│       ├── icon.png             # 桌面应用图标
│       └── icons/               # 功能模块 SVG 图标
│
└── docs/                        # 文档
```

---

## 快速开始

### 前置要求

- Node.js 22+
- pnpm 9+
- Rust（最新稳定版，用于 Tauri）
- Tauri 平台依赖

### 安装

```bash
git clone https://github.com/your-username/Jarvis.git
cd Jarvis
pnpm install
```

### 环境配置

在项目根目录创建 `.env`。最小本地配置如下：

```env
STORAGE_MODE=local
DAEMON_PORT=3001
DAEMON_HOST=127.0.0.1
```

`MIMO_API_KEY`、`GROQ_API_KEY`、`OPENROUTER_API_KEY`、`DATABASE_URL`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 等 Provider 或数据库密钥是可选项，仅在启用对应集成时添加。

### 一键启动

```bash
pnpm dev
```

### 分别启动守护进程或桌面应用

```bash
pnpm --filter daemon dev
pnpm --filter frontend tauri dev
```

---

## 安装与运行常见问题 (FAQ)

### 1. macOS 提示“App 已损坏，您应该将它移到废纸篓”

- **原因**：由于项目目前未缴纳 Apple 开发者年费进行代码签名与公证（Notarization），macOS Gatekeeper 安全机制在下载后会强制将 App 隔离并提示损坏。
- **解决办法**：
  1. 将安装挂载出的 `Jarvis.app` 拖入到 **应用程序 (Applications)** 文件夹中。
  2. 打开系统的 **终端 (Terminal)**，运行以下命令（会提示输入 Mac 的开机密码）：
     ```bash
     sudo xattr -r -d com.apple.quarantine /Applications/Jarvis.app
     ```
  3. 执行完毕后重新双击 App 即可正常启动。

### 2. Windows 覆盖安装/更新时提示文件被锁定（锁死错误）

- **原因**：可能因为后台旧版本的 `jarvis-daemon.exe` 守护进程仍在运行，占用了 SQLite 的原生扩展库（`better_sqlite3.node`）。
- **解决办法**：安装包内建了自动杀进程的安装钩子。如果仍旧遇到锁定弹窗，请在 Windows 任务管理器中手动结束所有 `jarvis-daemon.exe` 进程，或者打开命令行运行以下指令后，再重试安装：
  ```cmd
  taskkill /f /im jarvis-daemon.exe
  ```

---

## 示例指令

向 Jarvis 提问：

```text
为 packaged runtime supervisor 创建一个工作空间。
```

```text
把这个目标拆成实现任务，并分配合适的 Agent。
```

```text
使用 Codex 运行编码 Agent，并保持改动隔离。
```

```text
显示这个 Agent Run 修改了什么，以及哪些检查通过了。
```

```text
只为当前任务批准这次文件写入。
```

```text
显示这个工作空间里所有待处理审批。
```

```text
连接我的 GitHub MCP 服务器，并列出可用工具。
```

---

## 控制中心

CoreLayer 包含桌面控制中心，用于管理：

- 守护进程状态和健康检查
- 已连接应用和 MCP 服务器
- 模型配置和路由规则
- 工具注册中心和发现
- 权限策略和审计日志
- 语音配置和测试控制台
- 本地记忆和上下文

---

## 工具安全

CoreLayer 按风险等级分类工具。

| 风险     | 行为       | 示例         |
| -------- | ---------- | ------------ |
| **低**   | 自动执行   | 查看当前任务 |
| **中**   | 执行并通知 | 创建新任务   |
| **高**   | 需要确认   | 删除项目     |
| **极高** | 需显式批准 | 系统级命令   |

所有工具调用都会写入审计日志，包含耗时、风险等级和结果状态。

---

## MCP 集成

CoreLayer 连接 MCP 服务器，将工具注册到统一的工具注册中心。

支持的连接类型：

```text
stdio · HTTP · SSE
```

MCP 工具被标准化为 CoreLayer 内部格式：

```text
mcp:{serverId}:{toolName}
```

这允许 Jarvis 通过与原生工具相同的权限、日志和展示管线调用外部工具。

---

## 模型路由

不同任务需要不同模型。CoreLayer 跨提供商路由请求：

```text
快速语音指令       → 低延迟模型 (MiMo, Groq)
工具密集型工作流   → 工具代理模型
本地隐私请求       → 本地模型 (Ollama)
长推理任务         → 推理模型 (OpenRouter)
```

可通过控制中心 UI 添加提供商，支持预设目录或自定义 OpenAI 兼容端点。

---

## 存储模式

CoreLayer 在 UI 和配置层支持三种存储模式：

| 模式            | 说明                                                                  |
| --------------- | --------------------------------------------------------------------- |
| **本地 SQLite** | 零配置，离线优先，数据留在本地。                                      |
| **Supabase**    | 基于 Supabase 仓储的云同步模式。                                      |
| **PostgreSQL**  | 已有配置和连接测试入口；完整仓储支持仍是实验性，当前会回退到 SQLite。 |

存储模式可在设置中切换，但 PostgreSQL 仍应视为进行中能力。

---

## 语音管线

Jarvis 支持语音原生交互流程：

```text
唤醒词检测
  ↓
ASR 语音识别
  ↓
流式模型响应
  ↓
句级 TTS 队列播报
  ↓
打断续听
  ↓
上下文追问
```

语音配置支持不同语言、模型和声音设置。

---

## 路线图

### 已实现

- [x] Tauri 桌面 Shell 与本地 daemon supervision
- [x] React 工作空间 UI、命令面板、控制中心和语音浮窗
- [x] 带 HTTP 重试和 SSE streaming 的统一 JarvisClient
- [x] MiMo、Groq、OpenRouter、Ollama、OpenAI-compatible 模型网关
- [x] 支持原生工具、MCP 工具、技能和 REST 适配器的工具注册中心
- [x] ASR、流式响应、TTS 和打断能力组成的语音管线
- [x] 本地技能运行时和定时自动化基础能力
- [x] SQLite 本地优先存储与 Supabase 仓储支持
- [x] Workspace、Project、Task Graph、Agent Run、Artifact、Approval、Environment Session 数据模型
- [x] 工作空间 UI：任务图、时间线、Agent、运行、审批和产物
- [x] Claude Code、Codex、OpenCode 编码执行器适配器
- [x] Runtime protocol、execution environment、capability grant、pending action、execution log 基础能力

### 当前重点

- [ ] 强化第三方执行器权限和审批投射
- [ ] 在副作用发生前执行工作空间与执行环境边界检查
- [ ] 将可交付产物与日志、转录、权限提示、状态输出分离
- [ ] 增加 trajectory export，用事件、日志、审批和产物重建一次 Agent Run
- [ ] 让可验证交付成为编码任务的默认完成路径

### 下一步

- [ ] 围绕项目记忆、决策记录和可复用工作流完善 Agent OS 工作空间
- [ ] 将执行器治理从 coding 扩展到 research、writing、browser、messaging、media 等工作流
- [ ] 将更多宿主级权限收敛到 Rust/Tauri Core：进程监管、应用路径、密钥、权限、更新和审计日志
- [ ] 稳定 runtime protocol，为未来 managed runtimes 和 plugin ecosystem 做准备
- [ ] 在权限、记忆、runtime 和 artifact contract 稳定后，再推进 marketplace 式共享

---

## 设计系统

CoreLayer 使用暗色、沉静、未来感的视觉语言：

- 深海军蓝 / 近黑色背景
- 青色 AI 核心光晕
- 紫色模型路由强调色
- 琥珀色权限 / 反应器高亮
- HUD 风格环形和连线节点
- 专业产品仪表盘布局

视觉资源：

```text
public/assets/corelayer-hero.png    README 横幅
public/assets/coreling.png          助手头像
public/assets/icon.png              桌面应用图标
public/assets/icons/                功能模块 SVG 图标
```

---

## 命名

仓库和产品系统叫做 **CoreLayer**。

内建的 AI 助手人格叫做 **Jarvis**。

```text
CoreLayer = 桌面端 AI 控制层
Jarvis    = CoreLayer 内的助手人格
Coreling  = 全息 AI 核心伙伴
```

---

## 开源协议

[MIT](LICENSE)

---

## 状态

CoreLayer 目前处于实验阶段，优先面向个人使用。

近期落地楔子是 Claude Code、Codex、OpenCode 等编码执行器的本地优先控制平面。
长期目标是成为本地优先的 Agent OS，用于管理 Agent、任务、工作空间、工具、权限、记忆、产物和模型运行时。
