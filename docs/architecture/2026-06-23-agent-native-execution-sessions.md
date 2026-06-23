# Agent-Native Execution Sessions

This is the execution queue for coding agents.

Use this file when assigning implementation work. The architecture phases live in `2026-06-23-agent-native-execution-plan.md`; this file turns that roadmap into bounded coding sessions.

## How To Use

- [ ] Run one session per coding-agent session.
- [ ] Do not ask one agent session to complete the full architecture plan.
- [ ] Keep each session's diff small enough to review.
- [ ] Each session must update checkboxes in this file.
- [ ] Each session must report changed files, tests run, skipped tests, and residual risks.
- [ ] If a session grows too large, stop and split it before continuing.

## Product Scope Rule

The first implementation target is coding executor management, but the core architecture is a general Agent Execution OS.

- [ ] Build the first working path around Claude Code, Codex, and OpenCode.
- [ ] Keep core runtime abstractions domain-agnostic.
- [ ] Do not put coding-specific names into core packages unless they are adapter/domain implementations.
- [ ] Use `ExecutionEnvironment` as the general concept; use `GitWorktreeEnvironment` only in the coding domain.
- [ ] Use `OutcomeContract` and `VerificationPlan` as general concepts; use `CodingChangeContract` only in the coding domain.
- [ ] Treat coding as the first proof point, not the final product boundary.
- [ ] Future domains should fit the same runtime model: research, image generation, writing, desktop control, messaging, data analysis, and cloud agents.

## AI Implementation Guardrails

These rules are mandatory for every coding-agent session. They exist to prevent short-term coding executor work from corrupting the long-term general Agent Execution OS architecture.

- [ ] Core packages must use generic nouns: `executor`, `environment`, `artifact`, `verification`, `outcome`, `delivery`, `capability`, `permission`, `event`.
- [ ] Coding-only nouns such as `git`, `worktree`, `diff`, `typecheck`, `lint`, `testCommand`, `ClaudeCode`, `Codex`, and `OpenCode` must stay in coding-domain packages, coding adapters, or coding-specific tests.
- [ ] If a core type needs a coding-specific field, replace it with a generic extension point such as `metadata`, `capabilities`, `environmentKind`, `artifactKind`, or a domain-specific contract.
- [ ] Every new core interface must include at least one non-coding example in comments, docs, or tests.
- [ ] Every new executor abstraction must be able to describe a non-coding executor, such as `ImageGenerationExecutor`, `ResearchAgentExecutor`, or `MessagingExecutor`.
- [ ] Every new environment abstraction must be able to describe a non-coding environment, such as `BrowserSessionEnvironment`, `ImageWorkspaceEnvironment`, or `MessageDraftEnvironment`.
- [ ] Every new verification abstraction must be able to describe non-code checks, such as citation checks, image safety checks, tone checks, or sensitive-data checks.
- [ ] Do not place Claude Code/Codex/OpenCode assumptions in shared schemas unless they are behind an executor-specific profile or adapter config.
- [ ] Do not make git worktrees mandatory in the core runtime; they are the default coding environment implementation only.
- [ ] Do not make shell access mandatory in the core runtime; many future domains should not need shell execution.
- [ ] Do not make file diffs the only artifact model; future domains may produce images, reports, drafts, browser traces, data files, or external-action receipts.
- [ ] If a session introduces a core abstraction, its handoff note must state why the abstraction remains domain-agnostic.

Core abstraction checklist before committing a session:

- [ ] Could this type/API support a research task?
- [ ] Could this type/API support an image generation task?
- [ ] Could this type/API support a messaging draft task?
- [ ] Could this type/API support a desktop/browser control task?
- [ ] Are all coding-specific details isolated in coding-domain code?
- [ ] Are executor-specific details isolated in adapter/profile code?
- [ ] Can the feature still be explained as part of a general Agent Execution OS?

## Branch And Commit Strategy

