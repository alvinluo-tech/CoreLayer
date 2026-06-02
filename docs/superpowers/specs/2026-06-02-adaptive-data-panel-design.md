# Adaptive Data Panel — Design Spec (v2)

**Date**: 2026-06-02
**Status**: Approved
**Branch**: feat/dynamic-data-panel

## Problem

The data panel currently has 3 fixed renderers (List, Stats, GenericJSON). When tool results don't match known patterns, they fall back to raw JSON display. As more data sources are added, it becomes impossible to pre-define renderers for every data shape. The panel needs to handle **any** data structure gracefully while maintaining a sci-fi holographic aesthetic.

## Goals

1. **Never show raw JSON by default** — every data shape gets a structured visualization; raw payload available via debug drawer
2. **ViewModel-driven rendering** — normalize raw data into a display model before rendering
3. **Automatic layout** — the panel analyzes data structure and picks the best display
4. **Adaptive density** — layout adjusts based on data volume
5. **Holographic sci-fi style** — cyan glow, scanlines, terminal headers, pulse animations
6. **Incremental enhancement** — build on existing code, don't rewrite from scratch

## Architecture: ViewModel + Hybrid Rendering

```
Tool Result (raw JSON)
  ↓
normalizeDataPanelPayload()
  ↓
DataPanelViewModel
  ↓
resolveRenderer(viewModel)
  ↓
Known Renderer / Detail / Adaptive
  ↓
UI Atoms
```

**Key change from v1**: Raw data is normalized into a `DataPanelViewModel` before reaching renderers. Renderers only consume structured view models — they never analyze raw JSON.

## DataPanelViewModel

```typescript
interface DataPanelViewModel {
  id: string;
  source: {
    toolName: string;
    timestamp: string;
  };
  title: string;
  subtitle?: string;
  kind: 'list' | 'stats' | 'detail' | 'adaptive' | 'empty' | 'error';
  density: 'detailed' | 'compact' | 'grid';
  items?: DataPanelItem[];
  stats?: DataPanelStat[];
  detail?: DataPanelObject;
  raw?: unknown; // preserved for debug drawer
  debug?: {
    rendererReason: string;
    detectedShape: string;
  };
}

interface DataPanelItem {
  id?: string;
  primary: string;
  secondary?: string;
  status?: { value: string; color: string };
  badge?: { value: string; variant?: string };
  progress?: number;
  fields: DataPanelField[];
  raw?: unknown;
}

interface DataPanelField {
  key: string;
  label: string;
  value: unknown;
  type:
    | 'title'
    | 'text'
    | 'number'
    | 'boolean'
    | 'date'
    | 'url'
    | 'status'
    | 'badge'
    | 'object'
    | 'array'
    | 'null';
  confidence: number;
}

interface DataPanelStat {
  label: string;
  value: number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
}

interface DataPanelObject {
  fields: DataPanelField[];
  nested?: Record<string, DataPanelObject>;
}
```

## normalizeDataPanelPayload()

Separates data analysis from UI rendering. This function:

1. Extracts metadata (toolName, timestamp)
2. Detects data shape (array, object, primitive, null)
3. Analyzes field types with **confidence scores**
4. Selects density mode
5. Builds the ViewModel

### Field Type Detection with Confidence

| Value Pattern                                  | Detected Type        | Confidence       |
| ---------------------------------------------- | -------------------- | ---------------- |
| key is `title`/`name`/`label` + string         | title                | 0.9              |
| key is `id` AND `title`/`name` also exists     | text                 | 0.1 (downgraded) |
| key is `status`/`state`/`phase` + short string | status               | 0.9              |
| key is `priority`/`level`/`rank` + number      | badge                | 0.85             |
| key matches `createdAt`/`updatedAt`/`dueDate`  | date                 | 0.95             |
| value matches ISO 8601 pattern                 | date                 | 0.7              |
| value is valid URL                             | url                  | 0.85             |
| key is `is*`/`has*`/`can*` + boolean           | boolean (status dot) | 0.8              |
| plain boolean                                  | boolean (key-value)  | 0.5              |
| number                                         | number               | 0.9              |
| nested object                                  | object (section)     | 0.9              |
| nested array                                   | array (sub-list)     | 0.9              |
| null/undefined                                 | null                 | 1.0              |

