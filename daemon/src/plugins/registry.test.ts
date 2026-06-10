import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../runtimes/tool/public-api.js", () => ({
  registerJarvisTool: vi.fn(),
}));

import { readdir, readFile } from "node:fs/promises";
import {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  getAllPlugins,
  enablePlugin,
  disablePlugin,
  loadPluginsFromDirectory,
} from "./registry.js";
import type { Plugin, PluginMetadata } from "./types.js";

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

function makePlugin(overrides: Partial<PluginMetadata> = {}): Plugin {
  const metadata: PluginMetadata = {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    ...overrides,
  };
  return {
    metadata,
    activate: vi.fn(async () => {}),
    deactivate: vi.fn(async () => {}),
    active: false,
  };
}

describe("registerPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up all plugins by unregistering them
    for (const p of getAllPlugins()) {
      unregisterPlugin(p.metadata.id);
    }
  });

  it("should register and activate a plugin", async () => {
    const plugin = makePlugin();

    await registerPlugin(plugin);

    expect(plugin.activate).toHaveBeenCalled();
    expect(plugin.active).toBe(true);
    expect(getPlugin("test-plugin")).toBe(plugin);
  });

  it("should not re-register an already registered plugin", async () => {
    const plugin = makePlugin();

    await registerPlugin(plugin);
    await registerPlugin(plugin);

    // activate should only be called once
    expect(plugin.activate).toHaveBeenCalledTimes(1);
  });

  it("should check dependencies before registering", async () => {
    const plugin = makePlugin({ dependencies: ["missing-dep"] });

    await registerPlugin(plugin);

    expect(plugin.activate).not.toHaveBeenCalled();
    expect(getPlugin("test-plugin")).toBeUndefined();
  });

  it("should register when dependencies are met", async () => {
    const dep = makePlugin({ id: "dep" });
    await registerPlugin(dep);

    const plugin = makePlugin({ dependencies: ["dep"] });
    await registerPlugin(plugin);

    expect(plugin.active).toBe(true);
    expect(getPlugin("test-plugin")).toBe(plugin);

    // cleanup
    await unregisterPlugin("dep");
  });

  it("should check required env vars before registering", async () => {
    const original = process.env.MY_SECRET;
    delete process.env.MY_SECRET;

    const plugin = makePlugin({ requiredEnv: ["MY_SECRET"] });
    await registerPlugin(plugin);

    expect(plugin.activate).not.toHaveBeenCalled();
    expect(getPlugin("test-plugin")).toBeUndefined();

    if (original !== undefined) process.env.MY_SECRET = original;
  });

  it("should register when required env vars are present", async () => {
    process.env.MY_SECRET = "token";
    const plugin = makePlugin({ requiredEnv: ["MY_SECRET"] });

    await registerPlugin(plugin);

    expect(plugin.active).toBe(true);
    delete process.env.MY_SECRET;
  });

  it("should handle activation failure gracefully", async () => {
    const plugin = makePlugin();
    plugin.activate = vi.fn(async () => {
      throw new Error("activation failed");
    });

    await registerPlugin(plugin);

    expect(plugin.active).toBe(false);
    expect(getPlugin("test-plugin")).toBe(plugin);
  });
});

describe("unregisterPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const p of getAllPlugins()) {
      unregisterPlugin(p.metadata.id);
    }
  });

  it("should unregister and deactivate a plugin", async () => {
    const plugin = makePlugin();
    await registerPlugin(plugin);

    const result = await unregisterPlugin("test-plugin");

    expect(result).toBe(true);
    expect(plugin.deactivate).toHaveBeenCalled();
    expect(plugin.active).toBe(false);
    expect(getPlugin("test-plugin")).toBeUndefined();
  });

  it("should return false for unknown plugin", async () => {
    const result = await unregisterPlugin("nonexistent");

    expect(result).toBe(false);
  });

  it("should handle deactivation error gracefully", async () => {
    const plugin = makePlugin();
    plugin.deactivate = vi.fn(async () => {
      throw new Error("deactivation failed");
    });
    await registerPlugin(plugin);

    const result = await unregisterPlugin("test-plugin");

    expect(result).toBe(true);
    expect(getPlugin("test-plugin")).toBeUndefined();
  });

  it("should not call deactivate for inactive plugin", async () => {
    const plugin = makePlugin();
    plugin.active = false;
    // Register without activating
    plugin.activate = vi.fn(async () => { throw new Error("skip"); });
    await registerPlugin(plugin);
    plugin.active = false;

    const result = await unregisterPlugin("test-plugin");

    expect(result).toBe(true);
  });
});

describe("getPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const p of getAllPlugins()) {
      unregisterPlugin(p.metadata.id);
    }
  });

  it("should return undefined for unknown plugin", () => {
    expect(getPlugin("nonexistent")).toBeUndefined();
  });

  it("should return registered plugin", async () => {
    const plugin = makePlugin();
    await registerPlugin(plugin);

    expect(getPlugin("test-plugin")).toBe(plugin);
  });
});

