import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("./env.js", () => ({
  env: {
    STORAGE_MODE: "local",
    DATABASE_URL: "",
  },
}));

import { readFileSync, existsSync, statSync } from "fs";
import { configManager, invalidateConfigCache } from "./config-manager.js";

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedStatSync = vi.mocked(statSync);

const SAMPLE_CONFIG = {
  version: 1,
  activeProvider: "mimo",
  activeModel: "mimo-v2.5-pro",
  providers: [],
  routingRules: [],
  defaults: { temperature: 0.7, maxTokens: 4096, maxSteps: 20, streamTimeout: 120_000, turnTimeout: 180_000 },
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateConfigCache();

  mockedExistsSync.mockReturnValue(true);
  mockedReadFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
  mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as any);
});

describe("ConfigManager cache", () => {
  it("should return config from disk on first call", () => {
    const config = configManager.getConfig();
    expect(config.activeProvider).toBe("mimo");
    expect(mockedReadFileSync).toHaveBeenCalledTimes(1);
  });

  it("should return cached config on second call (same mtime)", () => {
    configManager.getConfig();
    const config2 = configManager.getConfig();
    expect(config2.activeProvider).toBe("mimo");
    // readFileSync should only be called once (cached)
    expect(mockedReadFileSync).toHaveBeenCalledTimes(1);
  });

  it("should invalidate cache when file mtime changes", () => {
    configManager.getConfig();
    expect(mockedReadFileSync).toHaveBeenCalledTimes(1);

    // Simulate file change
    mockedStatSync.mockReturnValue({ mtimeMs: 2000 } as any);
    const updatedConfig = { ...SAMPLE_CONFIG, activeProvider: "groq" };
    mockedReadFileSync.mockReturnValue(JSON.stringify(updatedConfig));

    const config2 = configManager.getConfig();
    expect(config2.activeProvider).toBe("groq");
    expect(mockedReadFileSync).toHaveBeenCalledTimes(2);
  });

  it("should invalidate cache on updateConfig", () => {
    configManager.getConfig();
    expect(mockedReadFileSync).toHaveBeenCalledTimes(1);

    // Update triggers invalidation
    configManager.updateConfig({ activeProvider: "groq" });

    // Next read should hit disk again
    mockedReadFileSync.mockReturnValue(JSON.stringify({ ...SAMPLE_CONFIG, activeProvider: "groq" }));
    configManager.getConfig();
    expect(mockedReadFileSync).toHaveBeenCalledTimes(2);
  });

  it("should export invalidateConfigCache for manual invalidation", () => {
    configManager.getConfig();
    expect(mockedReadFileSync).toHaveBeenCalledTimes(1);

    invalidateConfigCache();

    configManager.getConfig();
    expect(mockedReadFileSync).toHaveBeenCalledTimes(2);
  });
});
