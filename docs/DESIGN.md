# Jarvis — 全面设计文档 v2

> 本文档汇总 Jarvis Personal Command Center 的所有设计决策，包括产品定位、系统架构、UI 设计、数据模型、AI 编排、语音系统、MCP 集成等，供外部评估使用。
>
> **v2 更新**：新增 DaemonSupervisor 进程管理、统一 API 客户端 (JarvisClient)、异步权限确认、能力路由、语音配置集中管理、工具执行元数据、审计日志表等基础设施。

---

## 1. 产品概述

Jarvis 是一个 **桌面端个人指令中心**，将多个自建 Web 应用（Todo、阅读清单、日/周回顾）统一在 AI 驱动的界面之下。它不是通用聊天机器人，而是「个人数据中心 + 语音操作入口 + 自建 Web 应用的统一控制层」。

**核心理念**：MCP-first, but not MCP-only. Jarvis 是控制层；每个 Web App 是独立业务系统；MCP 是标准接口；Skills/Plugins 扩展 Jarvis 能力。

**目标用户**：当前阶段唯一用户是开发者本人（Durham University 研究生）。

**典型使用场景**：
- 开始工作时，问 Jarvis「今天有什么任务？」快速获取当日待办
- 阅读文章时，说「把这篇文章加到阅读清单」
- 周末复盘时，要求「总结本周完成情况，分析模式，建议改进」
- 通过语音唤醒 "Hey Jarvis"，在后台浮窗中进行语音对话
- 通过 Alt+Space 命令面板快速执行常用操作

---

## 2. 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面壳 | Tauri | 2.11.2 (Rust) |
| 前端 | React + Vite + Tailwind CSS + shadcn/ui | React 19, Vite 6, Tailwind 4 |
| 状态管理 | Zustand | 5 |
| 后端 | Hono (Node.js HTTP) | TypeScript |
| ORM | Drizzle ORM | SQLite + Supabase |
| 本地数据库 | SQLite (better-sqlite3) | — |
| 云端数据库 | Supabase (PostgreSQL) | — |
| AI SDK | Vercel AI SDK | v6 |
| AI 模型 | MiMo v2.5 (小米) | OpenAI-compatible API |
| 语音 ASR | Web Speech API + Groq Whisper | 实时 + 批量后备 |
| 语音 TTS | MiMo TTS | 句子级流式 |
| 唤醒词 | Porcupine / Web Speech API | "Hey Jarvis" |
| 外部协议 | MCP (Model Context Protocol) | 官方 SDK |
| Monorepo | pnpm workspaces | — |

---

## 3. 系统架构

### 3.1 三层代理模式

```
React Frontend  ──(Tauri IPC)──>  Rust Backend  ──(HTTP)──>  Node.js Daemon  ──(ORM)──>  SQLite/Supabase
```

**设计决策**：

1. **Tauri IPC 作为 HTTP 代理**：Rust 层包含 30+ `#[tauri::command]` 处理器，将请求代理到 Node.js daemon。避免 CORS 问题，给前端提供类型安全的 API。

2. **DaemonSupervisor 进程管理**：Rust 层管理 daemon 生命周期 — 健康检查（5s 轮询 `/health`）、崩溃重启（最多 3 次）、端口冲突检测、优雅关闭。通过 `daemon_status` / `start_daemon` / `stop_daemon` / `restart_daemon` Tauri 命令暴露给前端。

3. **统一 API 客户端 (JarvisClient)**：前端单例类，封装所有 daemon 通信 — 缓存 daemon URL（仅首次通过 Tauri IPC 解析）、HTTP 方法带自动重试（2 次、指数退避）、SSE 流式解析、语音操作 (synthesize/transcribe)。组件永不直接 `fetch()` 或 `invoke()`。

4. **双聊天路径**：
   - **流式（主路径）**：`jarvisClient.streamSSE()` 回调式 SSE 解析，逐 token 实时显示
   - **非流式（后备）**：通过 Tauri IPC 代理，流式失败时自动降级

5. **双存储模式**：Repository 模式 + factory，在运行时通过设置 UI 切换 SQLite / Supabase。

6. **多 AI 提供商**：支持 MiMo、Groq、OpenRouter、Ollama，通过 ModelGateway 按上下文路由。支持基于能力的路由（CapabilityRequirements）作为规则路由的后备。

### 3.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri 2.0)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Frontend (React + Vite + Tailwind)       │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ ChatPanel│  │ ModuleUI │  │ VoiceOverlay     │   │   │
│  │  └─────┬────┘  └─────┬────┘  └────────┬─────────┘   │   │
│  │        └──────────────┴──────┬────────┘              │   │
│  │                       ┌──────┴──────┐                │   │
│  │                       │ JarvisClient│ (singleton)     │   │
│  │                       │ - HTTP retry│                │   │
│  │                       │ - SSE parse │                │   │
│  │                       │ - TTS/ASR   │                │   │
│  │                       └──────┬──────┘                │   │
│  └──────────────────────────────┼───────────────────────┘   │
│                                 │                            │
│  ┌──────────────────────────────┴───────────────────────┐   │
│  │              Tauri Rust Backend                       │   │
│  │  lib.rs: HTTP proxy to daemon (reqwest)              │   │
│  │  daemon_supervisor.rs: process lifecycle mgmt        │   │
│  │  - Health check (5s polling /health)                 │   │
│  │  - Auto-restart (max 3 attempts)                     │   │
│  │  - Tauri commands: daemon_status/start/stop/restart  │   │
│  └────────┼─────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────┘
            │ HTTP
