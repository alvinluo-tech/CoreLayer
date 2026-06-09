# Jarvis UI Implementation Plan — AgentsView & Workspace

> Branch: `feat/agents-workspace-ui-redesign`
> Design Spec: `2026-06-09-ui-design-spec.md`
> Created: 2026-06-09

---

## Phase 1: AgentsView with Current API Fields

**Goal**: Complete AgentsView redesign using only fields that exist in the current backend.
**Commit**: `feat(agents-view): redesign with modular components`

### 1.1 Shared UI Primitives

- [x] Create `frontend/src/components/ui/agent-os/Tag.tsx` — colored chip with remove button
- [x] Create `frontend/src/components/ui/agent-os/SectionHeader.tsx` — uppercase label with left accent bar (already existed)
- [x] Create `frontend/src/components/ui/agent-os/FormField.tsx` — label + input wrapper with glass styling (inline in AgentEditPanel)
- [x] Create `frontend/src/components/ui/agent-os/MetaGrid.tsx` — key-value metadata display (2-3 column grid) (already existed)
- [x] Create `frontend/src/components/ui/agent-os/StatusBadge.tsx` — status dot + label (StatusPill already existed)
- [x] Create `frontend/src/components/ui/agent-os/GlassCard.tsx` — glass background container with border-radius 8px (CSS class)
- [x] Create `frontend/src/components/ui/agent-os/EmptyState.tsx` — icon + title + description with fade-in animation (already existed)

### 1.2 CSS

- [x] Create `frontend/src/components/shell/views/agentsView.css` — all transitions, animations, hover states
- [x] Define `.agent-card` styles (border, background, hover, selected states)
- [x] Define `.section-collapse` styles (header, arrow rotation, body hide)
- [x] Define `.inline-edit` styles (contentEditable visual state)
- [x] Define `.toast` styles (position, animation, auto-dismiss)

### 1.3 AgentCard Component

- [x] Create `frontend/src/components/shell/views/AgentCard.tsx`
- [x] Render: Bot icon (26x26) + name + role badge ("general") + default star
- [x] Render: description (single-line ellipsis)
- [x] Render: status dot + executor name
- [x] CSS-only hover/selected transitions (no JS mouse handlers)
- [x] Border: neutral default (`rgba(255,255,255,0.06)`), cyan when selected

### 1.4 AgentListPanel Component

- [x] Create `frontend/src/components/shell/views/AgentListPanel.tsx`
- [x] Header: "Agent Profiles" (hud-label) + Import (`Download` icon) + New (`Plus` icon) buttons
- [x] Search input: `Search` icon + placeholder, `font-data`, focus glow
- [x] Role filter chips: All | Planner | Coding | Review | Testing | General
- [x] Agent list: scrollable, renders `AgentCard[]`
- [x] Empty state: "No agents yet" with `Bot` icon + "Create your first agent" description

### 1.5 AgentDetailPanel Component

- [x] Create `frontend/src/components/shell/views/AgentDetailPanel.tsx`
- [x] Sticky top bar: agent icon (32x32) + name + role badge + default badge
- [x] Action buttons: Edit (`Pencil`, ghost) + Test (`Check`, success)
- [x] Section: Basic Info — name, description (editable via InlineEdit), created/updated (dim)
- [x] Section: Capabilities — Skills (`tag-cyan`), Tools (`tag-emerald`), MCP, Permissions (`tag-amber`)
- [x] Section: Code Executor — 2x2 card grid (self, claude-code, codex, opencode)
- [x] Section: Scopes — Knowledge + Memory with `tag-muted`
- [x] Section: Model Policy — JSON code block with syntax coloring
- [x] All sections collapsible via click header
- [x] Empty state: "Select an agent to view details" when no agent selected

### 1.6 AgentInspectorPanel Component

