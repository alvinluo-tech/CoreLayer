# Dynamic Data Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dynamic floating panel that renders tool call results as structured, sci-fi-styled visualizations instead of raw JSON in chat bubbles.

**Architecture:** Three-layer rendering strategy (LLM renderHint > tool dataView schema > heuristic > GenericJSON fallback). Zustand store receives tool results from SSE events, resolves the appropriate renderer, and displays in a slide-in panel with animated counters, progress bars, and scanline aesthetic matching JarvisVoiceOverlay.

**Tech Stack:** React 18, Zustand, TypeScript, CSS animations, Tauri IPC

---

## File Structure

| Action | File                                                              | Responsibility                      |
| ------ | ----------------------------------------------------------------- | ----------------------------------- |
| Create | `packages/types/src/dataView.ts`                                  | DataViewSchema + RenderHint types   |
| Modify | `packages/types/src/index.ts`                                     | Export dataView types               |
| Modify | `packages/types/src/tool.ts`                                      | Add dataView field to JarvisTool    |
| Create | `frontend/src/types/dataView.ts`                                  | Frontend re-exports + STATUS_COLORS |
| Create | `frontend/src/stores/dataPanelStore.ts`                           | Zustand store for panel state       |
| Create | `frontend/src/stores/dataPanelStore.test.ts`                      | Store unit tests                    |
| Create | `frontend/src/components/data-panel/resolveRenderer.ts`           | 3-layer renderer resolution         |
| Create | `frontend/src/components/data-panel/resolveRenderer.test.ts`      | Resolution tests                    |
| Create | `frontend/src/components/data-panel/data-panel.css`               | Sci-fi theme + animations           |
| Create | `frontend/src/components/data-panel/DataPanelHeader.tsx`          | Title bar with scanline             |
| Create | `frontend/src/components/data-panel/DataPanelContainer.tsx`       | Slide-in panel shell                |
| Create | `frontend/src/components/data-panel/renderers/GenericJSON.tsx`    | Fallback JSON renderer              |
| Create | `frontend/src/components/data-panel/renderers/DataPanelList.tsx`  | List renderer                       |
| Create | `frontend/src/components/data-panel/renderers/DataPanelStats.tsx` | Stats grid + counters               |
| Modify | `frontend/src/hooks/useChat.ts`                                   | Wire tool-result to dataPanelStore  |
| Modify | `frontend/src/App.tsx`                                            | Mount DataPanelContainer            |

---

## Task 1: DataViewSchema Types

**Files:**

- Create: `packages/types/src/dataView.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/tool.ts`

- [ ] **Step 1: Create DataViewSchema type definitions**

```typescript
// packages/types/src/dataView.ts

export type DataViewType = 'list' | 'stats' | 'detail' | 'table' | 'timeline';

export interface DataViewItemShape {
  primary: string;
  secondary?: string;
  badge?: string;
  icon?: string;
  progress?: string;
  status?: string;
}

export interface DataViewSchema {
  type: DataViewType;
  title?: string;
  itemShape?: DataViewItemShape;
  columns?: string[];
  stats?: string[];
  groupBy?: string;
  sortBy?: string;
  actions?: string[];
}

export interface RenderHint {
  type: DataViewType;
  title?: string;
  stats?: string[];
  columns?: string[];
}
```

- [ ] **Step 2: Add export to index**

Add to `packages/types/src/index.ts`:

```typescript
export * from './dataView';
```

- [ ] **Step 3: Add dataView field to JarvisTool**

In `packages/types/src/tool.ts`, add after line 54 (`displayMode?: ToolDisplayMode;`):

```typescript
  dataView?: import('./dataView').DataViewSchema;
```

- [ ] **Step 4: Verify types compile**

```bash
cd packages/types && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/dataView.ts packages/types/src/index.ts packages/types/src/tool.ts
git commit -m "feat(types): add DataViewSchema and RenderHint type definitions"
```

---

## Task 2: Frontend DataView Types

