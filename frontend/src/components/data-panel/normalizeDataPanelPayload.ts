// frontend/src/components/data-panel/normalizeDataPanelPayload.ts
import type {
  DataPanelViewModel,
  DataPanelItem,
  DataPanelField,
  DataPanelStat,
  FieldType,
  DensityMode,
} from './dataPanelTypes';

const SENSITIVE_KEYS = new Set([
  'token',
  'apikey',
  'password',
  'secret',
  'authorization',
  'cookie',
  'accesstoken',
  'refreshtoken',
  'auth',
  'credential',
]);

const TITLE_KEYS = ['title', 'name', 'label', 'subject', 'headline', 'summary'];
const STATUS_KEYS = ['status', 'state', 'phase'];
const BADGE_KEYS = ['priority', 'level', 'rank', 'type', 'category'];
const DATE_KEYS = [
  'createdat',
  'updatedat',
  'dueat',
  'completedat',
  'addedat',
  'created_at',
  'updated_at',
  'completed_at',
];
const SKIP_KEYS = ['id', 'userid', 'user_id', ...DATE_KEYS];

const MAX_DEPTH = 3;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 500;

interface NormalizeInput {
  toolName: string;
  data: unknown;
}

export function normalizeDataPanelPayload(input: NormalizeInput): DataPanelViewModel {
  const { toolName, data: rawData } = input;
  const timestamp = new Date().toISOString();

  // Step 1: Redact sensitive fields
  const sanitized = redactSensitive(rawData);

  // Step 2: Truncate oversized data
  const truncated = truncateDeep(sanitized, 0);

  // Step 3-7: Analyze and build ViewModel
  if (truncated == null) {
    return {
      id: `${toolName}-${Date.now()}`,
      source: { toolName, timestamp },
      title: formatTitle(toolName),
      kind: 'empty',
      density: 'detailed',
      raw: rawData,
      debug: { rendererReason: 'null data', detectedShape: 'null' },
    };
  }

  if (Array.isArray(truncated)) {
    return buildListViewModel(toolName, timestamp, truncated, rawData);
  }

  if (typeof truncated === 'object') {
    return buildObjectViewModel(toolName, timestamp, truncated as Record<string, unknown>, rawData);
  }

  // Primitive
  return {
    id: `${toolName}-${Date.now()}`,
    source: { toolName, timestamp },
    title: formatTitle(toolName),
    kind: 'adaptive',
    density: 'detailed',
    detail: {
      fields: [{ key: 'value', label: 'Value', value: truncated, type: 'text', confidence: 1.0 }],
    },
    raw: rawData,
    debug: { rendererReason: 'primitive value', detectedShape: 'primitive' },
  };
}

// --- Build list ViewModel ---
function buildListViewModel(
  toolName: string,
  timestamp: string,
  arr: unknown[],
  raw: unknown
): DataPanelViewModel {
  const items = arr.slice(0, MAX_ARRAY_ITEMS).map((item) => {
    if (item == null || typeof item !== 'object') {
      return {
        primary: String(item ?? ''),
        fields: [
          { key: 'value', label: 'Value', value: item, type: 'text' as FieldType, confidence: 1.0 },
        ],
      };
    }
    return objectToItem(item as Record<string, unknown>);
  });

  return {
    id: `${toolName}-${Date.now()}`,
    source: { toolName, timestamp },
    title: formatTitle(toolName),
    subtitle: `${items.length} items`,
    kind: 'list',
    density: selectDensity(arr),
    items,
    raw,
    debug: { rendererReason: 'array of objects', detectedShape: `array[${arr.length}]` },
  };
}

// --- Build object ViewModel ---
function buildObjectViewModel(
  toolName: string,
  timestamp: string,
  obj: Record<string, unknown>,
  raw: unknown
): DataPanelViewModel {
  const keys = Object.keys(obj);

  // Unwrap single-key wrapper
  if (keys.length === 1) {
    const val = obj[keys[0]!];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return buildObjectViewModel(toolName, timestamp, val as Record<string, unknown>, raw);
    }
    if (Array.isArray(val)) {
      return buildListViewModel(toolName, timestamp, val, raw);
    }
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
  ];
  const sorted = [
    ...PREFERRED.filter((k) => k in obj),
    ...keys.filter((k) => !PREFERRED.includes(k)),
  ];
  for (const key of sorted) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      return buildListViewModel(toolName, timestamp, val, raw);
    }
  }

  // Stats-like object (>= 60% numeric)
  const numericKeys = keys.filter((k) => typeof obj[k] === 'number');
  if (numericKeys.length / keys.length >= 0.6) {
    const stats: DataPanelStat[] = keys.map((k) => ({
      label: formatLabel(k),
      value: Number(obj[k]),
      unit: guessUnit(k),
    }));
    return {
      id: `${toolName}-${Date.now()}`,
      source: { toolName, timestamp },
      title: formatTitle(toolName),
      kind: 'stats',
      density: 'detailed',
      stats,
      raw,
      debug: { rendererReason: 'mostly numeric object', detectedShape: 'stats' },
    };
  }

  // Single object -> detail
  const fields = analyzeFields(obj);
  return {
    id: `${toolName}-${Date.now()}`,
    source: { toolName, timestamp },
    title: formatTitle(toolName),
    kind: 'detail',
    density: 'detailed',
    detail: { fields },
    raw,
    debug: { rendererReason: 'single object', detectedShape: 'object' },
  };
}

