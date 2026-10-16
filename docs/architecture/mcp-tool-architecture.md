# Jarvis MCP 工具架构文档

> 本文档完整描述 Jarvis 项目的 MCP (Model Context Protocol) 工具系统架构，包括外部工具接入方式、工具注册机制、执行流程、类型系统和配置管理。用于架构评审。

---

## 1. 架构总览

Jarvis 的工具系统采用**统一注册表 + 多源适配器**模式。四种不同来源的工具最终汇聚到同一个 `ToolRegistry`，由 AI 模型在对话中统一调用：

```
┌─────────────────────────────────────────────────────────┐
│                    AI Model (Vercel AI SDK)              │
│              generateText() / streamText()               │
│                    getAllTools() ↓                        │
├─────────────────────────────────────────────────────────┤
│                   ToolRegistry (Map<id, JarvisTool>)     │
├──────────┬──────────┬──────────┬────────────────────────┤
│  native  │   rest   │   mcp    │         skill          │
│ (内置工具) │(REST适配) │(MCP协议) │      (工作流技能)       │
├──────────┤──────────┤──────────┤                        │
│ reading  │ Veridia  │ 外部MCP   │                        │
│ todo     │ TaskFlow │ Server   │                        │
│ review   │ FlexiLog │          │                        │
└──────────┴──────────┴──────────┴────────────────────────┘
```

### 四种工具来源 (`ToolSource`)

| 来源 | ID 格式 | 说明 |
|------|---------|------|
| `native` | `native:{name}` | Jarvis 内置工具（reading/todo/review），直接操作 SQLite 仓库 |
| `rest` | `rest:{appId}:{toolName}` | REST API 适配器，将外部 HTTP API 包装为工具 |
| `mcp` | `mcp:{serverId}:{toolName}` | 标准 MCP 协议连接的外部服务器 |
| `skill` | `skill:{name}` | 工作流/技能系统（预留） |

---

## 2. 核心类型系统

### 2.1 JarvisTool — 统一工具接口

```typescript
// packages/types/src/tool.ts
interface JarvisTool {
  id: string;                    // 全局唯一 ID，格式: {source}:{appId}:{name}
  appId: string;                 // 所属应用/服务标识
  source: ToolSource;            // "mcp" | "native" | "skill" | "rest"
  name: string;                  // 工具名称
  title: string;                 // 显示标题
  description: string;           // 工具描述（AI 用于理解工具用途）
  inputSchema: JSONSchema;       // JSON Schema 格式的输入参数定义
  outputSchema?: JSONSchema;     // 可选的输出 schema
  risk: RiskLevel;               // "low" | "medium" | "high" | "critical"
  permissions: string[];         // 所需权限列表
  requiresConfirmation: boolean; // high/critical 风险自动设为 true
  execute: (args: unknown) => Promise<ToolResult>;  // 执行函数
  timeoutMs?: number;
  idempotent?: boolean;
  cancellable?: boolean;
  category?: ToolCategory;
  displayMode?: ToolDisplayMode;
}
```

### 2.2 ToolResult — 统一返回格式

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;                // 成功时的数据
  error?: string;                // 失败时的错误信息
  metadata?: Record<string, unknown>;
}
```

### 2.3 JSONSchema — 输入参数定义

```typescript
interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;       // 兼容标准 JSON Schema 扩展字段
}
```

---

## 3. ToolRegistry — 工具注册表

### 3.1 包级注册表 (`packages/tool-registry/src/registry.ts`)

```typescript
class ToolRegistry {
  private tools: Map<string, JarvisTool>;

  // 注册
  registerTool(tool: JarvisTool): void;
  registerTools(tools: JarvisTool[]): void;

  // 注销
  unregisterTool(toolId: string): boolean;
  unregisterBySource(source: ToolSource): number;  // 按来源批量注销

  // 查询
  getTool(toolId: string): JarvisTool | undefined;
  getAllTools(): JarvisTool[];
  filterTools(filter: ToolFilter): JarvisTool[];   // 支持 appId/source/risk/category/search
  getToolsByApp(appId: string): JarvisTool[];
  getToolsBySource(source: ToolSource): JarvisTool[];