**Files:**

- Create: `frontend/src/types/dataView.ts`

- [ ] **Step 1: Create frontend types file**

```typescript
// frontend/src/types/dataView.ts
import type { DataViewSchema, DataViewType, DataViewItemShape, RenderHint } from '@jarvis/types';

export const STATUS_COLORS: Record<string, string> = {
  done: '#10b981',
  completed: '#10b981',
  in_progress: '#f59e0b',
  'in-progress': '#f59e0b',
  wip: '#f59e0b',
  pending: '#6b7280',
  todo: '#6b7280',
  error: '#ef4444',
  failed: '#ef4444',
};

export type { DataViewSchema, DataViewType, DataViewItemShape, RenderHint };
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/dataView.ts
git commit -m "feat(frontend): add frontend DataView types and status color map"
```

---

## Task 3: Data Panel Zustand Store

**Files:**

- Create: `frontend/src/stores/dataPanelStore.ts`
- Create: `frontend/src/stores/dataPanelStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/src/stores/dataPanelStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDataPanelStore } from './dataPanelStore';

describe('dataPanelStore', () => {
  beforeEach(() => {
    useDataPanelStore.setState({
      entries: [],
      activeId: null,
      isVisible: false,
      dismissedAt: null,
    });
  });

  it('should start with empty state', () => {
    const state = useDataPanelStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.activeId).toBeNull();
    expect(state.isVisible).toBe(false);
  });

  it('addEntry should add entry and make panel visible', () => {
    useDataPanelStore.getState().addEntry({
      toolCallId: 'tc-1',
      toolName: 'list_tasks',
      title: 'Tasks',
      data: [{ title: 'Test' }],
    });

    const state = useDataPanelStore.getState();
    expect(state.entries).toHaveLength(1);
    expect(state.activeId).toBe('tc-1');
    expect(state.isVisible).toBe(true);
  });

  it('addEntry should replace existing entry with same toolCallId', () => {
    const { addEntry } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'list_tasks', title: 'Tasks', data: [1] });
    addEntry({ toolCallId: 'tc-1', toolName: 'list_tasks', title: 'Updated', data: [2] });

    expect(useDataPanelStore.getState().entries).toHaveLength(1);
    expect(useDataPanelStore.getState().entries[0].title).toBe('Updated');
  });

  it('dismiss should hide panel and record timestamp', () => {
    const { addEntry, dismiss } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'a', title: 'A', data: [] });
    dismiss();

    const state = useDataPanelStore.getState();
    expect(state.isVisible).toBe(false);
    expect(state.dismissedAt).not.toBeNull();
  });

  it('clearAll should reset everything', () => {
    const { addEntry, clearAll } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'a', title: 'A', data: [] });
    addEntry({ toolCallId: 'tc-2', toolName: 'b', title: 'B', data: [] });
    clearAll();

    const state = useDataPanelStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.isVisible).toBe(false);
    expect(state.activeId).toBeNull();
  });

  it('show should re-show a dismissed panel', () => {
    const { addEntry, dismiss, show } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'a', title: 'A', data: [] });
    dismiss();
    show();

    expect(useDataPanelStore.getState().isVisible).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && pnpm vitest run src/stores/dataPanelStore.test.ts
```

- [ ] **Step 3: Implement the store**

