# Jarvis UI Design Specification — AgentsView & Workspace

> Date: 2026-06-09
> Platform: Tauri 2 Desktop App (Windows/macOS/Linux)
> Tech Stack: React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS v4
> Interactive Mockups: `agents-v2.html`, `workspace.html`

---

## 1. Design System Foundation

### 1.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Cyan | `#00d4ff` | Primary accent, active states, running status |
| Violet | `#a78bfa` | Planner role, memory icons, secondary accent |
| Amber | `#ffb800` | Warning states, approval badges, testing role |
| Emerald | `#00e68a` | Success states, file additions, review role |
| Rose | `#ff3d5a` | Error states, delete actions, danger buttons |
| Rose (soft) | `#f472b6` | Research role |
| Background | `#0a0e1a` | Base background |
| Glass BG | `rgba(8,12,24,0.7)` | Panel backgrounds |
| Glass Border | `rgba(0,212,255,0.08)` | Panel dividers (holo mode) |
| Neutral Border | `rgba(255,255,255,0.06)` | Default card borders, non-active elements |

### 1.2 Border Radius System

| Element | Radius | Token |
|---------|--------|-------|
| Card | 8px | `--r-md` |
| Modal | 10px | custom |
| Input / Button | 6px | custom |
| Badge / Tag | 4px | `--r-sm` |
| Toggle knob | 50% (circle) | — |

> Agent OS / desktop tool — not a marketing page. Keep corners tight.

### 1.3 Typography

| Font | CSS Variable | Usage |
|------|-------------|-------|
| Chakra Petch | `--font-hud` | Section headers, titles, HUD labels |
| Exo 2 | `--font-body` | Body text, descriptions |
| Share Tech Mono | `--font-data` | Status badges, labels, metadata, timestamps |
| JetBrains Mono | `--font-code` | Code blocks, policy JSON, diff views |

### 1.4 Glass Design Tokens

```css
.glass-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-md); /* 8px */
  backdrop-filter: blur(16px);
}
.glass-hover:hover {
  border-color: var(--glass-border-hover);
}
.hud-label {
  font-family: var(--font-hud);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 2px;
}
```

### 1.5 Border Color Strategy

| Context | Border Color | Reason |
|---------|-------------|--------|
| Default card / input | `rgba(255,255,255,0.06)` | Neutral, non-distracting |
| Hover card | `rgba(0,212,255,0.12)` | Subtle cyan hint |
| Active / selected | `rgba(0,212,255,0.3)` | Cyan = active state |
| Running status | `#00d4ff` | Cyan = in progress |
| Error / danger | `#ff3d5a` | Rose = problems |
| Success | `#00e68a` | Emerald = done |
| Warning / approval | `#ffb800` | Amber = needs attention |

> **Rule**: Cyan is reserved for active/primary states only. Non-active borders use neutral `rgba(255,255,255,0.06)`.

### 1.6 Button Variants

| Variant | Color | Background | Border | Hover |
|---------|-------|-----------|--------|-------|
| `btn-primary` | `#00d4ff` | `rgba(0,212,255,0.1)` | `rgba(0,212,255,0.2)` | + glow shadow |
| `btn-ghost` | `rgba(255,255,255,0.4)` | `rgba(255,255,255,0.03)` | neutral border | lighter text |
| `btn-success` | `#00e68a` | `rgba(0,230,138,0.08)` | `rgba(0,230,138,0.15)` | brighter |
| `btn-danger` | `#ff3d5a` | `rgba(255,61,90,0.08)` | `rgba(255,61,90,0.15)` | brighter |
| `btn-warn` | `#ffb800` | `rgba(255,184,0,0.08)` | `rgba(255,184,0,0.15)` | brighter |

### 1.7 Status Colors

| Status | Color | Background | Dot |
|--------|-------|-----------|-----|
| `running` | `#00d4ff` | `rgba(0,212,255,0.1)` | blue (pulsing) |
| `succeeded` | `#00e68a` | `rgba(0,230,138,0.1)` | green |
| `failed` | `#ff3d5a` | `rgba(255,61,90,0.1)` | red |
| `blocked` | `#ffb800` | `rgba(255,184,0,0.1)` | amber |
| `planning` | `#a78bfa` | `rgba(167,139,250,0.1)` | violet |
| `queued` | `rgba(255,255,255,0.4)` | `rgba(255,255,255,0.05)` | gray |
| `pending` | `rgba(255,255,255,0.25)` | `rgba(255,255,255,0.03)` | gray |

### 1.8 Tag Color System

| Tag Type | Color | Background | Border | Usage |
|----------|-------|-----------|--------|-------|
| `tag-cyan` | `#00d4ff` | `rgba(0,212,255,0.08)` | `rgba(0,212,255,0.12)` | Skills |
| `tag-emerald` | `#00e68a` | `rgba(0,230,138,0.08)` | `rgba(0,230,138,0.12)` | Tools |
| `tag-violet` | `#a78bfa` | `rgba(167,139,250,0.08)` | `rgba(167,139,250,0.12)` | MCP Servers |
| `tag-amber` | `#ffb800` | `rgba(255,184,0,0.08)` | `rgba(255,184,0,0.12)` | Permissions |
| `tag-rose` | `#f472b6` | `rgba(244,114,182,0.08)` | `rgba(244,114,182,0.12)` | Research role |
| `tag-muted` | `rgba(255,255,255,0.4)` | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.06)` | Scopes, generic |

### 1.9 Role Color Mapping

| Role | Color | Background |
|------|-------|-----------|
| `planner` | `#a78bfa` | `rgba(167,139,250,0.1)` |
| `coding` | `#00d4ff` | `rgba(0,212,255,0.1)` |
| `review` | `#00e68a` | `rgba(0,230,138,0.1)` |
| `testing` | `#ffb800` | `rgba(255,184,0,0.1)` |
| `research` | `#f472b6` | `rgba(244,114,182,0.1)` |
| `general` | `rgba(255,255,255,0.4)` | `rgba(255,255,255,0.05)` |

### 1.10 Icon System

All icons use **lucide-react**. No emoji in production code.

| Purpose | Icon Component | Size |
|---------|---------------|------|
| Assistant | `MessageSquare` | 20 |
| Tasks | `ListTodo` | 20 |
| Runs | `Activity` | 20 |
| Memory | `Brain` | 20 |
| Approvals | `ShieldCheck` | 20 |
| Projects | `FolderKanban` | 20 |
| Agents | `Bot` | 20 |
| Settings | `Settings` | 20 |
| Search | `Search` | 16 |
| Add / New | `Plus` | 16 |
| Edit | `Pencil` | 14 |
| Delete | `Trash2` | 14 |
| Default star | `Star` | 14 |
| Close | `X` | 16 |
| Collapse | `ChevronDown` | 14 |
| Expand | `ChevronRight` | 14 |
| Import | `Download` | 16 |
| Export | `Upload` | 16 |
| Clone | `Copy` | 14 |
| Refresh | `RotateCcw` | 14 |
| Enable toggle | `ToggleLeft` / `ToggleRight` | 20 |
| Tool call | `Wrench` | 14 |
| File | `FileText` | 14 |
| Clock | `Clock` | 12 |
| Check | `Check` | 14 |
| Warning | `AlertTriangle` | 14 |
| Error | `XCircle` | 14 |
| Loading | `Loader2` | 16 (spinning) |

