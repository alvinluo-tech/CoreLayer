# CoreLayer MCP Adapter Skill

Guide an AI coding agent through adapting an existing project into a CoreLayer-compatible MCP App.

## What This Skill Does

CoreLayer (powered by Jarvis) is an MCP-first desktop AI control layer. External apps expose their capabilities via MCP servers; CoreLayer discovers, connects, and orchestrates them. This skill teaches an AI agent how to add an MCP server to any existing project so Jarvis can control it.

## Core Principle

**Do NOT modify CoreLayer to understand your app. Make your app describe itself via MCP.**

Wrong:

```
Add a REST adapter for MyProject inside CoreLayer
Write MyProject tool definitions in CoreLayer's adapter directory
```

Correct:

```
Add an MCP server to MyProject
Let MyProject expose its own tools, resources, and prompts
CoreLayer connects and discovers at runtime
```

---

## Step 1: Choose Your MCP Transport

| Transport         | When to Use                                     |
| ----------------- | ----------------------------------------------- |
| `streamable-http` | Production apps with HTTP servers (recommended) |
| `sse`             | Legacy MCP servers, browser-compatible          |
| `stdio`           | CLI tools, local daemons                        |

For most web apps (Next.js, Hono, Express), use `streamable-http` or `sse`.

---

## Step 2: Create the MCP Server

Install the MCP SDK:

```bash
npm install @modelcontextprotocol/sdk
```

Create `mcp/server.ts` in your project:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const server = new McpServer({
  name: 'your-app-name',
  version: '1.0.0',
});

// Register tools (see Step 3)
registerTools(server);

// Start transport
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
await server.connect(transport);
```

---

## Step 3: Design AI-Friendly Tools

Tools should be **domain actions**, not REST API translations.

### Wrong: Mechanical REST Translation

```
GET /api/media       → media_get
POST /api/media      → media_create
PATCH /api/media/:id → media_update
DELETE /api/media/:id → media_delete
```

### Correct: AI-Friendly Domain Actions

```
media.get_current      — What am I currently consuming?
media.search           — Find something in my library
media.update_progress  — I read 20 more pages
media.add_note         — Save a reflection
media.get_stats        — Show my consumption stats
media.recommend_next   — What should I consume next?
```

### Naming Convention

```
{domain}.{action}
```

Examples:

```
task.get_today
task.complete
task.reschedule

workout.log
workout.get_weekly_stats

project.get_active
project.create_issue

media.get_current
media.update_progress
```

The app identity comes from the MCP server ID, NOT the tool name. Do NOT prefix with the app name:

```
❌ veridia_get_current
❌ flexilog_log_workout
✅ media.get_current
✅ workout.log
```

---

## Step 4: Add Annotations

MCP tool annotations tell CoreLayer how to handle each tool.

```typescript
server.tool(
  'media.update_progress',
  'Update reading/watching progress for a media item',
  {
    user_media_id: z.string().describe('Media item ID'),
    progress_current: z.number().describe('Current progress value'),
    progress_total: z.number().optional().describe('Total (pages, episodes)'),
  },
  async (args) => {
    // ... implementation
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  }
);
```

### Annotation Reference

| Annotation        | Type    | Effect in CoreLayer              |
| ----------------- | ------- | -------------------------------- |
| `readOnlyHint`    | boolean | `true` → risk defaults to `low`  |
| `destructiveHint` | boolean | `true` → risk defaults to `high` |
| `idempotentHint`  | boolean | `true` → safe to retry           |

### CoreLayer Extensions (via `_meta`)

For fine-grained control, add CoreLayer-specific metadata:

```typescript
server.tool(
  'admin.purge_data',
  'Permanently delete all data',
  {},
  async () => {
    /* ... */
  },
  {
    annotations: {
      destructiveHint: true,
    },
    _meta: {
      corelayer: {
        risk: 'critical',
        category: 'system',
        displayMode: 'confirm',
        permission: 'admin.write',
      },
    },
  }
);
```

| Field         | Values                                                           | Default             |
| ------------- | ---------------------------------------------------------------- | ------------------- |
| `risk`        | `low`, `medium`, `high`, `critical`                              | Inferred from hints |
| `category`    | `productivity`, `media`, `data`, `system`, `automation`, `other` | `other`             |
| `displayMode` | `inline`, `card`, `silent`, `confirm`                            | `card`              |
| `permission`  | e.g. `media.read`, `task.write`                                  | None                |

---

## Step 5: Implement Required Tools

Every CoreLayer-compatible MCP server MUST expose:

```typescript
// Health check
server.tool('app.health', 'Check if the app is healthy', {}, async () => {
  return { content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }) }] };
});