```typescript
// frontend/src/stores/dataPanelStore.ts
import { create } from 'zustand';
import type { DataViewSchema, RenderHint } from '@/types/dataView';

export interface DataPanelEntry {
  id: string;
  toolCallId: string;
  toolName: string;
  title: string;
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
  timestamp: number;
}

interface AddEntryInput {
  toolCallId: string;
  toolName: string;
  title: string;
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
}

interface DataPanelState {
  entries: DataPanelEntry[];
  activeId: string | null;
  isVisible: boolean;
  dismissedAt: number | null;

  addEntry: (input: AddEntryInput) => void;
  dismiss: () => void;
  show: () => void;
  clearAll: () => void;
}

export const useDataPanelStore = create<DataPanelState>((set, get) => ({
  entries: [],
  activeId: null,
  isVisible: false,
  dismissedAt: null,

  addEntry: (input) => {
    const id = input.toolCallId;
    const entry: DataPanelEntry = {
      id,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      title: input.title,
      data: input.data,
      schema: input.schema,
      renderHint: input.renderHint,
      timestamp: Date.now(),
    };

    set((state) => {
      const existingIndex = state.entries.findIndex((e) => e.toolCallId === id);
      const entries =
        existingIndex >= 0
          ? state.entries.map((e, i) => (i === existingIndex ? entry : e))
          : [...state.entries, entry];

      return { entries, activeId: id, isVisible: true, dismissedAt: null };
    });
  },

  dismiss: () => {
    set({ isVisible: false, dismissedAt: Date.now() });
  },

  show: () => {
    const { entries } = get();
    if (entries.length > 0) {
      set({
        isVisible: true,
        dismissedAt: null,
        activeId: entries[entries.length - 1].id,
      });
    }
  },

  clearAll: () => {
    set({ entries: [], activeId: null, isVisible: false, dismissedAt: null });
  },
}));
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && pnpm vitest run src/stores/dataPanelStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/dataPanelStore.ts frontend/src/stores/dataPanelStore.test.ts
git commit -m "feat(store): add dataPanelStore with addEntry, dismiss, show, clearAll"
```

---

## Task 4: resolveRenderer Logic

**Files:**

- Create: `frontend/src/components/data-panel/resolveRenderer.ts`
- Create: `frontend/src/components/data-panel/resolveRenderer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/src/components/data-panel/resolveRenderer.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRenderer } from './resolveRenderer';

describe('resolveRenderer', () => {
  it('should return hint renderer when renderHint provided', () => {
    const result = resolveRenderer({
      data: [{ name: 'test' }],
      renderHint: { type: 'stats', stats: ['count'] },
    });
    expect(result.type).toBe('stats');
    expect(result.source).toBe('hint');
  });

  it('should return schema renderer when dataView schema provided', () => {
    const result = resolveRenderer({
      data: [{ name: 'test' }],
      schema: { type: 'list', title: 'Items', itemShape: { primary: 'name' } },
    });
    expect(result.type).toBe('list');
    expect(result.source).toBe('schema');
  });

  it('should prefer hint over schema', () => {
    const result = resolveRenderer({
      data: [{ name: 'test' }],
      schema: { type: 'list', itemShape: { primary: 'name' } },
      renderHint: { type: 'stats' },
    });
    expect(result.type).toBe('stats');
    expect(result.source).toBe('hint');
  });

  it('should detect list from array of objects', () => {
    const result = resolveRenderer({
      data: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
    });
    expect(result.type).toBe('list');
    expect(result.source).toBe('heuristic');
  });

  it('should fall back to generic for plain data', () => {
    const result = resolveRenderer({ data: { foo: 'bar' } });
    expect(result.type).toBe('generic');
    expect(result.source).toBe('fallback');
  });

  it('should fall back to generic for null data', () => {
    const result = resolveRenderer({ data: null });
    expect(result.type).toBe('generic');
    expect(result.source).toBe('fallback');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && pnpm vitest run src/components/data-panel/resolveRenderer.test.ts
```

- [ ] **Step 3: Implement resolveRenderer**

