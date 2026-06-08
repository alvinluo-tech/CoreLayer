import { registerJarvisTool } from "./registry.js";
import type { JarvisTool } from "@jarvis/types";

const MAX_DATA_POINTS = 500;
const MAX_STRING_LENGTH = 200;
const SUPPORTED_CHART_TYPES = ["line", "bar", "pie", "scatter"] as const;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) return value.slice(0, MAX_STRING_LENGTH) + "...";
    return value;
  }
  return value;
}

function sanitizeChartData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.slice(0, MAX_DATA_POINTS).map((item) => {
      if (!item || typeof item !== "object") return redactValue(item);
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        sanitized[k] = redactValue(v);
      }
      return sanitized;
    });
  }
  return data;
}

function validateChartPayload(args: {
  chartType?: string;
  data?: unknown;
  xKey?: string;
  yKeys?: string[];
  title?: string;
}): { valid: boolean; error?: string } {
  const { chartType, data, xKey, yKeys } = args;

  if (!chartType || !SUPPORTED_CHART_TYPES.includes(chartType as (typeof SUPPORTED_CHART_TYPES)[number])) {
    return { valid: false, error: `Invalid chart type. Must be one of: ${SUPPORTED_CHART_TYPES.join(", ")}` };
  }

  if (!data) {
    return { valid: false, error: "Data is required" };
  }

  if (Array.isArray(data) && data.length > MAX_DATA_POINTS) {
    return { valid: false, error: `Data exceeds maximum of ${MAX_DATA_POINTS} points` };
  }

  if (xKey && typeof xKey !== "string") {
    return { valid: false, error: "xKey must be a string" };
  }

  if (yKeys && !Array.isArray(yKeys)) {
    return { valid: false, error: "yKeys must be an array of strings" };
  }

  // Reject React/HTML injection attempts
  const dataStr = JSON.stringify(data);
  if (dataStr.includes("<script") || dataStr.includes("javascript:") || dataStr.includes("dangerouslySetInnerHTML")) {
    return { valid: false, error: "Data contains prohibited content" };
  }

  return { valid: true };
}

export function registerChartTools(): void {
  const tool: JarvisTool = {
    id: "native:render_chart",
    appId: "jarvis",
    source: "native",
    name: "render_chart",
    title: "Render Chart",
    description:
      "Render data as a chart in the data panel. Supports line, bar, pie, and scatter charts. " +
      "Provide data as an array of objects with xKey and yKeys to specify axes.",
    inputSchema: {
      type: "object",
      properties: {
        chartType: {
          type: "string",
          enum: ["line", "bar", "pie", "scatter"],
          description: "Type of chart to render",
        },
        data: {
          type: "array",
          description: "Array of data objects to plot",
        },
        xKey: {
          type: "string",
          description: "Key for the X axis (default: 'name')",
        },
        yKeys: {
          type: "array",
          items: { type: "string" },
          description: "Keys for the Y axis values",
        },
        title: {
          type: "string",
          description: "Chart title",
        },
      },
      required: ["chartType", "data"],
    },
    risk: "low",
    permissions: [],
    requiresConfirmation: false,
    category: "data",
    action: "read",
    displayMode: "card",
    dataView: {
      type: "chart",
    },
    execute: async (args: unknown) => {
      const input = args as {
        chartType?: string;
        data?: unknown;
        xKey?: string;
        yKeys?: string[];
        title?: string;
      };

      const validation = validateChartPayload(input);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const sanitizedData = sanitizeChartData(input.data);

      return {
        success: true,
        data: {
          chartType: input.chartType,
          data: sanitizedData,
          xKey: input.xKey ?? "name",
          yKeys: input.yKeys ?? [],
          title: input.title,
        },
        metadata: {
          dataView: {
            type: "chart" as const,
            title: input.title,
            chartType: input.chartType as "line" | "bar" | "pie" | "scatter",
            xKey: input.xKey ?? "name",
            yKeys: input.yKeys ?? [],
          },
        },
      };
    },
  };

  registerJarvisTool(tool);
}