**Confidence threshold**: Fields below 0.6 confidence render as generic key-value, not specialized atoms.

### Density Selection

```typescript
function selectDensity(data: unknown, context?: DensityContext): 'detailed' | 'compact' | 'grid' {
  if (!Array.isArray(data)) return 'detailed';
  const count = data.length;
  if (count <= 3) return 'detailed';
  if (count <= 15) return 'compact';
  return 'grid';
}
```

`context` parameter is reserved for future expansion (panel size, field count, user preference, etc.).

### Sensitive Field Redaction

```typescript
const SENSITIVE_KEYS = [
  'token',
  'apiKey',
  'password',
  'secret',
  'authorization',
  'cookie',
  'accessToken',
  'refreshToken',
  'auth',
  'credential',
];

// Fields matching these keys are rendered as "••••••" in the ViewModel
```

### Link Sanitization

Only `http://` and `https://` URLs are rendered as LinkCards. All other schemes (`javascript:`, `file:`, `data:`, `blob:`) are rendered as plain text.

## Renderer Selection (4-Layer Priority)

```typescript
function resolveRenderer(viewModel: DataPanelViewModel): RendererDecision {
  // Layer 1: Tool metadata (future: MCP displayMode, outputSchema)
  // Layer 2: Known pattern registry (tasks → list, stats → stats)
  // Layer 3: ViewModel kind (set by normalizeDataPanelPayload)
  // Layer 4: Fallback to adaptive
}
```

The `kind` field on ViewModel is set by `normalizeDataPanelPayload` based on data shape analysis:

- Array of objects → `kind: "list"`
- Mostly numeric → `kind: "stats"`
- Single object → `kind: "detail"`
- Empty/null → `kind: "empty"`
- Error shape → `kind: "error"`
- Everything else → `kind: "adaptive"`

## Components

### 1. AdaptiveRenderer (new)

Renders `kind: "adaptive"` ViewModels. Uses the pre-analyzed `DataPanelField[]` from the ViewModel — does NOT re-analyze raw data.

- Iterates fields, renders each with the appropriate UI atom based on `field.type`
- Nested objects → collapsible sections
- Nested arrays → inline tag clouds or sub-lists
- Density mode controls layout (detailed/compact/grid)

### 2. DataPanelDetail (new)

Renders `kind: "detail"` ViewModels (single objects).

- Primary field as header
- Status dot + badge in header row
- Key-value pairs below, grouped by type
- Nested objects as collapsible sub-sections

### 3. UI Atoms (new shared components)

| Atom            | Purpose                                   |
| --------------- | ----------------------------------------- |
| `StatusDot`     | Colored circle for status values          |
| `Badge`         | Small label with background color         |
| `StatValue`     | Animated number with optional unit        |
| `ProgressBar`   | Gradient fill bar                         |
| `KeyValueRow`   | Label: value pair with type-aware styling |
| `SectionHeader` | Collapsible section with count            |
| `TimeLabel`     | Formatted timestamp with clock icon       |
| `LinkCard`      | Clickable http/https URL (sanitized)      |
| `TypeIcon`      | Visual indicator for data type            |
| `DebugDrawer`   | Collapsible raw payload viewer            |

### 4. Enhanced Existing Renderers

**DataPanelList**:

- Add density modes: `detailed` (1-3 items) and `compact` (4+ items)
- In `detailed` mode: full card layout with all fields
- In `compact` mode: single-line layout with key fields
- Consume `DataPanelItem[]` from ViewModel instead of raw data

**DataPanelStats**:

- Consume `DataPanelStat[]` from ViewModel
- Add entrance pulse animation
- Support nested stat expansion