```typescript
// frontend/src/components/data-panel/resolveRenderer.ts
import type { DataViewSchema, DataViewType, RenderHint } from '@/types/dataView';

export interface ResolvedRenderer {
  type: DataViewType | 'generic';
  source: 'hint' | 'custom' | 'schema' | 'heuristic' | 'fallback';
  title?: string;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
}

interface ResolveInput {
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
}

export function resolveRenderer(input: ResolveInput): ResolvedRenderer {
  // Layer 3: LLM renderHint (highest priority)
  if (input.renderHint) {
    return {
      type: input.renderHint.type,
      source: 'hint',
      title: input.renderHint.title,
      renderHint: input.renderHint,
    };
  }

  // Layer 1: Tool dataView schema
  if (input.schema) {
    return {
      type: input.schema.type,
      source: 'schema',
      title: input.schema.title,
      schema: input.schema,
    };
  }

  // Heuristic: array of objects → list
  if (Array.isArray(input.data) && input.data.length > 0) {
    const first = input.data[0];
    if (typeof first === 'object' && first !== null) {
      return { type: 'list', source: 'heuristic' };
    }
  }

  // Fallback
  return { type: 'generic', source: 'fallback' };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && pnpm vitest run src/components/data-panel/resolveRenderer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/data-panel/resolveRenderer.ts frontend/src/components/data-panel/resolveRenderer.test.ts
git commit -m "feat(data-panel): add resolveRenderer with 3-layer resolution"
```

---

## Task 5: Sci-Fi CSS Theme

**Files:**

- Create: `frontend/src/components/data-panel/data-panel.css`

- [ ] **Step 1: Create shared sci-fi theme**

```css
/* frontend/src/components/data-panel/data-panel.css */

:root {
  --dp-bg: rgba(10, 15, 25, 0.95);
  --dp-border: rgba(0, 200, 255, 0.3);
  --dp-glow: rgba(0, 200, 255, 0.15);
  --dp-title-color: #00c8ff;
  --dp-text: #c8d6e5;
  --dp-text-dim: #6b7280;
  --dp-status-done: #10b981;
  --dp-status-wip: #f59e0b;
  --dp-status-pending: #6b7280;
  --dp-status-error: #ef4444;
  --dp-divider: rgba(0, 200, 255, 0.15);
  --dp-scrollbar-thumb: rgba(0, 200, 255, 0.4);
  --dp-scrollbar-track: transparent;
  --dp-width: 400px;
  --dp-radius: 8px;
  --dp-font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}

/* Panel Container */
.dp-container {
  position: fixed;
  top: 50%;
  right: 16px;
  transform: translateY(-50%) translateX(0);
  width: var(--dp-width);
  max-height: 70vh;
  background: var(--dp-bg);
  border: 1px solid var(--dp-border);
  border-radius: var(--dp-radius);
  box-shadow:
    0 0 15px var(--dp-glow),
    inset 0 0 30px rgba(0, 200, 255, 0.03);
  overflow: hidden;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  animation: dp-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dp-container.dp-dismissed {
  animation: dp-fade-out 0.3s ease-out forwards;
}

@keyframes dp-slide-in {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(60px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

@keyframes dp-fade-out {
  to {
    opacity: 0;
    transform: translateY(-50%) translateX(40px);
  }
}

/* Header */
.dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dp-divider);
  position: relative;
  overflow: hidden;
}

.dp-header::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--dp-title-color), transparent);
  animation: dp-scanline 3s linear infinite;
}

@keyframes dp-scanline {
  0% {
    transform: translateY(-100%);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateY(200%);
    opacity: 0;
  }
}

.dp-header-title {
  font-family: var(--dp-font-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--dp-title-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.dp-header-icon {
  font-size: 14px;
  opacity: 0.8;
}

.dp-header-meta {
  font-family: var(--dp-font-mono);
  font-size: 10px;
  color: var(--dp-text-dim);
}

.dp-close-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: var(--dp-text-dim);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
  transition: all 0.2s;
}

.dp-close-btn:hover {
  color: var(--dp-status-error);
  border-color: rgba(239, 68, 68, 0.4);
}

/* Content */
.dp-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}

.dp-content::-webkit-scrollbar {
  width: 4px;
}
.dp-content::-webkit-scrollbar-track {
  background: var(--dp-scrollbar-track);
}
.dp-content::-webkit-scrollbar-thumb {
  background: var(--dp-scrollbar-thumb);
  border-radius: 2px;
}

/* Footer */
.dp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  border-top: 1px solid var(--dp-divider);
  font-family: var(--dp-font-mono);
  font-size: 10px;
  color: var(--dp-text-dim);
}

.dp-timer {
  animation: dp-timer-pulse 1s ease-in-out infinite;
}

@keyframes dp-timer-pulse {
  50% {
    opacity: 0.5;
  }
}

/* List Renderer */
.dp-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dp-list-item {
  background: rgba(0, 200, 255, 0.04);
  border: 1px solid rgba(0, 200, 255, 0.1);
  border-radius: 6px;
  padding: 10px 12px;
  animation: dp-item-in 0.3s ease-out both;
}

@keyframes dp-item-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.dp-item-primary {
  font-family: var(--dp-font-mono);
  font-size: 13px;
  color: var(--dp-text);
  margin-bottom: 2px;
}

.dp-item-secondary {
  font-size: 11px;
  color: var(--dp-text-dim);
}

.dp-item-badge {
  display: inline-block;
  font-family: var(--dp-font-mono);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 200, 255, 0.12);
  color: var(--dp-title-color);
  margin-left: 6px;
}

.dp-item-status {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
}

.dp-item-progress {
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.dp-item-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--dp-title-color), var(--dp-status-done));
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  animation: dp-progress-pulse 2s ease-in-out infinite;
}

@keyframes dp-progress-pulse {
  50% {
    opacity: 0.7;
  }
}

/* Stats Renderer */
.dp-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.dp-stat-card {
  background: rgba(0, 200, 255, 0.04);
  border: 1px solid rgba(0, 200, 255, 0.12);
  border-radius: 6px;
  padding: 12px;
  text-align: center;
  animation: dp-item-in 0.3s ease-out both;
}

.dp-stat-label {
  font-family: var(--dp-font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--dp-text-dim);
  margin-bottom: 4px;
}

.dp-stat-value {
  font-family: var(--dp-font-mono);
  font-size: 24px;
  font-weight: 700;
  color: var(--dp-title-color);
}

.dp-stat-unit {
  font-size: 12px;
  color: var(--dp-text-dim);
  margin-left: 2px;
}

/* JSON Fallback */
.dp-json-block {
  font-family: var(--dp-font-mono);
  font-size: 12px;
  color: var(--dp-text);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 10px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
}

/* Divider */
.dp-divider {
  height: 1px;
  background: var(--dp-divider);
  margin: 8px 0;
}

/* Empty State */
.dp-empty {
  text-align: center;
  padding: 20px;
  color: var(--dp-text-dim);
  font-family: var(--dp-font-mono);
  font-size: 12px;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/data-panel/data-panel.css
git commit -m "feat(data-panel): add sci-fi CSS theme with scanline, glow, and animations"
```