  // MCP 桥接（关键方法）
  static fromMCPTools(
    serverId: string,
    mcpTools: MCPToolDefinition[],
    callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<MCPToolCallResult>,
  ): JarvisTool[];
}
```

### 3.2 Daemon 级包装器 (`daemon/src/tools/registry.ts`)

在包级注册表之上提供向后兼容的 API：

```typescript
// 将 Vercel AI SDK 的 Tool 格式包装为 JarvisTool（source: "native"）
function registerTool(name: string, toolDef: Tool): void;

// 直接注册 JarvisTool（适配器使用）
function registerJarvisTool(tool: JarvisTool): void;

// 返回 Vercel AI SDK 兼容的 Record<string, Tool>（供 generateText/streamText 使用）
function getAllTools(): Record<string, Tool>;

// 底层访问
function getRegistry(): ToolRegistry;
```

---

## 4. REST API 适配器系统

### 4.1 设计目标

将任意 REST API 声明式地转换为 Jarvis 可调用的工具，无需编写 HTTP 调用逻辑。

### 4.2 核心接口

```typescript
// daemon/src/mcp/adapters/types.ts

interface AppConfig {
  appId: string;           // 唯一应用标识
  name: string;            // 人类可读名称
  baseUrl: string;         // API 基础 URL
  authToken?: string;      // Bearer token（可选）
}

interface AdapterToolDef {
  name: string;            // 工具名（适配器内唯一）
  title: string;           // 显示标题
  description: string;     // 描述（AI 用来理解何时调用）
  risk: RiskLevel;         // 风险等级
  method: HTTPMethod;      // GET | POST | PUT | PATCH | DELETE
  path: string;            // 相对路径，支持 :param 路径参数
  inputSchema: JSONSchema; // 输入参数 JSON Schema
  responseTransform?: (data: unknown) => unknown;  // 可选的响应转换
}
```

### 4.3 注册流程 (`base.ts`)

```
registerAdapterTools(config, toolDefs)
  └─ for each toolDef:
       ├─ createAdapterTool(config, toolDef)
       │    ├─ id: "rest:{config.appId}:{toolDef.name}"
       │    ├─ source: "rest"
       │    ├─ execute(args) → callRestApi(config, toolDef, args)
       │    └─ requiresConfirmation: risk === "high" || "critical"
       └─ registerJarvisTool(tool)  → 写入全局 ToolRegistry