- [ ] Start from the latest `main`.
- [ ] Use one long-lived feature branch for this roadmap: `feat/agent-native-execution-runtime`.
- [ ] Complete one session at a time.
- [ ] Create at least one commit per completed session.
- [ ] Use commit messages in this shape: `feat: session N <short outcome>` or `test: session N <short outcome>`.
- [ ] If a session is too large, split it into multiple commits, but keep all commits scoped to that session.
- [ ] Do not mix unrelated cleanup or opportunistic refactors into a session commit.
- [ ] Do not commit `docs/` unless explicitly requested; this workspace currently ignores `docs/` by default.
- [ ] Before each session commit, run the smallest relevant test set plus typecheck.
- [ ] Before merging the feature branch back to `main`, run full `pnpm.cmd test`, `pnpm.cmd typecheck`, `pnpm.cmd lint`, and `git diff --check`.
- [ ] Keep the feature branch mergeable by rebasing or merging from `main` only at session boundaries.

Recommended setup:

```bash
git checkout main
git pull
git checkout -b feat/agent-native-execution-runtime
```

## Execution Queue

## Phase Coverage Map

Use this map to verify that the implementation sessions cover the architecture roadmap.

- [ ] Product thesis, target mental model, non-goals, guardrails, and success criteria are design constraints for every session.
- [x] Phase 0 is covered by Session 0.
- [x] Phase 1 is covered by Sessions 1, 2, and 3.
- [x] Phase 2 is covered by Sessions 4 and 5.
- [ ] Phase 3 is covered by Sessions 6, 7, 8, 18, and 21.
- [ ] Phase 4 is covered by Sessions 7 and 8.
- [ ] Phase 5 is covered by Sessions 12 and 25.
- [ ] Phase 6 is covered by Sessions 9, 10, 13, and 19.
- [ ] Phase 7 is covered by Sessions 14 and 22.
- [ ] Phase 8 is covered by Session 15.
- [ ] Phase 9 is covered by Sessions 11, 17, and 24.
- [ ] Phase 10 is covered by Sessions 20 and 23.
- [ ] Phase 11 is covered by Sessions 16, 17, and 25.
- [ ] Phase 12 is the high-level migration order; it is implemented through Sessions 0-25.

### Session 0 - Inventory Only

Goal: map the current codebase to the target architecture without changing behavior.

- [x] Map current workspace, task, run, agent, approval, and coding runtime modules.
- [x] List every direct executor launch path.
- [x] List every direct shell/file/network/MCP policy bypass path.
- [x] Identify which current APIs should become legacy low-level APIs.
- [x] Write findings to a dated inventory note under `docs/architecture/`.

Verification:

- [x] No production behavior changes.
- [x] Manual review of code references.

### Session 1 - Executor Lifecycle Types

Goal: add the shared vocabulary for managed executors.

- [x] Add `ExecutorAdapter` interface.
- [x] Add normalized executor statuses.
- [x] Add normalized executor events.
- [x] Add executor capability profile types.
- [x] Export types from the proper package boundary.

Verification:

- [x] Typecheck affected packages.
- [x] Run focused tests for modified package.

### Session 2 - Executor Run Persistence

Goal: persist executor lifecycle separately from agent logic.

- [x] Add `executor_runs` schema/table.
- [x] Add repository methods for create/update/get/list.
- [x] Add SQLite migration.
- [x] Add repository tests.
- [x] Keep existing executor behavior unchanged.

Verification:

- [x] Repository tests pass.
- [x] Migration tests pass if migration coverage exists.

### Session 3 - Adapter Wrapper Skeleton

Goal: wrap existing coding executors behind the unified lifecycle contract.

- [x] Wrap Claude Code adapter behind `ExecutorAdapter`.
- [x] Wrap Codex adapter behind `ExecutorAdapter`.
- [x] Wrap OpenCode adapter behind `ExecutorAdapter`.
- [x] Add discovery tests.
- [x] Avoid changing executor CLI flags unless required for compatibility.

Verification:

- [x] Focused coding runtime adapter tests.
- [x] Typecheck daemon package.

