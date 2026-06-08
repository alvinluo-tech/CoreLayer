import type { DataViewSchema, ChartType } from '@/types/dataView';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  Line,
  Bar,
  Pie,
  Cell,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const CHART_COLORS = ['var(--cyan)', 'var(--amber)', '#a78bfa', '#34d399', '#f472b6', '#fb923c'];

interface DataPanelChartProps {
  data: unknown;
  schema?: DataViewSchema;
}

function extractChartData(
  data: unknown,
  schema?: DataViewSchema
): { chartType: ChartType; data: Record<string, unknown>[]; xKey: string; yKeys: string[] } {
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

function detectYKeys(rows: Record<string, unknown>[], xKey: string): string[] {
  if (rows.length === 0) return [];
  const first = rows[0]!;
  return Object.keys(first).filter((k) => k !== xKey && typeof first[k] === 'number');
}

const MAX_POINTS = 200;

const tooltipStyle = {
  background: 'rgba(4,6,14,0.95)',
  border: '1px solid var(--glass-border)',
  borderRadius: 6,
  fontFamily: 'var(--font-data)',
  fontSize: 10,
};

const axisProps = {
  tick: { fill: 'var(--text-tertiary)', fontSize: 10 },
  axisLine: { stroke: 'var(--glass-border)' },
  tickLine: false as const,
};

export function DataPanelChart({ data: rawData, schema }: DataPanelChartProps) {
  const { chartType, data: chartData, xKey, yKeys } = extractChartData(rawData, schema);
  const truncated = chartData.length > MAX_POINTS;
  const displayData = truncated ? chartData.slice(0, MAX_POINTS) : chartData;

  if (displayData.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 200,
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          color: 'var(--text-tertiary)',
        }}
      >
        NO DATA TO CHART
      </div>
    );
  }

  return (
    <div>
      {truncated && (
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            color: 'var(--amber)',
            padding: '4px 8px',
            textAlign: 'center',
          }}
        >
          Showing first {MAX_POINTS} of {chartData.length} data points
        </div>
      )}
      <ResponsiveContainer width="100%" height={220}>
        {chartType === 'line' ? (
          <LineChart data={displayData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : chartType === 'bar' ? (
          <BarChart data={displayData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        ) : chartType === 'pie' ? (
          (() => {
            const yKey = yKeys[0] ?? 'value';
            const pieData = displayData.map((d) => ({
              name: String(d[xKey] ?? ''),
              value: Number(d[yKey] ?? 0),
            }));
            return (
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={30}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={{ stroke: 'var(--text-tertiary)' }}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            );
          })()
        ) : chartType === 'scatter' ? (
          <ScatterChart data={displayData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} {...axisProps} />
            <YAxis dataKey={yKeys[0] ?? xKey} {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} />
            <Scatter data={displayData} fill={CHART_COLORS[0]} />
          </ScatterChart>
        ) : (
          <LineChart data={displayData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey={xKey} {...axisProps} />
            <YAxis {...axisProps} />
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
