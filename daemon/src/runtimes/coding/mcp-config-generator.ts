/**
 * MCP Config Generator — generate executor-specific MCP configs
 * from approved servers.
 *
 * Each executor (Claude Code, Codex, OpenCode) has different MCP
 * config formats. This module generates the correct format per adapter.
 */

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConfigGenerationInput {
  /** Adapter ID (claude-code, codex, opencode) */
  adapterId: string;
  /** Approved MCP servers */
  servers: McpServerConfig[];
  /** Whether to use strict MCP config (only these servers) */
  strict?: boolean;
}

/**
 * Generate MCP config for an executor adapter.
 */
export function generateMcpConfig(input: McpConfigGenerationInput): {
  format: "json" | "yaml" | "inline";
  content: string;
  filePath?: string;
} {
  const { adapterId, servers } = input;

  switch (adapterId) {
    case "claude-code":
      return generateClaudeCodeConfig(servers);
    case "codex":
      return generateCodexConfig(servers);
    case "opencode":
      return generateOpenCodeConfig(servers);
    default:
      throw new Error(`Unknown adapter: ${adapterId}`);
  }
}

function generateClaudeCodeConfig(
  servers: McpServerConfig[],
): { format: "json"; content: string } {
  const config: Record<string, unknown> = {};
  for (const server of servers) {
    config[server.name] = {
      command: server.command,
      ...(server.args?.length ? { args: server.args } : {}),
      ...(server.env && Object.keys(server.env).length ? { env: server.env } : {}),
    };
  }
  return { format: "json", content: JSON.stringify(config, null, 2) };
}

function generateCodexConfig(
  servers: McpServerConfig[],
): { format: "json"; content: string } {
  const config = {
    mcpServers: servers.reduce(
      (acc, server) => {
        acc[server.name] = {
          command: server.command,
          ...(server.args?.length ? { args: server.args } : {}),
        };
        return acc;
      },
      {} as Record<string, unknown>,
    ),
  };
  return { format: "json", content: JSON.stringify(config, null, 2) };
}

function generateOpenCodeConfig(
  servers: McpServerConfig[],
): { format: "json"; content: string } {
  const config = {
    servers: servers.map((s) => ({
      name: s.name,
      command: s.command,
      ...(s.args?.length ? { args: s.args } : {}),
    })),
  };
  return { format: "json", content: JSON.stringify(config, null, 2) };
}

/**
 * Validate that all servers in a config are in the approved list.
 */
export function validateMcpConfig(
  configServers: string[],
  approvedServers: string[],
): { valid: boolean; unapproved: string[] } {
  const approved = new Set(approvedServers);
  const unapproved = configServers.filter((s) => !approved.has(s));
  return { valid: unapproved.length === 0, unapproved };
}