- [x] Create `frontend/src/components/shell/views/AgentInspectorPanel.tsx`
- [x] Availability section: "Active" (green dot) — always shown in Phase 1
- [x] Usage Stats (2x2 grid): Total Runs, Tokens, Success Rate, Avg Duration (placeholder "—")
- [x] "Used In" section: "No workspaces assigned" (dim) — placeholder for Phase 2
- [x] Test Result section: "Not tested yet" (dim) — empty state
- [x] Quick Actions: Test Agent, Delete Agent
- [x] Model Config: preferred models list + temperature + max tokens

### 1.7 AgentEditPanel Modal

- [x] Create `frontend/src/components/shell/views/AgentEditPanel.tsx`
- [x] Modal overlay: `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- [x] Modal: 520px width, max-height 80vh, border-radius 10px
- [x] Form: Name input, Description textarea
- [x] Form: Skills/Tools/Permissions/Knowledge/Memory tag lists with add/remove
- [x] Form: Code Executor 2x2 card selector
- [x] Form: Model Policy fields (preferred models, temperature, max tokens)
- [x] Footer: Cancel (ghost) + Save (primary)
- [x] Input styles: neutral border, cyan focus glow

### 1.8 AgentsView Orchestrator

- [x] Refactor `frontend/src/components/shell/views/AgentsView.tsx`
- [x] Compose: AgentListPanel + AgentDetailPanel + AgentInspectorPanel + AgentEditPanel
- [x] State: selectedAgent, viewMode (list/edit/create)
- [x] Wire: agent store (useAgentStore) for CRUD operations
- [x] Handle: create agent, update agent, delete agent
- [x] Handle: test agent (placeholder)
- [x] Empty state and error state handling
- [x] Target: ~120 lines for orchestrator

### 1.9 Type Check & Build

- [x] Run `pnpm tsc --noEmit` — zero errors
- [x] Run `pnpm build` — success

---

## Phase 2: Backend Domain Model Alignment

**Goal**: Add core domain fields to backend schema. These are NOT UI mirror fields — they are product domain concepts the Agent Broker and orchestration engine need.
**Commit**: `feat(backend): add domain fields for agent orchestration`

> **Architecture principle**: DB Schema = stable domain facts. API ViewModel = aggregated for frontend. Don't put UI display fields in the database.

### 2.1 Database Migration — agent_profiles

Add fields the Agent Broker needs for agent selection:

- [x] Add `role` text field to `agent_profiles` (default: "general") — Broker needs to know who is coding/review/planner
- [x] Add `capabilities` text (JSON array) to `agent_profiles` (default: "[]") — structured capability declarations (e.g. `["file_write", "shell_exec", "code_review"]`)
- [x] Add `enabled` boolean field to `agent_profiles` (default: true) — allow disabling agents without deleting
- [x] Update Drizzle schema in `daemon/src/persistence/schema.ts`
- [x] Write migration SQL

### 2.2 Database Migration — workspace_agents (new table)

Agent-to-workspace relationship is a domain fact, not UI state:

- [x] Create `workspace_agents` table:
  ```
  id              TEXT PK
  workspace_id    TEXT FK → workspaces
  agent_profile_id TEXT FK → agent_profiles
  role_in_workspace TEXT (owner/planner/builder/reviewer/tester/observer)
  status          TEXT (idle/running/completed/failed/blocked)
  current_task_id TEXT (nullable, FK → tasks)
  joined_at       TEXT
  left_at         TEXT (nullable)
  ```
- [x] Update Drizzle schema
- [x] Write migration SQL

### 2.3 Database Migration — workspaces

Add minimal domain fields to workspaces (NOT derived/aggregate fields):

- [x] Add `goal` text field to `workspaces` — the user's original goal description
- [x] Add `status` text enum to `workspaces` (draft/planning/running/blocked/succeeded/failed/cancelled)
- [x] Add `active_project_id` text FK to `workspaces` (nullable)
- [x] Add `completed_at` text to `workspaces` (nullable)
- [x] Update Drizzle schema

> **NOT added to workspaces table**: progress, tokens, cost, agents, tasks, events — these are derived at API layer.

### 2.4 Database Migration — artifacts (new table)

Artifacts as a first-class domain entity for workspace-level aggregation and search:

- [x] Create `artifacts` table:
  ```
  id              TEXT PK
  workspace_id    TEXT FK → workspaces
  project_id      TEXT FK → projects (nullable)
  task_id         TEXT (nullable)
  run_id          TEXT FK → agent_runs (nullable)
  type            TEXT (spec/plan/file/report/scaffold)
  title           TEXT
  path            TEXT (nullable)
  content         TEXT (nullable)
  metadata        TEXT (JSON, nullable)
  created_at      TEXT
  ```
- [x] Update Drizzle schema
- [x] Write migration SQL

### 2.5 Backend Domain Service — Agent Broker

- [x] Create `daemon/src/runtimes/agent-broker/` module
- [x] Implement rule-based filtering (role, capabilities, enabled)
- [x] Implement LLM-based ranking for agent team proposals
- [x] Return `AgentTeamProposal` with risk levels and permission requirements

### 2.6 Backend Domain Service — Workspace Detail Aggregation

- [x] Create `daemon/src/services/workspace-detail.ts`
- [x] Implement `getWorkspaceDetail(workspaceId)` → aggregates from multiple tables:
  ```
  workspaces + projects + tasks + workspace_agents + agent_profiles
  + agent_runs + agent_run_events + approval_requests + artifacts
  ```
- [x] Return `WorkspaceDetailViewModel` (see design spec Section 5.3)
- [x] Compute `summary.progress` from task statuses (not stored in DB)
- [x] Compute `summary.totalTasks`, `completedTasks`, `activeRuns`, `blockedTasks`

### 2.7 Backend API Endpoints

- [x] `GET /api/workspace-agents?workspaceId=X` — list agents in workspace
- [x] `POST /api/workspace-agents` — add agent to workspace
- [x] `DELETE /api/workspace-agents/:id` — remove agent from workspace
- [x] `GET /api/workspaces/:id/detail` — full aggregated workspace detail
- [x] `GET /api/workspaces/:id/timeline` — timeline events from multiple tables
- [x] `POST /api/workspaces/create-from-goal` — goal → workspace + broker → team proposal
- [x] `POST /api/agent-broker/propose-team` — get agent team recommendation
- [x] `GET /api/workspaces/:id/artifacts` — artifact list

### 2.8 Frontend Schema Updates

- [x] Update `agentProfileSchema` in `frontend/src/lib/apiSchemas.ts` — add `role`, `capabilities`, `enabled`
- [x] Add `workspaceAgentSchema` type
- [x] Add `workspaceDetailSchema` type (aggregated ViewModel)
- [x] Add `artifactSchema` type
- [x] Update `workspaceSchema` — add `goal`, `status`, `activeProjectId`

### 2.9 AgentsView UI Updates

- [x] Enable role selector dropdown in AgentEditPanel (general/planner/coding/review/testing/research)
- [x] Enable enabled/disabled toggle in AgentDetailPanel top bar
- [x] Show role badge with correct color in AgentCard and AgentDetailPanel
- [x] Enable "Used In" section in AgentInspectorPanel (from workspace_agents)
- [x] Filter agents by role in AgentListPanel
- [x] Show capabilities list in AgentDetailPanel (new section)

---

## Phase 3: WorkspaceView with Real Data

**Goal**: Build WorkspaceView consuming the aggregated WorkspaceDetailViewModel from Phase 2 APIs.
**Commit**: `feat(workspace-view): build with real data`

> Phase 2 already created the domain services and APIs. Phase 3 is frontend-only: consume the APIs and build the UI.

### 3.1 Workspace Store

- [x] Create `frontend/src/stores/workspaceDetailStore.ts` — manages selected workspace detail
- [x] Fetch from `GET /api/workspaces/:id/detail`
- [x] State: workspaceDetail, timeline, approvals, isLoading, error

### 3.3 Workspace UI Primitives

- [x] Create `frontend/src/components/ui/agent-os/EmptyState.tsx` (if not done in Phase 1)
- [x] Create workspace-specific StatusBadge variants (running=pulsing, etc.)

### 3.4 WorkspaceCard Component

- [x] Create `frontend/src/components/shell/views/WorkspaceCard.tsx`
- [x] Render: status badge + name + goal (ellipsis) + meta (tasks, agents, progress%)
- [x] Same card styling as AgentCard (neutral border, cyan selected)

### 3.5 WorkspaceSidebar Component

- [x] Create `frontend/src/components/shell/views/WorkspaceSidebar.tsx`
- [x] Header: "Workspaces" (hud-label) + search input
- [x] Workspace list: scrollable, renders `WorkspaceCard[]`
- [x] Empty state: "No workspaces yet" with `FolderKanban` icon

### 3.6 WorkspaceCenter Component

- [x] Create `frontend/src/components/shell/views/WorkspaceCenter.tsx`
- [x] Workspace header: name + status badge + action buttons (Pause/Start)
- [x] Goal text + progress bar (3px, colored by status)
- [x] Token bar: font-data 9px, shows tokens/cost
- [x] Compose: WorkspaceTaskGraph + WorkspaceTimeline + WorkspaceChat

### 3.7 WorkspaceTaskGraph Component

- [x] Create `frontend/src/components/shell/views/WorkspaceTaskGraph.tsx`
- [x] Render task list with: number + title + agent + mini progress bar + status
- [x] Show dependency lines ("depends on: [task]")
- [x] Failed tasks: `RotateCcw` + "Retry" button
- [x] Max height 280px, scrollable
- [x] Empty state: "No tasks yet — Workspace is being planned..."

### 3.8 WorkspaceTimeline Component

- [x] Create `frontend/src/components/shell/views/WorkspaceTimeline.tsx`
- [x] Filter chips: All | Agent | Tool | Memory | Approval | System
- [x] Render events: icon (22x22, colored bg) + message + timestamp
- [x] Tool events: file reference badge + diff block
- [x] Vertical timeline line (1px, `rgba(0,212,255,0.08)`)
- [x] Data source: aggregated from agent_run_events, approval_requests, tool_call_logs, event_log

### 3.9 WorkspaceChat Component

- [x] Create `frontend/src/components/shell/views/WorkspaceChat.tsx`
- [x] Header: "Workspace Chat" with left accent bar
- [x] Messages: icon (20x20) + text bubble (glass, rounded 8px)
- [x] Input row: text input + Send button (primary)
- [x] Data source: conversations + messages (filtered by workspaceId)
- [x] Note: Real-time messaging is Phase 5; Phase 3 uses polling or mock

### 3.10 WorkspaceRightPanel Component

- [x] Create `frontend/src/components/shell/views/WorkspaceRightPanel.tsx`
- [x] Tab bar: Agents | Runs | Files | Artifacts (4 equal-width tabs)
- [x] Tab: Agents — mini cards with icon + name + role + status badge
- [x] Tab: Runs — run cards with title + agent + progress bar
- [x] Tab: Files — file list with add/mod icon + path + line stats
- [x] Tab: Artifacts — artifact cards with icon + title + metadata
- [x] Pending Approvals section (amber-bordered cards)

### 3.11 WorkspaceView Orchestrator

- [x] Create `frontend/src/components/shell/views/WorkspaceView.tsx`
- [x] Compose: WorkspaceSidebar + WorkspaceCenter + WorkspaceRightPanel
- [x] State: selectedWorkspace, workspaceDetail, activeTab
- [x] Wire: workspace store for data loading
- [x] Handle: select workspace, load detail, pause/resume
- [x] Empty state: no workspace selected

### 3.12 Type Check & Build

- [x] Run `pnpm tsc --noEmit` — zero errors
- [x] Run `pnpm build` — success
- [x] Visual check in browser

---

## Phase 4: Agent Broker & Team Proposal

**Goal**: Connect Agent Broker for automatic agent selection.
**Commit**: `feat(workspace): agent team proposal modal`

### 4.1 Backend

- [x] Build agent team proposal API endpoint (broker rule filtering + LLM ranking)
- [x] Build create-workspace-from-goal endpoint

### 4.2 AgentTeamProposalModal Component

- [x] Create `frontend/src/components/shell/views/AgentTeamProposalModal.tsx`
- [x] Render agent cards: icon (36x36) + name + role/executor + reason + risk badge
- [x] Risk badges: low (emerald), medium (amber), high (rose)
- [x] Warning box: amber bg + border for high-risk permissions
- [x] Footer: Cancel + Confirm Team buttons

### 4.3 ProjectSpecModal Component

- [x] Create `frontend/src/components/shell/views/ProjectSpecModal.tsx`
- [x] Render spec sections: Summary, Goals, Non-Goals, Tech Stack, Constraints
- [x] Code block style for each section

### 4.4 Integration

- [x] Connect "New Workspace" flow to agent broker
- [x] Show proposal modal before starting workspace
- [x] Wire confirm/cancel to workspace creation

---

## Phase 5: Workspace Chat, Approvals, Artifacts

**Goal**: Complete remaining workspace features.
**Commit**: `feat(workspace): chat, approvals, artifacts`

### 5.1 Workspace Chat (Real-time)

- [x] Connect WorkspaceChat to real conversation API
- [x] Implement workspace-scoped message sending
- [x] Handle streaming responses (if applicable)

### 5.2 Approval Cards

- [x] Build real-time approval cards in right panel
- [x] Implement Approve/Deny actions
- [x] Auto-refresh on new approvals
- [x] Handle expired approvals

### 5.3 Artifact Viewer

- [ ] Build artifact detail view (click to expand)
- [ ] Handle different artifact types (spec, plan, file, report)
- [ ] Download/view artifact content

### 5.4 File Changes

- [ ] Build file change list with diff viewing
- [ ] Show additions (emerald) vs modifications (amber)
- [ ] Click to view full diff

---

## Dependency Graph

```
Phase 1 (AgentsView UI)
    ↓