---

## 2. Global Shell Layout

Both views share the same global shell structure:

```
┌─────────────────────────────────────────────────────┐
│  Title Bar (42px)                                    │
│  JARVIS | Systems ● AI Core ● MCP ●   14:32:07     │
├───┬─────────────────────────────────────────────────┤
│ R │                                                   │
│ A │  View Content (flex: 1, overflow: hidden)        │
│ I │                                                   │
│ L │                                                   │
│   │                                                   │
│56 │                                                   │
│px │                                                   │
└───┴─────────────────────────────────────────────────┘
```

### 2.1 Title Bar

- Height: `42px`
- Background: `rgba(4,6,14,0.85)`
- Bottom border: `1px solid var(--glass-border)`
- Left: JARVIS logo (`font-hud`, 15px, `#00d4ff`, letter-spacing 3px, text-shadow glow)
- Center-left: Status indicators (dot + label for Systems, AI Core, MCP)
- Right: Live clock (`font-data`, `#00d4ff` at 40% opacity, updated every second)

### 2.2 Global Rail (Left Navigation)

- Width: `56px`
- Background: `rgba(4,6,14,0.8)`
- Right border: `1px solid var(--glass-border)`
- Icons: lucide-react components (see section 1.10)
- Bottom: Settings icon (after spacer)
- Icon container: `40x40px`, `border-radius: 8px`
- Default state: `color: var(--text-tertiary)`
- Hover: `color: var(--text-secondary)`, `background: rgba(255,255,255,0.04)`
- Active: `color: var(--cyan)`, `background: var(--cyan-subtle)`, `border: 1px solid rgba(0,212,255,0.3)`
- All transitions: `all 0.15s`

---

## 3. AgentsView — Agent Configuration UI

### 3.1 Design Purpose

Agent configuration manages **reusable capability templates**. This page answers:
- What can this agent do?
- Which model does it use?
- Which executor does it use?
- Which tools, MCP servers, skills, and permissions can it request?

It does **NOT** show: current workspace progress, task graphs, live run events, or workspace-specific logs.

### 3.2 Layout

```
┌───────────────────────────────────────────────────────────────┐
│ Rail │ List Panel (280px) │ Content Area (flex-1)              │
│ 56px │                  │ ┌─────────────┬──────────────┐      │
│      │ Header:          │ │ Detail      │ Inspector    │      │
│      │  Title + Actions │ │ Panel       │ Panel        │      │
│      │  Search Input    │ │ (flex-1)    │ (300px)      │      │
│      │  Role Filters    │ │             │              │      │
│      │                  │ │             │              │      │
│      │ Agent Cards[]    │ │             │              │      │
│      │ Agent Card(sel)  │ │             │              │      │
│      │ Agent Card       │ │             │              │      │
│      │                  │ │             │              │      │
└──────┴──────────────────┴─┴─────────────┴──────────────┴──────┘
```

### 3.3 List Panel (Left — 280px)

#### Header

- Title: "Agent Profiles" (hud-label style, uppercase)
- Actions row: Import button (`Download` icon, ghost style) + New button (`Plus` icon + "New", primary style)
- Search input: full-width, `font-data`, placeholder with `Search` icon + "Search agents...", focus border glow
- Role filter chips: All | Planner | Coding | Review | Testing | General
  - Active chip: `color: #00d4ff`, `background: rgba(0,212,255,0.1)`, `border: rgba(0,212,255,0.2)`
  - Inactive chip: `color: var(--text-tertiary)`, `background: rgba(255,255,255,0.02)`
  - Hover: brighter text + background

#### Agent Card

```
┌──────────────────────────────┐
│ [Bot icon] AgentName  [Role]★│
│  Description text truncat... │
│  ● Active  ⚡Claude Code     │
│  142 runs                    │
└──────────────────────────────┘
```

- Padding: `10px 14px`
- Left border: `2px solid transparent` → selected: `#00d4ff`
- Background: transparent → hover: `rgba(0,212,255,0.03)` → selected: `rgba(0,212,255,0.06)`
- Border: `1px solid rgba(255,255,255,0.06)` (neutral default, not cyan)
- Transition: `all 0.15s ease`
- Header row: icon (26x26, border-radius 6px) + name (13px, weight 500) + role badge + default badge (`Star` icon)
- Description: 11px, `var(--text-tertiary)`, single-line ellipsis
- Meta row: status dot (green/gray) + status text + executor icon + name + total runs count
- All text uses `font-data` for metadata, `font-hud` for headers

### 3.4 Detail Panel (Center — flex-1)

#### Top Bar (Sticky)

- Background: `rgba(10,14,26,0.95)` with `backdrop-filter: blur(8px)`
- Left: agent icon (32x32) + name (15px bold) + role badge + default badge
- Right: Edit button (`Pencil` icon, ghost) + Test button (`Check` icon, success) + Enable/Disable toggle

#### Toggle Switch

- Width: `36px`, height: `20px`, border-radius: `10px`
- Off: `background: rgba(255,255,255,0.08)`, knob at left (14x14 circle, white at 40%)
- On: `background: rgba(0,212,255,0.2)`, `border: rgba(0,212,255,0.3)`, knob at right (`#00d4ff` + glow)
- Transition: `all 0.2s`

> **Note**: `enabled` field does not exist in current `agent_profiles` schema. This toggle will be added in Phase 2 when the backend field is added. For Phase 1, the toggle is hidden.

#### Collapsible Sections

Each section is a glass-card container with:

```
┌─────────────────────────────────────────────┐
│ ▌ Section Header                  ▼ Toggle  │
├─────────────────────────────────────────────┤
│  Section Body (collapsible)                 │
│  ...                                        │
└─────────────────────────────────────────────┘
```

- Section header: `hud-label` style, left accent bar (3px wide, cyan→transparent gradient), toggle arrow (`ChevronDown` rotates -90deg when collapsed)
- Hover: `rgba(0,212,255,0.02)` background
- Body padding: `4px 14px 14px`, gap between items: `10px`
- Click anywhere on header toggles collapse

#### Section: Basic Info

```
Name          [Agent Name value]          [Pencil]
Description   [Description text value]    [Pencil]
Created       [date, dim]
Updated       [date, dim]
```

- Field layout: label (110px min-width, hud-label) + value (flex-1, font-data, 12px)
- Editable values: hover shows edit icon (`Pencil`, opacity 0→1), click triggers `contentEditable`
- Editing state: `background: rgba(0,0,0,0.3)`, `border: 1px solid rgba(0,212,255,0.15)`, white text
- Enter saves, Escape cancels with original value
- Dim values (Created/Updated): `color: var(--text-tertiary)`, italic
- **Role field**: Not in current schema. Shown as read-only "general" for Phase 1. Editable role selector added in Phase 2.