```

### 4.4 HTTP 调用逻辑 (`callRestApi`)

```typescript
async function callRestApi(config, toolDef, args) {
  const params = { ...args };           // 浅拷贝，避免修改冻结对象
  let path = toolDef.path;

  // 1. 路径参数替换（仅替换 path 部分，不影响 baseUrl 中的端口号）
  path = path.replace(/:(\w+)/g, (match, key) => {
    const value = params[key];
    delete params[key];                  // 已消费的参数从 args 中移除
    return String(value ?? "");
  });

  let url = `${config.baseUrl}${path}`;

  // 2. 请求头
  const headers = { "Content-Type": "application/json" };
  if (config.authToken) headers["Authorization"] = `Bearer ${config.authToken}`;

  // 3. 请求体/查询参数
  if (method !== "GET" && hasParams) {
    fetchOptions.body = JSON.stringify(params);      // POST/PUT/PATCH → JSON body
  } else if (method === "GET" && hasParams) {
    url += "?" + new URLSearchParams(...);            // GET → query string
  }

  // 4. 发起请求
  const response = await fetch(url, fetchOptions);
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}
```

### 4.5 现有适配器

#### Veridia（媒体追踪）— 6 个工具

| 工具名 | 方法 | 路径 | 风险 | 说明 |
|--------|------|------|------|------|
| `veridia_get_current` | GET | `/api/jarvis/current` | low | 获取当前进行中的媒体 |
| `veridia_get_stats` | GET | `/api/jarvis/stats` | low | 获取消费统计 |
| `veridia_add_media` | POST | `/api/jarvis/add` | medium | 添加新媒体 |
| `veridia_update_status` | POST | `/api/jarvis/status` | medium | 更新媒体状态 |
| `veridia_update_progress` | POST | `/api/jarvis/progress` | medium | 更新阅读/观看进度 |
| `veridia_add_note` | POST | `/api/jarvis/note` | medium | 添加笔记 |

**激活条件**: 环境变量 `VERIDIA_BASE_URL` 存在（可选 `VERIDIA_AUTH_TOKEN`）

#### FlexiLog（健身追踪）— 4 个工具

| 工具名 | 方法 | 路径 | 风险 | 说明 |
|--------|------|------|------|------|
| `flexilog_log_workout` | POST | `/api/workouts` | medium | 记录锻炼 |
| `flexilog_get_history` | GET | `/api/workouts` | low | 获取锻炼历史 |
| `flexilog_get_exercises` | GET | `/api/exercises` | low | 获取可用动作 |
| `flexilog_get_analytics` | GET | `/api/analytics` | low | 获取健身分析 |

**激活条件**: 环境变量 `FLEXILOG_BASE_URL` 存在（可选 `FLEXILOG_AUTH_TOKEN`）

#### TaskFlow（任务管理）— 2 个工具

| 工具名 | 方法 | 风险 | 说明 |
|--------|------|------|------|
| `taskflow_list_tasks` | - | low | 列出任务（支持 status/priority 过滤） |
| `taskflow_create_task` | - | medium | 创建任务 |

**特殊性**: TaskFlow **不调用外部 REST API**，直接操作 Jarvis 内部的 `getRepositories().tasks`。它用 `rest` source 注册是为了让 MCP 客户端可以发现和调用 Jarvis 的任务管理能力。

---

## 5. MCP 协议客户端

### 5.1 MCPClientManager (`packages/mcp-client/src/manager.ts`)

使用 `@modelcontextprotocol/sdk` 实现标准 MCP 协议：

```typescript
class MCPClientManager {
  // 连接管理
  connectServer(config: MCPServerConfig): Promise<MCPConnection>;
  disconnectServer(serverId: string): Promise<void>;
  disconnectAll(): Promise<void>;

  // 能力发现
  discoverCapabilities(connection: MCPConnection): Promise<void>;
  // → 调用 listTools(), listResources(), listPrompts()

  // 工具调用
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;

  // 资源/提示
  readResource(serverId: string, uri: string): Promise<...>;
  getPrompt(serverId: string, promptName: string, args: Record<string, unknown>): Promise<...>;
}
```

### 5.2 Daemon MCP 编排 (`daemon/src/mcp/client.ts`)

```typescript
// 连接 MCP 服务器并注册工具到全局注册表
async function connectMCPServer(config: MCPServerConfig): Promise<void> {
  const manager = getMCPManager();
  const connection = await manager.connectServer(config);

  // 关键桥接：MCP 工具定义 → JarvisTool
  const mcpTools = ToolRegistry.fromMCPTools(
    config.id,
    connection.tools,
    (serverId, toolName, args) => manager.callTool(serverId, toolName, args),
  );

  // 注入全局注册表
  const toolRegistry = getRegistry();
  toolRegistry.registerTools(mcpTools);
}