Phase 2 (Backend Fields) ← can start in parallel with Phase 1 backend work
    ↓
Phase 3 (WorkspaceView) ← depends on Phase 2 for workspace_agents
    ↓
Phase 4 (Agent Broker) ← depends on Phase 3 for workspace creation flow
    ↓
Phase 5 (Chat/Approvals/Artifacts) ← depends on Phase 3 for workspace detail APIs
```

---

## Estimated Effort

| Phase | Description | Estimated Lines |
|-------|-------------|-----------------|
| Phase 1 | AgentsView redesign | ~1500 lines (components + CSS) |
| Phase 2 | Backend alignment | ~300 lines (migration + API) |
| Phase 3 | WorkspaceView | ~2000 lines (components + CSS) |
| Phase 4 | Agent Broker | ~500 lines (modal + API) |
| Phase 5 | Chat/Approvals | ~800 lines |
| **Total** | | **~5100 lines** |

---

## Notes

- Each phase produces a working, committable state
- Phase 1 can be fully tested with current backend (mock data for missing fields)
- Phase 3 depends on Phase 2 for workspace_agents and workspace status fields
- Phase 4 and 5 can be developed in parallel after Phase 3
- All phases use lucide-react icons, no emoji
- All borders neutral by default, cyan only for active/selected
- Border-radius: card=8px, modal=10px, input/button=6px, badge/tag=4px