#### Section: Capabilities

```
[Brain icon] Skills     [tag-cyan ×] [tag-cyan ×] ... [+ add]
[Wrench icon] Tools      [tag-emerald ×] ... [+ add]
[ShieldCheck icon] MCP        [tag-violet ×] ... [+ add]
[Lock icon] Perms      [tag-amber ×] ... [+ add]
```

- Each row: icon + label (left) + tag list (flex: 1, wrap)
- Tags: `font-data`, 10px, `padding: 3px 10px`, `border-radius: 4px`
- Each tag has a remove button (`X` icon) on the right, `opacity: 0.5` → `1` on hover
- "Add" tag: dashed border, transparent background, text "＋ add"
  - Hover: cyan color + border

#### Section: Code Executor

```
┌──────────────┬──────────────┐
│ [Bot icon]    │ [Activity]   │  ← 2x2 grid
│ Self          │ Claude Code  │
│ Built-in      │ Anthropic CLI│
├──────────────┼──────────────┤
│ [Sparkles]    │ [Wrench]     │
│ Codex         │ OpenCode     │
│ OpenAI coder  │ Open-source  │
└──────────────┴──────────────┘

Max Concurrent    [3]              [Pencil]
Work Directory    [/projects]      [Pencil]
```

- Executor cards: `2x2 grid`, each card `padding: 10px`, `border-radius: 8px`
- Default state: `border: rgba(255,255,255,0.06)` (neutral), `background: rgba(255,255,255,0.015)`
- Hover: brighter border + background
- Selected: `border: #00d4ff`, `background: rgba(0,212,255,0.05)`, `box-shadow: 0 0 12px rgba(0,212,255,0.06)`, checkmark (`Check` icon) in top-right
- Executor descriptions:
  - self: "Built-in — runs within daemon"
  - claude-code: "Anthropic's CLI agent"
  - codex: "OpenAI autonomous coder"
  - opencode: "Open-source pipeline"
- Config fields (maxConcurrent, workDir) only shown for non-self executors

> **Note**: Executor is stored in `executorPolicy.executor` JSON field. The 2x2 card selector reads/writes this field.

#### Section: Scopes

```
[FolderKanban icon] Knowledge   [tag-muted: global] [tag-muted: project]
[Brain icon] Memory      [tag-muted: global]
```

- Uses `tag-muted` for scope items
- Empty state: dim italic "none"

#### Section: Model Policy

```json
"preferredModels": ["claude-sonnet-4-6"],
"fallbackModel": "claude-haiku-4-5",
"maxTokens": 8192,
"temperature": 0.7
```

- Code block style: `background: rgba(0,0,0,0.3)`, `font-code`, `border-radius: 6px`
- Syntax coloring: keys in cyan, strings in emerald, numbers in amber
- Click to edit (contentEditable)

### 3.5 Inspector Panel (Right — 300px)

Fixed sidebar showing metadata and actions for the selected agent.

#### Inspector Sections

**Availability**
- Status dot (green/gray) + "Available"/"Disabled" text
- > **Note**: Based on `enabled` field (Phase 2). Phase 1 shows "Available" always.

**Usage Stats** (2x2 grid)
- Total Runs: large number
- Success Rate: colored by threshold (>=90% emerald, >=70% amber, <70% rose)
- Avg Time: e.g. "2.3s"
- Last Used: e.g. "2 min ago"

**Used In (N workspaces)**
- List of workspace cards the agent participates in
- Each card: `FolderKanban` icon + workspace name + status badge (with colored dot)
- Click navigates to workspace
- Empty state: "Not used in any workspace" (dim text)
- > **Note**: Requires `workspace_agents` table (Phase 2). Phase 1 shows "Not used in any workspace" always.

**Test Result**
- Green-bordered card when test has been run
- Shows: Model, Tokens, Duration, Tools Used
- Response preview: truncated first line of agent response
- Empty state: "Click Test to run a trial" (dim text)

**Recent Activity**
- Monospace log block with timestamped entries
- Color coding: `.log-ok` (emerald), `.log-warn` (amber), `.log-err` (rose)
- Max height: 120px with scroll
- Data source: `agent_runs` + `agent_run_events` for this agent

**Quick Actions** (vertical button stack)
- Edit Configuration (`Pencil` icon, ghost)
- Run Test (`Check` icon, success)
- Clone (`Copy` icon, ghost)
- Export JSON (`Upload` icon, ghost)
- Set as Default (`Star` icon, ghost, hidden if already default)
- Delete (`Trash2` icon, danger, hidden if default)

**Model Config**
- List of preferred models with `Box` icon
- Fallback model with `RotateCcw` icon (dimmer)

### 3.6 Modals

#### Edit/Create Modal

- Overlay: `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- Modal: `width: 520px`, `max-height: 80vh`, `border-radius: 10px`
- Glass background: `rgba(12,16,30,0.98)`
- Header: title + close button (`X` icon)
- Body: form fields
- Footer: Cancel (ghost) + Save (primary)

**Form Fields:**
- Name: text input
- Role: select dropdown (general, planner, coding, review, testing, research) — **Phase 2 only**
- Description: textarea
- Skills: tag list with add/remove
- Tools: tag list with add/remove
- MCP Servers: tag list with add/remove
- Permissions: tag list with add/remove
- Code Executor: 2x2 card selector
- Model Policy: JSON textarea (`font-code`, monospace, 11px)

**Input Styles:**
- `font-data`, 12px
- Background: `rgba(255,255,255,0.03)`
- Border: `1px solid rgba(255,255,255,0.06)` (neutral)
- Focus: `border: #00d4ff`, `box-shadow: 0 0 0 2px rgba(0,212,255,0.1)`

#### Export Modal

- Width: `480px`
- Readonly textarea showing JSON representation of agent profile
- Copy to clipboard button (`Check` icon, primary)
- Fields exported: name, description, modelPolicy, executorPolicy, skills, tools, knowledgeScopes, permissions, memoryScopes

### 3.7 Toast Notifications

- Position: `bottom: 24px`, `right: 24px`
- Background: `rgba(0,212,255,0.1)`, border: `rgba(0,212,255,0.2)`
- `font-data`, 11px, `#00d4ff`
- Animation: fade in + slide up from `translateY(10px)`
- Auto-dismiss: 2 seconds

---

## 4. Workspace View — Execution Management UI

### 4.1 Design Purpose

Workspace manages the **live execution site** for a concrete user goal. This page answers:
- What is the user trying to accomplish?
- Which agents are participating?
- What is the current task graph and progress?
- What has happened so far (timeline, events, artifacts)?
- What needs user approval?

It does **NOT** show: agent configuration templates, model policies, or global settings.

