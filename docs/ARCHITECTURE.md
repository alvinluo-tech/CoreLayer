# Jarvis — 系统架构文档

> Long-term runtime target: see [Final Multi-Runtime Architecture](architecture/final-multi-runtime-architecture.md). The current single TypeScript daemon sidecar is a transition stage; the final direction is Rust/Tauri Core supervising multiple managed runtimes through explicit permission, audit, update, and runtime protocols.

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri 2.0)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Frontend (React + Vite + Tailwind)       │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ ChatPanel│  │ ModuleUI │  │ ReviewDashboard  │   │   │
│  │  └─────┬────┘  └─────┬────┘  └────────┬─────────┘   │   │
│  │        └──────────────┴───────────────┘              │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │ Tauri IPC Commands                 │
│  ┌──────────────────────┴───────────────────────────────┐   │
│  │              Tauri Rust Backend                       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │   │
│  │  │ IPC Handler│  │System Tray │  │ Local SQLite │   │   │
│  │  └─────┬──────┘  └────────────┘  └──────────────┘   │   │
│  └────────┼─────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────┘
            │ HTTP / Stdio
┌───────────┴─────────────────────────────────────────────────┐
│                Node.js Daemon (TypeScript)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              AI Orchestrator                          │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │ MiMo Client  │  │ Tool Router  │                 │   │
│  │  │ (API + Tool  │  │ (MCP Compat) │                 │   │
│  │  │  Calling)    │  │              │                 │   │
│  │  └──────┬───────┘  └──────┬───────┘                 │   │
│  │         └─────────────────┘                         │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────┴───────────────────────────────┐   │
│  │              Tool Registry (MCP)                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │  │Todo Tool │  │Reading   │  │Review    │           │   │
│  │  │Connector │  │Connector │  │Connector │           │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘           │   │
│  └───────┼──────────────┼──────────────┼────────────────┘   │
│          │              │              │                     │
│  ┌───────┴──────────────┴──────────────┴────────────────┐   │
│  │              Data Layer (Drizzle ORM)                 │   │
│  │  ┌──────────────────┐  ┌──────────────────────────┐  │   │
│  │  │ SQLite (Local)   │  │ Supabase Client (Cloud)  │  │   │
│  │  └──────────────────┘  └──────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 2. 关键数据流

### 场景 A：用户问「今天有什么任务？」

1. 用户在 ChatPanel 输入 "今天有什么任务？"
2. React 组件调用 Tauri IPC command: `invoke('send_message', { text })`
3. Tauri Rust 层转发给 Node.js Daemon (HTTP POST /api/chat)
4. AI Orchestrator 构造 prompt + 当前可用 tools 列表
5. 调用 MiMo API (tool calling) → MiMo 返回 `tool_call: { name: "getTodayTasks", args: {} }`
6. Tool Router 找到 TodoConnector.getTodayTasks()
7. TodoConnector 执行 SQL 查询
8. 结果返回给 MiMo，MiMo 生成自然语言回复
9. 回复通过 IPC 返回前端

### 场景 B：用户问「总结本周」

1. 用户输入 "总结本周完成情况"
2. MiMo 返回 `tool_call: { name: "getWeeklyStats", args: { week: "current" } }`
3. ReviewConnector 执行多个查询（任务完成率、阅读量、每日分布）
4. 数据返回 MiMo，MiMo 生成分析 + 建议
5. 前端渲染结构化总结卡片

### 场景 C：用户说「把这篇文章加到阅读清单」

1. MiMo 解析出 `tool_call: { name: "addArticle", args: { url: "https://..." } }`
2. ReadingConnector 提取元信息并 INSERT
3. MiMo 回复确认

## 3. 数据库 Schema

### tasks 表

- id (UUID PK), user_id (UUID FK), title, description, priority (1-5)
- status (pending/in_progress/done/deleted), due_date, tags[]
- completed_at, created_at, updated_at

### articles 表

- id (UUID PK), user_id (UUID FK), url, title, description
- status (unread/reading/finished), rating (1-5), notes, category
- added_at, started_at, finished_at

### reviews 表

- id (UUID PK), user_id (UUID FK), type (daily/weekly)
- period_start, period_end, task_completion_rate, articles_read
- summary, patterns[], suggestions[], raw_data (JSONB)

## 4. Tool 接口定义 (MCP 兼容)

### Todo Tools

- `createTask(title, priority?, dueDate?, tags?, description?)` → Task
- `getTodayTasks()` → Task[]
- `queryTasks(status?, priority?, tags?, dueDateFrom?, dueDateTo?)` → Task[]
- `updateTask(taskId, title?, priority?, status?, dueDate?, tags?)` → Task
- `deleteTask(taskId)` → success

### Reading Tools

- `addArticle(url?, title, category?, description?)` → Article
- `getReadingList(status?, category?, limit?)` → Article[]
- `updateReadingStatus(articleId, status, rating?, notes?)` → Article
- `getReadingStats(period?)` → Stats
- `recommendNext()` → { recommendation, reason }

### Review Tools

- `getDailySummary(date?)` → Summary
- `getWeeklyStats(weekStart?)` → Stats
- `saveReview(type, summary, patterns, suggestions?)` → Review
- `getReviewHistory(type, limit?)` → Review[]

## 5. AI Agent 编排流程

1. 用户消息 → AI Orchestrator
2. 构造 system prompt + tool definitions
3. 发送给 MiMo API
4. MiMo 响应：
   - 文本回复 → 直接返回
   - Tool Call → Tool Router 验证并路由到 Connector
5. Connector 执行 Drizzle ORM 查询
6. 结果返回 MiMo → 生成自然语言总结 → 返回用户
