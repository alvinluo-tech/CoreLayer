# Dynamic Data Panel Design

## Problem

When the AI calls tools (task queries, reading stats, media lookups, etc.), the results are only shown as truncated JSON in chat bubbles. The `result` field in `MessageBubble` is never rendered. Voice interaction has a sci-fi overlay but no structured data display. Users see raw text instead of rich, interactive data visualizations.

## Solution

A **Dynamic Data Panel** system that renders tool call results as structured, animated visualizations in a floating window — sci-fi aesthetic matching the existing JarvisVoiceOverlay style.

## Architecture

### Three-Layer Rendering Strategy

```
┌─────────────────────────────────────────────┐
│  Layer 3: LLM renderHint (runtime override) │
│  LLM can override default at call time      │
├─────────────────────────────────────────────┤
│  Layer 2: Registered custom components      │
│  Apps register specialized renderers        │
├─────────────────────────────────────────────┤
│  Layer 1: Schema-driven generic renderer    │
│  Tool declares dataView schema → auto-render│
│  Covers 80% of cases                        │
└─────────────────────────────────────────────┘
```

Priority: LLM hint > tool custom component > tool schema > generic JSON fallback.

### Data Flow

```
AI calls tool
  → SSE tool-result event: { name, toolCallId, result, renderHint? }
    → DataPanelStore receives result
      → Resolve renderer:
        1. Check LLM renderHint → use specified renderer
        2. Check tool registry for custom component → use it
        3. Check tool.dataView schema → schema-driven renderer
        4. Fallback → GenericJSON renderer
      → Float window appears with rendered data
        → Auto-dismiss after configurable timeout (default 30s)
```

### Float Window

Separate Tauri webview window (like AssistantMirror), positioned to not overlap with the voice overlay:

| Mode                   | Voice Overlay                           | Data Panel                       |
| ---------------------- | --------------------------------------- | -------------------------------- |
| Main window active     | Bottom-right of main window             | Right side of main window        |
| Background/mirror mode | Bottom-right floating window (existing) | Right side floating window (new) |

The data panel float window:

- Width: 400px, auto-height based on content
- Position: right edge, vertically centered
- Appears with slide-in animation from right
- Disappears with fade-out
- Stays on top of other windows
- Has a close button and auto-dismiss timer

### Trigger Conditions

Panel shows when:

1. A tool returns structured data (not plain text)
2. The tool has a `dataView` schema or custom renderer registered
3. The data is non-empty

Panel does NOT show when:

- Tool returns a simple success/error message
- Tool is marked `displayMode: 'silent'`
- User has manually dismissed the panel within the current session

## Schema-Driven Rendering

### DataView Schema Definition

```typescript
interface DataViewSchema {
  type: 'list' | 'stats' | 'detail' | 'table' | 'timeline';
  title?: string; // Panel title
  itemShape?: {
    primary: string; // Main display field
    secondary?: string; // Subtitle field
    badge?: string; // Badge/tag field
    icon?: string; // Icon field or icon name
    progress?: string; // Progress bar field (0-1 or 0-100)
    status?: string; // Status field → color coded
  };
  columns?: string[]; // For table type
  stats?: string[]; // For stats type - field names to show as metric cards
  groupBy?: string; // Group items by this field
  sortBy?: string; // Sort items by this field
  actions?: string[]; // Available actions on items
}
```

### Built-in Renderer Mapping

| Schema Type | Component           | Description                                 |
| ----------- | ------------------- | ------------------------------------------- |
| `list`      | `DataPanelList`     | Scrollable list with item shape fields      |
| `stats`     | `DataPanelStats`    | Grid of metric cards with animated counters |
| `detail`    | `DataPanelDetail`   | Single item with field-by-field display     |
| `table`     | `DataPanelTable`    | Columnar table with sortable headers        |
| `timeline`  | `DataPanelTimeline` | Chronological event list with connectors    |

### Tool Registration Example

```typescript
// Built-in tool
registerJarvisTool({
  id: 'native:taskflow_list_tasks',
  name: 'taskflow_list_tasks',
  dataView: {
    type: 'list',
    title: 'Tasks',
    itemShape: {
      primary: 'title',
      secondary: 'description',
      badge: 'priority',
      icon: 'statusIcon',
      progress: 'completion',
      status: 'status',
    },
    groupBy: 'status',
    sortBy: 'priority',
  },
  // ...
});

// MCP tool — via annotations
annotations: {
  dataView: {
    type: 'list',
    title: 'Media Library',
    itemShape: { primary: 'name', secondary: 'type', badge: 'format' },
  },
}
```

## Visual Design

### Sci-Fi Aesthetic (matching JarvisVoiceOverlay)

All components share a unified visual theme:

| Element                | Style                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| Background             | `rgba(10, 15, 25, 0.95)` with subtle noise texture                       |
| Card border            | 1px with cyan/amber glow, `box-shadow: 0 0 15px rgba(0, 200, 255, 0.15)` |
| Title                  | Monospace, uppercase, cyan color, letter-spacing 2px                     |
| Text                   | Light gray (`#c8d6e5`), monospace for data fields                        |
| Status DONE            | Emerald glow (`#10b981`)                                                 |
| Status WIP/IN_PROGRESS | Amber pulse (`#f59e0b`)                                                  |
| Status TODO/PENDING    | Dim gray (`#6b7280`)                                                     |
| Progress bar           | Gradient fill with pulse animation                                       |
| Dividers               | Thin lines with subtle glow                                              |
| Scrollbar              | Thin, transparent track, cyan thumb                                      |