### 4.2 Relationship to Other Views

| View | Responsibility | Data Source |
|------|---------------|-------------|
| **WorkspaceView** | Execution现场 — live progress, task graph, timeline, approvals | `workspaces` + `tasks` + `agent_runs` + `agent_run_events` + `approval_requests` |
| **ProjectsView** | Project resources — file organization, project list | `projects` table |
| **RunsView** | Global run history — all agent runs across workspaces | `agent_runs` table |
| **AgentsView** | Agent template configuration — capabilities, models, tools | `agent_profiles` table |

> WorkspaceView is the **upper layer** that orchestrates execution. ProjectsView manages project metadata within a workspace. They do NOT overlap.

### 4.3 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Rail │ WS Sidebar (260px) │ Center Panel (flex-1) │ Right (320px)│
│ 56px │                    │                      │              │
│      │ Header:            │ WS Header            │ Tabs:        │
│      │  Workspaces        │  Name + Status       │ Agents|Runs  │
│      │  Search Input      │  Goal Text           │ Files|Artif. │
│      │                    │  Progress Bar        │              │
│      │ WS Cards[]         │  Token/Cost Bar      │ Tab Body     │
│      │ WS Card(selected)  │                      │              │
│      │                    │ Task Graph           │              │
│      │                    │ Timeline             │              │
│      │                    │ Embedded Chat        │              │
└──────┴────────────────────┴──────────────────────┴──────────────┘
```

### 4.4 Workspace Sidebar (Left — 260px)

#### Header

- Title: "Workspaces" (hud-label style)
- Search input: full-width, `Search` icon + placeholder "Search..."

#### Workspace Card

```
┌──────────────────────────────┐
│ [● running] Food Tracking    │
│ Build a food tracking web... │
│ 10 tasks · 4 agents · 58%   │
└──────────────────────────────┘
```

- Same card styling as AgentCard (left border, hover, selected states)
- Name row: status badge (with colored dot) + workspace name
- Goal: single-line ellipsis
- Meta row: task count, agent count, progress percentage
- Border: neutral default, cyan when selected

#### Empty State

```
┌──────────────────────────────┐
│                              │
│    [FolderKanban icon]       │
│    No workspaces yet         │
│    Create one to get started │
│                              │
│    [+ New Workspace]         │
│                              │
└──────────────────────────────┘
```

- Icon fades in from `opacity: 0, translateY(8px)`
- Title delayed 100ms, description delayed 200ms

### 4.5 Center Panel (flex-1)

#### Workspace Header

```
┌─────────────────────────────────────────────────────┐
│ Food Tracking Web App [● running]     [Spec] [Proposal] [Pause] │
│ Build a usable food tracking web app with calorie...│
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░ 58%            │
│ Started: Jun 9 12:00  Progress: 58%  Tokens: 162,700  Cost: $2.14  In: 124,500  Out: 38,200 │
└─────────────────────────────────────────────────────┘
```

- Top row: workspace name (16px bold) + status badge + action buttons
- Action buttons vary by status:
  - `running`: Pause button (`Pause` icon, warn)
  - `planning`: Start button (`Play` icon, primary)
  - `succeeded`: no action buttons
- Goal text: 12px, `var(--text-secondary)`
- Progress bar: 3px height, colored by status, animated width transition
- Token bar: `font-data`, 9px, showing: Started time, Progress %, Total Tokens, Cost, Input tokens, Output tokens

#### Task Graph

```
Task Graph (10)
1.  Analyze requirements    [📝 Planner]  [━━━]  succeeded
    │ depends on: (none)
2.  Create project spec     [📝 Planner]  [━━━]  succeeded
    │ depends on: Analyze requirements
3.  Choose tech stack       [📝 Planner]  [━━━]  succeeded
    │ depends on: Create project spec
4.  Scaffold frontend       [🤖 Jarvis]   [━━░░] running  [↻ Retry]
    │ depends on: Choose tech stack
5.  Implement backend API   —              [░░░░] queued
...
```

- Max height: `280px`, scrollable
- Each task row: number + title + agent icon/name + mini progress bar (40px wide, 3px) + status badge
- Active task (running): highlighted background `rgba(0,212,255,0.06)`, white title text
- Dependency line: indented under parent task, `font-data` 8px, shows "depends on: [task title colored by status]"
- Failed tasks: show `RotateCcw` + "Retry" button (amber, small)
- Task status colors match the global status color system
- **Data source**: `tasks` table filtered by workspaceId

#### Timeline

```
Timeline
[All] [Agent] [Tool] [Memory] [Approval] [System]

