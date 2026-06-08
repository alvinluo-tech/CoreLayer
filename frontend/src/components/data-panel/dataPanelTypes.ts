// frontend/src/components/data-panel/dataPanelTypes.ts

export type PanelKind = 'list' | 'stats' | 'detail' | 'adaptive' | 'chart' | 'empty' | 'error';
export type DensityMode = 'detailed' | 'compact' | 'grid';

export type FieldType =
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

export interface DataPanelField {
  key: string;
  label: string;
  value: unknown;
  type: FieldType;
  confidence: number;
}

export interface DataPanelItem {
  id?: string;
  primary: string;
  secondary?: string;
  status?: { value: string; color: string };
  badge?: { value: string; variant?: string };
  progress?: number;
  fields: DataPanelField[];
  raw?: unknown;
}

export interface DataPanelStat {
  label: string;
  value: number;
  unit?: string;
}

export interface DataPanelObject {
  fields: DataPanelField[];
}

export interface DataPanelViewModel {
  id: string;
  source: {
    toolName: string;
    timestamp: string;
  };
  title: string;
  subtitle?: string;
  kind: PanelKind;
  density: DensityMode;
  items?: DataPanelItem[];
  stats?: DataPanelStat[];
  detail?: DataPanelObject;
  raw?: unknown;
  debug?: {
    rendererReason: string;
    detectedShape: string;
  };
}

export interface RendererDecision {
  type: PanelKind | 'generic';
  source: 'metadata' | 'known' | 'schema' | 'heuristic' | 'fallback';
}