// --- Object to DataPanelItem ---
function objectToItem(obj: Record<string, unknown>): DataPanelItem {
  const keys = Object.keys(obj);
  const titleKey = keys.find((k) => TITLE_KEYS.includes(k.toLowerCase()));
  const statusKey = keys.find((k) => STATUS_KEYS.includes(k.toLowerCase()));
  const badgeKey = keys.find((k) => BADGE_KEYS.includes(k.toLowerCase()));

  const displayKeys = keys.filter((k) => {
    const lower = k.toLowerCase();
    return !SKIP_KEYS.includes(lower) && !SENSITIVE_KEYS.has(lower);
  });

  const primary = titleKey
    ? String(obj[titleKey] ?? '')
    : String((displayKeys[0] ? obj[displayKeys[0]] : undefined) ?? displayKeys[0] ?? 'item');

  const secondaryKey = displayKeys.find((k) => k !== titleKey && typeof obj[k] === 'string');
  const secondary = secondaryKey ? String(obj[secondaryKey]) : undefined;

  const status = statusKey ? { value: String(obj[statusKey] ?? ''), color: '' } : undefined;

  const badge = badgeKey ? { value: String(obj[badgeKey] ?? '') } : undefined;

  const fields = analyzeFields(obj);

  return { primary, secondary, status, badge, fields, raw: obj };
}

// --- Analyze fields with confidence ---
function analyzeFields(obj: Record<string, unknown>): DataPanelField[] {
  const keys = Object.keys(obj);
  const hasTitle = keys.some((k) => TITLE_KEYS.includes(k.toLowerCase()));

  return keys
    .filter((k) => !SENSITIVE_KEYS.has(k.toLowerCase()))
    .map((key) => {
      const val = obj[key];
      const lower = key.toLowerCase();

      // Sensitive (shouldn't reach here due to filter, but safety)
      if (SENSITIVE_KEYS.has(lower)) {
        return {
          key,
          label: formatLabel(key),
          value: '••••••',
          type: 'text' as FieldType,
          confidence: 1.0,
        };
      }

      // Title
      if (TITLE_KEYS.includes(lower) && typeof val === 'string') {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'title' as FieldType,
          confidence: 0.9,
        };
      }

      // Downgrade id when title exists
      if (lower === 'id' && hasTitle) {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'text' as FieldType,
          confidence: 0.1,
        };
      }

      // Status
      if (STATUS_KEYS.includes(lower) && typeof val === 'string') {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'status' as FieldType,
          confidence: 0.9,
        };
      }

      // Badge
      if (BADGE_KEYS.includes(lower) && typeof val === 'number') {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'badge' as FieldType,
          confidence: 0.85,
        };
      }

      // Date keys
      if (DATE_KEYS.includes(lower) && typeof val === 'string') {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'date' as FieldType,
          confidence: 0.95,
        };
      }

      // ISO date pattern
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'date' as FieldType,
          confidence: 0.7,
        };
      }

      // URL
      if (typeof val === 'string' && /^https?:\/\//.test(val)) {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'url' as FieldType,
          confidence: 0.85,
        };
      }

      // Boolean with is/has/can prefix
      if (typeof val === 'boolean' && /^(is|has|can|should)/.test(lower)) {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'boolean' as FieldType,
          confidence: 0.8,
        };
      }

      // Plain boolean
      if (typeof val === 'boolean') {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'boolean' as FieldType,
          confidence: 0.5,
        };
      }

      // Number
      if (typeof val === 'number') {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'number' as FieldType,
          confidence: 0.9,
        };
      }

      // Nested object
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'object' as FieldType,
          confidence: 0.9,
        };
      }

      // Nested array
      if (Array.isArray(val)) {
        return {
          key,
          label: formatLabel(key),
          value: val,
          type: 'array' as FieldType,
          confidence: 0.9,
        };
      }

      // Null
      if (val == null) {
        return {
          key,
          label: formatLabel(key),
          value: null,
          type: 'null' as FieldType,
          confidence: 1.0,
        };
      }

      // Default: text
      return {
        key,
        label: formatLabel(key),
        value: val,
        type: 'text' as FieldType,
        confidence: 0.7,
      };
    });
}

// --- Sensitive field redaction ---
function redactSensitive(data: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (data == null) return data;

  if (Array.isArray(data)) {
    return data.slice(0, MAX_ARRAY_ITEMS).map((item) => redactSensitive(item, depth + 1));
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = '••••••';
      } else {
        result[key] = redactSensitive(value, depth + 1);
      }
    }
    return result;
  }

  return data;
}

// --- Truncation ---
function truncateDeep(data: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (data == null) return data;

  if (typeof data === 'string') {
    return data.length > MAX_STRING_LENGTH ? data.slice(0, MAX_STRING_LENGTH) + '…' : data;
  }

  if (Array.isArray(data)) {
    return data.slice(0, MAX_ARRAY_ITEMS).map((item) => truncateDeep(item, depth + 1));
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = truncateDeep(value, depth + 1);
    }
    return result;
  }

  return data;
}

// --- Density ---
function selectDensity(data: unknown): DensityMode {
  if (!Array.isArray(data)) return 'detailed';
  if (data.length <= 3) return 'detailed';
  if (data.length <= 15) return 'compact';
  return 'grid';
}

// --- Helpers ---
function formatTitle(toolName: string): string {
  return toolName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
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
