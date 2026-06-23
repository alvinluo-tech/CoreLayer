# Claude Code Behavior Research

Date: 2026-06-23
Session: 5 (Behavior Research)
Claude Code Version: 2.1.152

## Confirmed Behavior

### `--output-format stream-json`

Requires `--verbose` flag when used with `--print`.

Event types observed in stream:
- `{"type":"system","subtype":"init",...}` — initialization with session_id, tools, model, mcp_servers, permissionMode, etc.
- `{"type":"assistant","message":{...}}` — assistant messages (may contain `thinking` and `text` content blocks)
- `{"type":"result","subtype":"success","is_error":false,...}` — final result with duration, cost, usage, stop_reason

Key fields in `result` event:
- `subtype`: "success" or "error"
- `is_error`: boolean
- `duration_ms`: total wall-clock time
- `duration_api_ms`: API call time
- `ttft_ms`: time to first token
- `num_turns`: conversation turns
- `result`: string output
- `stop_reason`: "end_turn" or other
- `session_id`: UUID
- `total_cost_usd`: cost
- `usage`: detailed token usage
- `modelUsage`: per-model breakdown
- `permission_denials`: array of denied permissions
- `terminal_reason`: "completed" or other

### `--permission-mode`

Available modes: `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`

- `default`: prompts for dangerous operations
- `auto`: auto-approves low-risk, prompts for high-risk
- `bypassPermissions` / `dangerously-skip-permissions`: skips all checks
- `plan`: planning mode, read-only

### `--settings`

Accepts a file path or inline JSON string. Loaded as session-local settings.

### `--mcp-config`

Accepts space-separated JSON file paths or inline JSON strings.

### `--strict-mcp-config`

When set, only uses MCP servers from `--mcp-config`, ignoring all other MCP configurations (project, user, etc.).

### `--no-session-persistence`

Disables session save to disk. Sessions cannot be resumed. Only works with `--print`.

### `--worktree`

Creates a new git worktree for the session. Optional name parameter.

### Discovery

`claude --version` returns version string: `2.1.152 (Claude Code)`

Exit codes (observed):
- `0`: success
- Non-zero: various failures (auth, timeout, etc.)

### Permission Blocked Behavior

When a permission is blocked in `default` mode:
- The assistant message contains a tool_use that requires approval
- The stream includes the tool call but does not auto-execute
- The `permission_denials` array in the result tracks denials

## Assumptions (Not Yet Verified)

- `--permission-mode plan` behavior in detail
- Exact exit codes for specific failure modes
- `--allowedTools` and `--disallowedTools` behavior
- `--max-budget-usd` enforcement
- `--json-schema` structured output behavior
- Hook system interaction with non-interactive mode
