import type { JarvisTool } from "@jarvis/types";

/**
 * Plugin system types for extensible Jarvis functionality.
 */

export interface PluginMetadata {
  /** Unique plugin identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin description */
  description?: string;
  /** Author name */
  author?: string;
  /** Plugin dependencies (other plugin IDs) */
  dependencies?: string[];
  /** Required environment variables */
  requiredEnv?: string[];
}

export interface PluginContext {
  /** Register a tool provided by this plugin */
  registerTool: (tool: JarvisTool) => void;
  /** Access environment variables */
  env: Record<string, string | undefined>;
  /** Logger scoped to plugin */
  log: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}

export interface Plugin {
  /** Plugin metadata */
  metadata: PluginMetadata;
  /** Called when plugin is loaded */
  activate: (context: PluginContext) => Promise<void> | void;
  /** Called when plugin is unloaded */
  deactivate?: () => Promise<void> | void;
  /** Whether plugin is currently active */
  active: boolean;
}