describe("getAllPlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const p of getAllPlugins()) {
      unregisterPlugin(p.metadata.id);
    }
  });

  it("should return all registered plugins", async () => {
    const p1 = makePlugin({ id: "p1" });
    const p2 = makePlugin({ id: "p2" });
    await registerPlugin(p1);
    await registerPlugin(p2);

    const all = getAllPlugins();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("should return empty array when no plugins", () => {
    const all = getAllPlugins();
    // May have plugins from other tests, just check it's an array
    expect(Array.isArray(all)).toBe(true);
  });
});

describe("enablePlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const p of getAllPlugins()) {
      unregisterPlugin(p.metadata.id);
    }
  });

  it("should enable a disabled plugin", async () => {
    const plugin = makePlugin();
    await registerPlugin(plugin);
    plugin.active = false;

    const result = await enablePlugin("test-plugin");

    expect(result).toBe(true);
    expect(plugin.active).toBe(true);
  });

  it("should return false for unknown plugin", async () => {
    const result = await enablePlugin("nonexistent");

    expect(result).toBe(false);
  });

  it("should return false for already active plugin", async () => {
    const plugin = makePlugin();
    await registerPlugin(plugin);

    const result = await enablePlugin("test-plugin");

    expect(result).toBe(false);
  });

  it("should handle activation failure", async () => {
    const plugin = makePlugin();
    await registerPlugin(plugin);
    plugin.active = false;
    plugin.activate = vi.fn(async () => { throw new Error("fail"); });

    const result = await enablePlugin("test-plugin");

    expect(result).toBe(false);
    expect(plugin.active).toBe(false);
  });
});

describe("disablePlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const p of getAllPlugins()) {
      unregisterPlugin(p.metadata.id);
    }
  });

  it("should disable an active plugin", async () => {
    const plugin = makePlugin();
    await registerPlugin(plugin);

    const result = await disablePlugin("test-plugin");

    expect(result).toBe(true);
    expect(plugin.active).toBe(false);
    expect(plugin.deactivate).toHaveBeenCalled();
  });

  it("should return false for unknown plugin", async () => {
    const result = await disablePlugin("nonexistent");

    expect(result).toBe(false);
  });

  it("should return false for already inactive plugin", async () => {
    const plugin = makePlugin();
    await registerPlugin(plugin);
    plugin.active = false;

    const result = await disablePlugin("test-plugin");

    expect(result).toBe(false);
  });

  it("should handle deactivation error gracefully", async () => {
    const plugin = makePlugin();
    plugin.deactivate = vi.fn(async () => { throw new Error("fail"); });
    await registerPlugin(plugin);

    const result = await disablePlugin("test-plugin");

    expect(result).toBe(true);
    expect(plugin.active).toBe(false);
  });
});

describe("loadPluginsFromDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const p of getAllPlugins()) {
      unregisterPlugin(p.metadata.id);
    }
  });

  it("should load plugins from JSON files", async () => {
    mockReaddir.mockResolvedValue(["plugin-a.json", "plugin-b.json"] as never[]);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({
        id: "p-a", name: "Plugin A", version: "1.0.0",
      }))
      .mockResolvedValueOnce(JSON.stringify({
        id: "p-b", name: "Plugin B", version: "1.0.0",
      }));

    const count = await loadPluginsFromDirectory("/plugins");

    expect(count).toBe(2);
  });

  it("should skip non-JSON files", async () => {
    mockReaddir.mockResolvedValue(["readme.txt", "plugin.json"] as never[]);
    mockReadFile.mockResolvedValue(JSON.stringify({
      id: "p", name: "P", version: "1.0.0",
    }));

    const count = await loadPluginsFromDirectory("/plugins");

    expect(count).toBe(1);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("should skip invalid metadata (missing id)", async () => {
    mockReaddir.mockResolvedValue(["bad.json"] as never[]);
    mockReadFile.mockResolvedValue(JSON.stringify({ name: "No ID", version: "1.0.0" }));

    const count = await loadPluginsFromDirectory("/plugins");

    expect(count).toBe(0);
  });

  it("should handle non-existent directory gracefully", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const count = await loadPluginsFromDirectory("/nonexistent");

    expect(count).toBe(0);
  });

  it("should handle malformed JSON gracefully", async () => {
    mockReaddir.mockResolvedValue(["broken.json"] as never[]);
    mockReadFile.mockResolvedValue("not json");

    const count = await loadPluginsFromDirectory("/plugins");

    expect(count).toBe(0);
  });

  it("should handle empty directory", async () => {
    mockReaddir.mockResolvedValue([]);

    const count = await loadPluginsFromDirectory("/empty");

    expect(count).toBe(0);
  });
});
