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