// 断开时清理
async function disconnectMCPServer(serverId: string): Promise<void> {
  // 从注册表中移除该服务器的所有工具
  const tools = toolRegistry.getToolsBySource("mcp");
  for (const tool of tools) {
    if (tool.appId === serverId) toolRegistry.unregisterTool(tool.id);
  }
  await manager.disconnectServer(serverId);
}
```

### 5.3 MCP → JarvisTool 转换 (`ToolRegistry.fromMCPTools`)

```typescript
static fromMCPTools(serverId, mcpTools, callTool): JarvisTool[] {
  return mcpTools.map(t => ({
    id: `mcp:${serverId}:${t.name}`,
    appId: serverId,
    source: "mcp",
    name: t.name,
    title: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema ?? { type: "object" },
    risk: "medium",           // MCP 工具默认 medium 风险
    requiresConfirmation: false,
    timeoutMs: 30000,
    execute: async (args) => {
      const result = await callTool(serverId, t.name, args);
      if (result.isError) return { success: false, error: ... };
      return { success: true, data: ... };
    },
  }));
}
```

---

## 6. 内置工具（Native Tools）

### 6.1 Reading 工具 — 5 个

| 工具 | 仓库方法 | 说明 |
|------|---------|------|
| `addArticle` | `repos.articles.create` | 添加文章 |
| `getReadingList` | `repos.articles.list` | 获取阅读列表 |
| `updateReadingStatus` | `repos.articles.update` | 更新阅读状态 |
| `getReadingStats` | `repos.articles.stats` | 获取阅读统计 |
| `recommendNext` | `repos.articles.recommend` | 推荐下一篇 |

### 6.2 Todo 工具 — 5 个

| 工具 | 仓库方法 | 说明 |
|------|---------|------|
| `createTask` | `repos.tasks.create` | 创建任务 |
| `getTodayTasks` | `repos.tasks.getToday` | 获取今日任务 |
| `queryTasks` | `repos.tasks.query` | 查询任务 |
| `updateTask` | `repos.tasks.update` | 更新任务 |
| `deleteTask` | `repos.tasks.delete` | 删除任务 |

### 6.3 Review 工具 — 4 个

| 工具 | 仓库方法 | 说明 |
|------|---------|------|
| `getDailySummary` | `repos.reviews.getDailySummary` | 获取每日总结 |
| `getWeeklyStats` | `repos.reviews.getWeeklyStats` | 获取每周统计 |
| `saveReview` | `repos.reviews.save` | 保存复盘 |
| `getReviewHistory` | `repos.reviews.getHistory` | 获取复盘历史 |

---

## 7. 启动流程

`daemon/src/index.ts` 中的工具注册顺序：

```
1. initializeRepositories()          // 初始化 SQLite/Supabase 仓库
2. registerTodoTools()               // native: 5 个任务工具
3. registerReadingTools()            // native: 5 个阅读工具
4. registerReviewTools()             // native: 4 个复盘工具
5. registerAllAdapters()             // rest: Veridia(6) + TaskFlow(2) + FlexiLog(4)
6. 创建 Hono HTTP 服务器
   └─ /api/chat 中调用 getAllTools()  // 所有工具传给 AI SDK
```

---

## 8. AI 调用流程

```
用户消息 → /api/chat
  → conversation.ts: getAllTools()        // 从注册表获取所有工具
  → generateText({ tools, ... })         // Vercel AI SDK
  → AI 模型决定调用某个工具
  → tool.execute(args)                   // 统一执行接口
  → ToolResult { success, data/error }   // 统一返回格式
  → AI 模型基于结果生成回复
```

---

## 9. 前端管理

### 9.1 MCP Store (`frontend/src/stores/mcpStore.ts`)

```typescript
interface MCPStore {
  servers: MCPServerInfo[];      // 已连接的 MCP 服务器
  tools: ToolInfo[];             // 所有工具列表
  toolCounts: {
    native: number;
    mcp: number;
    rest: number;
    skill: number;
  };

  fetchServers(): Promise<void>;
  fetchTools(): Promise<void>;
  connectServer(config: MCPServerConfig): Promise<void>;
  disconnectServer(serverId: string): Promise<void>;
}
```

通过 Tauri IPC 调用 daemon 后端 API。

### 9.2 MCP API 路由 (`daemon/src/api/mcp.ts`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mcp/servers` | 列出所有 MCP 服务器 |
| POST | `/api/mcp/servers` | 连接新 MCP 服务器 |
| DELETE | `/api/mcp/servers/:id` | 断开 MCP 服务器 |
| GET | `/api/mcp/tools` | 列出所有 MCP 工具 |
| GET | `/api/mcp/resources` | 列出所有 MCP 资源 |
| POST | `/api/mcp/servers/:id/tools/:name` | 调用指定工具 |
| GET | `/api/mcp/servers/:id/resources/*` | 读取指定资源 |

---

## 10. 外部服务接入指南

### 10.1 接入方式 A：REST API 适配器（推荐用于自有服务）

