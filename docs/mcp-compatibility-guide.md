# Jarvis MCP 外部服务器兼容指南

> 本文档面向希望将自己的 vibe-coding 项目通过 MCP 协议接入 Jarvis 的开发者。
> 核心原则：**不要修改 Jarvis 来适配你的应用，让你的应用通过 MCP 自我描述。**

---

## 目录

1. [MCP 是什么？Jarvis 如何消费它？](#1-mcp-是什么jarvis-如何消费它)
2. [传输方式选择](#2-传输方式选择)
3. [工具定义与注解（核心适配点）](#3-工具定义与注解核心适配点)
4. [认证方式](#4-认证方式)
5. [风险与安全模型](#5-风险与安全模型)
6. [资源与提示（可选）](#6-资源与提示可选)
7. [完整示例：为一款 Todo 项目添加 MCP 服务器](#7-完整示例为一款-todo-项目添加-mcp-服务器)
8. [在 Jarvis 中连接你的 MCP 服务器](#8-在-jarvis-中连接你的-mcp-服务器)
9. [故障排查](#9-故障排查)

---

## 1. MCP 是什么？Jarvis 如何消费它？

[MCP (Model Context Protocol)](https://modelcontextprotocol.io) 是一个开放协议，允许 AI 应用通过标准化的接口发现和调用外部工具。

### Jarvis 的架构

Jarvis 是一个 MCP 优先的个人 AI 控制层。任何实现了 MCP 协议的服务器都可以被 Jarvis 动态发现、连接和编排：

```
你的 vibe-coding 项目          Jarvis (CoreLayer)
┌──────────────────────┐       ┌──────────────────────┐
│  MCP Server          │       │  MCPClientManager    │
│  ├─ listTools() ─────┼───────┼→ 发现工具定义         │
│  ├─ callTool()  ←───┼───────┼─ 调用工具             │
│  ├─ listResources() ─┼───────┼→ 发现资源             │
│  └─ listPrompts()  ─┼───────┼→ 发现提示             │
└──────────────────────┘       │         ↓             │
                               │  ToolRegistry         │
                               │  (注册为 JarvisTool)   │
                               │         ↓             │
                               │  AI Orchestrator      │
                               │  (自动选择/调用工具)    │
                               └──────────────────────┘
```

### 连接生命周期

```
用户通过 UI 添加 MCP 服务器
  ↓
POST /api/mcp/servers { config }
  ↓
MCPClientManager.connectServer()
  ├─ 建立传输层连接（HTTP/SSE/stdio）
  ├─ listTools()    → 注册工具到 ToolRegistry
  ├─ listResources() → 记录资源
  └─ listPrompts()   → 记录提示
  ↓
AI 模型在对话中通过 RAG 选择最相关工具
  ↓
调用时: manager.callTool(serverId, toolName, args)
  ↓
结果返回给 AI 模型 → 生成回复
```

---

## 2. 传输方式选择

Jarvis 支持三种 MCP 传输方式：

| 传输方式 | Jarvis 内部名称 | 适用场景 |
|----------|----------------|----------|
| Streamable HTTP | `http` | **推荐**。生产级 Web 应用，支持流式响应 |
| Server-Sent Events | `sse` | 兼容性方案，支持浏览器端连接（Jarvis Tauri 环境） |
| stdio | `stdio` | CLI 工具、本地守护进程、AI 编码代理 |

### 推荐：Streamable HTTP

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

const app = express();
const mcpServer = new McpServer({
  name: 'your-project',
  version: '1.0.0',
});

// 注册工具（见第 3 节）
registerYourTools(mcpServer);

// 挂载 MCP 端点
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport();
  await mcpServer.connect(transport);
  // 处理请求...
});

app.listen(3000);
```

Jarvis 连接时将 `url` 设为 `http://your-host:3000/mcp`。

### 备选：SSE（传统方案）

```typescript
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  await mcpServer.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = SSEServerTransport.receiveSessionData(sessionId);
  await transport.handlePostMessage(req, res);
});
```

Jarvis 连接时将 `url` 设为 `http://your-host:3000/sse`。

---

## 3. 工具定义与注解（核心适配点）

这是外部 MCP 服务器与 Jarvis 最关键的适配点。Jarvis 会读取 MCP 协议的 `tool.annotations` 扩展字段来对工具进行**风险分类**和**行为控制**。

### 基础工具定义

每个工具必须提供：

```typescript
server.tool(
  'tool_name',                    // 工具名，AI 用此调用
  '工具描述，AI 理解何时调用此工具',  // 描述越详细越好
  {                                // inputSchema: JSON Schema
    type: 'object',
    properties: {
      param1: { type: 'string', description: '参数说明' },
      param2: { type: 'number', description: '参数说明' },
    },
    required: ['param1'],
  },
  async (args) => {
    // 执行逻辑
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);
```

### Jarvis 风险注解（关键！）

Jarvis 通过 MCP SDK 的 `annotations` 字段读取风险等级。**正确设置注解直接影响工具是否需要用户确认：**

```typescript
server.tool(
  'get_weather',
  '获取当前天气信息',
  { type: 'object', properties: { city: { type: 'string' } } },
  async (args) => { /* ... */ },
  {
    annotations: {
      // ⚠️ 以下三个是 MCP 标准注解
      readOnlyHint: true,      // 只读操作 → Jarvis 自动判为 low 风险
      destructiveHint: false,  // 非破坏性操作
      idempotentHint: true,    // 幂等

      // ⭐ 以下三个是 Jarvis 扩展注解
      risk: 'low',             // 显式风险覆盖：low | medium | high | critical
      category: 'data',        // 工具分类：productivity | communication | system |
                               //           data | media | automation | other
      displayMode: 'inline',   // 展示模式：inline | card | silent | confirm
    },
  },
);
```

### 风险等级映射

| 注解设置 | Jarvis 风险等级 | 行为 |
|----------|----------------|------|
| `readOnlyHint: true` 或 `risk: 'low'` | `low` | 自动允许，安全策略 low 控制 |
| 无注解（默认） | `medium` | 中等风险，用户可配置策略 |
| `destructiveHint: true` 或 `risk: 'high'` | `high` | 需要用户确认 |
| `risk: 'critical'` | `critical` | 严格限制，默认拒绝 |

### 工具命名规范

- 使用蛇形命名法（snake_case）：`get_user_profile`
- 避免使用点号（`.`），Jarvis 内部会将其替换为下划线
- 名称应反映领域动作而非 REST 端点：
  - ✅ `create_task`、`list_tasks`、`update_task_status`
  - ❌ `post_api_tasks`、`get_api_tasks_id`

### 输入参数 JSON Schema 要求

- 使用标准的 JSON Schema（Jarvis 内部兼容 Draft-07 风格）
- `required` 字段必须是数组，不要传对象
- 每个属性加 `description`，帮助 AI 理解参数含义
- 尽量使用 `enum` 约束可选值

```typescript
inputSchema: {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      description: '任务状态过滤',
      enum: ['todo', 'in_progress', 'done'],
    },
    priority: {
      type: 'integer',
      description: '优先级 (1-5)',
      minimum: 1,
      maximum: 5,
    },
    dueDate: {
      type: 'string',
      description: '截止日期，ISO 8601 格式',
    },
  },
  required: ['status'],
}
```

---

## 4. 认证方式

Jarvis 支持在 MCP 服务器配置中设置认证信息。

### 配置结构

```typescript
interface MCPAuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'oauth';
  tokenRef?: string;      // Bearer token 值或环境变量引用
  username?: string;      // Basic auth 用户名
  passwordRef?: string;   // Basic auth 密码或环境变量引用
}
```

### Bearer Token（最常用）

在 Jarvis 中配置：

```json
{
  "auth": {
    "type": "bearer",
    "tokenRef": "your-api-token-here"
  }
}
```

Jarvis 会在请求头中添加：
```
Authorization: Bearer your-api-token-here
```

### 无认证（开发环境）

```json
{
  "auth": { "type": "none" }
}
```

### 你的 MCP 服务器需要做什么？

- 根据你选择的认证方式，在相应端点验证请求头
- Bearer token 在 HTTP `Authorization` 头中
- 返回 `401` 表示认证失败，Jarvis 会显示错误状态

---

## 5. 风险与安全模型

Jarvis 有完整的安全策略引擎来管控工具调用：

### 策略层

```
所有工具调用
  ↓
1. Hardline 黑名单检查（不可绕过）
   - curl|bash 管道执行 → 拒绝
   - SSH 私钥读取 → 拒绝
   - 系统目录写入 → 拒绝
  ↓
2. 风险评估（基于工具注解）
   - low → 自动允许
   - medium → 按用户策略
   - high → 需要用户确认
   - critical → 默认拒绝
  ↓
3. 用户记忆权限（可记住决定）
   - "自动允许"（auto）
   - "拒绝"（deny）
  ↓
4. 执行或返回确认请求
```

### 对 MCP 服务器的影响

- **尽量将只读操作标注为 low 风险**，这样 AI 可以在无需用户干预的情况下使用
- **避免工具名称或描述暗示破坏性行为**，除非确实是
- 如果你的工具有删除/修改操作，正确标注 `risk: 'high'` 让用户有机会确认

---

## 6. 资源与提示（可选）

Jarvis 也支持 MCP 的资源和提示功能，但不是必须的。

### 资源（Resources）

用于暴露你的应用中的静态或动态数据：

```typescript
server.resource(
  'user-profile',
  'jarvis://users/{userId}/profile',
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify(await getUserProfile(uri.pathname)),
    }],
  }),
);
```

Jarvis 通过 `readResource()` 读取资源，暴露在 `/api/mcp/servers/:id/resources/*` 端点。

### 提示（Prompts）

用于暴露可复用的提示模板：

```typescript
server.prompt(
  'analyze-task',
  { taskId: z.string() },
  async ({ taskId }) => ({
    messages: [{
      role: 'user',
      content: { type: 'text', text: `请分析任务 ${taskId} 的完成情况` },
    }],
  }),
);
```

### 对兼容性的影响

- 可以**只实现工具**（tools），不强制实现资源和提示
- Jarvis 会优雅地处理 `listResources()` 或 `listPrompts()` 不支持的情况

---

## 7. 完整示例：为一款 Todo 项目添加 MCP 服务器

假设你有一个 vibe-coding 的 Todo 应用，已有 REST API。以下是将它包装为 MCP 服务器的完整步骤。

### 步骤 1：安装依赖

```bash
npm install @modelcontextprotocol/sdk express cors
```

### 步骤 2：创建 MCP 服务器

```typescript
// mcp/server.ts
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// 从 Zod schema 生成工具参数
const server = new McpServer({
  name: 'todo-app',
  version: '1.0.0',
});

// ---- 注册工具 ----

// 1. 只读工具：查询任务列表
server.tool(
  'list_tasks',
  '查询任务列表，可按状态和优先级过滤',
  {
    status: {
      type: 'string',
      description: '过滤状态',
      enum: ['all', 'todo', 'in_progress', 'done'],
    },
    priority: {
      type: 'integer',
      description: '过滤优先级（1-5）',
      minimum: 1,
      maximum: 5,
    },
  },
  async (args) => {
    const tasks = await getTasks(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(tasks) }],
    };
  },
  {
    annotations: {
      readOnlyHint: true,      // ← 只读，low 风险，自动允许
      idempotentHint: true,
      risk: 'low',             // ← 显式标注 low 风险
      category: 'productivity',
    },
  },
);

// 2. 写入工具：创建任务
server.tool(
  'create_task',
  '创建一个新任务',
  {
    title: { type: 'string', description: '任务标题' },
    description: { type: 'string', description: '任务描述' },
    priority: { type: 'integer', description: '优先级（1-5）' },
    dueDate: { type: 'string', description: '截止日期 ISO 8601' },
  },
  async (args) => {
    const task = await createTask(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(task) }],
    };
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      risk: 'medium',          // ← 写入操作，标注 medium
      category: 'productivity',
    },
  },
);

// 3. 高风险工具：删除任务
server.tool(
  'delete_task',
  '删除指定任务（高风险操作）',
  { taskId: { type: 'string', description: '任务 ID' } },
  async (args) => {
    await deleteTask(args.taskId);
    return { content: [{ type: 'text', text: '已删除' }] };
  },
  {
    annotations: {
      destructiveHint: true,   // ← 破坏性操作，high 风险
      risk: 'high',
      category: 'productivity',
    },
  },
);

// 4. 关键风险工具：批量清空
server.tool(
  'clear_completed_tasks',
  '清空所有已完成任务（不可恢复）',
  {},
  async () => {
    const count = await clearCompleted();
    return { content: [{ type: 'text', text: `已清除 ${count} 个任务` }] };
  },
  {
    annotations: {
      destructiveHint: true,
      risk: 'critical',         // ← 关键风险，默认拒绝
      category: 'productivity',
      displayMode: 'confirm',   // ← 显示确认对话框
    },
  },
);

// ---- 启动 HTTP 服务 ----

const app = express();
app.use(cors());
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);
  // Streamable HTTP 响应的处理...
  // 简化起见可以使用 callback 模式：transport.handlePostMessage(req, res)
});

app.listen(3001, () => {
  console.log('MCP 服务器运行在 http://localhost:3001/mcp');
});
```

### 步骤 3：部署并验证

确保 MCP 端点可访问，Jarvis 将发送 POST 请求到此端点。

---

## 8. 在 Jarvis 中连接你的 MCP 服务器

### 方式 A：通过 Jarvis 前端 UI

1. 打开 Jarvis 设置 → MCP 服务器
2. 点击"添加服务器"
3. 填写：
   - **ID**: `my-todo-app`（唯一标识）
   - **名称**: `我的 Todo 应用`
   - **传输方式**: `http`
   - **URL**: `http://localhost:3001/mcp`
   - **认证**: 根据你的设置选择
4. 点击连接

### 方式 B：通过 API

```bash
curl -X POST http://localhost:20288/api/mcp/servers \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "my-todo-app",
    "name": "我的 Todo 应用",
    "transport": "http",
    "url": "http://localhost:3001/mcp",
    "auth": { "type": "none" },
    "enabled": true,
    "permissions": { "read": true, "write": true, "delete": false, "bulkWrite": false },
    "riskPolicy": {
      "low": "auto",
      "medium": "notify",
      "high": "confirm",
      "critical": "deny"
    }
  }'
```

### 验证连接成功

连接成功后，Jarvis 会显示服务器的工具列表。你可以通过以下 API 查看：

```bash
# 查看所有 MCP 服务器
curl http://localhost:20288/api/mcp/servers

# 查看所有已注册工具
curl http://localhost:20288/api/mcp/tools
```

---

## 9. 故障排查

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 状态为 `error` | MCP 端点不可达或返回非标准响应 | 检查 URL 是否正确，服务器是否运行 |
| 工具列表为空 | `listTools()` 未实现或返回空 | 确保注册了至少一个工具 |
| 工具调用失败 | 参数不符合 JSON Schema | 检查工具参数类型和 required 字段 |
| 认证失败 | Bearer token 不匹配 | 检查 Jarvis 配置中的 tokenRef |
| AI 从不调用你的工具 | 工具描述不够清晰 | 改善描述，确保 AI 能理解何时使用 |

### 测试 MCP 服务器

你可以用标准 MCP inspector 测试你的服务器：

```bash
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```

### 日志检查

Jarvis 的 daemon 日志会显示 MCP 连接信息：

```
[MCP] Connected to todo-app: 4 tools, 0 resources, 0 prompts
[MCP] Failed to auto-connect my-server: connect ECONNREFUSED
```

---

## 附录：Jarvis MCP 配置完整结构

这是 Jarvis 内部存储的完整 MCP 服务器配置格式。你的服务器无需关心这些，但理解它有助于调试：

```typescript
interface MCPServerConfig {
  id: string;                    // 唯一标识
  name: string;                  // 显示名称
  transport: 'http' | 'stdio' | 'sse';
  url?: string;                  // HTTP/SSE 传输的 URL
  command?: string;              // stdio 传输的命令
  args?: string[];               // stdio 传输的命令参数
  env?: Record<string, string>;  // stdio 传输的环境变量
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'oauth';
    tokenRef?: string;
    username?: string;
    passwordRef?: string;
  };
  enabled: boolean;
  permissions: {
    read: boolean;
    write: boolean;
    delete: boolean;
    bulkWrite: boolean;
  };
  riskPolicy: {
    low: 'auto' | 'notify' | 'confirm';
    medium: 'auto' | 'notify' | 'confirm';
    high: 'auto' | 'notify' | 'confirm';
    critical: 'auto' | 'notify' | 'confirm' | 'deny';
  };
}
```

> **配置持久化位置**: `~/.jarvis/config/mcp-servers.json`
