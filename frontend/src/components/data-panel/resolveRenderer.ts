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

  // Heuristic: array of objects -> list
  if (Array.isArray(input.data) && input.data.length > 0) {
    const first = input.data[0];
    if (typeof first === 'object' && first !== null) {
      return { type: 'list', source: 'heuristic' };
    }
  }

  // Fallback
  return { type: 'generic', source: 'fallback' };
}