### Session 4 - Claude Code Conformance Harness

Goal: prove Claude Code behavior with tests before relying on it.

- [x] Add conformance tests that skip safely when Claude Code is missing.
- [x] Test discovery.
- [x] Test unavailable or unauthenticated behavior.
- [x] Test simple non-interactive run when credentials are available.
- [x] Test timeout.
- [x] Test cancellation.
- [x] Document optional local conformance command.

Verification:

- [x] Tests pass without Claude Code installed.
- [x] Optional local conformance run documented.

### Session 5 - Claude Code Behavior Research

Goal: record real installed-version behavior for Jarvis adapter design.

- [ ] Verify `--output-format stream-json` event shape.
- [ ] Verify `--permission-mode` blocked behavior.
- [ ] Verify `--settings` session-local behavior.
- [ ] Verify `--mcp-config` and `--strict-mcp-config`.
- [ ] Record observed commands and outputs in a dated research note.

Verification:

- [ ] Research note includes exact Claude Code version.
- [ ] Research note separates confirmed behavior from assumptions.

### Session 6 - Execution Environment Interface

Goal: introduce a backend-agnostic execution environment contract before implementing coding-specific worktrees.

- [ ] Add `packages/execution-environment`.
- [ ] Define `ExecutionEnvironment`.
- [ ] Define `EnvironmentSessionRequest`.
- [ ] Define `EnvironmentSession`.
- [ ] Define `EnvironmentState`.
- [ ] Define `AccessPolicy`.
- [ ] Define command/file/artifact result types.
- [ ] Define generic action request/result types that do not require shell execution.
- [ ] Add request validation helpers.
- [ ] Add non-coding environment examples in tests or docs:
  - [ ] `BrowserSessionEnvironment`
  - [ ] `ImageWorkspaceEnvironment`
  - [ ] `MessageDraftEnvironment`
- [ ] Add validation tests.

Verification:

- [ ] Execution environment package tests pass.
- [ ] Workspace typecheck passes.
- [ ] Core interfaces do not mention Claude Code, Codex, OpenCode, git, worktree, diff, lint, typecheck, or test commands.

### Session 7 - Environment Persistence

Goal: make environment sessions durable and auditable.

- [ ] Add `environment_sessions` schema/table.
- [ ] Add `environment_events` schema/table.
- [ ] Add repositories.
- [ ] Add repository tests.
- [ ] Link sessions to workspace/project/run/agent.

Verification:

- [ ] Repository tests pass.
- [ ] Migration tests pass if applicable.

### Session 8 - Git Worktree Environment Backend

Goal: make isolated git worktrees the default coding-domain environment implementation.

- [ ] Implement `GitWorktreeEnvironment`.
- [ ] Create per-run worktree.
- [ ] Persist run workspace state.
- [ ] Enforce worktree path under approved project root.
- [ ] Collect changed files.
- [ ] Add cleanup and abandoned-worktree recovery.

Verification:

- [ ] Path validation tests.
- [ ] Temporary git repo integration test.

### Session 9 - Coding Runtime Environment Integration

Goal: start one coding executor through an environment session.

- [ ] Create environment session before executor start.
- [ ] Pass environment-derived cwd/worktree to executor adapter.
- [ ] Persist executor run and environment session ids.
- [ ] Emit environment-created and executor-started events.
- [ ] Preserve fallback path where needed.

Verification:

- [ ] Focused coding runtime tests.
- [ ] Adapter tests for the migrated executor.

### Session 10 - Environment-Mediated Process Execution

Goal: stop one executor from owning raw process lifecycle directly.

- [ ] Route one executor's process start through execution environment runtime.
- [ ] Keep low-level process spawn as internal implementation detail.
- [ ] Propagate timeout through execution environment runtime.
- [ ] Propagate cancellation through execution environment runtime.
- [ ] Collect logs through execution environment runtime.

Verification:

- [ ] Cancellation test.
- [ ] Timeout test.
- [ ] Log collection test.

