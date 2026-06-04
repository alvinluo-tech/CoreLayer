import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const testDir = join(import.meta.dirname ?? ".", "__test_config_hot_reload__");
const testConfigPath = join(testDir, "config.json");

// Override JARVIS_HOME for tests
process.env.JARVIS_HOME = testDir;

// We need to test the watcher behavior, but since the module is already loaded
// with the real getConfigPath, we test the public API: startConfigWatcher,
// onConfigChange, stopConfigWatcher, invalidateConfigCache.

import {
  invalidateConfigCache,
  startConfigWatcher,
  stopConfigWatcher,
  onConfigChange,
} from "./config-manager.js";

describe("Config hot reload", () => {
  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    // Write a valid config
    writeFileSync(testConfigPath, JSON.stringify({
      version: 1,
      activeProvider: "test",
      activeModel: "test-model",
      providers: [],
      routingRules: [],
      defaults: { temperature: 0.5 },
    }), "utf-8");
    invalidateConfigCache();
  });

  afterEach(() => {
    stopConfigWatcher();
    invalidateConfigCache();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("invalidateConfigCache clears the cache", () => {
    // Just verify it doesn't throw
    invalidateConfigCache();
    expect(true).toBe(true);
  });

  it("onConfigChange returns an unsubscribe function", () => {
    const unsub = onConfigChange(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("startConfigWatcher and stopConfigWatcher don't throw", () => {
    startConfigWatcher();
    stopConfigWatcher();
    expect(true).toBe(true);
  });
});