### Animations

| Animation      | Trigger       | Implementation                                   |
| -------------- | ------------- | ------------------------------------------------ |
| Panel slide-in | Data arrives  | CSS transform translateX + transition            |
| Item fade-in   | Panel opens   | Staggered opacity + translateY, 50ms per item    |
| Number counter | Stats display | JS requestAnimationFrame, ease-out curve         |
| Progress pulse | Progress bars | CSS animation, slow opacity oscillation          |
| Scanline       | Title bar     | CSS pseudo-element, top-to-bottom sweep, 3s loop |
| Border glow    | Always        | CSS animation, subtle brightness oscillation     |

### Panel Layout

```
┌──────────────────────────────────┐ ← glow border
│  ◈ TASKS                    3/5  │ ← title bar + scanline
│  ══════════════════════════════  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ ▸ [■■■■□] 完成API重构     │  │ ← list item (staggered)
│  │   P4 · DONE                │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ ▸ [■■□□□] 集成MCP工具     │  │
│  │   P3 · IN_PROGRESS         │  │
│  └────────────────────────────┘  │
│                                  │
│  ◆ COMPLETION  60% ████████░░   │ ← stats bar
│                                  │
│  ─────────────────────────────── │
│  [✕]            auto-dismiss 25s│ ← footer
└──────────────────────────────────┘
```

## File Structure

```
frontend/src/components/data-panel/
├── DataPanelFloat.tsx        # Float window container (Tauri webview)
├── DataPanelContainer.tsx    # Panel layout with slide-in animation
├── DataPanelHeader.tsx       # Title bar with icon and close button
├── renderers/
│   ├── DataPanelList.tsx     # List renderer
│   ├── DataPanelStats.tsx    # Stats grid renderer
│   ├── DataPanelDetail.tsx   # Detail view renderer
│   ├── DataPanelTable.tsx    # Table renderer
│   ├── DataPanelTimeline.tsx # Timeline renderer
│   └── GenericJSON.tsx       # Fallback JSON renderer
├── resolveRenderer.ts        # L3 > L2 > L1 > fallback resolution
├── data-panel.css            # Shared sci-fi theme + animations
└── DataPanelFloatWindow.tsx  # Separate Tauri window entry point

frontend/src/stores/
└── dataPanelStore.ts         # Zustand store for panel state

frontend/src/types/
└── dataView.ts               # DataViewSchema type definitions
```

## Integration Points

### 1. Tool Registry

Add `dataView` field to `JarvisTool` type in `@jarvis/types`:

```typescript
interface JarvisTool {
  // ... existing fields
  dataView?: DataViewSchema;
}
```

### 2. MCP Annotations

Extend `MCPToolAnnotations` to include `dataView`:

```typescript
interface MCPToolAnnotations {
  // ... existing fields
  dataView?: DataViewSchema;
}
```

The `fromMCPTools()` converter in tool-registry reads this annotation.

### 3. SSE Events

The existing `tool-result` SSE event already carries `result`. No protocol change needed — the frontend just needs to render it.

### 4. Prompt Builder

Add render hint instructions to the system prompt:

```
## 数据展示
当调用工具返回结构化数据时，你可以在响应中附加 renderHint 来指定展示方式。
可用的渲染类型: list, stats, detail, table, timeline
示例: [renderHint:{"type":"stats","stats":["completionRate","totalTasks"]}]
```

## Implementation Phases

### Phase 1: Foundation

- `DataViewSchema` type definitions
- `dataPanelStore` (Zustand)
- `resolveRenderer` logic
- `GenericJSON` fallback renderer

### Phase 2: Core Renderers

- `DataPanelList` — the most needed (tasks, articles, media)
- `DataPanelStats` — metrics display
- `DataPanelContainer` — slide-in panel with sci-fi theme

### Phase 3: Float Window

- `DataPanelFloat` — Tauri webview window
- Position management (avoid voice overlay)
- Auto-dismiss logic
- Window show/hide via Tauri IPC

### Phase 4: Integration

- Wire into SSE `tool-result` events in `useChat`/`useVoiceConversation`
- Add `dataView` to tool registry types
- Update `fromMCPTools()` to read `dataView` annotation
- Add render hint instructions to system prompt

### Phase 5: Polish

- `DataPanelDetail`, `DataPanelTable`, `DataPanelTimeline` renderers
- Animation refinement
- Keyboard shortcuts (Esc to dismiss)
- History — browse past tool results

## Open Questions

- **Data lifecycle**: Should the panel persist until manually dismissed, or auto-dismiss? → Auto-dismiss after 30s, with manual override
- **Multiple results**: If AI calls 3 tools in sequence, show latest or stack? → Show latest, with small indicator of count
- **Performance**: Large result sets (100+ tasks) → virtualize list rendering, limit display to 50 items with "show more"
