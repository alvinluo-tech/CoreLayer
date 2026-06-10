import { describe, it, expect, beforeEach, vi } from "vitest";

const mockRegisterJarvisTool = vi.fn();
vi.mock("../registry.js", () => ({
  registerJarvisTool: (...args: unknown[]) => mockRegisterJarvisTool(...args),
}));

const { registerChartTools } = await import("../chart.js");

describe("chart tools", () => {
  let registeredTool: Parameters<typeof mockRegisterJarvisTool>[0] | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTool = null;
    mockRegisterJarvisTool.mockImplementation((tool: Parameters<typeof mockRegisterJarvisTool>[0]) => {
      registeredTool = tool;
    });
  });

  describe("registerChartTools", () => {
    it("registers a tool with id native:render_chart", () => {
      registerChartTools();
      expect(mockRegisterJarvisTool).toHaveBeenCalledOnce();
      expect(registeredTool).not.toBeNull();
      expect(registeredTool!.id).toBe("native:render_chart");
      expect(registeredTool!.name).toBe("render_chart");
      expect(registeredTool!.source).toBe("native");
      expect(registeredTool!.category).toBe("data");
      expect(registeredTool!.displayMode).toBe("card");
      expect(registeredTool!.dataView).toEqual({ type: "chart" });
    });

    it("has correct input schema", () => {
      registerChartTools();
      expect(registeredTool!.inputSchema).toEqual(
        expect.objectContaining({
          type: "object",
          required: ["chartType", "data"],
        }),
      );
    });
  });

  describe("execute", () => {
    function getExecute() {
      return registeredTool!.execute as (args: unknown) => Promise<unknown>;
    }

    it("returns error for invalid chart type", async () => {
      registerChartTools();
      const result = await getExecute()({ chartType: "invalid", data: [] });
      expect(result).toEqual({
        success: false,
        error: "Invalid chart type. Must be one of: line, bar, pie, scatter",
      });
    });

    it("returns error for missing chart type", async () => {
      registerChartTools();
      const result = await getExecute()({ data: [] });
      expect(result).toEqual({
        success: false,
        error: "Invalid chart type. Must be one of: line, bar, pie, scatter",
      });
    });

    it("returns error for missing data", async () => {
      registerChartTools();
      const result = await getExecute()({ chartType: "line" });
      expect(result).toEqual({ success: false, error: "Data is required" });
    });

    it("returns error for data exceeding max points", async () => {
      registerChartTools();
      const data = Array.from({ length: 501 }, (_, i) => ({ x: i, y: i }));
      const result = await getExecute()({ chartType: "line", data });
      expect(result).toEqual({
        success: false,
        error: "Data exceeds maximum of 500 points",
      });
    });

    it("returns error for non-string xKey", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "line",
        data: [{ x: 1, y: 2 }],
        xKey: 123,
      });
      expect(result).toEqual({ success: false, error: "xKey must be a string" });
    });

    it("returns error for non-array yKeys", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "line",
        data: [{ x: 1, y: 2 }],
        yKeys: "not-array",
      });
      expect(result).toEqual({
        success: false,
        error: "yKeys must be an array of strings",
      });
    });

    it("returns error for script injection", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "bar",
        data: [{ name: '<script>alert("xss")</script>' }],
      });
      expect(result).toEqual({
        success: false,
        error: "Data contains prohibited content",
      });
    });

    it("returns error for javascript: injection", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "bar",
        data: [{ name: 'javascript:void(0)' }],
      });
      expect(result).toEqual({
        success: false,
        error: "Data contains prohibited content",
      });
    });

    it("returns error for dangerouslySetInnerHTML injection", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "pie",
        data: [{ name: 'dangerouslySetInnerHTML={{}' }],
      });
      expect(result).toEqual({
        success: false,
        error: "Data contains prohibited content",
      });
    });

    it("succeeds with valid line chart", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "line",
        data: [{ x: 1, y: 2 }],
        xKey: "x",
        yKeys: ["y"],
        title: "Test Chart",
      });
      expect(result).toEqual({
        success: true,
        data: {
          chartType: "line",
          data: [{ x: 1, y: 2 }],
          xKey: "x",
          yKeys: ["y"],
          title: "Test Chart",
        },
        metadata: {
          dataView: {
            type: "chart",
            title: "Test Chart",
            chartType: "line",
            xKey: "x",
            yKeys: ["y"],
          },
        },
      });
    });

    it("succeeds with bar chart and defaults", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "bar",
        data: [{ name: "A", value: 10 }],
      });
      const r = result as { success: boolean; data: { xKey: string; yKeys: string[] } };
      expect(r.success).toBe(true);
      expect(r.data.xKey).toBe("name");
      expect(r.data.yKeys).toEqual([]);
    });

    it("succeeds with pie chart", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "pie",
        data: [{ name: "A", value: 10 }],
      });
      expect((result as { success: boolean }).success).toBe(true);
    });

    it("succeeds with scatter chart", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "scatter",
        data: [{ x: 1, y: 2 }],
      });
      expect((result as { success: boolean }).success).toBe(true);
    });

    it("sanitizes long string values in data", async () => {
      registerChartTools();
      const longString = "a".repeat(300);
      const result = await getExecute()({
        chartType: "bar",
        data: [{ name: longString }],
      });
      const r = result as { data: { data: Array<{ name: string }> } };
      expect(r.data.data[0].name.length).toBe(203); // 200 + "..."
      expect(r.data.data[0].name.endsWith("...")).toBe(true);
    });

    it("passes through non-string values unchanged", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "bar",
        data: [{ name: "A", count: 42, active: true }],
      });
      const r = result as { data: { data: Array<{ name: string; count: number; active: boolean }> } };
      expect(r.data.data[0].count).toBe(42);
      expect(r.data.data[0].active).toBe(true);
    });

    it("rejects data exceeding max points (validation before sanitization)", async () => {
      registerChartTools();
      const data = Array.from({ length: 600 }, (_, i) => ({ x: i, y: i }));
      const result = await getExecute()({ chartType: "line", data });
      expect((result as { success: boolean }).success).toBe(false);
    });

    it("accepts data at exactly max points", async () => {
      registerChartTools();
      const data = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i }));
      const result = await getExecute()({ chartType: "line", data });
      const r = result as { success: boolean; data: { data: unknown[] } };
      expect(r.success).toBe(true);
      expect(r.data.data.length).toBe(500);
    });

    it("handles non-object items in array", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "pie",
        data: [null, 42, "hello", { name: "ok" }],
      });
      const r = result as { data: { data: unknown[] } };
      expect(r.data.data[0]).toBeNull();
      expect(r.data.data[1]).toBe(42);
      expect(r.data.data[2]).toBe("hello");
      expect(r.data.data[3]).toEqual({ name: "ok" });
    });

    it("passes through non-object non-array data", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "bar",
        data: "raw-string-data",
      });
      const r = result as { data: { data: unknown } };
      expect(r.data.data).toBe("raw-string-data");
    });

    it("passes through null/undefined data (caught by validation)", async () => {
      registerChartTools();
      const result = await getExecute()({
        chartType: "bar",
        data: null,
      });
      expect((result as { success: boolean }).success).toBe(false);
    });
  });
});
