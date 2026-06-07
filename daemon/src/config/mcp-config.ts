import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { MCPServerConfig } from "@jarvis/types";

const CONFIG_DIR = join(homedir(), ".jarvis", "config");
const CONFIG_FILE = join(CONFIG_DIR, "mcp-servers.json");

export interface MCPConfigStore {
  version: 1;
  servers: MCPServerConfig[];
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadMCPServers(): MCPServerConfig[] {
  if (!existsSync(CONFIG_FILE)) return [];
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const store: MCPConfigStore = JSON.parse(raw);
    if (store.version !== 1 || !Array.isArray(store.servers)) return [];
    return store.servers;
  } catch {
    return [];
  }
}

export function saveMCPServers(servers: MCPServerConfig[]): void {
  ensureDir();
  const store: MCPConfigStore = { version: 1, servers };
  writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function addMCPServer(config: MCPServerConfig): void {
  const servers = loadMCPServers();
  const idx = servers.findIndex((s) => s.id === config.id);
  if (idx >= 0) {
    servers[idx] = config;
  } else {
    servers.push(config);
  }
  saveMCPServers(servers);
}

export function removeMCPServer(serverId: string): void {
  const servers = loadMCPServers().filter((s) => s.id !== serverId);
  saveMCPServers(servers);
}
