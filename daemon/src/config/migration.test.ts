import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    statSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("./config-manager.js", () => ({
  configManager: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    setProvider: vi.fn(),
    setCredential: vi.fn(),
    getCredentials: vi.fn(),
    setRoutingRules: vi.fn(),
    setActiveModel: vi.fn(),
  },
}));

import { existsSync, readFileSync } from "fs";
import { configManager } from "./config-manager.js";
import { runMigration } from "./migration.js";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedGetConfig = vi.mocked(configManager.getConfig);
const mockedUpdateConfig = vi.mocked(configManager.updateConfig);
const mockedSetProvider = vi.mocked(configManager.setProvider);
const mockedSetCredential = vi.mocked(configManager.setCredential);
const mockedGetCredentials = vi.mocked(configManager.getCredentials);
const mockedSetRoutingRules = vi.mocked(configManager.setRoutingRules);
const mockedSetActiveModel = vi.mocked(configManager.setActiveModel);

const ENV_KEYS_TO_SAVE = ["MIMO_API_KEY", "XIAOMI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"];
const savedEnv: Record<string, string | undefined> = {};

describe("runMigration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Save and clear env vars that migration reads
    for (const key of ENV_KEYS_TO_SAVE) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    // Default: config not yet migrated, no old config file, no legacy files
    mockedGetConfig.mockReturnValue({ migrated: false } as any);
    mockedExistsSync.mockReturnValue(false);
    mockedGetCredentials.mockReturnValue({});
  });

  afterEach(() => {
    for (const key of ENV_KEYS_TO_SAVE) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("skips migration when already marked as migrated", () => {
    mockedGetConfig.mockReturnValue({ migrated: true } as any);

    runMigration();

    expect(mockedSetProvider).not.toHaveBeenCalled();
    expect(mockedUpdateConfig).not.toHaveBeenCalled();
  });

  it("migrates providers from legacy config file", () => {
    // Use path-agnostic matching for Windows (\) and Unix (/)
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (String(p).includes("data") && String(p).includes("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: [
          { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", apiKey: "sk-test" },
        ],
      }),
    );

    runMigration();

    expect(mockedSetProvider).toHaveBeenCalledWith("openai", {
      name: "OpenAI",
      type: "openai_compatible",
      baseURL: "https://api.openai.com/v1",
      enabled: true,
    });
    expect(mockedSetCredential).toHaveBeenCalledWith("openai", "sk-test");
  });

  it("migrates providerCredentials from legacy config", () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (String(p).includes("data") && String(p).includes("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        providerCredentials: { groq: { apiKey: "gk-123" } },
      }),
    );

    runMigration();

    expect(mockedSetCredential).toHaveBeenCalledWith("groq", "gk-123");
  });

  it("migrates routing rules from legacy config", () => {
    const rules = [{ taskType: "fast", modelId: "groq-llama" }];
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (String(p).includes("data") && String(p).includes("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ routingRules: rules }),
    );

    runMigration();

    expect(mockedSetRoutingRules).toHaveBeenCalledWith(rules);
  });

  it("migrates activeModel from legacy config", () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (String(p).includes("data") && String(p).includes("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ activeModelId: "groq-llama" }),
    );

    runMigration();

    expect(mockedSetActiveModel).toHaveBeenCalledWith("groq-llama");
  });

  it("marks config as migrated when changes were made", () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (String(p).includes("data") && String(p).includes("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ activeModelId: "test-model" }),
    );

    runMigration();

    expect(mockedUpdateConfig).toHaveBeenCalledWith({ migrated: true });
  });

  it("does not mark as migrated when no legacy data found", () => {
    mockedExistsSync.mockReturnValue(false);

    runMigration();

    expect(mockedUpdateConfig).not.toHaveBeenCalled();
  });

  it("ignores JSON parse errors from legacy config", () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (String(p).includes("data") && String(p).includes("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("not-json");

    runMigration();

    expect(mockedSetProvider).not.toHaveBeenCalled();
  });

  it("migrates env API keys when not already present in credentials", () => {
    process.env.MIMO_API_KEY = "mimo-key-123";
    mockedGetCredentials.mockReturnValue({});

    runMigration();

    expect(mockedSetCredential).toHaveBeenCalledWith("mimo", "mimo-key-123");
  });

  it("does not overwrite existing credentials for env keys", () => {
    process.env.GROQ_API_KEY = "new-groq-key";
    mockedGetCredentials.mockReturnValue({ groq: "existing-key" });

    runMigration();

    expect(mockedSetCredential).not.toHaveBeenCalledWith("groq", "new-groq-key");
  });

  it("handles legacy providers with default enabled=true", () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (String(p).includes("data") && String(p).includes("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: [
          { id: "test", name: "Test", baseURL: "http://localhost" },
        ],
      }),
    );

    runMigration();

    expect(mockedSetProvider).toHaveBeenCalledWith("test", expect.objectContaining({
      enabled: true,
    }));
  });
});
