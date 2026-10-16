# Jarvis Final Directory Structure Design

> Date: 2026-06-07  
> Purpose: define the target directory structure for Jarvis as it evolves from one packaged TypeScript daemon sidecar into a Rust/Tauri Core supervising clear runtime boundaries.  
> Status: architecture target, not a one-shot migration plan.
>
> Execution guide for current old-to-new folder migration: `docs/architecture/2026-06-07-final-runtime-directory-refactor-guide.md`.

## Why This Document Exists

The current repo is in a transition state:

```text
frontend/
daemon/
packages/

daemon/src/runtime/*
daemon/src/runtimes/*
daemon/src/coding-runtime/*
daemon/src/computer-control/*
daemon/src/capability/*
daemon/src/worktree/*
```

The architecture direction is correct, but the directory layout currently mixes old implementation modules, new runtime facades, cross-cutting authority services, and product API routes. That makes future work harder because agents and human contributors cannot easily tell which file is the public boundary and which file is an internal implementation detail.

This document defines the final target organization and migration rules.

## Design Principles

The structure uses three ideas:

1. **Tauri's natural split:** the app has a JavaScript frontend and a Rust `src-tauri` project. Tauri documents this as a normal two-part project: JavaScript/static frontend plus Rust code under `src-tauri/`, with `tauri.conf.json`, `src/lib.rs`, `src/main.rs`, and capability files managed there. Source: Tauri project structure docs.  
   Reference: https://v2.tauri.app/start/project-structure/

2. **Modular monolith before distributed runtimes:** while Jarvis is still one daemon process, each runtime should behave like an independent module with a public facade and private internals. Modular monolith guidance emphasizes independent modules, internal facades, no cross-imports into private domain code, and extracting modules later only when needed.  
   Reference: https://folderstructure.dev/downloads/modular-monolith/default.pdf

3. **Ports and adapters at authority boundaries:** domain/runtime code should not directly depend on databases, shell, OS APIs, HTTP providers, or UI. Ports are interfaces; adapters are concrete implementations. This keeps core behavior testable and infrastructure replaceable.  
   Reference: https://core.cz/en/know-how/architecture-hexagonal-architecture/

For Jarvis, this means:

```text
React UI
  -> calls stable API/IPCs

Rust/Tauri Core
  -> owns local authority: process lifecycle, secrets, updates, OS paths, supervisor status

TypeScript runtime host
  -> hosts in-process runtimes during transition
  -> can later split selected runtimes into separate processes

Runtime modules
  -> own their domain behavior
  -> expose only a public facade
  -> request dangerous capabilities through shared brokers
```

## Target Root Layout

Recommended final root layout:

```text
Jarvis/
  frontend/
    src/
    src-tauri/

  daemon/
    src/
    tests/

  packages/
    runtime-protocol/
    runtime-core/
    capability-protocol/
    shared-types/
    model-gateway/
    mcp-client/
    a2a-client/
    tool-registry/

  scripts/
    build-daemon-sidecar.mjs
    clean-local-artifacts.mjs

  docs/
    architecture/
    planning/
    bugs/
    reviews/

  .github/
  package.json
  pnpm-workspace.yaml
```

Do not move to `apps/frontend` and `apps/daemon` unless the repo later adds more applications. The existing `frontend/` and `daemon/` names are clear enough and avoid churn.

## Target Frontend Layout

The frontend should remain a product UI layer. It should not know daemon internals or runtime implementation details.

```text
frontend/src/
  app/
    App.tsx
    routes.tsx
    providers.tsx

  shell/
    layout/
    navigation/
    inspector/
    command-center/

  features/
    chat/
      components/
      hooks/
      state/
      api.ts

    tasks/
      components/
      hooks/
      state/
      api.ts

    projects/
      components/
      hooks/
      state/
      api.ts

    runs/
      components/
      hooks/
      state/
      api.ts

    approvals/
      components/
      hooks/
      state/
      api.ts

    memory/
      components/
      hooks/
      state/
      api.ts

    voice/
      components/
      hooks/
      state/
      api.ts

    mcp/
      components/
      hooks/
      state/
      api.ts

    runtime-status/
      components/
      hooks/
      state/
      api.ts

  api/
    daemon-client.ts
    tauri-client.ts
    schemas.ts
    errors.ts

  components/
    ui/
    data-panel/
    shared/

  stores/
    index.ts

  lib/
    logger.ts
    time.ts
    ids.ts

  types/
```