**适用场景**: 你有一个 HTTP API，想让 Jarvis AI 能调用它。

**步骤**:

1. 在 `daemon/src/mcp/adapters/` 下创建新文件（如 `myservice.ts`）
2. 定义 `AdapterToolDef[]` 数组，描述每个 API 端点
3. 导出注册函数，检查环境变量后调用 `registerAdapterTools()`
4. 在 `index.ts` 的 `registerAllAdapters()` 中添加调用
5. 在 `.env` 中配置 `MYSERVICE_BASE_URL` 和 `MYSERVICE_AUTH_TOKEN`

**示例**:

```typescript
// daemon/src/mcp/adapters/myservice.ts
import { registerAdapterTools } from "./base.js";
import type { AppConfig, AdapterToolDef } from "./types.js";

const tools: AdapterToolDef[] = [
  {
    name: "get_something",
    title: "Get Something",
    description: "获取某些数据",
    risk: "low",
    method: "GET",
    path: "/api/data",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "返回数量" },
      },
    },
  },
  {
    name: "do_action",
    title: "Do Action",
    description: "执行某个操作",
    risk: "medium",
    method: "POST",
    path: "/api/action/:id",    // 支持路径参数
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        payload: { type: "object" },
      },
      required: ["id"],
    },
  },
];

export function registerMyServiceAdapter(): number {
  const baseUrl = process.env["MYSERVICE_BASE_URL"];
  if (!baseUrl) return 0;

  const config: AppConfig = {
    appId: "myservice",
    name: "My Service",
    baseUrl,
    authToken: process.env["MYSERVICE_AUTH_TOKEN"],
  };

  return registerAdapterTools(config, tools);
}
```

**外部服务需要暴露什么**:
- RESTful HTTP API（JSON 格式）
- 可选：Bearer token 认证
- 路径参数用 `:param` 风格（如 `/api/users/:id`）
- 返回 JSON 响应

### 10.2 接入方式 B：MCP Server（推荐用于通用工具服务）

**适用场景**: 你想让 Jarvis 连接到一个标准 MCP 服务器。

**外部服务需要实现**:
- MCP 协议（支持 SSE 或 HTTP 传输）
- `listTools()` 返回工具定义（name + description + inputSchema）
- `callTool(name, args)` 执行工具调用

**连接方式**（通过前端 UI 或 API）:

```typescript
// POST /api/mcp/servers
{
  "id": "my-mcp-server",
  "name": "My MCP Server",
  "transport": "sse",
  "url": "http://localhost:8080/sse",
  "auth": { "type": "bearer", "tokenRef": "my-token" },
  "enabled": true,
  "permissions": { "read": true, "write": true, "delete": false, "bulkWrite": false },
  "riskPolicy": {
    "low": "auto",
    "medium": "notify",
    "high": "confirm",
    "critical": "deny"
  }
}
```

---

## 11. 架构设计待评审问题

以下是供更强 AI 分析的架构问题清单：

### 11.1 类型系统

1. `JarvisTool.execute` 参数类型为 `unknown`，实际使用时都需要 `as Record<string, unknown>` 强制转换。是否应该在类型层面统一处理？
2. `inputSchema` 使用自定义 `JSONSchema` 类型而非标准 JSON Schema 类型库（如 `json-schema-typed`），是否有兼容性风险？
3. `ToolResult.data` 为 `unknown`，下游消费者需要自行类型断言。是否应引入泛型 `ToolResult<T>`？

### 11.2 适配器架构

4. TaskFlow 适配器直接调用内部仓库而非 REST API，却用 `source: "rest"` 注册。是否应该用 `source: "native"` 或新增 `source: "internal"`？
5. 适配器配置（baseUrl, authToken）仅通过环境变量管理，不走 `storage-config.ts` 的持久化配置。是否应该统一？
6. `callRestApi` 中的路径参数正则 `/: (\w+)/g` 只处理简单替换，不支持可选参数或嵌套路由。是否有更好的方案？
7. 适配器没有请求重试、超时配置、速率限制等 HTTP 健壮性机制。是否需要？
8. `responseTransform` 作为函数定义在 `AdapterToolDef` 中，无法序列化。如果未来需要动态注册适配器（从配置文件加载），这个设计是否受限？

