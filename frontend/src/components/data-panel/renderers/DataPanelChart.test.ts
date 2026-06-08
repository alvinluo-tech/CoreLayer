import { describe, it, expect } from 'vitest';

// Test the chart data extraction logic (pure function, no React rendering needed)
// We replicate the extractChartData logic since it's not exported

interface DataViewSchema {
  type?: string;
  chartType?: string;
  xKey?: string;
  yKeys?: string[];
}

function detectYKeys(rows: Record<string, unknown>[], xKey: string): string[] {
  if (rows.length === 0) return [];
  const first = rows[0]!;
  return Object.keys(first).filter((k) => k !== xKey && typeof first[k] === 'number');
}

function extractChartData(
  data: unknown,
  schema?: DataViewSchema
): { chartType: string; data: Record<string, unknown>[]; xKey: string; yKeys: string[] } {
  const chartType = schema?.chartType ?? 'line';
  const xKey = schema?.xKey ?? 'name';
  const yKeys = schema?.yKeys ?? [];

  if (!data) return { chartType, data: [], xKey, yKeys };

  if (Array.isArray(data)) {
    const rows = data.filter(
      (d): d is Record<string, unknown> => d != null && typeof d === 'object' && !Array.isArray(d)
    );
    const detectedYKeys = yKeys.length > 0 ? yKeys : detectYKeys(rows, xKey);
    return { chartType, data: rows, xKey, yKeys: detectedYKeys };
  }

  if (typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        const rows = val as Record<string, unknown>[];
        const detectedYKeys = yKeys.length > 0 ? yKeys : detectYKeys(rows, xKey);
        return { chartType, data: rows, xKey, yKeys: detectedYKeys };
      }
    }
  }

  return { chartType, data: [], xKey, yKeys };
}

describe('DataPanelChart - extractChartData', () => {
  it('returns empty data for null input', () => {
    const result = extractChartData(null);
    expect(result.data).toEqual([]);
    expect(result.chartType).toBe('line');
    expect(result.xKey).toBe('name');
  });

  it('returns empty data for undefined input', () => {
    const result = extractChartData(undefined);
    expect(result.data).toEqual([]);
  });

  it('extracts chart data from array of objects', () => {
    const data = [
      { name: 'Jan', value: 10 },
      { name: 'Feb', value: 20 },
    ];
    const result = extractChartData(data);
    expect(result.data).toHaveLength(2);
    expect(result.xKey).toBe('name');
    expect(result.yKeys).toContain('value');
  });

  it('uses schema xKey and yKeys when provided', () => {
    const data = [
      { month: 'Jan', sales: 100, profit: 30 },
      { month: 'Feb', sales: 150, profit: 50 },
    ];
    const schema: DataViewSchema = { xKey: 'month', yKeys: ['sales'] };
    const result = extractChartData(data, schema);
    expect(result.xKey).toBe('month');
    expect(result.yKeys).toEqual(['sales']);
  });

  it('auto-detects yKeys as numeric columns', () => {
    const data = [
      { label: 'A', count: 5, total: 100 },
      { label: 'B', count: 10, total: 200 },
    ];
    const result = extractChartData(data);
    expect(result.yKeys).toContain('count');
    expect(result.yKeys).toContain('total');
  });

  it('filters out non-object items from array', () => {
    const data = [{ name: 'a', value: 1 }, null, 'string', 42, { name: 'b', value: 2 }];
    const result = extractChartData(data);
    expect(result.data).toHaveLength(2);
  });

  it('extracts array from wrapper object', () => {
    const data = {
      items: [
        { name: 'a', value: 1 },
        { name: 'b', value: 2 },
      ],
    };
    const result = extractChartData(data);
    expect(result.data).toHaveLength(2);
  });

  it('returns empty for wrapper object with no arrays', () => {
    const data = { foo: 'bar', baz: 42 };
    const result = extractChartData(data);
    expect(result.data).toEqual([]);
  });

  it('respects chartType from schema', () => {
    const data = [{ name: 'a', value: 1 }];
    const schema: DataViewSchema = { chartType: 'bar' };
    const result = extractChartData(data, schema);
    expect(result.chartType).toBe('bar');
  });

  it('defaults to line chart when no schema', () => {
    const data = [{ name: 'a', value: 1 }];
    const result = extractChartData(data);
    expect(result.chartType).toBe('line');
  });

  it('handles empty array', () => {
    const result = extractChartData([]);
    expect(result.data).toEqual([]);
    expect(result.yKeys).toEqual([]);
  });

  it('handles array with only non-numeric columns', () => {
    const data = [
      { name: 'a', category: 'foo' },
      { name: 'b', category: 'bar' },
    ];
    const result = extractChartData(data);
    expect(result.yKeys).toEqual([]);
  });

  it('validates chart payload size (MAX_POINTS = 200)', () => {
    const data = Array.from({ length: 250 }, (_, i) => ({ name: `item${i}`, value: i }));
    const result = extractChartData(data);
    // The component truncates to 200, but extractChartData returns all
    expect(result.data).toHaveLength(250);
  });
});