### Session 11 - Artifact And Verification Core

Goal: make completion depend on artifacts and checks, not self-report.

- [ ] Add artifact collection phase.
- [ ] Add verification result model if missing.
- [ ] Add changed-files artifact.
- [ ] Add final-summary artifact.
- [ ] Add path-policy verification.
- [ ] Add test-command verification hook.

Verification:

- [ ] Verification unit tests.
- [ ] Changed-files integration test.

### Session 12 - Plan-Scoped Permission Grants

Goal: reduce permission spam while keeping hard boundaries.

- [ ] Add permission grant model.
- [ ] Add run/task/workspace/project scopes.
- [ ] Add expiry and max-use constraints.
- [ ] Add decision source.
- [ ] Keep high and critical risk fail-closed.
- [ ] Add broker tests for risk and scope.

Verification:

- [ ] Permission broker tests.
- [ ] Approval memory tests.

### Session 13 - Executor Permission Block Handling

Goal: convert executor permission blocks into visible Jarvis states.

- [ ] Detect known permission-blocked output for one executor.
- [ ] Convert known block to Jarvis approval request.
- [ ] Mark unknown interactive block as `blocked_by_executor_permission`.
- [ ] Add timeout so executor cannot hang forever.
- [ ] Record run event and audit entry.

Verification:

- [ ] Simulated stdout/stderr tests.
- [ ] Approval service or route tests if touched.

### Session 14 - Event Sourcing For Runs

Goal: make workflow execution traceable and replayable.

- [ ] Add missing run/task event types.
- [ ] Emit an append-only event for every lifecycle transition.
- [ ] Add event sequence ordering per run.
- [ ] Add query by workspace/project/task/run.
- [ ] Add tests for ordering and replay data.

Verification:

- [ ] Event repository tests.
- [ ] Workspace detail/timeline tests.

### Session 15 - Retry Policy Core

Goal: make failed runs retryable from known state.

- [ ] Add failure classification.
- [ ] Add attempt number.
- [ ] Add parent attempt id.
- [ ] Snapshot task/agent/executor/environment policy per attempt.
- [ ] Implement safe retry scheduling for reversible failures.
- [ ] Add retry decision tests.

Verification:

- [ ] Retry policy unit tests.
- [ ] Queue service tests if touched.

### Session 16 - Workspace Timeline UI

Goal: make execution status understandable to users.

- [ ] Show planning/executing/verifying/delivering phases.
- [ ] Show active agent and executor.
- [ ] Show environment and executor lifecycle events.
- [ ] Show artifacts and verification status.
- [ ] Show retry attempts and blocked state.
- [ ] Keep detailed logs collapsible.

Verification:

- [ ] Timeline model tests if present.
- [ ] Manual UI smoke test.

### Session 17 - Final Delivery Gate

Goal: prevent unverified success claims.

- [ ] Add delivery-ready state.
- [ ] Require verification summary before final success.
- [ ] Show changed files, artifacts, tests, and residual risks.
- [ ] Require explicit confirmation for merge/push/publish/external write.
- [ ] Prevent success claim when verification failed.

Verification:

- [ ] Delivery state service tests.
- [ ] UI smoke test for final delivery panel.

### Session 18 - Docker Sandbox Backend

Goal: add optional stronger isolation after worktree backend is stable.

- [ ] Implement Docker backend behind explicit config.
- [ ] Mount workspace according to policy.
- [ ] Use isolated HOME/config/tmp.
- [ ] Add network mode support.
- [ ] Add container cleanup.
- [ ] Add Docker-gated integration tests.

Verification:

- [ ] Unit tests pass without Docker.
- [ ] Optional Docker integration tests pass when Docker is available.

### Session 19 - MCP Gateway Policy

Goal: make executor MCP access explicit and scoped.

- [ ] Generate executor-specific MCP config from approved servers.
- [ ] Support strict MCP config for Claude Code if verified.
- [ ] Deny unapproved MCP servers by default.
- [ ] Log MCP exposure and visible calls.
- [ ] Add config generation tests.