---

## Task 6: GenericJSON + DataPanelHeader

**Files:**

- Create: `frontend/src/components/data-panel/renderers/GenericJSON.tsx`
- Create: `frontend/src/components/data-panel/DataPanelHeader.tsx`

- [ ] **Step 1: Create GenericJSON renderer**

```tsx
// frontend/src/components/data-panel/renderers/GenericJSON.tsx
import { useMemo } from 'react';

interface GenericJSONProps {
  data: unknown;
}

export function GenericJSON({ data }: GenericJSONProps) {
  const formatted = useMemo(() => {
    try {
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  return <pre className="dp-json-block">{formatted}</pre>;
}
```

- [ ] **Step 2: Create DataPanelHeader**

```tsx
// frontend/src/components/data-panel/DataPanelHeader.tsx
import { X } from 'lucide-react';

interface DataPanelHeaderProps {
  title: string;
  icon?: string;
  meta?: string;
  onClose: () => void;
}

export function DataPanelHeader({ title, icon, meta, onClose }: DataPanelHeaderProps) {
  return (
    <div className="dp-header">
      <div className="dp-header-title">
        {icon && <span className="dp-header-icon">{icon}</span>}
        <span>{title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {meta && <span className="dp-header-meta">{meta}</span>}
        <button className="dp-close-btn" onClick={onClose} aria-label="Close panel">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/data-panel/renderers/GenericJSON.tsx frontend/src/components/data-panel/DataPanelHeader.tsx
git commit -m "feat(data-panel): add GenericJSON fallback and DataPanelHeader"
```

