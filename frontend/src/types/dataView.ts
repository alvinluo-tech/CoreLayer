import type {
  DataViewSchema,
  DataViewType,
  DataViewItemShape,
  RenderHint,
  ChartType,
} from '@jarvis/types';

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

export type { DataViewSchema, DataViewType, DataViewItemShape, RenderHint, ChartType };