### 11.3 注册表设计

9. 全局单例 `ToolRegistry` 通过 `getRegistry()` 访问。在多租户或测试场景下是否需要依赖注入？
10. `unregisterBySource` 按 source 类型批量注销，但如果同一个 source 下有不同的 appId，粒度是否足够？
11. MCP 工具的 `risk` 默认为 `"medium"`，无法从 MCP 协议中获取实际风险等级。是否需要 MCP 服务器在工具定义中携带风险元数据？

### 11.4 MCP 客户端

12. `MCPClientManager` 目前只支持 SSE 传输。stdio 和 http 传输类型在类型定义中存在但未实现。是否需要补全？
13. MCP 连接断开后，注册表中的工具会被清理，但前端 store 的刷新依赖手动调用 `fetchTools()`。是否有自动同步机制？
14. `fromMCPTools` 中 `timeoutMs: 30000` 是硬编码的。是否应从 `MCPServerConfig.riskPolicy` 或工具定义中获取？

### 11.5 安全与权限

15. `requiresConfirmation` 仅基于 `risk` 等级判断（high/critical），但 `riskPolicy` 中定义了更细粒度的策略（auto/notify/confirm/deny）。这两套机制如何协同？
16. REST 适配器的 `authToken` 存储在内存中的 `AppConfig` 对象里。是否有泄露风险（如日志、错误堆栈）？
17. MCP 工具调用时没有做权限检查（`permissions` 字段只定义了需求，没有执行时校验）。是否需要？

### 11.6 错误处理

18. `callRestApi` 在 HTTP 错误时抛出异常，由 `createAdapterTool` 的 try-catch 捕获并转为 `ToolResult.error`。但 MCP 工具的错误处理路径不同（通过 `MCPToolCallResult.isError`）。两种错误格式是否统一？
19. 工具执行失败时，AI 模型看到的是 `error` 字符串。是否需要结构化错误码让 AI 能区分重试/放弃？

### 11.7 扩展性

20. 如果要支持 WebSocket 类型的实时工具（如订阅通知），当前的 `execute(args) → Promise<ToolResult>` 接口是否足够？
21. 工具分组/分类（`category` 字段）目前没有被使用。前端如何展示大量工具的分类？
22. 是否需要工具版本管理？如果适配器升级了工具的 inputSchema，已有的 MCP 客户端缓存是否会出问题？

---

## 12. 文件索引

| 文件 | 职责 |
|------|------|
| `packages/types/src/tool.ts` | 核心工具类型定义 |
| `packages/types/src/mcp.ts` | MCP 协议类型定义 |
| `packages/tool-registry/src/registry.ts` | 通用工具注册表实现 |
| `daemon/src/tools/registry.ts` | Daemon 级注册表包装器 |
| `daemon/src/mcp/adapters/types.ts` | 适配器接口定义 |
| `daemon/src/mcp/adapters/base.ts` | 适配器核心工厂（callRestApi） |
| `daemon/src/mcp/adapters/veridia.ts` | Veridia 适配器 |
| `daemon/src/mcp/adapters/taskflow.ts` | TaskFlow 适配器 |
| `daemon/src/mcp/adapters/flexilog.ts` | FlexiLog 适配器 |
| `daemon/src/mcp/adapters/index.ts` | 适配器注册入口 |
| `daemon/src/mcp/client.ts` | MCP 客户端编排 |
| `packages/mcp-client/src/manager.ts` | MCP 协议客户端实现 |
| `daemon/src/tools/reading/` | Reading 工具（schema + connector） |
| `daemon/src/tools/todo/` | Todo 工具（schema + connector） |
| `daemon/src/tools/review/` | Review 工具（schema + connector） |
| `daemon/src/api/mcp.ts` | MCP HTTP API 路由 |
| `daemon/src/index.ts` | 启动入口（注册所有工具） |
| `frontend/src/stores/mcpStore.ts` | 前端 MCP 状态管理 |
