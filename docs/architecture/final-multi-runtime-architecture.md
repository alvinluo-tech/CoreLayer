# Jarvis Final Multi-Runtime Architecture

> This document records the long-term runtime architecture for Jarvis. The current single TypeScript daemon sidecar is a transition stage, not the final architecture.
>
> Current gap analysis: see `docs/architecture/2026-06-07-runtime-decomposition-audit.md`.
> Target directory structure: see `docs/architecture/final-directory-structure-design.md`.

## Core Position

Jarvis should evolve toward a desktop-native Agent OS with a Rust/Tauri Core supervising multiple managed runtimes.

The long-term architecture remains:

```text
React Workspace UI
  -> Rust/Tauri Core
    -> ProcessSupervisor
    -> RuntimeRegistry
    -> PermissionBroker
    -> OSCapabilityBroker
    -> SecretStore
    -> UpdateManager
    -> EventLog / AuditLog
    -> AppDataManager
    -> RuntimeProtocol

  -> Managed Runtimes
    -> agent-runtime
    -> tool-runtime
    -> coding-runtime
    -> voice-runtime
    -> memory-runtime
    -> scheduler-runtime
    -> computer-control-runtime
```

Phase 1 intentionally packages one TypeScript daemon sidecar so installed builds work without asking users to start a backend manually. That does not mean the final system should remain one large daemon.

The correct path is:

```text
Phase 1: one managed TypeScript daemon sidecar for installable runtime startup
Phase 2: Rust Core owns supervisor, permissions, logs, secrets, paths, and update lifecycle
Phase 3: daemon internals stabilize around explicit module boundaries and runtime contracts
Phase 4: split mature modules into managed runtimes when isolation or lifecycle control is valuable
Phase 5: runtime protocol, plugin sandbox, marketplace, and third-party runtime ecosystem
```

## Responsibility Boundaries

### React Workspace UI

React is the workspace surface. It should own interaction, visualization, and user workflows.

React may:

- Render conversations, projects, tasks, approvals, memory, logs, and runtime status.
- Call Tauri IPC commands and daemon APIs through stable client adapters.
- Show runtime health, pending approvals, update state, and audit history.

React must not:

- Spawn runtimes.
- Choose runtime ports.
- Read or write app data paths directly.
- Execute shell commands.
- Directly grant file system, browser, computer-control, or secret access.

### Rust/Tauri Core

Rust/Tauri Core is the local operating layer. It should own the host-level powers that make Jarvis safe and installable.

Rust Core owns:

- Process lifecycle and runtime supervision.
- Runtime registry and protocol negotiation.
- Dynamic port allocation and local transport setup.
- App data, config, cache, and log paths.
- Secret storage.
- Automatic updates, version checks, migrations, rollback, and restart orchestration.
- Permission broker and capability policy.
- OS capability execution boundaries.
- Event log and audit log emission.
- Packaged app integration, signing, and updater support.

Rust Core should not absorb all agent business logic. Agent behavior, LLM orchestration, memory policy, tool routing, and workflow iteration can remain in TypeScript runtimes while they are changing quickly.

### Managed Runtimes

Managed runtimes are isolated engines supervised by Rust Core. Most can start as TypeScript.

Recommended initial language split:

| Runtime | Initial implementation | Responsibility |
| --- | --- | --- |
| `agent-runtime` | TypeScript | Planner, orchestrator, agent runs, model gateway, task loop |
| `tool-runtime` | TypeScript | Tool registry, MCP bridge, file/shell/browser/git/computer tools as brokered requests |
| `coding-runtime` | TypeScript | Codex/Claude/OpenClaw-style coding agents, worktrees, patches, PR workflows |
| `voice-runtime` | TypeScript first | Realtime voice sessions, transcription, TTS, turn-taking |
| `memory-runtime` | TypeScript first | Procedural, episodic, semantic memory, indexing, retrieval |
| `scheduler-runtime` | TypeScript first | Timers, cron, event-triggered autonomous runs |
| `computer-control-runtime` | TypeScript first with native adapters as needed | Screen, window, input, screenshot, automation requests |

Runtimes request capabilities. They do not own raw OS authority.

## Capability Model

The central security rule is:

```text
Agents do not directly own computer permissions.
Agents request capabilities.
Jarvis Core decides whether to allow them.
Tool/OS adapters execute only after approval or policy allow.
Every meaningful action is auditable.
```

No agent, plugin, MCP tool, or runtime should freely call:

```text
fs.readFile
fs.writeFile
child_process.exec
screen capture APIs
window control APIs
secret reads
network publishing actions
git push / PR creation
installer / updater mutation
```

Instead, every dangerous action should follow this pattern:

```text
Runtime
  -> capability request
  -> PermissionBroker policy check
  -> user approval or remembered scoped policy
  -> OSCapabilityBroker execution
  -> EventLog / AuditLog
  -> result returned to runtime
```

The broker must know:

- Actor: user, agent, runtime, plugin, MCP server.
- Intent: why the action is requested.
- Capability: file read, file write, shell exec, browser control, computer control, secret read, git push, update install.
- Resource: path, command, URL, window, repository, secret key.
- Scope: workspace, project, task, run, directory, domain, command allowlist.
- Risk level: low, medium, high, critical.
- Approval state: allow, deny, pending, expired.

## File Access

File reads and writes are core agent abilities, but they must be scoped.

Read flow:

```text
Agent wants to read a file
  -> tool-runtime requests file.read(path, reason, runId)
  -> PermissionBroker checks workspace/project/path scope
  -> if needed, user approves
  -> OS adapter reads file
  -> AuditLog records path, actor, runId, reason, byte count
  -> content returns to agent
```

Write flow:

```text
Agent wants to write a file
  -> agent produces patch/diff or structured write request
  -> tool-runtime requests file.write(path, diff, reason, runId)
  -> PermissionBroker checks scope and risk
  -> user or policy approves
  -> OS adapter applies write
  -> artifact is recorded
  -> AuditLog records path, actor, runId, reason, changed lines/hash
```

Preferred write behavior:

- Generate diffs before mutation when practical.
- Show user-facing approvals for high-impact writes.
- Preserve artifacts for review and rollback.
- Scope remembered approvals to a directory, project, task, or command, never globally by default.

## Shell and Git Access

Shell execution is critical risk. It should be deny-by-default outside a narrow allowlist and approval flow.

Coding agents need shell and git, but through controlled execution:

```text
coding-runtime
  -> request shell.exec("pnpm test", cwd, runId)
  -> PermissionBroker checks command, cwd, project, risk
  -> OSCapabilityBroker executes
  -> stdout/stderr are streamed and logged
  -> result is attached to AgentRun
```

Git operations should be split by risk:

| Operation | Risk | Expected behavior |
| --- | --- | --- |
| `git status`, `git diff`, `git log` | low | Allow inside workspace, log action |
| `git add`, local commit | medium | Allow by scoped policy or approval |
| `git worktree add/remove` | medium/high | Brokered and audited |
| `git push`, PR creation, release tags | high/critical | Explicit approval required |

## Computer Control

Computer control is a first-class runtime but must not be an unrestricted agent power.

Supported capabilities may include:

- Screenshot.
- Window discovery.
- Window focus.
- Mouse movement and click.
- Keyboard input.
- File picker control.
- Browser automation.
- Clipboard access.

All computer control should go through:

```text
agent-runtime
  -> computer-control-runtime request
  -> PermissionBroker
  -> user approval / scoped policy
  -> native OS adapter
  -> EventLog / AuditLog
```

Risk examples:

| Capability | Default risk | Notes |
| --- | --- | --- |
| Screenshot current app | medium | May expose private data |
| Screenshot full screen | high | Requires explicit scope |
| Window focus | medium | Can disrupt user workflow |
| Mouse/keyboard input | high | Must be visible and revocable |
| Clipboard read | high | Often contains secrets |
| Clipboard write | medium | Must be logged |
| File picker selection | high | Equivalent to file grant |

The user must be able to pause or revoke computer-control permissions quickly.

## Automatic Updates

Automatic update belongs in Rust/Tauri Core, not an agent runtime.

UpdateManager owns:

- Version checks.
- Signature verification.
- Download lifecycle.
- Update staging.
- Runtime compatibility checks.
- Data migrations.
- Restart orchestration.
- Rollback policy.
- User-visible update status.

Runtimes may expose:

- Current runtime version.
- Supported runtime protocol version.
- Migration requirements.
- Compatibility warnings.

Runtimes must not replace application binaries, mutate updater config, or bypass signature checks.

## Runtime Protocol

Each runtime should expose a small explicit protocol instead of leaking internal APIs.

Minimum shape:

```text
GET /health
GET /runtime/status
GET /runtime/capabilities
POST /runtime/start-run
POST /runtime/cancel-run
GET /runtime/events
POST /runtime/shutdown
```

Core should track:

- Runtime id.
- Runtime kind.
- Version.
- Protocol version.
- Process id.
- Health state.
- Port or IPC channel.
- Log path.
- App data path.
- Restart count.
- Last error.

## Observability

Every runtime should produce:

- Structured events for product state.
- Audit records for authority-bearing actions.
- Log files for debugging startup/runtime failures.
- AgentRun artifacts for user-visible work.

Distinguish logs:

| Record type | Purpose |
| --- | --- |
| Runtime log | Debugging process failures |
| Event log | Product timeline and state changes |
| Audit log | Security-relevant decisions and actions |
| Artifact | User-reviewable output of an agent run |

## Design Rules for Future Agents

Any future OpenClaw-like, Codex-like, Claude-like, or third-party agent integration must follow these rules:

1. Agent runtimes are untrusted by default.
2. Agents request capabilities; they do not own OS permissions.
3. File, shell, browser, computer-control, git, secret, and update operations are brokered.
4. High-risk actions require explicit approval unless a narrow remembered policy exists.
5. All side effects are logged with actor, run id, reason, resource, and result.
6. Runtime crashes should not corrupt app state.
7. Runtime updates must be compatible with Core protocol versions.
8. The single daemon may host several modules temporarily, but module boundaries should match the future runtime split.

## Current Implementation Implication

Near-term work should avoid adding more authority directly into the TypeScript daemon. When a module needs a dangerous capability, implement the request/approval/audit path first.

The most important cleanup before expanding multi-runtime is:

- Make approval truly blocking for high-risk tools.
- Route tool execution, worktree operations, shell execution, and computer-control operations through one capability broker.
- Persist runtime runs, artifacts, approvals, events, and logs with stable IDs.
- Keep Phase 1 sidecar packaging as the installable foundation, but do not treat it as the final runtime topology.
