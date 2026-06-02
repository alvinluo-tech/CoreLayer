# Adaptive Data Panel — Design Spec

**Date**: 2026-06-02
**Status**: Approved
**Branch**: feat/dynamic-data-panel

## Problem

The data panel currently has 3 fixed renderers (List, Stats, GenericJSON). When tool results don't match known patterns, they fall back to raw JSON display. As more data sources are added, it becomes impossible to pre-define renderers for every data shape. The panel needs to handle **any** data structure gracefully while maintaining a sci-fi holographic aesthetic.

## Goals

1. **Never show raw JSON** — every data shape gets a structured, styled visualization
2. **Automatic layout** — the panel analyzes data structure and picks the best display
3. **Adaptive density** — layout adjusts based on data volume (1-3 items → big cards, 4-15 → compact list, 16+ → grid)
4. **Holographic sci-fi style** — cyan glow, scanlines, terminal headers, pulse animations
5. **Incremental enhancement** — build on existing code, don't rewrite from scratch

## Architecture: Hybrid Mode

```
resolveRenderer(data)
    ├── Known pattern match?
    │   ├── { tasks/articles } → DataPanelList (enhanced)
    │   ├── { numeric >= 60% } → DataPanelStats (enhanced)
    │   └── { single object }  → DataPanelDetail (new)
    │
    └── Unknown data → AdaptiveRenderer (new)
                        ├── Analyze field types
                        ├── Compute density mode
                        └── Compose UI atoms
```

**Principle**: Known tools get polished specific renderers. Unknown tools get smart adaptive rendering. No data falls through to JSON.

## Components

### 1. AdaptiveRenderer (new)

The universal fallback renderer. Inspects data recursively and composes UI atoms.

**Field Type Detection**:

| Value Pattern                         | Detected Type | Render                       |
| ------------------------------------- | ------------- | ---------------------------- |
| `title`, `name`, `label` key + string | Primary title | Large highlighted text       |
| URL string                            | Link          | Clickable link card          |
| ISO date string                       | Timestamp     | Time label with clock icon   |
| `true` / `false`                      | Status        | Status light (green/gray)    |
| Number                                | Metric        | Animated number card         |
| Nested object                         | Section       | Collapsible card             |
| Nested array                          | List          | Inline tag cloud or sub-list |
| `null` / `undefined`                  | Empty         | Dimmed dash                  |

**Density Modes**:

| Item Count | Mode       | Layout                                                        |
| ---------- | ---------- | ------------------------------------------------------------- |
| 1-3        | `detailed` | Full cards with all fields, glow borders, entrance animations |
| 4-15       | `compact`  | One-line per item, key fields only, bottom-border dividers    |
| 16+        | `grid`     | Multi-column grid, title + status dot only, hover glow        |

For objects (not arrays), always use `detailed` mode with sections for each key.

### 2. DataPanelDetail (new)

Renders a single object as a structured detail card. Used when tool returns `{ task: {...} }` or `{ article: {...} }`.

- Primary field (title/name) as header
- Status dot + badge in header row
- Key-value pairs below, grouped by type
- Nested objects rendered as collapsible sub-sections

### 3. UI Atoms (new shared components)

Reusable building blocks composed by AdaptiveRenderer and Detail:

| Atom            | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `StatusDot`     | Colored circle for status values                  |
| `Badge`         | Small label with background color                 |
| `StatValue`     | Animated number with optional unit                |
| `ProgressBar`   | Gradient fill bar                                 |
| `KeyValueRow`   | Label: value pair with type-aware styling         |
| `SectionHeader` | Collapsible section with count                    |
| `TimeLabel`     | Formatted timestamp with clock icon               |
| `LinkCard`      | Clickable URL with favicon                        |
| `TypeIcon`      | Visual indicator for data type (Aa, #, ◉, [], {}) |

### 4. Enhanced Existing Renderers

**DataPanelList**:

- Add density modes: `compact` (default for 4+ items) and `detailed` (default for 1-3)
- In `detailed` mode: show all fields in a card layout
- In `compact` mode: current single-line layout
- Improve autoDetectShape to use UI atoms for field rendering

**DataPanelStats**:

- Add entrance pulse animation on stat cards
- Support nested object expansion (e.g., `byCategory` → individual stat cards)

**resolveRenderer**:

- Add `detail` type detection: single non-array object → DataPanelDetail
- Route truly unknown data to AdaptiveRenderer instead of GenericJSON
- Keep GenericJSON only for edge cases (circular refs, functions, etc.)

### 5. Visual Enhancements (CSS)

**Terminal Header**:

```
[TOOL: getTodayTasks] • 14:32:07
```

Monospace, cyan, with blinking cursor animation.

**Density-Aware Styles**:

- `detailed`: full borders, glow shadow, 50ms stagger animation
- `compact`: bottom-border only, no animation, tighter padding
- `grid`: no borders, gap-based separation, hover glow

**Scanline Enhancement**:

- Data items trigger a left-to-right scan highlight on entrance
- Only in `detailed` mode (performance)

**Nested Structure Lines**:

- Nested objects connected by glowing vertical indent lines
- Similar to code editor indentation guides

## File Changes

| File                                                                | Change                                         |
| ------------------------------------------------------------------- | ---------------------------------------------- |
| `frontend/src/components/data-panel/resolveRenderer.ts`             | Add `detail` routing, route unknown → adaptive |
| `frontend/src/components/data-panel/renderers/AdaptiveRenderer.tsx` | **New** — universal adaptive renderer          |
| `frontend/src/components/data-panel/renderers/DataPanelDetail.tsx`  | **New** — single object detail card            |
| `frontend/src/components/data-panel/renderers/ui-atoms.tsx`         | **New** — shared UI building blocks            |
| `frontend/src/components/data-panel/renderers/DataPanelList.tsx`    | Add density modes, use UI atoms                |
| `frontend/src/components/data-panel/renderers/DataPanelStats.tsx`   | Entrance animations, nested expansion          |
| `frontend/src/components/data-panel/DataPanelContainer.tsx`         | Terminal header, new renderer types            |
| `frontend/src/components/data-panel/data-panel.css`                 | Density styles, visual enhancements            |

**No changes to**: useChat.ts, dataPanelStore.ts, sseParser.ts, daemon code.

## Density Mode Selection Logic

```typescript
function selectDensity(data: unknown): 'detailed' | 'compact' | 'grid' {
  if (!Array.isArray(data)) return 'detailed';
  if (data.length <= 3) return 'detailed';
  if (data.length <= 15) return 'compact';
  return 'grid';
}
```

## Verification

1. `pnpm -r typecheck` — no type errors
2. Send "查看任务" → task list with status dots, priority badges, density adapts to count
3. Send "阅读清单" → article list with status indicators
4. Send "今日总结" → stats grid with animated numbers
5. Send arbitrary text that triggers an unknown tool → adaptive renderer shows structured view, never raw JSON
6. Test with 1 item, 5 items, 20+ items → density modes switch correctly
7. Panel auto-dismiss still works at 30s