### Frontend Rules

- Feature code should call `frontend/src/api/*` clients or feature-local `api.ts`, not raw daemon URLs.
- Frontend must not hardcode daemon ports.
- Frontend must not encode runtime implementation details.
- Approval, run, and runtime status types should come from shared protocol/types where practical.
- UI state can be Zustand or local hooks, but server state should remain API-shaped and serializable.

## Target Rust/Tauri Layout

Keep Rust under `frontend/src-tauri` because this is the standard Tauri project location and avoids fighting the framework.

Target:

```text
frontend/src-tauri/
  Cargo.toml
  tauri.conf.json
  capabilities/
    default.json

  binaries/
    jarvis-daemon-<target-triple>[.exe]

  src/
    main.rs
    lib.rs

    core/
      app_paths.rs
      app_state.rs
      errors.rs
      logging.rs

    supervisor/
      daemon_supervisor.rs
      process_supervisor.rs
      port_allocator.rs
      health_check.rs
      sidecar_locator.rs

    runtime/
      runtime_registry.rs
      runtime_component.rs
      runtime_status.rs
      runtime_client.rs

    security/
      secret_store.rs
      permission_bridge.rs
      capability_bridge.rs

    observability/
      event_log.rs
      audit_log.rs
      log_paths.rs

    updater/
      update_manager.rs
      migration_runner.rs
      rollback_policy.rs

    commands/
      daemon_commands.rs
      runtime_commands.rs
      settings_commands.rs
      diagnostics_commands.rs

    ipc/
      proxy.rs
      errors.rs
      request_context.rs
```

### Rust/Tauri Rules

- `main.rs` should stay thin.
- `lib.rs` wires plugins, state, commands, and startup.
- `supervisor/` owns process lifecycle and sidecar startup.
- `runtime/` owns supervisor-visible runtime component state.
- `security/` owns secrets and native authority bridges.
- `commands/` exposes Tauri IPC only; commands delegate to services.
- Rust should not absorb agent business logic unless a module needs native performance or OS-level authority.

## Target Daemon Layout

The daemon should become a runtime host plus runtime modules.

Target:

```text
daemon/src/
  main.ts
  app.ts

  bootstrap/
    env.ts
    startup.ts
    shutdown.ts
    migrations.ts
    tool-registration.ts

  http/
    app.ts
    middleware/
      cors.ts
      errors.ts
      request-id.ts
    routes/
      chat.routes.ts
      conversations.routes.ts
      tasks.routes.ts
      approvals.routes.ts
      runtime.routes.ts
      settings.routes.ts
      diagnostics.routes.ts

  runtime-host/
    index.ts
    registry.ts
    lifecycle.ts
    status.ts
    events.ts
    in-process-runtime-client.ts
    process-runtime-client.ts

  runtimes/
    agent/
    tool/
    coding/
    voice/
    scheduler/
    memory/
    computer-control/
    a2a-gateway/

  capabilities/
    index.ts
    permission-broker.ts
    os-capability-broker.ts
    capability-executor.ts
    policies/
      shell-allowlist.ts
      file-scope-policy.ts
      computer-control-policy.ts
      network-policy.ts
    adapters/
      file-system-adapter.ts
      shell-adapter.ts
      git-adapter.ts
      computer-adapter.ts
      clipboard-adapter.ts

  approvals/
    index.ts
    approval-service.ts
    pending-execution-service.ts
    resume-service.ts
    approval-events.ts
    approval-policy-memory.ts

  persistence/
    schema.ts
    migrations/
    repositories.ts
    sqlite/
    supabase/
    codecs/

  observability/
    event-log-service.ts
    audit-log-service.ts
    runtime-log-service.ts
    telemetry.ts

  config/
    config-manager.ts
    app-paths.ts
    storage-config.ts
    provider-config.ts

  gateways/
    model/
    mcp/
    a2a/
    browser/

  workspaces/
    workspace-service.ts
    project-service.ts
    task-graph-service.ts

  worktree/
    worktree-service.ts
    worktree-repository.ts
    conflict-detector.ts

  shared/
    errors.ts
    ids.ts
    time.ts
    json.ts
    result.ts
    validation.ts
```

### Daemon Rules