// Current state summary
server.tool('app.get_current_state', 'Get the current state of the app', {}, async () => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          /* ... */
        }),
      },
    ],
  };
});
```

### Recommended Tools

```typescript
app.get_stats; // Aggregate statistics
app.search; // Full-text search across domain
app.get_recent_activity; // Recent changes/events
app.summarize; // AI-friendly summary of state
```

---

## Step 6: Implement Resources (Optional)

Resources let CoreLayer read app state without calling a tool.

```typescript
server.resource('config', 'config://app', async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: JSON.stringify({ appName: 'MyApp', version: '1.0' }),
    },
  ],
}));
```

---

## Step 7: Read-First, Write-Second

When adapting an existing project, implement tools in this order:

### Batch 1: Read-Only (No Side Effects)

```
app.health
app.get_current_state
app.get_stats
app.search
{domain}.get_*
```

### Batch 2: Writes (Low Impact)

```
{domain}.create
{domain}.update_progress
{domain}.add_note
{domain}.log
```

### Batch 3: Destructive (High Risk)

```
{domain}.delete
{domain}.bulk_delete
{domain}.reset
{domain}.clear_all
```

**Do NOT expose** unless absolutely necessary:

```
system_command
send_email
payment
```

---

## Step 8: Connect from CoreLayer

Once your MCP server is running, connect from CoreLayer:

```bash
# Via the Control Center UI
# Settings → MCP Apps → Add Server

# Or via the API
curl -X POST http://localhost:3456/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-app",
    "name": "My App",
    "transport": "http",
    "url": "http://localhost:3000/mcp",
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

CoreLayer will automatically:

1. Connect to your MCP server
2. Discover all tools, resources, and prompts
3. Read annotations to determine risk levels
4. Register tools in the unified ToolRegistry
5. Route all executions through PermissionGuard + audit log

---

## Adaptation Checklist

### Before You Start

- [ ] Identify the app's domain (what does it manage?)
- [ ] List the actions Jarvis would want to perform
- [ ] Categorize: read-only vs write vs destructive

### Implementation

- [ ] Install `@modelcontextprotocol/sdk`
- [ ] Create MCP server file
- [ ] Implement `app.health` and `app.get_current_state`
- [ ] Implement read-only tools (Batch 1)
- [ ] Add annotations to all tools
- [ ] Test with MCP Inspector (`npx @modelcontextprotocol/inspector`)

### Integration

- [ ] Start the MCP server
- [ ] Connect from CoreLayer (Control Center or API)
- [ ] Verify tools appear in CoreLayer's Tools page
- [ ] Test each tool via Jarvis chat
- [ ] Verify permission policy works (low=auto, high=confirm)

### Production

- [ ] Implement write tools (Batch 2)
- [ ] Add error handling to all tools
- [ ] Set appropriate timeouts
- [ ] Document tool descriptions for Jarvis's system prompt
- [ ] (Optional) Implement resources and prompts

---

## Example: Adapting a Next.js App

```typescript
// app/mcp/route.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'my-nextjs-app', version: '1.0.0' });

server.tool('app.health', 'Health check', {}, async () => ({
  content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }) }],
}));

server.tool(
  'tasks.get_today',
  "Get today's tasks",
  {},
  async () => {
    const tasks = await db.query('SELECT * FROM tasks WHERE due_date = today()');
    return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
  },
  { annotations: { readOnlyHint: true } }
);

server.tool(
  'tasks.complete',
  'Mark a task as completed',
  { task_id: z.string() },
  async ({ task_id }) => {
    await db.query("UPDATE tasks SET status = 'done' WHERE id = ?", [task_id]);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  },
  { annotations: { readOnlyHint: false, idempotentHint: true } }
);

export async function POST(request: Request) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}
```

---

## Common Mistakes

1. **Translating REST 1:1** — Don't map GET/POST/PATCH/DELETE to tools. Map user intents.

2. **Missing annotations** — Without `readOnlyHint`/`destructiveHint`, CoreLayer defaults all tools to `medium` risk.

3. **No `app.health`** — CoreLayer uses this to monitor connection status.

4. **Exposing raw DB operations** — Tools should be domain actions, not SQL wrappers.

5. **Forgetting error handling** — Always return `{ isError: true, content: [...] }` on failure.

6. **Hardcoded secrets in tools** — Use environment variables, never pass API keys as tool arguments.
