/**
 * Storage Layout — unified filesystem topology for Jarvis/CoreLayer.
 *
 * Implements an industrial XDG-compliant, multi-tier directory structure
 * inspired by OpenClaw and Hermes Agent:
 *
 * 1. config/    — Pure user preferences, settings, and routing rules (Zero secrets, sync-safe)
 * 2. security/  — Sensitive credentials and keys (Enforces POSIX 0600 permissions)
 * 3. memory/    — Explicit living Markdown memory (USER.md, MEMORY.md, journal/, dreams/)
 * 4. storage/   — Durable SQLite databases and state
 * 5. worktrees/ — Git execution sandboxes (active/影子分支, snapshots/快照归档)
 * 6. cache/     — Temporary disposable caches (AST symbol graphs, MCP schemas, live pipes)
 *
 * Fully backwards-compatible with `process.env.JARVIS_HOME` and legacy paths.
 */

import { existsSync, mkdirSync, chmodSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface JarvisStorageLayout {
  rootDir: string;
  configDir: string;
  configPath: string;
  routingPath: string;
  securityDir: string;
  credentialsPath: string;
  memoryDir: string;
  userMarkdownPath: string;
  memoryMarkdownPath: string;
  journalDir: string;
  dreamsDir: string;
  storageDir: string;
  mainDbPath: string;
  worktreesDir: string;
  activeWorktreesDir: string;
  snapshotsDir: string;
  cacheDir: string;
  symbolGraphCacheDir: string;
  mcpSchemaCacheDir: string;
  delegationPipesDir: string;
}

/**
 * Resolves the absolute directory layout for the current environment.
 */
export function getStorageLayout(): JarvisStorageLayout {
  // Respect explicit test or custom override
  if (process.env.JARVIS_HOME) {
    const root = process.env.JARVIS_HOME;
    // For unit tests that point JARVIS_HOME directly to a directory containing config.json
    const isFlatTestDir = existsSync(join(root, "config.json")) || !existsSync(join(root, "config"));
    const configDir = isFlatTestDir ? root : join(root, "config");
    const securityDir = isFlatTestDir ? root : join(root, "security");

    return {
      rootDir: root,
      configDir,
      configPath: join(configDir, "config.json"),
      routingPath: join(configDir, "routing.json"),
      securityDir,
      credentialsPath: join(securityDir, "credentials.json"),
      memoryDir: join(root, "memory"),
      userMarkdownPath: join(root, "memory", "USER.md"),
      memoryMarkdownPath: join(root, "memory", "MEMORY.md"),
      journalDir: join(root, "memory", "journal"),
      dreamsDir: join(root, "memory", "dreams"),
      storageDir: join(root, "storage"),
      mainDbPath: join(root, "storage", "jarvis.db"),
      worktreesDir: join(root, "worktrees"),
      activeWorktreesDir: join(root, "worktrees", "active"),
      snapshotsDir: join(root, "worktrees", "snapshots"),
      cacheDir: join(root, "cache"),
      symbolGraphCacheDir: join(root, "cache", "symbol-graph"),
      mcpSchemaCacheDir: join(root, "cache", "mcp-schemas"),
      delegationPipesDir: join(root, "cache", "delegation-pipes"),
    };
  }

  // Production desktop default
  const root = join(homedir(), ".jarvis");
  const configDir = join(root, "config");
  const securityDir = join(root, "security");

  // Legacy fallback: check if ~/.jarvis/config/credentials.json exists from prior versions
  const legacyCredsPath = join(configDir, "credentials.json");
  const standardCredsPath = join(securityDir, "credentials.json");
  const credentialsPath = existsSync(legacyCredsPath) && !existsSync(standardCredsPath)
    ? legacyCredsPath
    : standardCredsPath;

  return {
    rootDir: root,
    configDir,
    configPath: join(configDir, "config.json"),
    routingPath: join(configDir, "routing.json"),
    securityDir,
    credentialsPath,
    memoryDir: join(root, "memory"),
    userMarkdownPath: join(root, "memory", "USER.md"),
    memoryMarkdownPath: join(root, "memory", "MEMORY.md"),
    journalDir: join(root, "memory", "journal"),
    dreamsDir: join(root, "memory", "dreams"),
    storageDir: join(root, "storage"),
    mainDbPath: join(root, "storage", "jarvis.db"),
    worktreesDir: join(root, "worktrees"),
    activeWorktreesDir: join(root, "worktrees", "active"),
    snapshotsDir: join(root, "worktrees", "snapshots"),
    cacheDir: join(root, "cache"),
    symbolGraphCacheDir: join(root, "cache", "symbol-graph"),
    mcpSchemaCacheDir: join(root, "cache", "mcp-schemas"),
    delegationPipesDir: join(root, "cache", "delegation-pipes"),
  };
}

/**
 * Ensures all required directories exist and applies security hardening on POSIX platforms.
 */
export function ensureStorageLayout(customLayout?: JarvisStorageLayout): JarvisStorageLayout {
  const layout = customLayout ?? getStorageLayout();

  const directories = [
    layout.rootDir,
    layout.configDir,
    layout.securityDir,
    layout.memoryDir,
    layout.journalDir,
    layout.dreamsDir,
    layout.storageDir,
    layout.worktreesDir,
    layout.activeWorktreesDir,
    layout.snapshotsDir,
    layout.cacheDir,
    layout.symbolGraphCacheDir,
    layout.mcpSchemaCacheDir,
    layout.delegationPipesDir,
  ];

  for (const dir of directories) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // POSIX 0600 file permission enforcement for sensitive credentials
  if (process.platform !== "win32" && existsSync(layout.credentialsPath)) {
    try {
      const stats = statSync(layout.credentialsPath);
      const mode = (stats.mode & 0o777).toString(8);
      if (mode !== "600") {
        chmodSync(layout.credentialsPath, 0o600);
      }
    } catch {
      // Permission modification ignored if unprivileged
    }
  }

  return layout;
}