- `main.ts` starts the daemon only.
- `app.ts` composes HTTP routes and middleware.
- `bootstrap/` handles startup sequencing.
- `http/routes/` translates HTTP requests into runtime/application calls.
- `runtime-host/` owns runtime registration, status aggregation, lifecycle, and future in-process vs process runtime clients.
- `runtimes/<kind>/` owns domain behavior for that runtime.
- `capabilities/` and `approvals/` are shared authority services, not runtime-private utilities.
- `persistence/` owns DB schema, migrations, repositories, and storage adapters.
- `gateways/` owns external protocols and provider integrations.
- Runtime modules should not import HTTP routes.
- Runtime modules should not directly execute OS actions.
- Runtime modules should not directly call provider SDKs unless the provider is part of that runtime's explicit adapter layer.

## Runtime Module Template

Every runtime should use this internal shape:

```text
daemon/src/runtimes/<runtime-name>/
  index.ts
  <runtime-name>-runtime.ts

  public/
    facade.ts
    types.ts

  application/
    use-cases/
    services/
    policies/

  domain/
    entities/
    events/
    value-objects/

  ports/
    repositories.ts
    capability-port.ts
    event-port.ts
    model-port.ts

  adapters/
    persistence/
    providers/
    tools/
    process/

  api/
    router.ts
    dto.ts

  tests/
```

This is not meant to create empty folders. Add subfolders only when that runtime needs them.

Minimum viable runtime module:

```text
runtimes/tool/
  index.ts
  tool-runtime.ts
  public/
    types.ts
  application/
    execute-tool.ts
  tests/
```

## Runtime-Specific Target Layouts

### Agent Runtime

```text
daemon/src/runtimes/agent/
  index.ts
  agent-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    run-turn.ts
    run-stream-turn.ts
    resume-run.ts
    build-context.ts
    handle-goal-command.ts
  domain/
    agent-run.ts
    agent-run-event.ts
    agent-profile.ts
  ports/
    conversation-repository.ts
    agent-run-repository.ts
    tool-runtime-port.ts
    memory-runtime-port.ts
    model-gateway-port.ts
  adapters/
    model/
    persistence/
```

Owns:

- AgentRun lifecycle.
- Chat/voice/scheduled run state.
- Pause/resume around approvals.
- Context assembly orchestration.
- Agent event emission.

Should absorb over time:

```text
daemon/src/runtime/run-executor.ts
daemon/src/runtime/run-stream-executor.ts
daemon/src/runtime/agent-run.ts
daemon/src/runtime/run-context.ts
daemon/src/orchestrator/context-builder.ts
daemon/src/orchestrator/context-manager.ts
daemon/src/orchestrator/goal-handler.ts
daemon/src/orchestrator/prompt-builder.ts
daemon/src/orchestrator/conversation.ts
```

### Tool Runtime

```text
daemon/src/runtimes/tool/
  index.ts
  tool-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    execute-tool.ts
    validate-tool-args.ts
    create-tool-approval.ts
    resume-tool-execution.ts
  domain/
    tool-call.ts
    tool-result.ts
    approval-required.ts
  ports/
    tool-registry-port.ts
    approval-service-port.ts
    audit-log-port.ts
  adapters/
    native-tools/
    mcp-tools/
```

Owns:

- Tool validation.
- Tool execution.
- ToolCall IDs and idempotency.
- ApprovalRequired result creation.
- Resume after approval.

Should absorb over time:

```text
daemon/src/runtime/tool-runtime.ts
daemon/src/runtime/ai-tool-wrapper.ts
daemon/src/runtime/tool-call-id.ts
daemon/src/tools/*
```

### Coding Runtime

```text
daemon/src/runtimes/coding/
  index.ts
  coding-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    create-coding-run.ts
    cancel-coding-run.ts
    collect-artifacts.ts
    stream-coding-events.ts
  domain/
    coding-run.ts
    coding-artifact.ts
    coding-adapter.ts
  ports/
    worktree-port.ts
    capability-port.ts
    process-port.ts
    artifact-repository.ts
  adapters/
    claude-code/
    codex/
    openclaw/
    process/
```

Owns:

- Coding agent run lifecycle.
- Adapter registry.
- Subprocess execution.
- Artifacts.
- Cancellation.

Should absorb over time:

```text
daemon/src/coding-runtime/*
daemon/src/worktree/*   # only the coding-facing service, not generic git capability adapters
```

### Computer-Control Runtime

