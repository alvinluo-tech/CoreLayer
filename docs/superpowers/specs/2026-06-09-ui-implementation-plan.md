# Jarvis UI Implementation Plan — AgentsView & Workspace

> Branch: `feat/agents-workspace-ui-redesign`
> Design Spec: `2026-06-09-ui-design-spec.md`
> Created: 2026-06-09

---

## Phase 1: AgentsView with Current API Fields

**Goal**: Complete AgentsView redesign using only fields that exist in the current backend.
**Commit**: `feat(agents-view): redesign with modular components`

### 1.1 Shared UI Primitives

- [ ] Create `frontend/src/components/ui/agent-os/Tag.tsx` — colored chip with remove button
- [ ] Create `frontend/src/components/ui/agent-os/SectionHeader.tsx` — uppercase label with left accent bar
- [ ] Create `frontend/src/components/ui/agent-os/FormField.tsx` — label + input wrapper with glass styling
- [ ] Create `frontend/src/components/ui/agent-os/MetaGrid.tsx` — key-value metadata display (2-3 column grid)
- [ ] Create `frontend/src/components/ui/agent-os/StatusBadge.tsx` — status dot + label
- [ ] Create `frontend/src/components/ui/agent-os/GlassCard.tsx` — glass background container with border-radius 8px
- [ ] Create `frontend/src/components/ui/agent-os/EmptyState.tsx` — icon + title + description with fade-in animation

### 1.2 CSS

- [ ] Create `frontend/src/components/shell/views/agentsView.css` — all transitions, animations, hover states
- [ ] Define `.agent-card` styles (border, background, hover, selected states)
- [ ] Define `.section-collapse` styles (header, arrow rotation, body hide)
- [ ] Define `.inline-edit` styles (contentEditable visual state)
- [ ] Define `.toast` styles (position, animation, auto-dismiss)

### 1.3 AgentCard Component

- [ ] Create `frontend/src/components/shell/views/AgentCard.tsx`
- [ ] Render: Bot icon (26x26) + name + role badge ("general") + default star
- [ ] Render: description (single-line ellipsis)
- [ ] Render: status dot + executor name + run count
- [ ] CSS-only hover/selected transitions (no JS mouse handlers)
- [ ] Border: neutral default (`rgba(255,255,255,0.06)`), cyan when selected

### 1.4 AgentListPanel Component

- [ ] Create `frontend/src/components/shell/views/AgentListPanel.tsx`
- [ ] Header: "Agent Profiles" (hud-label) + Import (`Download` icon) + New (`Plus` icon) buttons
- [ ] Search input: `Search` icon + placeholder, `font-data`, focus glow
- [ ] Role filter chips: All | Planner | Coding | Review | Testing | General
- [ ] Agent list: scrollable, renders `AgentCard[]`
- [ ] Empty state: "No agents yet" with `Bot` icon + "Create your first agent" description

### 1.5 AgentDetailPanel Component

- [ ] Create `frontend/src/components/shell/views/AgentDetailPanel.tsx`
- [ ] Sticky top bar: agent icon (32x32) + name + role badge + default badge
- [ ] Action buttons: Edit (`Pencil`, ghost) + Test (`Check`, success) + Toggle (hidden in Phase 1)
- [ ] Section: Basic Info — name, description (editable via contentEditable), created/updated (dim)
- [ ] Section: Capabilities — Skills (`tag-cyan`), Tools (`tag-emerald`), MCP (`tag-violet`), Permissions (`tag-amber`)
- [ ] Section: Code Executor — 2x2 card grid (self, claude-code, codex, opencode)
- [ ] Section: Scopes — Knowledge + Memory with `tag-muted`
- [ ] Section: Model Policy — JSON code block with syntax coloring
- [ ] All sections collapsible via click header
- [ ] Empty state: "Select an agent to view details" when no agent selected

### 1.6 AgentInspectorPanel Component

- [ ] Create `frontend/src/components/shell/views/AgentInspectorPanel.tsx`
- [ ] Availability section: "Available" (green dot) — always shown in Phase 1
- [ ] Usage Stats (2x2 grid): Total Runs, Success Rate (colored), Avg Time, Last Used
- [ ] "Used In" section: "Not used in any workspace" (dim) — placeholder for Phase 2
- [ ] Test Result section: "Click Test to run a trial" (dim) — empty state
- [ ] Recent Activity: monospace log block (from agent_runs, max 120px scroll)
- [ ] Quick Actions: Edit, Test, Clone (`Copy`), Export (`Upload`), Set Default (`Star`), Delete (`Trash2`)
- [ ] Model Config: preferred models list + fallback model

### 1.7 AgentEditPanel Modal

