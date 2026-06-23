import { describe, it, expect } from "vitest";
import { generateMcpConfig, validateMcpConfig } from "../mcp-config-generator.js";

const sampleServers = [
  { name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
  { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: "test" } },
];

describe("generateMcpConfig", () => {
  it("should generate Claude Code config", () => {
    const result = generateMcpConfig({ adapterId: "claude-code", servers: sampleServers });
    expect(result.format).toBe("json");
    const config = JSON.parse(result.content);
    expect(config.filesystem).toBeDefined();
    expect(config.filesystem.command).toBe("npx");
    expect(config.github.env.GITHUB_TOKEN).toBe("test");
  });

  it("should generate Codex config", () => {
    const result = generateMcpConfig({ adapterId: "codex", servers: sampleServers });
    expect(result.format).toBe("json");
    const config = JSON.parse(result.content);
    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers.filesystem).toBeDefined();
  });

  it("should generate OpenCode config", () => {
    const result = generateMcpConfig({ adapterId: "opencode", servers: sampleServers });
    expect(result.format).toBe("json");
    const config = JSON.parse(result.content);
    expect(config.servers).toHaveLength(2);
    expect(config.servers[0].name).toBe("filesystem");
  });

  it("should throw for unknown adapter", () => {
    expect(() =>
      generateMcpConfig({ adapterId: "unknown", servers: [] }),
    ).toThrow("Unknown adapter");
  });

  it("should handle empty servers", () => {
    const result = generateMcpConfig({ adapterId: "claude-code", servers: [] });
    expect(JSON.parse(result.content)).toEqual({});
  });
});

describe("validateMcpConfig", () => {
  it("should pass when all servers are approved", () => {
    const result = validateMcpConfig(["filesystem", "github"], ["filesystem", "github", "slack"]);
    expect(result.valid).toBe(true);
    expect(result.unapproved).toEqual([]);
  });

  it("should fail when servers are not approved", () => {
    const result = validateMcpConfig(["filesystem", "malicious"], ["filesystem", "github"]);
    expect(result.valid).toBe(false);
    expect(result.unapproved).toEqual(["malicious"]);
  });

  it("should handle empty lists", () => {
    const result = validateMcpConfig([], []);
    expect(result.valid).toBe(true);
  });
});