```text
daemon/src/runtimes/computer-control/
  index.ts
  computer-control-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    request-control.ts
    revoke-control.ts
    get-control-status.ts
  domain/
    computer-operation.ts
    computer-permission.ts
  ports/
    capability-port.ts
    native-computer-port.ts
    audit-log-port.ts
  adapters/
    native/
    browser/
```

Owns:

- Screen/window/input/clipboard operation lifecycle.
- Computer-control status.
- Operation-specific metadata.

Should absorb over time:

```text
daemon/src/computer-control/*
```

Precise capabilities should live in shared `capabilities/` if used by other runtimes.

### Voice Runtime

```text
daemon/src/runtimes/voice/
  index.ts
  voice-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    transcribe.ts
    synthesize.ts
    streaming-session.ts
  domain/
    voice-session.ts
    voice-provider.ts
  ports/
    asr-provider-port.ts
    tts-provider-port.ts
  adapters/
    groq-asr/
    tts-provider/
```

Should absorb over time:

```text
daemon/src/voice/*
```

### Scheduler Runtime

```text
daemon/src/runtimes/scheduler/
  index.ts
  scheduler-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    run-tick.ts
    schedule-task.ts
    compute-next-run.ts
    idle-consolidation.ts
  domain/
    scheduled-task.ts
    scheduler-event.ts
  ports/
    task-repository.ts
    agent-runtime-port.ts
    event-log-port.ts
```

Should absorb over time:

```text
daemon/src/scheduler.ts
daemon/src/reports/*
daemon/src/sensors/*
```

### Memory Runtime

```text
daemon/src/runtimes/memory/
  index.ts
  memory-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    read-memory.ts
    write-memory.ts
    index-memory.ts
    query-memory.ts
    extract-preferences.ts
    prune-memory.ts
  domain/
    procedural-memory.ts
    episodic-memory.ts
    semantic-memory.ts
    memory-scope.ts
  ports/
    memory-repository.ts
    vector-index-port.ts
    event-log-port.ts
  adapters/
    sqlite-fts/
    sqlite-vec/
    graph/
```

Owns:

- Procedural memory.
- Episodic memory.
- Semantic memory.
- Memory indexing and retrieval.
- Memory scope enforcement.

Should absorb over time:

```text
daemon/src/orchestrator/temporal-memory.ts
daemon/src/tools/memory/*
daemon/src/api/memories.ts  # route remains in http/routes, logic moves to runtime
```

### A2A Gateway Runtime

```text
daemon/src/runtimes/a2a-gateway/
  index.ts
  a2a-gateway-runtime.ts
  public/
    types.ts
    facade.ts
  application/
    create-agent-card.ts
    delegate-task.ts
    receive-task.ts
    map-artifacts.ts
  domain/
    agent-card.ts
    a2a-task.ts
    external-agent.ts
  ports/
    secret-store-port.ts
    capability-port.ts
    event-log-port.ts
    audit-log-port.ts
  adapters/
    http-client/
    agent-card-server/
```

Owns:

- A2A-compatible mapping.
- External agent delegation.
- External task receipt, if enabled.

Must not bypass:

- `OSCapabilityBroker`.
- `SecretStore`.
- `AuditLog`.
- Runtime registry.

## Shared Authority Services

Authority services should not live inside any runtime.

Target:

```text
daemon/src/capabilities/
  permission-broker.ts       # pure policy engine
  os-capability-broker.ts    # durable decision + approval/audit creation
  capability-executor.ts     # executes approved operations
  types.ts
  policies/
  adapters/

daemon/src/approvals/
  approval-service.ts
  pending-execution-service.ts
  resume-service.ts
  approval-policy-memory.ts
  types.ts
```

Rules:

- `PermissionBroker` is pure policy: no DB writes, no execution.
- `OSCapabilityBroker` creates durable approval requests when needed.
- `CapabilityExecutor` executes only approved operations.
- `ApprovalService` owns approve/deny/expire.
- `ResumeService` maps `operationKind + operationPayload` back into runtime execution.
- Runtimes request capabilities; they do not execute raw OS actions.

## Persistence Layout

Current `daemon/src/db` can migrate gradually to `daemon/src/persistence`.

Target:

```text
daemon/src/persistence/
  schema.ts
  repositories.ts
  migrations/
    001_initial.ts
    002_agent_runs.ts
    003_approvals.ts
    004_runtime_components.ts
    005_coding_runs.ts
  sqlite/
    client.ts
    index.ts
    repositories/
      agent-run-repository.ts
      approval-repository.ts
      pending-execution-repository.ts
      event-log-repository.ts
      audit-log-repository.ts
      memory-repository.ts
  supabase/
    client.ts
    index.ts
    repositories/
  codecs/
    json.ts
    timestamps.ts
```