Verification:

- [ ] MCP config generation tests.
- [ ] MCP route tests if touched.

### Session 20 - Team Mode Orchestration

Goal: make team mode a structured task graph, not free-form chat.

- [ ] Define team role mapping.
- [ ] Assign planner/builder/reviewer/tester roles.
- [ ] Route tasks to compatible agents/executors.
- [ ] Add reviewer handoff after builder output.
- [ ] Track per-agent performance data.

Verification:

- [ ] Agent broker tests.
- [ ] Task graph service tests.

### Session 21 - Cloud Executor Readiness

Goal: prepare the contracts for remote/cloud agents without selecting a provider.

- [ ] Define cloud executor adapter contract.
- [ ] Ensure environment/session/artifact/event contracts do not require local paths as source of truth.
- [ ] Add remote artifact references.
- [ ] Add remote log streaming abstraction.
- [ ] Add remote cancellation semantics.
- [ ] Keep this contract-only unless a provider is selected.

Verification:

- [ ] Type tests or contract tests.
- [ ] No provider-specific behavior unless explicitly scoped.

### Session 22 - Goal, Plan, And TaskGraph Persistence

Goal: make user goals and plans durable, not just transient orchestration output.

- [ ] Add or validate persistent `Goal` model coverage.
- [ ] Add persistent `Plan` model if missing.
- [ ] Add persistent `TaskGraph` or task dependency graph model if missing.
- [ ] Store planner output as a versioned plan artifact.
- [ ] Link goals, plans, tasks, agent runs, and artifacts.
- [ ] Add repository methods and tests.
- [ ] Add migration coverage where needed.

Verification:

- [ ] Repository tests pass.
- [ ] Task graph service tests pass.
- [ ] Workspace detail can load goal, plan, tasks, and runs together.

### Session 23 - AgentSpec, TeamSpec, And Capability Registry

Goal: make agents measurable capability units rather than prompt labels.

- [ ] Define `AgentSpec` schema or type.
- [ ] Define `TeamSpec` schema or type.
- [ ] Version agent specs.
- [ ] Store agent capability metadata.
- [ ] Store executor preference and model policy in a structured form.
- [ ] Track success rate by task type.
- [ ] Track retry rate.
- [ ] Track verification failure rate.
- [ ] Track user acceptance rate.
- [ ] Use capability and performance data in agent selection.

Verification:

- [ ] Agent profile repository tests.
- [ ] Agent broker tests.
- [ ] Schema/type validation tests.

### Session 24 - Quality Gate Expansion

Goal: expand verification beyond the first coding checks.

- [ ] Add task-type-specific quality gate registry.
- [ ] Add coding gates for lint, typecheck, tests, build, path policy, and security scan when configured.
- [ ] Add reviewer-agent gate after mechanical checks.
- [ ] Add image/media gate placeholders.
- [ ] Add research/writing gate placeholders.
- [ ] Ensure delivery includes artifact list, verification results, limitations, pending approvals, and unresolved risks.
- [ ] Ensure failed verification prevents success status.

Verification:

- [ ] Quality gate registry tests.
- [ ] Coding gate tests.
- [ ] Delivery gate tests.

### Session 25 - Permission UX, Revocation, And Approved Plan Display

Goal: make scoped permissions usable without hiding risk.

- [ ] Show required permission package before execution begins.
- [ ] Show approved permission package in the workspace timeline.
- [ ] Support approving a bounded execution plan once.
- [ ] Ask again only when execution exceeds the approved plan.
- [ ] Show high-risk external writes separately.
- [ ] Add permission grant revocation flow.
- [ ] Show final diff/artifacts before irreversible actions.
- [ ] Distinguish system auto-allow, user-memory allow, and explicit user approval.

Verification:

- [ ] Permission UI/store tests if present.
- [ ] Approval route/service tests.
- [ ] Manual UI smoke test for approve, revoke, and exceed-plan flows.