- [ ] Create `frontend/src/components/shell/views/AgentEditPanel.tsx`
- [ ] Modal overlay: `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- [ ] Modal: 520px width, max-height 80vh, border-radius 10px
- [ ] Form: Name input, Description textarea
- [ ] Form: Skills/Tools/MCP/Permissions tag lists with add/remove
- [ ] Form: Code Executor 2x2 card selector
- [ ] Form: Model Policy JSON textarea (`font-code`)
- [ ] Footer: Cancel (ghost) + Save (primary)
- [ ] Input styles: neutral border, cyan focus glow

### 1.8 AgentsView Orchestrator

- [ ] Refactor `frontend/src/components/shell/views/AgentsView.tsx`
- [ ] Compose: AgentListPanel + AgentDetailPanel + AgentInspectorPanel
- [ ] State: selectedAgent, searchQuery, roleFilter, editingAgent
- [ ] Wire: agent store (useAgentStore) for CRUD operations
- [ ] Handle: create agent, update agent, delete agent, clone agent, export JSON
- [ ] Handle: test agent (placeholder — shows toast "Test started")
- [ ] Toast notifications for all actions
- [ ] Target: < 150 lines for orchestrator

### 1.9 Type Check & Build

- [ ] Run `pnpm tsc --noEmit` — zero errors
- [ ] Run `pnpm build` — success
- [ ] Visual check in browser (dev server)

---

## Phase 2: Backend Fields Alignment

**Goal**: Add missing fields to agent_profiles and create workspace_agents table.
**Commit**: `feat(backend): add role, enabled, workspace_agents`

### 2.1 Database Migration

- [ ] Add `role` text field to `agent_profiles` (default: "general")
- [ ] Add `enabled` boolean field to `agent_profiles` (default: true)
- [ ] Create `workspace_agents` table (id, workspaceId, agentId, role, assignedTaskIds JSON)
- [ ] Update Drizzle schema in `daemon/src/persistence/schema.ts`

### 2.2 Backend API Updates

- [ ] Update agent create/update endpoints to handle `role` and `enabled`
- [ ] Add workspace_agents CRUD endpoints
- [ ] Update agent list endpoint to include `role` and `enabled` in response

### 2.3 Frontend Schema Updates

- [ ] Update `agentProfileSchema` in `frontend/src/lib/apiSchemas.ts`
- [ ] Add `role` and `enabled` to AgentProfile type
- [ ] Add workspace_agents types

### 2.4 AgentsView UI Updates

- [ ] Enable role selector dropdown in AgentEditPanel (general/planner/coding/review/testing/research)
- [ ] Enable enabled/disabled toggle in AgentDetailPanel top bar
- [ ] Show role badge with correct color in AgentCard and AgentDetailPanel
- [ ] Enable "Used In" section in AgentInspectorPanel (from workspace_agents)
- [ ] Filter agents by role in AgentListPanel

---

## Phase 3: WorkspaceView with Real Data

**Goal**: Build WorkspaceView using real workspace/task/run data.
**Commit**: `feat(workspace-view): build with real data`

### 3.1 Database Migration

- [ ] Add `status` text enum field to `workspaces` (default: "draft")
- [ ] Add `goal` text field to `workspaces`
- [ ] Add `progress` integer field to `workspaces` (default: 0)
- [ ] Add `tokens_input` integer field to `workspaces` (default: 0)
- [ ] Add `tokens_output` integer field to `workspaces` (default: 0)
- [ ] Add `cost` text field to `workspaces` (default: "0")

### 3.2 Backend APIs

- [ ] Build workspace detail endpoint (aggregates tasks, runs, agents)
- [ ] Build workspace timeline endpoint (aggregates agent_run_events, approval_requests, tool_call_logs, event_log)
- [ ] Build workspace agents endpoint (from workspace_agents + agent_profiles)
- [ ] Build workspace files endpoint (from tool_call_logs with file operations)
- [ ] Build workspace artifacts endpoint (from agent_runs.artifacts + tasks.artifacts)

### 3.3 Workspace UI Primitives

- [ ] Create `frontend/src/components/ui/agent-os/EmptyState.tsx` (if not done in Phase 1)
- [ ] Create workspace-specific StatusBadge variants (running=pulsing, etc.)

### 3.4 WorkspaceCard Component

- [ ] Create `frontend/src/components/shell/views/WorkspaceCard.tsx`
- [ ] Render: status badge + name + goal (ellipsis) + meta (tasks, agents, progress%)
- [ ] Same card styling as AgentCard (neutral border, cyan selected)

### 3.5 WorkspaceSidebar Component

- [ ] Create `frontend/src/components/shell/views/WorkspaceSidebar.tsx`
- [ ] Header: "Workspaces" (hud-label) + search input
- [ ] Workspace list: scrollable, renders `WorkspaceCard[]`
- [ ] Empty state: "No workspaces yet" with `FolderKanban` icon

### 3.6 WorkspaceCenter Component

- [ ] Create `frontend/src/components/shell/views/WorkspaceCenter.tsx`
- [ ] Workspace header: name + status badge + action buttons (Pause/Start)
- [ ] Goal text + progress bar (3px, colored by status)
- [ ] Token bar: font-data 9px, shows tokens/cost
- [ ] Compose: WorkspaceTaskGraph + WorkspaceTimeline + WorkspaceChat

### 3.7 WorkspaceTaskGraph Component

- [ ] Create `frontend/src/components/shell/views/WorkspaceTaskGraph.tsx`
- [ ] Render task list with: number + title + agent + mini progress bar + status
- [ ] Show dependency lines ("depends on: [task]")
- [ ] Failed tasks: `RotateCcw` + "Retry" button
- [ ] Max height 280px, scrollable
- [ ] Empty state: "No tasks yet — Workspace is being planned..."

### 3.8 WorkspaceTimeline Component

- [ ] Create `frontend/src/components/shell/views/WorkspaceTimeline.tsx`
- [ ] Filter chips: All | Agent | Tool | Memory | Approval | System
- [ ] Render events: icon (22x22, colored bg) + message + timestamp
- [ ] Tool events: file reference badge + diff block
- [ ] Vertical timeline line (1px, `rgba(0,212,255,0.08)`)
- [ ] Data source: aggregated from agent_run_events, approval_requests, tool_call_logs, event_log

### 3.9 WorkspaceChat Component

- [ ] Create `frontend/src/components/shell/views/WorkspaceChat.tsx`
- [ ] Header: "Workspace Chat" with left accent bar
- [ ] Messages: icon (20x20) + text bubble (glass, rounded 8px)
- [ ] Input row: text input + Send button (primary)
- [ ] Data source: conversations + messages (filtered by workspaceId)
- [ ] Note: Real-time messaging is Phase 5; Phase 3 uses polling or mock

### 3.10 WorkspaceRightPanel Component

- [ ] Create `frontend/src/components/shell/views/WorkspaceRightPanel.tsx`
- [ ] Tab bar: Agents | Runs | Files | Artifacts (4 equal-width tabs)
- [ ] Tab: Agents — mini cards with icon + name + role + status badge
- [ ] Tab: Runs — run cards with title + agent + progress bar
- [ ] Tab: Files — file list with add/mod icon + path + line stats
- [ ] Tab: Artifacts — artifact cards with icon + title + metadata
- [ ] Pending Approvals section (amber-bordered cards)

### 3.11 WorkspaceView Orchestrator

- [ ] Create `frontend/src/components/shell/views/WorkspaceView.tsx`
- [ ] Compose: WorkspaceSidebar + WorkspaceCenter + WorkspaceRightPanel
- [ ] State: selectedWorkspace, workspaceDetail, activeTab
- [ ] Wire: workspace store for data loading
- [ ] Handle: select workspace, load detail, pause/resume
- [ ] Empty state: no workspace selected

### 3.12 Type Check & Build

- [ ] Run `pnpm tsc --noEmit` — zero errors
- [ ] Run `pnpm build` — success
- [ ] Visual check in browser

---

## Phase 4: Agent Broker & Team Proposal

**Goal**: Connect Agent Broker for automatic agent selection.
**Commit**: `feat(workspace): agent team proposal modal`

### 4.1 Backend

- [ ] Build agent team proposal API endpoint (broker rule filtering + LLM ranking)
- [ ] Build create-workspace-from-goal endpoint

### 4.2 AgentTeamProposalModal Component

- [ ] Create `frontend/src/components/shell/views/AgentTeamProposalModal.tsx`
- [ ] Render agent cards: icon (36x36) + name + role/executor + reason + risk badge
- [ ] Risk badges: low (emerald), medium (amber), high (rose)
- [ ] Warning box: amber bg + border for high-risk permissions
- [ ] Footer: Cancel + Confirm Team buttons

### 4.3 ProjectSpecModal Component

- [ ] Create `frontend/src/components/shell/views/ProjectSpecModal.tsx`
- [ ] Render spec sections: Summary, Goals, Non-Goals, Tech Stack, Constraints
- [ ] Code block style for each section

### 4.4 Integration

- [ ] Connect "New Workspace" flow to agent broker
- [ ] Show proposal modal before starting workspace
- [ ] Wire confirm/cancel to workspace creation

---

## Phase 5: Workspace Chat, Approvals, Artifacts

**Goal**: Complete remaining workspace features.
**Commit**: `feat(workspace): chat, approvals, artifacts`

### 5.1 Workspace Chat (Real-time)

- [ ] Connect WorkspaceChat to real conversation API
- [ ] Implement workspace-scoped message sending
- [ ] Handle streaming responses (if applicable)

### 5.2 Approval Cards

- [ ] Build real-time approval cards in right panel
- [ ] Implement Approve/Deny actions
- [ ] Auto-refresh on new approvals
- [ ] Handle expired approvals

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