Rules:

- Runtime modules should depend on repository ports or public persistence interfaces, not concrete SQLite code.
- SQLite/Supabase differences stay in adapters.
- Migrations should be named and testable.
- Raw SQL compatibility migrations should be consolidated over time.

## Packages Layout

Target packages:

```text
packages/
  runtime-protocol/
    src/
      runtime-info.ts
      runtime-event.ts
      runtime-endpoints.ts
      runtime-kind.ts
      approval.ts
      artifact.ts

  runtime-core/
    src/
      managed-runtime.ts
      runtime-registry.ts
      runtime-client.ts
      process-supervisor.ts
      lifecycle.ts

  capability-protocol/
    src/
      capability.ts
      risk.ts
      approval-decision.ts
      audit.ts

  shared-types/
    src/
      json.ts
      result.ts
      ids.ts
      time.ts

  model-gateway/
    src/

  mcp-client/
    src/

  a2a-client/
    src/

  tool-registry/
    src/
```

### Package Rules

- Packages must not import from `daemon/` or `frontend/`.
- `runtime-protocol` should contain serializable DTOs and protocol types only.
- `runtime-core` should contain runtime abstractions, not Jarvis business logic.
- `capability-protocol` should contain serializable capability and approval shapes shared between Rust, daemon, and frontend.
- Avoid keeping both `packages/types` and `packages/shared-types` long term. Pick one canonical shared type package.
- `packages/permission-guard` should be deprecated or absorbed after `approvals/` and `capabilities/` are authoritative.

## Dependency Rules

Allowed direction:

```text
frontend/features
  -> frontend/api
  -> daemon HTTP API or Tauri IPC

daemon/http/routes
  -> daemon/runtimes/<kind>/public facade
  -> daemon/runtime-host

daemon/runtimes/<kind>/application
  -> daemon/runtimes/<kind>/domain
  -> runtime ports
  -> shared services through public facades

daemon/runtimes/<kind>/adapters
  -> persistence/gateways/capabilities as needed

daemon/capabilities
  -> persistence/observability/approvals

daemon/approvals
  -> persistence/observability/runtime-host

daemon/persistence
  -> db drivers only

packages/*
  -> other packages only, never daemon/frontend
```

Forbidden:

```text
runtime module -> http/routes
runtime module -> another runtime's private implementation
runtime module -> child_process directly
runtime module -> fs writes directly for user/workspace files
runtime module -> provider SDK directly unless inside its adapter
frontend -> daemon internals
frontend -> hardcoded daemon port
packages -> daemon or frontend
```

Cross-runtime calls should use public facades or ports:

```text
agent-runtime -> tool-runtime public facade
agent-runtime -> memory-runtime public facade
scheduler-runtime -> agent-runtime public facade
coding-runtime -> worktree service + capability broker
a2a-gateway -> agent-runtime public facade
```

## Naming Rules

Use these canonical names:

```text
RuntimeKind:
  agent
  tool
  coding
  voice
  scheduler
  memory
  computer-control
  a2a-gateway
```

Directory names:

```text
runtimes/agent
runtimes/tool
runtimes/coding
runtimes/voice
runtimes/scheduler
runtimes/memory
runtimes/computer-control
runtimes/a2a-gateway
```

Display names can use:

```text
agent-runtime
tool-runtime
coding-runtime
voice-runtime
scheduler-runtime
memory-runtime
computer-control-runtime
a2a-gateway-runtime
```

Avoid having both:

```text
runtime/
runtimes/
coding-runtime/
computer-control/
```

as top-level daemon concepts long term.

## Migration Strategy

Do not do a single massive directory move. Use the runtime decomposition phases.

### Phase A: Create stable host boundaries

Add:

```text
daemon/src/runtime-host/
daemon/src/runtimes/<canonical-kind>/
```

Keep old modules in place. Runtime facades call old modules.

### Phase B: Move approval code

Add:

```text
daemon/src/approvals/
```

Move approval lifecycle logic out of `daemon/src/runtime/tool-runtime.ts` and `daemon/src/api/approval.ts` into services. Routes become thin.

### Phase C: Move capability code

Rename or migrate:

```text
daemon/src/capability/ -> daemon/src/capabilities/
```

