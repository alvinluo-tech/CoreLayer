import { describe, it, expect, beforeEach, vi } from "vitest";

let capturedExecute: ((args: unknown) => Promise<unknown>) | null = null;

const mockJarvisTools = [
  {
    id: "mcp:github:create_issue",
    appId: "github",
    name: "github_create_issue",
    title: "Create GitHub Issue",
    description: "Creates an issue in a GitHub repository",
    source: "mcp" as const,
    risk: "medium" as const,
    permissions: [],
    requiresConfirmation: false,
    inputSchema: { type: "object" },
    execute: async () => ({ success: true }),
  },
  {
    id: "mcp:slack:send_message",
    appId: "slack",
    name: "slack_send_message",
    title: "Send Slack Message",
    description: "Sends a notification message to a Slack channel",
    source: "mcp" as const,
    risk: "low" as const,
    permissions: [],
    requiresConfirmation: false,
    inputSchema: { type: "object" },
    execute: async () => ({ success: true }),
  },
  {
    id: "native:bash",
    appId: "system",
    name: "bash",
    title: "Execute Command",
    description: "Executes a shell command in sandbox",
    source: "native" as const,
    risk: "high" as const,
    permissions: [],
    requiresConfirmation: true,
    inputSchema: { type: "object" },
    execute: async () => ({ success: true }),
  },
];

vi.mock("../registry.js", () => ({
  registerTool: (_name: string, definition: { execute: (args: unknown) => Promise<unknown> }) => {
    capturedExecute = definition.execute;
  },
  getAllJarvisTools: () => mockJarvisTools,
}));

const { registerToolDiscoveryTools } = await import("../tool-discovery.js");

beforeEach(() => {
  capturedExecute = null;
  registerToolDiscoveryTools();
});

describe("search_tools meta-tool", () => {
  it("registers search_tools with an execute function", () => {
    expect(capturedExecute).toBeTypeOf("function");
  });

  it("finds matching tools for a relevant keyword query", async () => {
    const fn = capturedExecute!;
    const result = (await fn({
      query: "github issue repository",
      limit: 5,
    })) as { totalFound: number; tools: Array<{ name: string }> };

    expect(result.totalFound).toBeGreaterThanOrEqual(1);
    expect(result.tools[0].name).toBe("github_create_issue");
  });

  it("returns zero matches with note when query has no relevance", async () => {
    const fn = capturedExecute!;
    const result = (await fn({
      query: "quantum teleportation mechanics",
    })) as { totalFound: number; tools: unknown[]; note: string };

    expect(result.totalFound).toBe(0);
    expect(result.tools).toEqual([]);
    expect(result.note).toContain("No tools matched query");
  });
});
