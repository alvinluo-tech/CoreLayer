import { describe, it, expect } from "vitest";
import {
  DynamicToolRouter,
  CORE_TOOL_SET,
  DEFAULT_MAX_ACTIVE_TOOLS,
} from "../tool-router.js";
import type { JarvisTool } from "@jarvis/types";

describe("DynamicToolRouter", () => {
  it("passes all tools through when total count is within maxActiveTools limit", () => {
    const router = new DynamicToolRouter(16);
    const smallToolMap: Record<string, string> = {
      bash: "tool-bash",
      readFile: "tool-read",
      customTool1: "tool-custom-1",
      customTool2: "tool-custom-2",
    };

    const routed = router.routeTools({
      allTools: smallToolMap,
      query: "anything",
    });

    expect(Object.keys(routed)).toHaveLength(4);
    expect(routed).toEqual(smallToolMap);
  });

  it("caps total tools at maxActiveTools when tool spillover occurs (e.g. 50+ tools)", () => {
    const router = new DynamicToolRouter(16);
    const massiveToolMap: Record<string, string> = {};

    // 10 Core tools
    for (const core of CORE_TOOL_SET) {
      massiveToolMap[core] = `impl-${core}`;
    }

    // 40 Random MCP / domain tools
    for (let i = 0; i < 40; i++) {
      massiveToolMap[`mcp_extra_tool_${i}`] = `impl-extra-${i}`;
    }

    expect(Object.keys(massiveToolMap).length).toBe(CORE_TOOL_SET.size + 40);

    const routed = router.routeTools({
      allTools: massiveToolMap,
      query: "general coding help",
    });

    const activeKeys = Object.keys(routed);
    expect(activeKeys.length).toBeLessThanOrEqual(DEFAULT_MAX_ACTIVE_TOOLS);

    // All core tools must be preserved
    for (const core of CORE_TOOL_SET) {
      expect(activeKeys).toContain(core);
    }
  });

  it("dynamically recalls query-relevant tools when candidates are available", () => {
    const router = new DynamicToolRouter(16);
    const toolMap: Record<string, string> = {
      bash: "impl",
      readFile: "impl",
      writeFile: "impl",
    };

    // Populate 30 tools with distinct domains
    for (let i = 0; i < 10; i++) toolMap[`weather_forecast_${i}`] = "impl";
    for (let i = 0; i < 10; i++) toolMap[`calendar_event_${i}`] = "impl";
    toolMap["postgres_database_query"] = "impl";
    toolMap["mysql_schema_inspector"] = "impl";

    const jarvisMeta: JarvisTool[] = [
      {
        id: "postgres_database_query",
        appId: "postgres",
        name: "postgres_database_query",
        title: "Postgres Query",
        description: "Executes SQL query against postgres database",
        source: "mcp",
        risk: "medium",
        permissions: [],
        requiresConfirmation: false,
        inputSchema: { type: "object" },
        execute: async () => ({ success: true }),
      },
      {
        id: "mysql_schema_inspector",
        appId: "mysql",
        name: "mysql_schema_inspector",
        title: "MySQL Inspector",
        description: "Inspects database tables and schema structures",
        source: "mcp",
        risk: "low",
        permissions: [],
        requiresConfirmation: false,
        inputSchema: { type: "object" },
        execute: async () => ({ success: true }),
      },
    ];

    const routed = router.routeTools({
      allTools: toolMap,
      query: "please query the database for user records",
      jarvisTools: jarvisMeta,
      maxTools: 10,
    });

    const activeKeys = Object.keys(routed);
    expect(activeKeys.length).toBeLessThanOrEqual(10);
    expect(activeKeys).toContain("bash");
    expect(activeKeys).toContain("readFile");
    // Relevant database tools are dynamically recalled
    expect(activeKeys).toContain("postgres_database_query");
  });

  it("smoothly pads remaining slots when query does not match any candidate", () => {
    const router = new DynamicToolRouter(10);
    const toolMap: Record<string, string> = {
      bash: "impl",
      toolA: "impl",
      toolB: "impl",
      toolC: "impl",
      toolD: "impl",
      toolE: "impl",
      toolF: "impl",
      toolG: "impl",
      toolH: "impl",
      toolI: "impl",
      toolJ: "impl",
      toolK: "impl",
    };

    const routed = router.routeTools({
      allTools: toolMap,
      query: "xyznonexistentqueryxyz",
      maxTools: 8,
    });

    expect(Object.keys(routed)).toHaveLength(8);
    expect(Object.keys(routed)).toContain("bash");
  });
});