⚡ 14:30  Jarvis started task "Scaffold frontend"
🔧 14:28  Tool call: write_file src/App.tsx
           📄 src/App.tsx
           + import { BrowserRouter } from "react-router-dom"
           + import { AppShell } from "./components/shell/AppShell"
           - export default function App() {
           + export function App() {
🔧 14:25  Tool call: write_file src/main.tsx
           📄 src/main.tsx
🧠 14:22  Memory read: project/food-tracker/tech-stack
🤖 14:20  Planner completed — task graph generated (10 tasks)
🛡️ 14:15  Approval granted: file_write for Jarvis agent
⚙️ 14:10  Workspace created — goal: "Build a food tracking web app"
```

- Filter chips: All | Agent | Tool | Memory | Approval | System
  - Same chip styling as role filters in AgentsView
  - Filters events by type, client-side
- Each event: icon (22x22, colored background) + message + timestamp
- Tool events may include:
  - File reference: green monospace badge with `FileText` icon
  - Diff block: dark background, monospace, with colored lines (green add, red delete, gray context)
- Vertical timeline line connecting events (1px, `rgba(0,212,255,0.08)`)
- **Data source**: Aggregated from multiple tables:

| Timeline Filter | Data Source | Event Type |
|----------------|-------------|------------|
| Agent | `agent_run_events` (type: agent lifecycle) | Agent started, completed, failed |
| Tool | `agent_run_events` (type: tool_call) + `tool_call_logs` | Tool calls with args/results |
| Memory | `agent_run_events` (type: memory) | Memory reads/writes |
| Approval | `approval_requests` | Approval granted/denied/pending |
| System | `event_log` + `audit_log` | System events, workspace created |

> **Note**: Frontend aggregates these into `WorkspaceTimelineItem`. The source data comes from real tables, not a fake event type enum.

#### Embedded Workspace Chat

```
Workspace Chat
[User icon] User:    Help me create a food tracking web app
[Bot icon] Jarvis:  I can create a workspace for this goal...
[Bot icon] Jarvis:  Workspace created. Planner agent has generated...
─────────────────────────────────────────
[Send a message to workspace agents...] [Send]
```

- Located at bottom of center panel
- Separator: top border `var(--glass-border)`
- Header: "Workspace Chat" with left accent bar
- Messages: icon (20x20) + text bubble (glass background, rounded 8px)
  - User messages: white icon, light border
  - Jarvis messages: cyan icon, cyan border
- Input row: text input (flex-1) + Send button (primary)
- Messages are workspace-scoped (not global chat)
- **Data source**: `conversations` table filtered by workspaceId + `messages` table

### 4.6 Right Panel (320px)

#### Tabs

| Tab | Content |
|-----|---------|
| Agents | Agent participants + pending approvals |
| Runs | Agent run cards with progress |
| Files | File change list |
| Artifacts | Artifact cards |

Tab bar: 4 equal-width tabs, `font-data` 10px, active tab has `#00d4ff` text + bottom border

#### Tab: Agents

Shows workspace agent participants as mini cards:

```
┌────────────────────────────────┐
│ [📝]  Planner          ● done  │
│     planner · completed        │
├────────────────────────────────┤
│ [🤖]  Jarvis           ● run   │
│     builder · running          │
├────────────────────────────────┤
│ [🔧]  Code Reviewer    ● queue │
│     reviewer · queued          │
├────────────────────────────────┤
│ [🧪]  Test Runner       ● idle │
│     tester · idle              │
└────────────────────────────────┘
```

- Each agent card: icon (28x28) + name + role/status text + status badge with dot
- Hover: `rgba(0,212,255,0.03)` background
- **Data source**: `agent_runs` grouped by agentId for this workspace

**Pending Approvals** (below agent list, if any):

```
Pending Approvals
┌────────────────────────────────┐
│ [ShieldCheck] write_file       │
│     [high risk]                │
│ Jarvis wants to write_file on  │
│ src/components/Dashboard.tsx   │
│                                │
│ [✓ Approve] [✕ Deny] [Details]│
└────────────────────────────────┘
```

- Amber-bordered card
- Shows: action, risk level badge, agent name, target file
- Action buttons: Approve (`Check` icon, success), Deny (`X` icon, danger), Details (ghost)
- **Data source**: `approval_requests` where status = "pending"

#### Tab: Runs

Shows agent run cards:

```
┌────────────────────────────────┐
│ Scaffold frontend    [running]  │
│ [🤖] Jarvis  ⏱ running...      │
│ ━━━━━━━━━━━░░░░░ 65%           │
└────────────────────────────────┘
```

- Each card: title + status badge + agent name + duration + progress bar
- Card style: `background: rgba(255,255,255,0.015)`, `border-radius: 8px`
- **Data source**: `agent_runs` where workspaceId matches

#### Tab: Files

Shows file changes:

```
[+]  src/App.tsx                  +12 -3
[~]  src/main.tsx                 +8 -0
[+]  src/components/shell/AppShell.tsx  +45 -0
```

- Each row: add/mod icon + file path (monospace) + line stats (colored: emerald for add, amber for mod)
- **Data source**: `agent_run_events` (type: file_change) or `tool_call_logs` with file operations

#### Tab: Artifacts

Shows workspace artifacts:

```
┌────────────────────────────────┐
│ [FileText] Project Specification│
│     spec · 14:18 · 2.4 KB     │
├────────────────────────────────┤
│ [BarChart] Task Graph          │
│     plan · 14:20 · 1.1 KB     │
├────────────────────────────────┤
│ [Folder] Frontend Scaffold     │
│     file · 14:28 · 5 files    │
└────────────────────────────────┘
```

- Each card: icon + title + metadata (type, time, size)
- Card style: glass background, clickable
- **Data source**: `agent_runs.artifacts` JSON array + `tasks.artifacts`

### 4.7 Modals

#### Project Spec Modal

Shows the structured project specification:

```
┌─────────────────────────────────┐
│ Project Spec                [X] │
├─────────────────────────────────┤
│ SUMMARY                         │
│ ┌─────────────────────────────┐ │
│ │ Build a usable food tracking│ │
│ │ web app with calorie count..│ │
│ └─────────────────────────────┘ │
│                                 │
│ GOALS                           │
│ ┌─────────────────────────────┐ │
│ │ • Calorie tracking per meal │ │
│ │ • Daily/weekly nutrition... │ │
│ │ • Meal photo upload         │ │
│ │ • Searchable food database  │ │
│ └─────────────────────────────┘ │
│                                 │
│ NON-GOALS                       │
│ ┌─────────────────────────────┐ │
│ │ • Mobile app                │ │
│ │ • Social features           │ │
│ └─────────────────────────────┘ │
│                                 │
│ TECH STACK                      │
│ ┌─────────────────────────────┐ │
│ │ "React 19", "TypeScript",  │ │
│ │ "Vite", "Tailwind CSS"     │ │
│ └─────────────────────────────┘ │
│                                 │
│ CONSTRAINTS                     │
│ ┌─────────────────────────────┐ │
│ │ • Must run locally          │ │
│ │ • No external API deps      │ │
│ │ • Offline-first             │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- Sections separated by `margin-bottom: 12px`
- Each section: hud-label title with left accent bar + code block container
- Code blocks: dark background, monospace, syntax-colored strings in emerald
- **Data source**: `tasks.artifacts` JSON where type = "spec" or `workspaces.settings` JSON

#### Agent Team Proposal Modal

Shows the Agent Broker's recommended team:

```
┌──────────────────────────────────────────────┐
│ [Bot] Agent Team Proposal               [X]  │
├──────────────────────────────────────────────┤
│ Jarvis recommends the following agent team:  │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ [📝]  Planner Agent                      │ │
│ │     role: planner · executor: self       │ │
│ │     Analyze requirements, create project │ │
│ │     spec, and generate task graph.       │ │
│ │     [low risk]                           │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ [🤖]  Jarvis (Coding Agent)              │ │
│ │     role: builder · executor: claude-code│ │
│ │     Implement frontend, backend, and     │ │
│ │     persistence layer based on the spec. │ │
│ │     [high risk] [!] requires file write +│ │
│ │     shell permissions                    │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ [🔧]  Code Reviewer                      │ │
│ │     role: reviewer · executor: self      │ │
│ │     Review generated code for quality,   │ │
│ │     security, and best practices.        │ │
│ │     [medium risk]                        │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [!] Coding Agent will request file write and │
│   shell execution permissions. Confirm       │
│   before starting high-risk work.            │
│                                              │
│                        [Cancel] [✓ Confirm]  │
└──────────────────────────────────────────────┘
```

- Each agent card: icon (36x36) + name + role/executor info + reason text + risk level badge
- Risk badges: low (emerald), medium (amber), high (rose)
- Warning box: amber background + border, explains permission requirements
- Footer: Cancel (ghost) + Confirm Team (primary)
- **Note**: Agent Team Proposal is a future feature (Phase 4). The modal structure is defined here for completeness.

### 4.8 Empty & Error States

#### No Workspaces

- Icon: `FolderKanban` (48px, `var(--text-tertiary)`)
- Title: "No workspaces yet"
- Description: "Create one to get started"
- Action: "+ New Workspace" button

#### No Tasks in Workspace

- Icon: `ListTodo` (48px, `var(--text-tertiary)`)
- Title: "No tasks yet"
- Description: "Workspace is being planned..."
- Animation: loading spinner (`Loader2`, spinning)

#### No Agents Found by Broker

- Icon: `Bot` (48px, `var(--text-tertiary)`)
- Title: "No matching agents found"
- Description: "The broker couldn't find agents with the required capabilities"
- Action: "Create Agent" button (links to AgentsView)

#### Run Stuck / Failed

- Icon: `AlertTriangle` (48px, `#ffb800`)
- Title: "Run encountered an error"
- Description: [error message from `agent_runs.error`]
- Action: "Retry" button (`RotateCcw` icon) + "View Logs" button

#### Daemon Disconnected

- Icon: `XCircle` (48px, `#ff3d5a`)
- Title: "Daemon disconnected"
- Description: "Cannot reach the Jarvis backend. Check if the daemon is running."
- Action: "Reconnect" button (`RotateCcw` icon)

#### Approval Pending Too Long

- Badge: amber pulsing dot
- Title: "Approval pending"
- Description: "Waiting for user decision on [tool_name]"
- Auto-highlight after 60s pending

#### External CLI Not Found

- Icon: `AlertTriangle` (48px, `#ffb800`)
- Title: "CLI agent not available"
- Description: "[command] is not installed or not in PATH"
- Action: "Install Instructions" link

---

## 5. Data Model

> **Important**: The types below are **ViewModels** for the UI, not direct database schemas. See Section 9 for alignment with the actual backend.

### 5.1 AgentProfileViewModel

```typescript
// Maps to: agent_profiles table + computed fields
interface AgentProfileViewModel {
  // ---- From agent_profiles table ----
  id: string;
  name: string;
  description: string | null;
  modelPolicy: {
    preferredModels?: string[];
    fallbackModel?: string;
    maxTokens?: number;
    temperature?: number;
    provider?: string;
  };
  executorPolicy: {
    executor: 'self' | 'codex' | 'claude-code' | 'opencode';
    maxConcurrent?: number;
    workDir?: string;
    extraArgs?: string[];
  } | null;
  skills: string[];
  tools: string[];
  knowledgeScopes: string[];
  permissions: string[];
  memoryScopes: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;

  // ---- Computed / derived fields (Phase 2+) ----
  role?: string;           // Future: from agent_profiles.role or settings JSON
  enabled?: boolean;       // Future: from agent_profiles.enabled
  totalRuns?: number;      // Derived from agent_runs count
  successRate?: number;    // Derived from agent_runs status
  lastUsedAt?: string;     // Derived from agent_runs MAX(started_at)
  usedInWorkspaces?: Array<{  // Future: from workspace_agents
    id: string;
    name: string;
    status: string;
  }>;
}
```

### 5.2 WorkspaceSummary

```typescript
// For workspace list sidebar — lightweight
interface WorkspaceSummary {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'planning' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;          // Derived from tasks
  taskCount: number;         // Derived from tasks count
  agentCount: number;        // Derived from agent_runs distinct agents
  createdAt: string;
  updatedAt: string;
}
```

### 5.3 WorkspaceDetail

```typescript
// For center panel — full execution state
interface WorkspaceDetail extends WorkspaceSummary {
  goal: string;              // From workspaces.description or settings
  tokens: {
    input: number;
    output: number;
    cost: string;
  };
  tasks: TaskViewModel[];
  agents: WorkspaceAgentViewModel[];
  timeline: WorkspaceTimelineItem[];
  approvals: ApprovalViewModel[];
  fileChanges: FileChangeViewModel[];
  artifacts: ArtifactViewModel[];
  spec: ProjectSpec | null;
  chatMessages: ChatMessageViewModel[];
}
```

### 5.4 TaskViewModel

```typescript
// Maps to: tasks table
interface TaskViewModel {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'queued' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled';
  agent: string | null;      // Agent name (from agent_profiles via assignedAgentId)
  agentIcon: string | null;  // Agent role icon
  progress: number;          // Derived from run events
  dependsOn: string[];       // From tasks.dependencies JSON
  retryCount: number;        // Derived from runHistory
}
```

### 5.5 WorkspaceTimelineItem

```typescript
// Aggregated from multiple source tables for timeline display
interface WorkspaceTimelineItem {
  id: string;
  time: string;
  type: 'run' | 'tool' | 'memory' | 'approval' | 'system';
  icon: string;              // lucide-react icon name
  color: string;             // CSS color for icon background
  message: string;
  file?: string;             // For tool events
  diff?: string;             // For tool events with file changes
  source: 'agent_run_events' | 'approval_requests' | 'tool_call_logs' | 'event_log' | 'audit_log';
  sourceId: string;          // ID in the source table
}
```

### 5.6 ApprovalViewModel

```typescript
// Maps to: approval_requests table
interface ApprovalViewModel {
  id: string;
  runId: string;
  toolName: string;
  args: unknown;
  risk: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  agentName: string;         // Derived from agent_runs.agentId
  targetFile?: string;       // Parsed from args
  preview?: string;
  createdAt: string;
  decidedAt: number | null;
}
```

### 5.7 WorkspaceAgentViewModel

```typescript
// Derived from agent_runs grouped by agentId
interface WorkspaceAgentViewModel {
  agentId: string;
  agentName: string;
  role: string;              // From agent profile or workspace assignment
  status: 'idle' | 'running' | 'completed' | 'failed' | 'queued';
  runCount: number;
  lastRunAt: string | null;
}
```

### 5.8 FileChangeViewModel

```typescript
// Derived from tool_call_logs with file operations
interface FileChangeViewModel {
  path: string;
  type: 'add' | 'modify' | 'delete';
  additions: number;
  deletions: number;
}
```

### 5.9 ArtifactViewModel

```typescript
// Derived from agent_runs.artifacts + tasks.artifacts
interface ArtifactViewModel {
  id: string;
  title: string;
  type: 'spec' | 'plan' | 'file' | 'report';
  time: string;
  size: string;
  sourceRunId?: string;
}
```

### 5.10 ChatMessageViewModel

```typescript
// Maps to: messages table (filtered by workspace conversation)
interface ChatMessageViewModel {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
```

---

## 6. Interaction Specifications

### 6.1 CSS-Only Transitions (No JS Mouse Handlers)

All hover/active/selected states use CSS transitions:

```css
.agent-card, .ws-card {
  transition: all 0.15s ease;
}
.agent-card:hover {
  background: rgba(0,212,255,0.03);
  border-left-color: rgba(0,212,255,0.1);
}
.agent-card.selected {
  background: rgba(0,212,255,0.06);
  border-left-color: #00d4ff;
  box-shadow: 0 0 12px rgba(0,212,255,0.05);
}
```

### 6.2 Inline Editing

- Click on editable field → `contentEditable = true` + editing class
- Enter key → save (blur)
- Escape key → restore original value + blur
- Visual: dark background + cyan border + white text

### 6.3 Section Collapse

- Click section header → toggle `.collapsed` class
- `ChevronDown` icon rotates -90deg
- Body hides with `display: none`
- No animation (instant toggle)

### 6.4 Modal Behavior

- Open: overlay fades in, modal slides up slightly
- Close: click overlay, press Escape, or click `X` button
- Backdrop blur: `4px`
- Scroll: modal body scrollable at `80vh` max

### 6.5 Toast Notifications

- Triggered by user actions (save, delete, clone, etc.)
- Position: fixed bottom-right
- Auto-dismiss: 2 seconds
- Animation: fade in + slide up (0.3s)

### 6.6 Empty State Animations

- Icon fades in from `opacity: 0, translateY(8px)`
- Title delayed 100ms
- Description delayed 200ms

### 6.7 Scrollbar Styling

```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.12); border-radius: 2px; }
```

---

## 7. Component File Structure

### 7.1 AgentsView

```
frontend/src/components/shell/views/
├── AgentsView.tsx            # Orchestrator (< 150 lines)
├── AgentListPanel.tsx        # Left 280px panel
├── AgentCard.tsx             # Single agent list item
├── AgentDetailPanel.tsx      # Center detail display
├── AgentEditPanel.tsx        # Modal edit/create form
├── AgentInspectorPanel.tsx   # Right 300px inspector
└── agentsView.css            # Transitions, animations
```

### 7.2 WorkspaceView

```
frontend/src/components/shell/views/
├── WorkspaceView.tsx          # Orchestrator
├── WorkspaceSidebar.tsx       # Left 260px workspace list
├── WorkspaceCard.tsx          # Single workspace list item
├── WorkspaceCenter.tsx        # Center panel (header + tasks + timeline + chat)
├── WorkspaceTaskGraph.tsx     # Task list with dependencies
├── WorkspaceTimeline.tsx      # Event timeline with filters
├── WorkspaceChat.tsx          # Embedded chat panel
├── WorkspaceRightPanel.tsx    # Right 320px tabbed panel
├── AgentTeamProposalModal.tsx # Agent broker proposal modal
├── ProjectSpecModal.tsx       # Project spec viewer modal
└── workspaceView.css          # Transitions, animations
```

### 7.3 Shared Primitives

```
frontend/src/components/ui/agent-os/
├── Tag.tsx                   # Colored chip component
├── SectionHeader.tsx         # Uppercase label with accent
├── FormField.tsx             # Label + input wrapper
├── MetaGrid.tsx              # Key-value metadata display
├── StatusBadge.tsx           # Status dot + label
├── GlassCard.tsx             # Glass background container
├── Toggle.tsx                # Enable/disable toggle switch
└── EmptyState.tsx            # Reusable empty state with icon + title + description
```

---

## 8. Scope and Constraints

### In Scope

- AgentsView: complete UI redesign with modular components
- WorkspaceView: new UI for workspace management
- All interactive features: inline editing, tag management, executor selection, modals, toasts
- CSS-only transitions (no JS mouse handlers)
- Uses existing design tokens from `globals.css`
- TagInput component reused from existing implementation

### Out of Scope (Phase 1)

- Backend schema changes (role, enabled, workspace_agents) — Phase 2
- Agent Team Proposal Modal real data — Phase 4
- Workspace chat real data — Phase 5
- Real-time WebSocket updates — future
- New npm dependencies

### Design Principles

1. Agent Profile is a **reusable template**, not a live execution view
2. Workspace is the **execution boundary** for a user goal
3. Task Graph is the **progress source**
4. Agent Run Event is the **activity/timeline source**
5. UI separates **configuration** from **live execution**
6. Parent status is **derived from child state**
7. High-risk tools require **explicit permission**
8. All interactions use **CSS transitions**, not JS mouse handlers
9. Use **lucide-react** icons everywhere, never emoji
10. Borders are **neutral by default**, cyan only for active/selected states

---

## 9. Backend Contract Alignment

### 9.1 Current Backend Schema (DB Tables)

These fields exist in the database **today**:

**`agent_profiles`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| name | text | |
| description | text | nullable |
| modelPolicy | text (JSON) | preferredModels, fallbackModel, maxTokens, temperature |
| executorPolicy | text (JSON) | executor, maxConcurrent, workDir |
| skills | text (JSON[]) | |
| tools | text (JSON[]) | |
| knowledgeScopes | text (JSON[]) | |
| permissions | text (JSON[]) | |
| memoryScopes | text (JSON[]) | |
| isDefault | boolean | |
| createdAt | text | |
| updatedAt | text | |

**`workspaces`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| name | text | |
| description | text | nullable |
| ownerId | text | |
| settings | text (JSON) | |
| createdAt | text | |
| updatedAt | text | |

**`tasks`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| userId | text | |
| workspaceId | text FK | references workspaces |
| projectId | text FK | references projects |
| title | text | |
| description | text | |
| status | text enum | draft/queued/running/blocked/failed/completed/cancelled/pending/in_progress/done/deleted |
| assignedAgentId | text FK | references agent_profiles |
| dependencies | text (JSON[]) | task IDs |
| blockedBy | text (JSON[]) | task IDs |
| artifacts | text (JSON[]) | artifact refs |
| runHistory | text (JSON[]) | run refs |

**`agent_runs`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| workspaceId | text FK | |
| projectId | text FK | |
| taskId | text | |
| agentId | text FK | references agent_profiles |
| status | text enum | queued/running/succeeded/failed/cancelled/waiting_for_approval |
| mode | text enum | chat/voice/tick/scheduled/workflow/regenerate |
| selectedModel | text | |
| selectedTools | text (JSON[]) | |
| toolCalls | text (JSON[]) | |
| toolCallCount | integer | |
| artifacts | text (JSON[]) | |
| approvals | text (JSON[]) | |
| startedAt | text | |
| completedAt | text | |
| durationMs | integer | |
| error | text | |

**`agent_run_events`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| runId | text FK | references agent_runs |
| sequence | integer | |
| type | text | event type string |
| payload | text (JSON) | |
| createdAt | text | |

**`approval_requests`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| runId | text FK | references agent_runs |
| toolName | text | |
| args | text (JSON) | |
| risk | text | |
| status | text enum | pending/approved/denied/expired |
| preview | text | |
| createdAt | integer | unix timestamp |

**`tool_call_logs`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| toolName | text | |
| args | text (JSON) | |
| resultSuccess | boolean | |
| resultData | text (JSON) | |
| durationMs | integer | |
| conversationId | text | |

**`conversations`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| workspaceId | text FK | nullable |
| title | text | |
| modelUsed | text | |

**`messages`**
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| conversationId | text FK | |
| role | text enum | user/assistant/system/tool |
| content | text | |

### 9.2 Missing Fields (Needed for Full Feature Set)

| Table | Field | Type | Purpose |
|-------|-------|------|---------|
| agent_profiles | role | text | Agent role (planner/coding/review/testing/research/general) |
| agent_profiles | enabled | boolean | Enable/disable toggle |
| workspaces | status | text enum | Workspace execution status |
| workspaces | goal | text | User's goal description |
| workspaces | progress | integer | Overall progress percentage |
| workspaces | tokens_input | integer | Total input tokens used |
| workspaces | tokens_output | integer | Total output tokens used |
| workspaces | cost | text | Total cost string |
| workspace_agents | (new table) | — | Maps agents to workspaces with role |
| artifacts | (new table) | — | Structured artifact storage |

### 9.3 Existing APIs (Currently Available)

| API | Endpoint | Returns |
|-----|----------|---------|
| List agents | `list_agents` | `AgentProfile[]` |
| Create agent | `create_agent` | `AgentProfile` |
| Update agent | `update_agent` | `AgentProfile` |
| Delete agent | `delete_agent` | void |
| List workspaces | `list_workspaces` | `Workspace[]` |
| Create workspace | `create_workspace` | `Workspace` |
| List projects | `list_projects` | `Project[]` |
| Create project | `create_project` | `Project` |
| List runs | `list_runs` | `AgentRun[]` |
| List run events | `list_run_events` | `AgentRunEvent[]` |
| List approvals | `list_approvals` | `ApprovalRequest[]` |

### 9.4 Missing APIs (Needed for Full Feature Set)

| API | Purpose | Phase |
|-----|---------|-------|
| Get workspace detail | Aggregated workspace state | Phase 3 |
| Get workspace timeline | Timeline events from multiple tables | Phase 3 |
| Get workspace agents | Agent participation list | Phase 2 |
| Create workspace from goal | User goal → workspace + agent team | Phase 4 |
| Agent team proposal | Broker recommends agents | Phase 4 |
| Workspace chat messages | Workspace-scoped conversation | Phase 5 |
| Workspace artifacts | Structured artifact list | Phase 3 |

---

## 10. Implementation Phasing

### Phase 1: AgentsView with Current API Fields

**Goal**: Complete AgentsView redesign using only fields that exist in the current backend.

**Scope**:
- [ ] Create feature branch `feat/agents-workspace-ui-redesign`
- [ ] Extract shared UI primitives (Tag, SectionHeader, FormField, MetaGrid, StatusBadge, GlassCard, EmptyState)
- [ ] Create `agentsView.css` with all transition/animation CSS
- [ ] Build `AgentCard` component
- [ ] Build `AgentListPanel` with search + role filter chips
- [ ] Build `AgentDetailPanel` with collapsible sections (Basic Info, Capabilities, Code Executor, Scopes, Model Policy)
- [ ] Build `AgentInspectorPanel` with usage stats (from agent_runs), test result, quick actions
- [ ] Build `AgentEditPanel` modal with form fields
- [ ] Refactor `AgentsView` orchestrator to compose new components
- [ ] Handle empty states (no agents, no selected agent)
- [ ] Run type check (`pnpm tsc --noEmit`)
- [ ] Run build verification (`pnpm build`)
- [ ] Commit: `feat(agents-view): redesign with modular components`

**Fields used**: id, name, description, modelPolicy, executorPolicy, skills, tools, knowledgeScopes, permissions, memoryScopes, isDefault, createdAt, updatedAt

**Fields NOT yet available** (hidden/placeholder):
- `role` → shown as "general" always
- `enabled` → toggle hidden
- `usedInWorkspaces` → shows "Not used in any workspace"
- `totalRuns` / `successRate` → computed from agent_runs (available)

### Phase 2: Backend Fields Alignment

**Goal**: Add missing fields to agent_profiles and create workspace_agents table.

**Scope**:
- [ ] Add `role` field to `agent_profiles` table (migration)
- [ ] Add `enabled` field to `agent_profiles` table (migration)
- [ ] Create `workspace_agents` table (workspaceId, agentId, role, assignedTaskIds)
- [ ] Update agent API endpoints to handle new fields
- [ ] Update frontend AgentProfile schema
- [ ] Enable role selector in AgentEditPanel
- [ ] Enable enabled/disabled toggle in AgentDetailPanel
- [ ] Enable "Used In" section in AgentInspectorPanel
- [ ] Commit: `feat(backend): add role, enabled, workspace_agents`

### Phase 3: WorkspaceView with Real Data

**Goal**: Build WorkspaceView using real workspace/task/run data.

**Scope**:
- [ ] Add workspace status/goal/progress/tokens fields (migration)
- [ ] Build workspace detail API endpoint (aggregated state)
- [ ] Build workspace timeline API (aggregated from multiple tables)
- [ ] Create workspace UI primitives (WorkspaceCard, StatusBadge variants)
- [ ] Build `WorkspaceSidebar` with workspace list
- [ ] Build `WorkspaceCenter` with header + progress bar
- [ ] Build `WorkspaceTaskGraph` from real tasks
- [ ] Build `WorkspaceTimeline` from real events
- [ ] Build `WorkspaceRightPanel` with tabs (Agents, Runs, Files, Artifacts)
- [ ] Handle all empty/error states
- [ ] Commit: `feat(workspace-view): build with real data`

### Phase 4: Agent Broker & Team Proposal

**Goal**: Connect Agent Broker for automatic agent selection.

**Scope**:
- [ ] Build agent team proposal API endpoint
- [ ] Build `AgentTeamProposalModal` component
- [ ] Connect "New Workspace" flow to agent broker
- [ ] Show risk levels and permission warnings
- [ ] Commit: `feat(workspace): agent team proposal modal`

### Phase 5: Workspace Chat, Approvals, Artifacts

**Goal**: Complete remaining workspace features.

**Scope**:
- [ ] Build workspace-scoped chat (conversations + messages)
- [ ] Build real-time approval cards
- [ ] Build artifact viewer
- [ ] Build file change list
- [ ] Connect all data sources
- [ ] Commit: `feat(workspace): chat, approvals, artifacts`

---

## 11. View Relationships

```
┌─────────────────────────────────────────────────┐
│                   ShellView                      │
├──────────┬──────────┬──────────┬────────────────┤
│ AgentsView│Workspace │ Projects │    RunsView    │
│ (config)  │  View    │   View   │   (history)    │
│           │ (exec)   │ (assets) │                │
├──────────┼──────────┼──────────┼────────────────┤
│ agent_    │workspaces│ projects │  agent_runs    │
│ profiles  │tasks     │          │  (all)         │
│           │agent_    │          │                │
│           │runs      │          │                │
│           │approval_ │          │                │
│           │requests  │          │                │
└──────────┴──────────┴──────────┴────────────────┘
```

- **AgentsView** = agent template configuration (what CAN an agent do)
- **WorkspaceView** = execution现场 (what IS happening now)
- **ProjectsView** = project resources (what FILES exist)
- **RunsView** = global run history (what HAS happened)

They do NOT overlap. WorkspaceView is the upper orchestration layer that references agents, tasks, and runs.