---

## Task 7: DataPanelList Renderer

**Files:**

- Create: `frontend/src/components/data-panel/renderers/DataPanelList.tsx`

- [ ] **Step 1: Create DataPanelList component**

```tsx
// frontend/src/components/data-panel/renderers/DataPanelList.tsx
import type { DataViewSchema } from '@/types/dataView';
import { STATUS_COLORS } from '@/types/dataView';

interface DataPanelListProps {
  data: unknown[];
  schema?: DataViewSchema;
}

function getValue(obj: unknown, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  return (obj as Record<string, unknown>)[path];
}

function normalizeProgress(value: unknown): number {
  if (typeof value !== 'number') return 0;
  return value > 1 ? Math.min(value, 100) : value * 100;
}

export function DataPanelList({ data, schema }: DataPanelListProps) {
  const shape = schema?.itemShape;

  if (!Array.isArray(data) || data.length === 0) {
    return <div className="dp-empty">No data</div>;
  }

  const grouped = schema?.groupBy ? groupItems(data, schema.groupBy) : null;

  if (grouped) {
    return (
      <div className="dp-list">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            <div className="dp-item-secondary" style={{ padding: '4px 0', fontWeight: 600 }}>
              {group} ({items.length})
            </div>
            <div className="dp-divider" />
            {items.map((item, i) => (
              <ListItem key={i} item={item} shape={shape} index={i} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dp-list">
      {data.map((item, i) => (
        <ListItem key={i} item={item} shape={shape} index={i} />
      ))}
    </div>
  );
}

function ListItem({
  item,
  shape,
  index,
}: {
  item: unknown;
  shape?: DataViewSchema['itemShape'];
  index: number;
}) {
  if (typeof item !== 'object' || item === null) {
    return (
      <div className="dp-list-item" style={{ animationDelay: `${index * 50}ms` }}>
        <span className="dp-item-primary">{String(item)}</span>
      </div>
    );
  }

  const primary = shape?.primary
    ? String(getValue(item, shape.primary) ?? '')
    : JSON.stringify(item);
  const secondary = shape?.secondary ? String(getValue(item, shape.secondary) ?? '') : undefined;
  const badge = shape?.badge ? getValue(item, shape.badge) : undefined;
  const status = shape?.status ? String(getValue(item, shape.status) ?? '') : undefined;
  const progress = shape?.progress ? normalizeProgress(getValue(item, shape.progress)) : undefined;

  return (
    <div className="dp-list-item" style={{ animationDelay: `${index * 50}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {status && (
          <span
            className="dp-item-status"
            style={{
              backgroundColor: STATUS_COLORS[status.toLowerCase()] ?? STATUS_COLORS.pending,
            }}
          />
        )}
        <span className="dp-item-primary">{primary}</span>
        {badge != null && <span className="dp-item-badge">{String(badge)}</span>}
      </div>
      {secondary && <div className="dp-item-secondary">{secondary}</div>}
      {progress != null && (
        <div className="dp-item-progress">
          <div className="dp-item-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function groupItems(data: unknown[], field: string): Record<string, unknown[]> {
  const groups: Record<string, unknown[]> = {};
  for (const item of data) {
    const key = String(getValue(item, field) ?? 'Other');
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/data-panel/renderers/DataPanelList.tsx
git commit -m "feat(data-panel): add DataPanelList renderer with grouping and progress"
```

---

## Task 8: DataPanelStats Renderer

**Files:**

- Create: `frontend/src/components/data-panel/renderers/DataPanelStats.tsx`

- [ ] **Step 1: Create DataPanelStats with animated counters**

```tsx
// frontend/src/components/data-panel/renderers/DataPanelStats.tsx
import { useEffect, useRef, useState } from 'react';
import type { DataViewSchema } from '@/types/dataView';

interface DataPanelStatsProps {
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: { stats?: string[] };
}

function extractStatsData(
  data: unknown,
  fields?: string[]
): Array<{ label: string; value: number; unit?: string }> {
  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;
  const keys = fields ?? Object.keys(record);

  return keys
    .map((key) => {
      const val = record[key];
      if (typeof val === 'number') {
        return { label: formatLabel(key), value: val, unit: guessUnit(key) };
      }
      if (typeof val === 'string' && !isNaN(Number(val))) {
        return { label: formatLabel(key), value: Number(val) };
      }
      return null;
    })
    .filter(Boolean) as Array<{ label: string; value: number; unit?: string }>;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function guessUnit(key: string): string | undefined {
  const lower = key.toLowerCase();
  if (lower.includes('rate') || lower.includes('ratio') || lower.includes('percent')) return '%';
  return undefined;
}

function AnimatedNumber({ value, unit }: { value: number; unit?: string }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 800;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  const formatted = unit === '%' ? `${display}` : display.toLocaleString();

  return (
    <span className="dp-stat-value">
      {formatted}
      {unit && <span className="dp-stat-unit">{unit}</span>}
    </span>
  );
}

export function DataPanelStats({ data, schema, renderHint }: DataPanelStatsProps) {
  const fields = renderHint?.stats ?? schema?.stats;
  const stats = extractStatsData(data, fields);

  if (stats.length === 0) {
    return <div className="dp-empty">No numeric data to display</div>;
  }

  return (
    <div className="dp-stats-grid">
      {stats.map((stat, i) => (
        <div key={stat.label} className="dp-stat-card" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="dp-stat-label">{stat.label}</div>
          <AnimatedNumber value={stat.value} unit={stat.unit} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/data-panel/renderers/DataPanelStats.tsx
git commit -m "feat(data-panel): add DataPanelStats renderer with animated counters"
```

---

## Task 9: DataPanelContainer

**Files:**

- Create: `frontend/src/components/data-panel/DataPanelContainer.tsx`

- [ ] **Step 1: Create DataPanelContainer with auto-dismiss**

```tsx
// frontend/src/components/data-panel/DataPanelContainer.tsx
import { useEffect, useState, useCallback } from 'react';
import { useDataPanelStore, type DataPanelEntry } from '@/stores/dataPanelStore';
import { resolveRenderer } from './resolveRenderer';
import { DataPanelHeader } from './DataPanelHeader';
import { DataPanelList } from './renderers/DataPanelList';
import { DataPanelStats } from './renderers/DataPanelStats';
import { GenericJSON } from './renderers/GenericJSON';
import './data-panel.css';

const AUTO_DISMISS_MS = 30_000;
const TIMER_TICK_MS = 1_000;

export function DataPanelContainer() {
  const { entries, activeId, isVisible, dismiss } = useDataPanelStore();
  const activeEntry = entries.find((e) => e.id === activeId) ?? null;

  return <DataPanelFloat entry={activeEntry} isVisible={isVisible} onDismiss={dismiss} />;
}

interface DataPanelFloatProps {
  entry: DataPanelEntry | null;
  isVisible: boolean;
  onDismiss: () => void;
}

function DataPanelFloat({ entry, isVisible, onDismiss }: DataPanelFloatProps) {
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS / 1000);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    if (!isVisible || !entry) return;

    setRemaining(AUTO_DISMISS_MS / 1000);
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          return 0;
        }
        return r - 1;
      });
    }, TIMER_TICK_MS);

    const timeout = setTimeout(() => {
      setIsDismissing(true);
      setTimeout(onDismiss, 300);
    }, AUTO_DISMISS_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isVisible, entry?.id, onDismiss]);

  const handleClose = useCallback(() => {
    setIsDismissing(true);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  useEffect(() => {
    setIsDismissing(false);
  }, [entry?.id]);

  if (!entry || !isVisible) return null;

  const resolved = resolveRenderer({
    data: entry.data,
    schema: entry.schema,
    renderHint: entry.renderHint,
  });

  const itemCount = Array.isArray(entry.data) ? entry.data.length : undefined;

  return (
    <div className={`dp-container${isDismissing ? ' dp-dismissed' : ''}`}>
      <DataPanelHeader
        title={resolved.title ?? entry.title}
        icon={getIcon(resolved.type)}
        meta={itemCount != null ? `${itemCount} items` : undefined}
        onClose={handleClose}
      />
      <div className="dp-content">
        {renderContent(resolved.type, entry.data, entry.schema, entry.renderHint)}
      </div>
      <div className="dp-footer">
        <span>auto-dismiss</span>
        <span className="dp-timer">{remaining}s</span>
      </div>
    </div>
  );
}

function getIcon(type: string): string {
  switch (type) {
    case 'list':
      return '≡';
    case 'stats':
      return '◆';
    case 'detail':
      return '☰';
    case 'table':
      return '▦';
    case 'timeline':
      return '⏱';
    default:
      return '◇';
  }
}

function renderContent(
  type: string,
  data: unknown,
  schema?: DataPanelEntry['schema'],
  renderHint?: DataPanelEntry['renderHint']
): JSX.Element {
  switch (type) {
    case 'list':
      return <DataPanelList data={Array.isArray(data) ? data : []} schema={schema} />;
    case 'stats':
      return <DataPanelStats data={data} schema={schema} renderHint={renderHint} />;
    case 'generic':
    default:
      return <GenericJSON data={data} />;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/data-panel/DataPanelContainer.tsx
git commit -m "feat(data-panel): add DataPanelContainer with auto-dismiss and renderer dispatch"
```

---

## Task 10: Wire SSE Tool-Result Events

**Files:**

- Modify: `frontend/src/hooks/useChat.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import dataPanelStore in useChat.ts**

Add import at top of `frontend/src/hooks/useChat.ts`:

```typescript
import { useDataPanelStore } from '@/stores/dataPanelStore';
```

- [ ] **Step 2: Dispatch to dataPanelStore on tool-result**

In the `tool-result` event handler (around line 129), after setting `existing.result`, add:

```typescript
// Dispatch to data panel
const resultPayload = payload.result as Record<string, unknown> | undefined;
const panelData =
  resultPayload && typeof resultPayload === 'object' && 'data' in resultPayload
    ? resultPayload.data
    : payload.result;

if (panelData != null) {
  useDataPanelStore.getState().addEntry({
    toolCallId: payload.toolCallId,
    toolName: payload.name,
    title: payload.name.replace(/_/g, ' '),
    data: panelData,
  });
}
```

- [ ] **Step 3: Mount DataPanelContainer in App.tsx**

Add import:

```typescript
import { DataPanelContainer } from '@/components/data-panel/DataPanelContainer';
```

Add next to `JarvisVoiceOverlay` in the main window render (around line 660):

```tsx
{
  /* Dynamic Data Panel */
}
<DataPanelContainer />;
```

- [ ] **Step 4: Verify app builds**

```bash
cd frontend && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useChat.ts frontend/src/App.tsx
git commit -m "feat(data-panel): wire SSE tool-result events to data panel store"
```

---

## Verification

1. `cd packages/types && pnpm build` — types compile
2. `cd frontend && pnpm vitest run src/stores/dataPanelStore.test.ts` — store tests pass
3. `cd frontend && pnpm vitest run src/components/data-panel/resolveRenderer.test.ts` — resolver tests pass
4. `cd frontend && pnpm build` — full frontend builds
5. Manual test: ask Jarvis to list tasks → panel slides in from right with animated list
6. Manual test: ask Jarvis for stats → panel shows animated number counters
7. Auto-dismiss: panel disappears after 30s with fade-out animation
8. Close button: clicking X dismisses panel immediately
