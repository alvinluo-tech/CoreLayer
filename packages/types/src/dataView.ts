export type DataViewType = 'list' | 'stats' | 'detail' | 'table' | 'timeline' | 'chart';

export type ChartType = 'line' | 'bar' | 'pie' | 'scatter';

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
  /** Chart-specific config (only when type === 'chart'). */
  chartType?: ChartType;
  xKey?: string;
  yKeys?: string[];
  seriesKey?: string;
}

export interface RenderHint {
  type: DataViewType;
  title?: string;
  stats?: string[];
  columns?: string[];
}