┌───────────┴─────────────────────────────────────────────────┐
│                Node.js Daemon (Hono, port 3001)              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              AI Orchestrator                          │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │ ModelGateway │  │ ToolRegistry │                 │   │
│  │  │ (rule-based  │  │ (unified,    │                 │   │
│  │  │  + capability│  │  with meta)  │                 │   │
│  │  │  fallback)   │  │              │                 │   │
│  │  └──────┬───────┘  └──────┬───────┘                 │   │
│  │         └─────────────────┘                         │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┴───────────────────────────────┐   │
│  │              Tool Sources                             │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ Native   │  │   MCP    │  │  Skill   │          │   │
│  │  │(Todo,    │  │(External │  │(Workflow)│          │   │
│  │  │ Reading, │  │ servers) │  │          │          │   │
│  │  │ Review)  │  │          │  │          │          │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘          │   │
│  └───────┼──────────────┼──────────────┼────────────────┘   │
│          │              │              │                     │
│  ┌───────┴──────────────┴──────────────┴────────────────┐   │
│  │  PermissionGuard (risk-based + async pending confirm) │   │
│  │  + ToolCallLog audit trail                            │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┴───────────────────────────────┐   │
│  │              Data Layer (Repository Pattern)          │   │
│  │  ┌──────────────────┐  ┌──────────────────────────┐  │   │
│  │  │ SQLite (Local)   │  │ Supabase Client (Cloud)  │  │   │
│  │  │ + tool_call_logs │  │ (stubs for V1)           │  │   │
│  │  │ + app_connections│  │                          │  │   │
│  │  │ + model_profiles │  │                          │  │   │
│  │  │ + memories       │  │                          │  │   │
│  │  └──────────────────┘  └──────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Monorepo 结构

```
Jarvis/
├── frontend/              # Tauri 2.0 + React 桌面应用
│   ├── src/
│   │   ├── lib/
│   │   │   ├── jarvisClient.ts    # 统一 API 客户端（单例）
│   │   │   ├── sseParser.ts       # SSE 流式解析器
│   │   │   └── voiceProfile.ts    # 语音配置管理
│   │   ├── hooks/
│   │   │   ├── useChat.ts         # 聊天 hook（使用 jarvisClient）
│   │   │   ├── useVoice.ts        # 语音 hook
│   │   │   └── useVoiceConversation.ts
│   │   └── stores/                # Zustand stores
│   └── src-tauri/
│       └── src/
│           ├── lib.rs             # Tauri 命令 + HTTP 代理
│           └── daemon_supervisor.rs # 进程生命周期管理
├── daemon/                # Node.js 后端服务 (Hono)
│   └── src/
│       └── db/
│           ├── schema.ts          # Drizzle 表定义
│           ├── repository.ts      # Repository 接口
│           └── sqlite/            # SQLite 实现
├── packages/
│   ├── types/             # @jarvis/types — 共享 TypeScript 类型
│   ├── model-gateway/     # @jarvis/model-gateway — 模型路由与配置
│   ├── mcp-client/        # @jarvis/mcp-client — MCP 服务器连接管理
│   ├── tool-registry/     # @jarvis/tool-registry — 统一工具注册表
│   └── permission-guard/  # @jarvis/permission-guard — 权限守卫 + 审计日志
├── supabase/migrations/   # 云端数据库迁移
└── docs/                  # 设计文档
```

### 3.4 统一 API 客户端 (JarvisClient)

前端所有 daemon 通信通过 `jarvisClient` 单例，组件永不直接 `fetch()` 或 `invoke()`。

```
Components → Zustand Stores → jarvisClient.invoke()     → Tauri IPC → Daemon
Hooks      → jarvisClient.streamSSE()                   → Daemon (SSE)
Hooks      → jarvisClient.synthesize() / .transcribe()  → Daemon (TTS/ASR)
```

**核心能力**：
- **URL 缓存**：首次通过 `invoke<string>("get_daemon_url_command")` 解析，后续复用
- **HTTP 重试**：maxRetries=2, retryDelayMs=1000 (指数退避), timeoutMs=30000
- **SSE 解析**：共享 `createSSEParser`，处理跨 chunk 的不完整行
- **语音操作**：`synthesize()` → ArrayBuffer, `transcribe()` → string

**降级策略**：SSE 流式失败时，自动降级到 Tauri IPC 非流式路径。

### 3.5 DaemonSupervisor

Rust 层 daemon 进程管理器，通过 Tauri State 注入：

| 命令 | 行为 |
|------|------|
| `daemon_status` | 返回 running/healthy/url/restartAttempts/lastHealthCheck/lastError |
| `start_daemon` | 验证 daemon 已运行（当前无 sidecar 自动启动） |
| `stop_daemon` | 重置重启计数器 |
| `restart_daemon` | 尝试重启（最多 3 次），验证健康状态 |

健康检查：5 秒间隔 GET `/health`，5 秒超时。重启尝试间隔 500ms。超过 3 次重启失败返回错误，需人工介入。

---

## 4. UI 设计

### 4.1 整体布局

主窗口采用 **左侧边栏 + 右侧聊天区** 的经典两栏布局：

