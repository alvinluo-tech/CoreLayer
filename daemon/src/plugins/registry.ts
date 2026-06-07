import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { registerJarvisTool } from "../runtimes/tool/adapters/native-tools/registry.js";
import type { Plugin, PluginMetadata, PluginContext } from "./types.js";

/**
 * Plugin registry — manages loading, activation, and lifecycle of plugins.
 */

const plugins = new Map<string, Plugin>();

/**
 * Register a plugin. If the plugin has an activate function, it will be called.
 */
export async function registerPlugin(plugin: Plugin): Promise<void> {
  if (plugins.has(plugin.metadata.id)) {
    console.warn(`[Plugins] Plugin already registered: ${plugin.metadata.id}`);
    return;
  }

  // Check dependencies
  if (plugin.metadata.dependencies) {
    for (const dep of plugin.metadata.dependencies) {
      if (!plugins.has(dep)) {
        console.error(`[Plugins] Missing dependency "${dep}" for plugin "${plugin.metadata.id}"`);
        return;
      }
    }
  }

  // Check required env vars
  if (plugin.metadata.requiredEnv) {
    const missing = plugin.metadata.requiredEnv.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      console.warn(`[Plugins] Missing env vars for "${plugin.metadata.id}": ${missing.join(", ")}`);
      return;
    }
  }

  plugins.set(plugin.metadata.id, plugin);

  // Create plugin context
  const context = createPluginContext(plugin.metadata);

  // Activate plugin
  try {
    await plugin.activate(context);
    plugin.active = true;
    console.log(`[Plugins] Activated: ${plugin.metadata.name} v${plugin.metadata.version}`);
  } catch (err) {
    plugin.active = false;
    console.error(`[Plugins] Failed to activate "${plugin.metadata.id}":`, err);
  }
}

/**
 * Unregister a plugin. Calls deactivate if available.
 */
export async function unregisterPlugin(pluginId: string): Promise<boolean> {
  const plugin = plugins.get(pluginId);
  if (!plugin) return false;

  if (plugin.active && plugin.deactivate) {
    try {
      await plugin.deactivate();
    } catch (err) {
      console.error(`[Plugins] Error deactivating "${pluginId}":`, err);
    }
  }

  plugin.active = false;
  return plugins.delete(pluginId);
}

/**
 * Get a plugin by ID.
 */
export function getPlugin(pluginId: string): Plugin | undefined {
  return plugins.get(pluginId);
}

/**
 * Get all registered plugins.
 */
export function getAllPlugins(): Plugin[] {
  return Array.from(plugins.values());
}

/**
 * Enable a previously disabled plugin.
 */
export async function enablePlugin(pluginId: string): Promise<boolean> {
  const plugin = plugins.get(pluginId);
  if (!plugin || plugin.active) return false;

  const context = createPluginContext(plugin.metadata);
  try {
    await plugin.activate(context);
    plugin.active = true;
    return true;
  } catch (err) {
    console.error(`[Plugins] Failed to enable "${pluginId}":`, err);
    return false;
  }
}

/**
 * Disable an active plugin without removing it.
 */
export async function disablePlugin(pluginId: string): Promise<boolean> {
  const plugin = plugins.get(pluginId);
  if (!plugin || !plugin.active) return false;

  if (plugin.deactivate) {
    try {
      await plugin.deactivate();
    } catch (err) {
      console.error(`[Plugins] Error deactivating "${pluginId}":`, err);
    }
  }

  plugin.active = false;
  return true;
}

/**
 * Load plugin definitions from JSON files in a directory.
 * Each JSON file should contain PluginMetadata.
 */
export async function loadPluginsFromDirectory(dirPath: string): Promise<number> {
  let count = 0;

  try {
    const files = await readdir(dirPath);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      try {
        const filePath = join(dirPath, file);
        const content = await readFile(filePath, "utf-8");
        const metadata = JSON.parse(content) as PluginMetadata;

        if (!metadata.id || !metadata.name || !metadata.version) {
          console.warn(`[Plugins] Invalid plugin metadata in ${file}: missing id/name/version`);
          continue;
        }

        // Create a basic plugin from metadata (no activate/deactivate for JSON-only plugins)
        const plugin: Plugin = {
          metadata,
          active: false,
          activate: () => {
            console.log(`[Plugins] JSON plugin "${metadata.id}" has no activate function`);
          },
        };

        await registerPlugin(plugin);
        count++;
      } catch (err) {
        console.error(`[Plugins] Error loading plugin from ${file}:`, err);
      }
    }
  } catch (err) {
    // Directory may not exist
    console.log(`[Plugins] Plugin directory not found: ${dirPath}`);
  }

  return count;
}

function createPluginContext(metadata: PluginMetadata): PluginContext {
  const prefix = `[Plugin:${metadata.id}]`;

  return {
    registerTool: (tool) => {
      registerJarvisTool(tool);
      console.log(`${prefix} Registered tool: ${tool.name}`);
    },
    env: process.env as Record<string, string | undefined>,
    log: {
      info: (message) => console.log(`${prefix} ${message}`),
      warn: (message) => console.warn(`${prefix} ${message}`),
      error: (message) => console.error(`${prefix} ${message}`),
    },
  };
}