Add capability executor and adapters. Keep compatibility exports temporarily if needed.

### Phase D: Consolidate coding runtime

Move:

```text
daemon/src/coding-runtime/* -> daemon/src/runtimes/coding/
```

Keep `daemon/src/worktree/` only if it is shared infrastructure. If only coding uses it, move it under `runtimes/coding/adapters/worktree` or `runtimes/coding/application/worktrees`.

### Phase E: Consolidate computer control

Move:

```text
daemon/src/computer-control/* -> daemon/src/runtimes/computer-control/
```

Shared native adapters can live under:

```text
daemon/src/capabilities/adapters/
```

### Phase F: Introduce memory and A2A

Add:

```text
daemon/src/runtimes/memory/
daemon/src/runtimes/a2a-gateway/
packages/a2a-client/
```

Only after approval/capability boundaries are stable.

## Current-to-Target Mapping

```text
Current                                           Target
-------                                           ------
daemon/src/runtime/run-executor.ts                daemon/src/runtimes/agent/application/run-turn.ts
daemon/src/runtime/run-stream-executor.ts         daemon/src/runtimes/agent/application/run-stream-turn.ts
daemon/src/runtime/agent-run.ts                   daemon/src/runtimes/agent/domain/agent-run.ts
daemon/src/runtime/tool-runtime.ts                daemon/src/runtimes/tool/application/execute-tool.ts
daemon/src/runtime/ai-tool-wrapper.ts             daemon/src/runtimes/tool/adapters/ai-tool-wrapper.ts
daemon/src/runtime/approval-manager.ts            daemon/src/approvals/approval-service.ts
daemon/src/runtimes/index.ts                      daemon/src/runtime-host/registry.ts + public runtime exports
daemon/src/capability/*                           daemon/src/capabilities/*
daemon/src/coding-runtime/*                       daemon/src/runtimes/coding/*
daemon/src/computer-control/*                     daemon/src/runtimes/computer-control/*
daemon/src/voice/*                                daemon/src/runtimes/voice/*
daemon/src/scheduler.ts                           daemon/src/runtimes/scheduler/application/run-tick.ts
daemon/src/orchestrator/*                         daemon/src/runtimes/agent/application/* or memory runtime pieces
daemon/src/db/*                                   daemon/src/persistence/*
daemon/src/api/*                                  daemon/src/http/routes/*
daemon/src/mcp/*                                  daemon/src/gateways/mcp/*
daemon/src/model/*                                daemon/src/gateways/model/*
frontend/src-tauri/src/daemon_supervisor.rs       frontend/src-tauri/src/supervisor/daemon_supervisor.rs
frontend/src-tauri/src/runtime_registry.rs        frontend/src-tauri/src/runtime/runtime_registry.rs
frontend/src-tauri/src/secret_store.rs            frontend/src-tauri/src/security/secret_store.rs
frontend/src-tauri/src/event_log.rs               frontend/src-tauri/src/observability/event_log.rs
frontend/src-tauri/src/audit_log.rs               frontend/src-tauri/src/observability/audit_log.rs
```

## Enforcement

Add automated checks over time:

```text
1. API routes cannot import runtime private files.
2. Runtime modules cannot import HTTP routes.
3. Runtime modules cannot import another runtime's private application/domain files.
4. Daemon runtime code cannot call child_process directly outside capability adapters.
5. Daemon runtime code cannot write workspace/user files outside capability adapters.
6. Packages cannot import daemon or frontend.
7. Frontend cannot use hardcoded daemon URLs.
```

Suggested tests:

```text
daemon/src/architecture/import-boundaries.test.ts
daemon/src/architecture/no-direct-os-authority.test.ts
frontend/src/architecture/no-hardcoded-daemon-url.test.ts
packages/architecture/no-app-imports.test.ts
```

## Final Recommendation

Do not reorganize everything before Phase A/B/C. The best order is:

```text
1. Establish runtime-host and canonical runtime kinds.
2. Move approval lifecycle into daemon/src/approvals.
3. Move capability authority into daemon/src/capabilities.
4. Consolidate each runtime's old implementation into daemon/src/runtimes/<kind>.
5. Only then consider physical runtime process splitting.
```

The target design is intentionally a modular monolith first. It gives Jarvis strong internal boundaries without paying distributed-system costs too early. When a runtime later needs isolation, the public facade and runtime protocol should already make extraction straightforward.