```
┌─────────────────────────────────────────────────────────┐
│ ┌──────────┐ ┌─────────────────────────────────────────┐│
│ │ Sidebar  │ │           Chat Area (flex-1)            ││
│ │ (w-80)   │ │                                         ││
│ │          │ │  ┌─────────────────────────────────┐    ││
│ │ Jarvis   │ │  │ MessageBubble (user)            │    ││
│ │ Settings │ │  └─────────────────────────────────┘    ││
│ │──────────│ │  ┌─────────────────────────────────┐    ││
│ │ ConvList │ │  │ MessageBubble (assistant)       │    ││
│ │ - Search │ │  │ - Thought block (collapsible)   │    ││
│ │ - Items  │ │  │ - Markdown content (Streamdown) │    ││
│ │──────────│ │  │ - Tool call indicators          │    ││
│ │ Voice    │ │  └─────────────────────────────────┘    ││
│ │ Panel    │ │  ┌─────────────────────────────────┐    ││
│ │──────────│ │  │ ChatInput                       │    ││
│ │ Today    │ │  └─────────────────────────────────┘    ││
│ │ Tasks    │ │                                         ││
│ │──────────│ │                                         ││
│ │ Reading  │ │                                         ││
│ │ List     │ │                                         ││
│ │──────────│ │                                         ││
│ │ Daily    │ │                                         ││
│ │ Summary  │ │                                         ││
│ └──────────┘ └─────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 4.2 侧边栏组件

#### 4.2.1 头部
- 标题："Jarvis"（text-xl, font-bold, tracking-tight）
- 副标题："Personal Command Center"（text-sm, text-muted-foreground）
- 右侧：设置按钮（齿轮图标，ghost variant）

#### 4.2.2 会话列表 (ConversationList)
- **新建对话按钮**：outline variant，全宽，左侧 + 图标
- **搜索框**：当对话 > 3 个时显示，带搜索图标
- **对话项 (ConversationItem)**：
  - 左侧：MessageSquare 图标
  - 中间：标题 + 相对时间（如 "2 小时前"）
  - 右侧：重命名/删除按钮（hover 显示）
  - 激活态：bg-primary/10 边框高亮
- 最大高度 300px，可滚动

#### 4.2.3 语音面板 (VoicePanel)
- **麦克风按钮**：圆形，颜色随状态变化
  - 空闲：secondary (灰色)
  - 监听中：green-600 + pulse 动画
  - 转写中：blue-600 + Loader2 旋转
  - AI 思考：yellow-600
  - AI 播报：purple-600
- **状态文字**：显示当前状态标签（"正在聆听..."、"AI 思考中..." 等）
- **转写文本**：实时显示语音识别结果
- **唤醒词提示**："说 'Hey Jarvis' 唤醒" + 方法标签（porcupine/webspeech）
- **打断按钮**：AI 播报时显示，点击打断

#### 4.2.4 今日任务 (TodayView)
- Card 组件，标题 "今日任务" + 完成计数（如 "2/5 完成"）
- 任务列表项：
  - 状态图标：CheckCircle2(绿/完成)、Clock(黄/进行中)、Circle(灰/待办)
  - 任务标题（truncated）
  - 优先级 Badge：紧急(红)、高(蓝)、中(灰)、低(描边)
- 筛选逻辑：今日到期 OR 高优先级(≤2)未完成

#### 4.2.5 阅读清单 (ReadingList)
- Card 组件，标题 "阅读清单" + 未读计数
- 文章列表项：
  - 状态图标：CheckCircle2(绿/已读)、Eye(黄/在读)、BookOpen(灰/未读)
  - 文章标题（truncated）
  - 分类 Badge（outline variant）
  - 状态 Badge：已读(secondary)、在读(default)、未读(outline)

#### 4.2.6 今日总结 (DailySummary)
- Card 组件，标题 "今日总结"
- 2×2 网格统计：
  - 任务完成：CheckCircle2(绿) / X/Y
  - 完成率：TrendingUp(蓝) / 百分比
  - 阅读：BookOpen(紫) / N 篇
  - 连续天数：Target(橙) / 数字

### 4.3 聊天区组件

#### 4.3.1 ChatPanel
- **空状态**：居中显示 MessageSquarePlus 图标 + "开始新对话" + 新建按钮
- **消息区域**：flex-1，可滚动，space-y-4 间距
- **滚动到底部按钮**：居中 pill 样式
  - 底部定位，圆角全宽，bg-background + border
  - 左侧 ArrowDown 图标 + "回到底部" 文字
  - 新消息时显示 cyan 脉冲圆点指示器
  - hover 效果：scale-105 + 图标下移
- **自动滚动逻辑**：
  - 用户在底部附近时自动跟随新消息
  - 用户向上滚动时暂停自动跟随，显示 "回到底部" 按钮
  - 切换会话时强制 instant 滚动到顶部

#### 4.3.2 MessageBubble
- **用户消息**：
  - 右对齐，bg-primary，圆角（右下角无圆角）
  - max-w-[85%]，whitespace-pre-wrap
- **助手消息**：
  - 左对齐，bg-card，圆角（左下角无圆角）
  - 带 border + shadow-sm，hover 时 shadow-md
  - **思考块 (Thought Block)**：
    - 可折叠/展开的紫色边框卡片
    - 展开中：Brain 图标(旋转) + "Jarvis 正在思考推理..."
    - 已完成：CheckCircle2(绿) + "已完成思考过程"
    - 内容：monospace 字体，muted-foreground，bg-muted/10
  - **主内容**：使用 Streamdown 组件渲染 Markdown
    - 流式模式：parseIncompleteMarkdown=true
    - 静态模式：完整渲染
  - **工具调用指示器**：
    - 每个工具调用一行，monospace 字体
    - 待执行：amber 背景 + Loader2 旋转
    - 已完成：muted 背景 + Check 图标
    - 显示：工具名 + 参数摘要
- **底部栏**：
  - 左侧：时间戳（HH:MM 格式）
  - 右侧：复制按钮（hover 显示）

#### 4.3.3 加载指示器
- cyan 科幻风格卡片
- "JARVIS COGNITIVE DECRYPTING..." 文字 + Loader2 旋转
- 三个弹跳圆点动画（错开 150ms 延迟）

#### 4.3.4 ChatInput
- 底部输入区域，border-top 分隔
- 文本输入框 + 发送按钮

### 4.4 命令面板 (CommandPalette)

触发方式：**Alt+Space** 全局快捷键

```
┌──────────────────────────────────────┐
│ 🔍 输入命令或搜索...          [ESC] │
├──────────────────────────────────────┤
│ 📋 今日任务        查看今天的待办任务 │
│ 📖 阅读清单        查看阅读列表       │
│ 📊 今日总结        查看今日任务完成情况│
│ 💬 新建对话        开始一个新的对话    │
│ 🎤 语音输入        切换语音输入模式    │
│ ⚙️ 设置            打开设置面板       │
│ ❓ 帮助            查看 Jarvis 可以做什么│
├──────────────────────────────────────┤
│ ↑↓ 导航  ↵ 执行  ESC 关闭  Alt+Space │
└──────────────────────────────────────┘
```

- 搜索过滤：匹配标签、描述、关键词
- 键盘导航：↑↓ 选择，Enter 执行，Escape 关闭
- 选中项高亮：bg-primary/10 + text-primary
- 居中显示，pt-[20vh]，半透明黑色遮罩 + backdrop-blur

### 4.5 语音覆盖层 (JarvisVoiceOverlay)

全屏科幻风格 HUD，用于语音对话交互。

#### 4.5.1 两种布局模式

- **centered**：居中弹窗模式（主窗口前台时）
  - max-w-md，圆角 2xl，半透明黑色遮罩 + backdrop-blur
  - 用于主窗口内的语音交互

- **bottom-right**：右下角浮窗模式（主窗口后台时）
  - 360×440px，无装饰，alwaysOnTop，透明背景
  - 独立 Tauri 窗口，唤醒词触发后显示

#### 4.5.2 视觉设计

**Canvas 正弦波动画**：
- 多层正弦波叠加（3-6 层），边缘渐隐
- 背景网格线（40px 间距，白色 2% 透明度）
- 发光效果（shadowBlur=15）

**状态颜色映射**：

| 状态 | 主色 | 辅色 | 含义 |
|------|------|------|------|
| listening | Cyan (#06b6d4) | Emerald (#10b981) | 正在监听 |
| transcribing | Blue (#3b82f6) | Indigo (#6366f1) | 语音转写中 |
| streaming | Amber (#f59e1b) | Yellow (#eab308) | AI 生成中 |
| speaking | Violet (#8b5cf6) | Pink (#ec4899) | AI 播报中 |
| idle | Slate (#94a3b8) | Dark Slate | 空闲 |

**HUD 元素**：
- 顶部栏：脉冲 cyan 圆点 + "JARVIS HUD v2.5" + 计时器（MM:SS）+ 关闭按钮
- 状态标题：大写字母 monospace（如 "🎤 JARVIS IS LISTENING..."）
- 状态副标题：英文描述（如 "Speak your command clearly"）

**交互面板**：
- 用户语音气泡：cyan 边框，显示实时转写文本
- AI 思考指示器：amber 脉冲动画，"🧠 COGNITIVE MATRIX SCANNERS" 标签
- AI 回复气泡：purple 边框，显示回复文本

**控制按钮**：
- 监听中：cyan "FINISH COMM" 按钮
- 播报中：red "INTERRUPT" 按钮
- 处理中：disabled "SYNCHRONIZING" 按钮

### 4.6 设置模态框 (SettingsModal)

Tab 导航，两个标签页：

#### 标签 1：存储模式
- 2×1 网格按钮选择器：
  - 本地存储：Database 图标 + "SQLite 数据库"
  - 云端存储：Cloud 图标 + "Supabase PostgreSQL"
  - 选中态：border-primary + bg-primary/5
  - 云端未配置时：opacity-50 + 黄色警告
- 切换警告："切换存储模式不会迁移已有数据"
- 当前模式指示器

#### 标签 2：MCP & 模型 (MCPSettings)
- **MCP 服务器列表**：
  - 状态图标：绿(已连接)、蓝(连接中/Spinner)、红(错误)、灰(断开)
  - 服务器名称 + URL + 类型
  - 连接/断开按钮
- **添加服务器表单**：ID、名称、传输类型(SSE)、URL
- **工具注册表摘要**：按来源分类计数（native/MCP/skill/REST）
- **模型配置列表**：模型名称 + 能力 Badge（text/code/embedding/reasoning）

### 4.7 设计风格

- **主色调**：深色主题为主，cyan 作为科技感强调色
- **字体**：系统默认 sans-serif + monospace（代码/HUD 元素）
- **圆角**：卡片 rounded-xl，按钮 rounded-md，pill rounded-full
- **间距**：space-y-4 为主，p-4 为标准内边距
- **动画**：
  - fade-in + slide-in 用于加载
  - pulse 用于活跃状态指示
  - bounce 用于加载点
  - ping 用于新消息通知
  - spin-slow 用于思考中 Brain 图标

---

## 5. 数据模型

### 5.1 SQLite Schema (Drizzle ORM)

```sql
-- 任务表
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 3,  -- 1(最高) ~ 5(最低)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/in_progress/done/deleted
  due_date TEXT,
  tags TEXT,  -- JSON array
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 文章表
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'unread',  -- unread/reading/finished
  rating INTEGER,  -- 1-5
  notes TEXT,
  category TEXT,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
);