**resolveRenderer**:

- Route based on ViewModel `kind` field
- Keep GenericJSON only as absolute fallback for serialization failures

### 5. Debug Drawer

A collapsible section at the bottom of the panel:

```
[▸ View raw payload]     ← collapsed
[▾ View raw payload]     ← expanded
{ "tasks": [...], ... }  ← formatted JSON
```

Hidden by default. Available for development/debugging.

### 6. Visual Enhancements (CSS)

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

**Reduced Motion**:

```css
@media (prefers-reduced-motion: reduce) {
  .dp-scanline,
  .dp-pulse,
  .dp-item-in {
    animation: none;
  }
}
```

### 7. Panel State (MVP)

MVP keeps simple `visible/dismissed` via existing Zustand store. Pin functionality deferred to future iteration.

Multi-tool result handling: new tool result replaces current panel (existing behavior). Stack/tabs deferred.

## File Changes

| File                                                                | Change                                              |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| `frontend/src/components/data-panel/dataPanelTypes.ts`              | **New** — ViewModel, FieldRole, DensityMode types   |
| `frontend/src/components/data-panel/normalizeDataPanelPayload.ts`   | **New** — raw data → ViewModel normalization        |
| `frontend/src/components/data-panel/resolveRenderer.ts`             | Route by ViewModel `kind`, 4-layer priority         |
| `frontend/src/components/data-panel/renderers/AdaptiveRenderer.tsx` | **New** — universal adaptive renderer               |
| `frontend/src/components/data-panel/renderers/DataPanelDetail.tsx`  | **New** — single object detail card                 |
| `frontend/src/components/data-panel/renderers/ui-atoms.tsx`         | **New** — shared UI building blocks                 |
| `frontend/src/components/data-panel/renderers/DataPanelList.tsx`    | Consume ViewModel, add density modes                |
| `frontend/src/components/data-panel/renderers/DataPanelStats.tsx`   | Consume ViewModel, entrance animations              |
| `frontend/src/components/data-panel/DataPanelContainer.tsx`         | Terminal header, debug drawer, new renderers        |
| `frontend/src/components/data-panel/data-panel.css`                 | Density styles, visual enhancements, reduced motion |

**No changes to**: useChat.ts, dataPanelStore.ts, sseParser.ts, daemon code.

## Implementation Phases

### Phase 1: Foundation

- `dataPanelTypes.ts` — type definitions
- `ui-atoms.tsx` — shared UI building blocks
- `DataPanelDetail.tsx` — single object renderer
- `resolveRenderer.ts` — detail routing

### Phase 2: ViewModel + Adaptive

- `normalizeDataPanelPayload.ts` — data normalization with confidence scoring
- `AdaptiveRenderer.tsx` — universal renderer consuming ViewModel
- Update `DataPanelContainer` to wire normalization into render pipeline

### Phase 3: Enhance Known Renderers

- `DataPanelList.tsx` — density modes, ViewModel consumption
- `DataPanelStats.tsx` — ViewModel consumption, nested expansion
- Terminal header in `DataPanelContainer.tsx`
- CSS animations and density styles

### Phase 4: Polish & Safety

- Debug drawer (raw payload viewer)
- Sensitive field redaction
- Link sanitization
- `prefers-reduced-motion` support
- Performance testing

## Verification

1. `pnpm -r typecheck` — no type errors
2. Send "查看任务" → task list with status dots, priority badges, density adapts to count
3. Send "阅读清单" → article list with status indicators
4. Send "今日总结" → stats grid with animated numbers
5. Unknown tool result → adaptive renderer shows structured view, not raw JSON
6. Click "View raw payload" → debug drawer shows original JSON
7. Test with 1, 5, 20+ items → density modes switch correctly
8. URL fields → clickable LinkCards (http/https only)
9. Fields with `token`/`apiKey` names → shown as `••••••`
10. `prefers-reduced-motion` → all animations disabled
