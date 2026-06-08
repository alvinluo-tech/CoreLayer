// frontend/src/components/data-panel/resolveRenderer.ts
import type { DataViewSchema, DataViewType, RenderHint } from '@/types/dataView';
import type { PanelKind, DataPanelViewModel } from './dataPanelTypes';

export interface ResolvedRenderer {
  type: DataViewType | 'generic' | 'detail' | 'adaptive';
  source: 'metadata' | 'known' | 'schema' | 'hint' | 'heuristic' | 'fallback';
  title?: string;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
  data?: unknown;
  viewModel?: DataPanelViewModel;
}

interface ResolveInput {
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
  viewModel?: DataPanelViewModel;
}

/**
 * Resolve which renderer to use.
 *
 * Priority:
 * 1. renderHint (LLM-provided)
 * 2. schema (tool-provided)
 * 3. ViewModel kind (from normalizeDataPanelPayload)
 * 4. Heuristic data shape detection
 * 5. Fallback to generic
 */
export function resolveRenderer(input: ResolveInput): ResolvedRenderer {
  // Layer 1: LLM renderHint (highest priority)
  if (input.renderHint) {
    return {
      type: input.renderHint.type,
      source: 'hint',
      title: input.renderHint.title,
      renderHint: input.renderHint,
      data: input.data,
    };
  }

  // Layer 2: Tool dataView schema
  if (input.schema) {
    return {
      type: input.schema.type,
      source: 'schema',
      title: input.schema.title,
      schema: input.schema,
      data: input.data,
    };
  }

  // Layer 3: ViewModel kind (from normalization)
  if (input.viewModel) {
    const vm = input.viewModel;
    const mapped = mapKindToRendererType(vm.kind);
    const extracted = mapped === 'list' ? extractArray(input.data) : input.data;
    return {
      type: mapped,
      source: 'heuristic',
      title: vm.title,
      data: extracted ?? input.data,
      viewModel: vm,
    };
  }

  // Layer 4: Heuristic data shape detection (legacy path)
  if (Array.isArray(input.data) && input.data.length > 0) {
    const first = input.data[0];
    if (typeof first === 'object' && first !== null) {
      return { type: 'list', source: 'heuristic', data: input.data };
    }
  }

  if (input.data && typeof input.data === 'object' && !Array.isArray(input.data)) {
    const obj = input.data as Record<string, unknown>;
    const keys = Object.keys(obj);

    // Single-item wrapper: unwrap and recurse
    if (keys.length === 1) {
      const onlyKey = keys[0]!;
      const val = obj[onlyKey];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return resolveRenderer({ ...input, data: val });
      }
    }

    // Find array-of-objects property
    const PREFERRED_KEYS = [
      'tasks',
      'articles',
      'items',
      'results',
      'list',
      'reviews',
      'conversations',
      'entries',
      'records',
      'data',
    ];
    const allKeys = Object.keys(obj);
    const sortedKeys = [
      ...PREFERRED_KEYS.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !PREFERRED_KEYS.includes(k)),
    ];

    for (const key of sortedKeys) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        return { type: 'list', source: 'heuristic', data: val };
      }
    }

    // Stats-like object
    const numericRatio = extractNumericRatio(obj);
    if (numericRatio >= 0.6) {
      return { type: 'stats', source: 'heuristic', data: input.data };
    }

    // Nested numeric object
    for (const key of allKeys) {
      const val = obj[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (extractNumericRatio(val as Record<string, unknown>) >= 0.6) {
          return { type: 'stats', source: 'heuristic', data: input.data };
        }
      }
    }
  }

  // Layer 5: Fallback
  return { type: 'generic', source: 'fallback', data: input.data };
}

function mapKindToRendererType(kind: PanelKind): ResolvedRenderer['type'] {
  switch (kind) {
    case 'list':
      return 'list';
    case 'stats':
      return 'stats';
    case 'detail':
      return 'detail';
    case 'adaptive':
      return 'adaptive';
    case 'chart':
      return 'chart';
    case 'empty':
      return 'generic';
    case 'error':
      return 'generic';
    default:
      return 'adaptive';
  }
}

function extractNumericRatio(obj: Record<string, unknown>): number {
  const values = Object.values(obj);
  if (values.length === 0) return 0;
  const numeric = values.filter(
    (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
  );
  return numeric.length / values.length;
}

function extractArray(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);

  // Single-key wrapper: unwrap
  if (keys.length === 1) {
    const val = obj[keys[0]!];
    if (Array.isArray(val)) return val;
  }

  // Find array-of-objects inside
  const PREFERRED = [
    'tasks',
    'articles',
    'items',
    'results',
    'list',
    'reviews',
    'conversations',
    'entries',
    'records',
    'data',
  ];
  const sorted = [
    ...PREFERRED.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !PREFERRED.includes(k)),
  ];
  for (const key of sorted) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      return val;
    }
  }

  return undefined;
}