-- 回顾表
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  type TEXT NOT NULL,  -- daily/weekly
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  task_completion_rate REAL,
  articles_read INTEGER,
  summary TEXT,
  patterns TEXT,  -- JSON array
  suggestions TEXT,  -- JSON array
  raw_data TEXT,  -- JSON object
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 对话表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL DEFAULT '新对话',
  model_used TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,  -- user/assistant/system/tool
  content TEXT NOT NULL,
  tool_calls TEXT,  -- JSON array
  tool_call_id TEXT,
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 工具调用审计日志
CREATE TABLE tool_call_logs (
  id TEXT PRIMARY KEY,
  tool_id TEXT,
  tool_name TEXT NOT NULL,
  app_id TEXT,
  source TEXT CHECK(source IN ('mcp','native','skill','rest')),
  args TEXT,  -- JSON
  result_success INTEGER DEFAULT 0,  -- boolean
  result_data TEXT,  -- JSON
  result_error TEXT,
  risk TEXT,
  confirmed_by_user INTEGER DEFAULT 0,  -- boolean
  duration_ms INTEGER,
  conversation_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tool_call_logs_conversation ON tool_call_logs(conversation_id);
CREATE INDEX idx_tool_call_logs_tool ON tool_call_logs(tool_id);

-- 持久化 MCP/应用连接状态
CREATE TABLE app_connections (
  id TEXT PRIMARY KEY,
  app_id TEXT UNIQUE NOT NULL,
  app_name TEXT,
  source TEXT CHECK(source IN ('mcp','native','skill','rest')),
  config TEXT,  -- JSON
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected','connecting','connected','error')),
  last_connected TEXT,
  last_error TEXT,
  tool_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 模型配置档案
CREATE TABLE model_profiles (
  id TEXT PRIMARY KEY,
  provider TEXT,
  model_name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  capabilities TEXT,  -- JSON array
  limits TEXT,  -- JSON (contextWindow, maxTokens, etc.)
  cost TEXT,  -- JSON (inputPer1k, outputPer1k)
  is_default INTEGER DEFAULT 0,  -- boolean
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agent 记忆（个性化）
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  type TEXT NOT NULL CHECK(type IN ('fact','preference','context','summary')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT,
  confidence REAL DEFAULT 1.0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_memories_user ON memories(user_id);
CREATE INDEX idx_memories_key ON memories(key);
```

### 5.2 Supabase (云端)

相同的表结构，使用 UUID 主键，PostgreSQL 原生类型，RLS 策略确保数据隔离。

---

## 6. API 设计

### 6.1 Daemon API 路由总览

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 |
| **Chat** | | |
| POST | `/api/chat` | 非流式聊天（遗留） |
| POST | `/api/chat/stream` | 流式聊天 (SSE) |
| **Conversations** | | |
| GET | `/api/conversations` | 列出所有对话 |
| POST | `/api/conversations` | 创建新对话 |
| GET | `/api/conversations/:id` | 获取对话+消息 |
| DELETE | `/api/conversations/:id` | 删除对话 |
| PATCH | `/api/conversations/:id` | 重命名对话 |
| POST | `/api/conversations/:id/messages` | 发送消息（非流式） |
| POST | `/api/conversations/:id/messages/stream` | 发送消息 (SSE 流式) |
| **Tasks** | | |
| GET | `/api/tasks` | 查询任务 (status, priority 过滤) |
| POST | `/api/tasks` | 创建任务 |
| PATCH | `/api/tasks/:id` | 更新任务 |
| DELETE | `/api/tasks/:id` | 软删除任务 |
| **Articles** | | |
| GET | `/api/articles` | 阅读清单 (status, category 过滤) |
| POST | `/api/articles` | 添加文章 |
| PATCH | `/api/articles/:id` | 更新阅读状态 |
| **Reviews** | | |
| GET | `/api/reviews/daily-summary` | 每日总结 |
| GET | `/api/reviews/weekly-stats` | 每周统计 |
| **Settings** | | |
| GET | `/api/settings` | 获取设置 |
| PUT | `/api/settings/storage-mode` | 切换存储模式 |
| **Voice** | | |
| POST | `/api/voice/transcribe` | 语音转文字 (Groq Whisper) |
| POST | `/api/voice/synthesize` | 文字转语音 (MiMo TTS) |
| GET | `/api/voice/status` | 语音管线可用性 |
| POST | `/api/voice/converse-stream` | 流式语音对话 (SSE) |
| **MCP** | | |
| GET | `/api/mcp/servers` | 列出 MCP 服务器 |
| POST | `/api/mcp/servers` | 连接 MCP 服务器 |
| DELETE | `/api/mcp/servers/:id` | 断开 MCP 服务器 |
| GET | `/api/mcp/tools` | 列出 MCP 工具 |
| GET | `/api/mcp/resources` | 列出 MCP 资源 |
| GET | `/api/mcp/prompts` | 列出 MCP Prompts |
| POST | `/api/mcp/servers/:id/tools/:name` | 调用 MCP 工具 |
| GET | `/api/mcp/models` | 获取模型配置 |
| **Tools** | | |
| GET | `/api/tools` | 列出所有注册工具 |
| POST | `/api/tools/filter` | 过滤工具 |
| POST | `/api/tools/:id/execute` | 执行工具（带权限检查） |

### 6.2 Tauri IPC 命令

Rust 层 30+ 命令，分类如下：

| 类别 | 命令 | 说明 |
|------|------|------|
| **Daemon 管理** | `daemon_status` | 获取 daemon 运行状态 |
| | `start_daemon` | 验证 daemon 已运行 |
| | `stop_daemon` | 停止监控 |
| | `restart_daemon` | 重启 daemon（最多 3 次） |
| | `health_check` | 直接健康检查 |
| | `get_daemon_url_command` | 获取 daemon URL |
| **对话** | `list_conversations`, `create_conversation`, `get_conversation`, `delete_conversation`, `update_conversation` | 对话 CRUD |
| | `send_message`, `send_conversation_message` | 消息发送 |
| **任务** | `query_tasks`, `create_task`, `update_task`, `delete_task` | 任务 CRUD |
| **阅读** | `get_reading_list`, `add_article`, `update_reading_status` | 阅读清单 |
| **回顾** | `get_daily_summary`, `get_weekly_stats` | 统计回顾 |
| **设置** | `get_settings`, `update_storage_mode`, `get_voice_status` | 系统设置 |
| **MCP** | `list_mcp_servers`, `connect_mcp_server`, `disconnect_mcp_server` | MCP 服务器管理 |
| | `list_mcp_tools`, `list_mcp_resources`, `list_mcp_prompts` | MCP 资源 |
| **工具** | `list_all_tools`, `get_tool` | 统一工具注册表 |
| **模型** | `list_model_profiles` | 模型配置 |

---

## 7. AI 编排

### 7.1 编排流程

```
用户消息 → AI Orchestrator → 构造 system prompt + tools → 调用 LLM
    ↓
LLM 响应：
  - 文本回复 → 直接返回
  - Tool Call → PermissionGuard 检查 → ToolRegistry 路由 → 执行 → 结果返回 LLM
    ↓（最多 5 轮 tool calling）
最终回复 → 返回前端
```

### 7.2 System Prompt

两种模式：

**文本模式**：
- 结构化 Markdown 回复
- 支持 `<thought>` 推理块（前端可折叠显示）
- 工具调用返回结构化数据

**语音模式**：
- 纯口语中文回复
- 无 Markdown/emoji
- 60-150 字符长度限制
- 交互式语气

### 7.3 模型路由 (ModelGateway)

**默认模型配置**：

| Profile | Provider | 用途 | 能力 |
|---------|----------|------|------|
| mimo-2.5-pro | MiMo | 主要对话 + 工具调用 | text, code, reasoning, vision |
| mimo-2.5-fast | MiMo | 快速响应 | text, code |
| groq-llama | Groq | 低延迟任务 | text, code |
| openrouter-default | OpenRouter | 备选 | text, code, vision |
| local-ollama | Ollama | 隐私敏感任务 | text, code |

**路由策略**（两层）：

1. **规则路由（主路径）**：按任务类型直接映射

| 任务类型 | 路由目标 | 条件 |
|----------|----------|------|
| fast | groq-llama | 需要快速响应 |
| toolAgent | mimo-2.5-pro | 需要工具调用 |
| reasoning | mimo-2.5-pro | 需要深度推理 |
| private | local-ollama | 隐私敏感 |
| chat | mimo-2.5-pro | 默认聊天 |

2. **能力路由（后备）**：当规则无匹配时，按 `CapabilityRequirements` 评分选择模型
   - `required` 能力：+10 分/项（不匹配则排除）
   - `bonus` 能力：+1 分/项
   - 上下文窗口：按比例加分
   - 可选成本偏好：低成本模型加分

```typescript
interface CapabilityRequirements {
  required: ModelCapability[];   // 必须具备
  bonus?: ModelCapability[];     // 加分项
  minContextWindow?: number;     // 最小上下文窗口
}
```

**持久化**：`model_profiles` 表支持运行时覆盖默认配置（通过设置 UI 管理）。

### 7.4 工具注册表 (ToolRegistry)

统一工具来源：

| 来源 | 说明 | 示例 |
|------|------|------|
| native | 内置工具连接器 | Todo、Reading、Review |
| MCP | MCP 服务器提供的工具 | 外部服务 |
| Skill | 工作流技能 | 复合操作 |
| REST | REST API 包装 | 第三方服务 |

每个工具包含：id, appId, source, name, title, description, inputSchema, risk, permissions, requiresConfirmation, execute。

**工具执行元数据**（v2 新增）：

| 字段 | 类型 | 说明 |
|------|------|------|
| timeoutMs | number | 执行超时（默认 30000ms） |
| idempotent | boolean | 是否幂等（可安全重试） |
| cancellable | boolean | 是否支持取消 |
| category | ToolCategory | 分类标签 |
| displayMode | ToolDisplayMode | 结果展示方式 |

```typescript
type ToolCategory = "productivity" | "communication" | "system" | "data" | "media" | "automation" | "other";
type ToolDisplayMode = "inline" | "card" | "silent" | "confirm";
```

`displayMode` 控制工具结果在聊天 UI 中的渲染方式：
- `inline`：直接嵌入消息流
- `card`：卡片式展示（默认）
- `silent`：静默执行，不显示结果
- `confirm`：执行前需用户确认

### 7.5 权限守卫 (PermissionGuard)

基于风险等级的权限控制：

| 风险等级 | 默认行为 | 说明 |
|----------|----------|------|
| low | 自动执行 | 读取操作 |
| medium | 通知用户 | 修改操作 |
| high | 需要确认 | 删除操作 |
| critical | 需要确认 | 不可逆操作 |

执行流程：
1. 检查工具风险等级
2. 检查应用级权限配置
3. 根据策略决定：自动执行 / 通知 / 确认 / 拒绝
4. 记录审计日志（`tool_call_logs` 表）

**异步确认机制**（v2 新增）：

同步确认回调无法支持 UI 驱动的暂停/恢复。新增 `PendingConfirmation` 模式：

```typescript
interface PendingConfirmation {
  confirmationId: string;
  toolId: string;
  toolName: string;
  appId: string;
  args: unknown;
  riskLevel: RiskLevel;
  reason?: string;
  createdAt: string;
  expiresAt: string;  // 30 秒超时
}

interface PendingExecution {
  confirmationId: string;
  confirmation: PendingConfirmation;
  confirm: () => Promise<ToolResult>;
  deny: () => Promise<ToolResult>;
  isExpired: boolean;
}
```

`executeWithPendingConfirmation()` 流程：
- Low/Medium 风险 → 自动执行（同 `executeWithGuard`）
- High/Critical 风险 → 创建 `PendingExecution`，暂停执行链
- UI 层展示确认卡片，用户点击确认/拒绝
- 30 秒超时自动拒绝并记录审计

API：
- `getPendingConfirmations()` — 获取待确认列表（UI 轮询）
- `cancelConfirmation(id)` — 取消单个
- `cancelAllPending()` — 取消全部

---

## 8. 语音系统

### 8.1 语音配置管理 (VoiceProfile)

语音参数（voice name、model、language）之前硬编码在 4+ 个文件中。现通过 `VoiceProfileManager` 单例集中管理：

```typescript
interface VoiceProfile {
  id: string;
  name: string;        // "茉莉"
  language: string;    // "zh-CN"
  model: string;       // "mimo-v2.5-tts"
  gender: "male" | "female" | "neutral";
  style: string;       // "warm"
}
```

默认 profile（保持现有行为）：

| 字段 | 值 |
|------|-----|
| id | moli |
| name | 茉莉 |
| language | zh-CN |
| model | mimo-v2.5-tts |
| gender | female |
| style | warm |

`voiceProfileManager.getVoiceName()` / `.getTTSModel()` / `.getLanguage()` 替代所有硬编码字符串。

### 8.2 语音对话管线

```
唤醒词检测 ("Hey Jarvis")
    ↓
问候语 (Sci-fi chime + TTS "我在，主人")
    ↓
监听 (Web Speech API 实时 ASR)
    ↓
转写 (最终文本)
    ↓
LLM 流式响应 (逐 token)
    ↓
TTS (按句子分割，MiMo TTS 合成)
    ↓
音频队列 (AudioQueueManager，逐句播放)
    ↓
打断检测 (VAD 监听用户语音)
    ↓
后续监听 (7 秒窗口)
    ↓
告别 (沉默后播放告别语，回到唤醒词模式)
```

### 8.3 打断机制 (Barge-in)

- AI 播报期间，后台 VAD 持续监听
- 检测到用户语音时，立即：
  1. 停止当前 TTS 播放
  2. 清空音频队列
  3. 切换到 ASR 监听状态
  4. 用户说完后重新进入 LLM 处理

### 8.4 助理浮窗

- 独立 Tauri 窗口（360×440px）
- 无装饰、透明背景、alwaysOnTop、skipTaskbar
- 位于屏幕右下角（24px margin）
- 唤醒词触发时显示，空闲时自动隐藏
- 运行轻量级 voice-only 模式（JarvisVoiceOverlay bottom-right 布局）

### 8.5 ASR 方案

| 方案 | 类型 | 延迟 | 准确度 |
|------|------|------|--------|
| Web Speech API | 实时流式 | 低 | 中 |
| Groq Whisper | 批量转写 | 中 | 高 |

主路径使用 Web Speech API 实时转写，失败时降级到 Groq Whisper 批量转写。

---

## 9. MCP 集成

### 9.1 MCP 架构

```
Jarvis Daemon (MCP Host)
    ├── MCPClientManager
    │   ├── Server Connection 1 (SSE)
    │   ├── Server Connection 2 (SSE)
    │   └── Server Connection N
    └── ToolRegistry
        ├── Native Tools (Todo, Reading, Review)
        ├── MCP Tools (from connected servers)
        ├── Skill Tools
        └── REST Tools
```

### 9.2 MCP 服务器管理

- **连接**：通过 SSE 传输连接到 MCP 服务器
- **发现**：自动发现服务器提供的 tools、resources、prompts
- **注册**：MCP 工具自动注册到统一 ToolRegistry
- **调用**：通过 ToolRegistry 统一调用，透明代理到 MCP 服务器
- **断开**：清理连接和注册的工具

### 9.3 MCP 工具桥接

MCP 工具被转换为 JarvisTool 格式：
- source: "mcp"
- id: `mcp:{serverId}:{toolName}`
- inputSchema: 从 MCP tool definition 映射
- execute: 代理到 MCPClientManager.callTool()

---

## 10. 状态管理

### 10.1 Zustand Stores

| Store | 状态 | 职责 |
|-------|------|------|
| conversationStore | conversations[], activeId, messages[] | 对话 CRUD + 消息管理 |
| taskStore | tasks[] | 任务 CRUD |
| articleStore | articles[] | 文章 CRUD |
| reviewStore | dailySummary | 回顾/统计 |
| settingsStore | storageMode, cloudConfigured | 存储设置 |
| mcpStore | servers[], tools[], modelProfiles[] | MCP 状态 |
| paletteStore | isOpen, query, selectedIndex | 命令面板 |

### 10.2 数据流

```
用户操作 → 组件 → Zustand Action → Tauri IPC → Daemon API → Database
    ↓
响应返回 → Zustand State 更新 → 组件重新渲染
```

流式聊天使用独立路径：
```
useChat hook → fetch SSE → 逐 token 更新 messages state → ChatPanel 渲染
```

---

## 11. 环境配置

### 11.1 关键环境变量

```env
# AI Provider
AI_PROVIDER=mimo                    # mimo/groq/openrouter/local
MIMO_API_KEY=sk-xxx
MIMO_MODEL=mimo-v2.5
GROQ_API_KEY=gsk_xxx
OPENROUTER_API_KEY=sk-or-xxx

# Database
DATABASE_URL=file:./data/jarvis.db  # SQLite
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Voice
GROQ_API_KEY=xxx                    # Whisper ASR (shared)
PORCUPINE_ACCESS_KEY=xxx            # Wake word

# Server
DAEMON_URL=http://127.0.0.1:3001
```

---

## 12. 测试策略

### 12.1 测试分布

| 层级 | 框架 | 覆盖率 |
|------|------|--------|
| packages/* | Vitest | 52 个测试（model-gateway 19, tool-registry 13, permission-guard 20） |
| daemon | Vitest | 62 个测试（tools, conversations, schema, new-repos 18） |
| frontend | — | 暂无测试（UI 组件） |
| Tauri (Rust) | cargo check | 编译通过（DaemonSupervisor） |
| 总计 | — | 114 个测试全部通过 |

### 12.2 测试重点

- **Model Gateway**：路由规则匹配、模型选择逻辑、任务类型推断、能力路由评分、成本偏好
- **Tool Registry**：工具注册/过滤/查询、MCP 工具桥接、category 过滤、默认元数据
- **Permission Guard**：风险等级检查、审计日志、同步确认回调、异步 PendingConfirmation（创建/确认/拒绝/取消/超时）
- **Daemon Repos**：tool_call_logs、app_connections、model_profiles、memories 的 CRUD + 边界情况（JSON 序列化、唯一约束、过期清理）
- **Daemon Tools**：Todo/Reading/Review CRUD、输入验证
- **Conversations**：消息创建、对话管理

---

## 13. 已知限制与改进方向

### 13.1 已知限制

- 单用户设计，无多用户支持
- 无移动端支持
- 前端无测试覆盖
- 语音 TTS 延迟可优化（句子级分割 vs 流式）
- DaemonSupervisor 仅支持连接已运行的 daemon（无 sidecar 自动启动）
- Supabase 新表仓库为 stub 实现（V1 仅 SQLite）

### 13.2 v2 已解决的问题

- ~~API 调用分散在 3+ hooks 中~~ → JarvisClient 统一封装
- ~~daemon URL 重复解析~~ → 单例缓存
- ~~SSE 解析代码重复~~ → 共享 sseParser
- ~~语音参数硬编码 4+ 处~~ → VoiceProfileManager 集中管理
- ~~模型路由硬编码~~ → 支持能力路由后备
- ~~工具无执行元数据~~ → timeoutMs/idempotent/cancellable/category/displayMode
- ~~同步确认无法支持 UI 暂停/恢复~~ → PendingConfirmation 异步机制
- ~~无工具调用审计~~ → tool_call_logs 表
- ~~无 daemon 生命周期管理~~ → DaemonSupervisor (健康检查/重启/状态)

### 13.3 改进方向

- **Phase 2**：健身模块、日历模块
- **Phase 3**：自定义 UI 主题、插件市场
- **Phase 4**：多用户支持、移动端
- DaemonSupervisor sidecar 打包（自动启动 daemon）
- Supabase 仓库实现
- 持续优化语音管线延迟
- 增加前端 E2E 测试
- 动态模型路由配置 UI
