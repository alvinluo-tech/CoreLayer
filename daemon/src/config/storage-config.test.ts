import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("./env.js", () => ({
  env: {
    STORAGE_MODE: "local",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    DATABASE_URL: "",
  },
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { env } from "./env.js";
import {
  getStorageMode,
  setStorageMode,
  getProviders,
  setProvider,
  removeProvider,
  setProviderCredential,
  getProviderCredentials,
  getRoutingRules,
  setRoutingRules,
  getActiveModelId,
  setActiveModelId,
  isCloudConfigured,
  isPostgresConfigured,
  getDbConfig,
  setDbConfig,
} from "./storage-config.js";

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedEnv = vi.mocked(env);

function mockConfigFile(data: Record<string, unknown> | null) {
  if (data === null) {
    mockedExistsSync.mockReturnValue(false);
  } else {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(data));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset env defaults
  mockedEnv.STORAGE_MODE = "local";
  mockedEnv.SUPABASE_URL = "";
  mockedEnv.SUPABASE_SERVICE_ROLE_KEY = "";
  mockedEnv.DATABASE_URL = "";
});

describe("getStorageMode", () => {
  it('returns "local" when config file does not exist', () => {
    mockConfigFile(null);
    expect(getStorageMode()).toBe("local");
  });

  it('returns "cloud" when config file has storageMode="cloud"', () => {
    mockConfigFile({ storageMode: "cloud" });
    expect(getStorageMode()).toBe("cloud");
  });

  it('returns "postgres" when config file has storageMode="postgres"', () => {
    mockConfigFile({ storageMode: "postgres" });
    expect(getStorageMode()).toBe("postgres");
  });

  it('returns "local" when config file has invalid JSON', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("not-json{{{");
    expect(getStorageMode()).toBe("local");
  });

  it('returns "local" for invalid storageMode value', () => {
    mockConfigFile({ storageMode: "invalid" });
    expect(getStorageMode()).toBe("local");
  });

  it('falls back to env STORAGE_MODE="cloud" when no config file', () => {
    mockConfigFile(null);
    mockedEnv.STORAGE_MODE = "cloud";
    expect(getStorageMode()).toBe("cloud");
  });
});

describe("setStorageMode", () => {
  it("writes mode to config file", () => {
    mockConfigFile({ storageMode: "local" });
    setStorageMode("cloud");

    expect(mockedWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.storageMode).toBe("cloud");
  });

  it("creates config directory", () => {
    mockConfigFile({ storageMode: "local" });
    setStorageMode("postgres");

    expect(mockedMkdirSync).toHaveBeenCalled();
  });
});

describe("getProviders / setProvider / removeProvider", () => {
  it("returns empty array when no providers in config", () => {
    mockConfigFile({});
    expect(getProviders()).toEqual([]);
  });

  it("returns providers from config", () => {
    const providers = [{ id: "p1", name: "Provider 1", type: "openai_compatible" as const, baseURL: "http://a", enabled: true }];
    mockConfigFile({ providers });
    expect(getProviders()).toEqual(providers);
  });

  it("adds a new provider", () => {
    mockConfigFile({ providers: [] });
    setProvider("p1", { name: "New", type: "openai_compatible", baseURL: "http://b", enabled: true });

    expect(mockedWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.providers).toHaveLength(1);
    expect(written.providers[0].id).toBe("p1");
    expect(written.providers[0].name).toBe("New");
  });

  it("updates an existing provider by id", () => {
    const providers = [{ id: "p1", name: "Old", type: "openai_compatible" as const, baseURL: "http://a", enabled: true }];
    mockConfigFile({ providers });
    setProvider("p1", { name: "Updated", type: "ollama", baseURL: "http://c", enabled: false });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.providers).toHaveLength(1);
    expect(written.providers[0].name).toBe("Updated");
    expect(written.providers[0].type).toBe("ollama");
  });

  it("removes a provider by id", () => {
    const providers = [
      { id: "p1", name: "A", type: "openai_compatible" as const, baseURL: "http://a", enabled: true },
      { id: "p2", name: "B", type: "ollama" as const, baseURL: "http://b", enabled: true },
    ];
    mockConfigFile({ providers });
    removeProvider("p1");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.providers).toHaveLength(1);
    expect(written.providers[0].id).toBe("p2");
  });

  it("removeProvider is a no-op when id not found", () => {
    const providers = [{ id: "p1", name: "A", type: "openai_compatible" as const, baseURL: "http://a", enabled: true }];
    mockConfigFile({ providers });
    removeProvider("nonexistent");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.providers).toHaveLength(1);
  });
});

describe("setProviderCredential", () => {
  it("sets a new credential", () => {
    mockConfigFile({});
    setProviderCredential("openai", { apiKey: "sk-123" });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.providerCredentials.openai.apiKey).toBe("sk-123");
  });

  it("merges with existing credential, preserving unset fields", () => {
    mockConfigFile({ providerCredentials: { openai: { apiKey: "sk-old", baseURL: "http://old" } } });
    setProviderCredential("openai", { apiKey: "sk-new" });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.providerCredentials.openai.apiKey).toBe("sk-new");
    expect(written.providerCredentials.openai.baseURL).toBe("http://old");
  });

  it("preserves existing apiKey when only baseURL is updated", () => {
    mockConfigFile({ providerCredentials: { openai: { apiKey: "sk-keep" } } });
    setProviderCredential("openai", { baseURL: "http://new" });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.providerCredentials.openai.apiKey).toBe("sk-keep");
    expect(written.providerCredentials.openai.baseURL).toBe("http://new");
  });
});

describe("getProviderCredentials", () => {
  it("returns empty object when no credentials", () => {
    mockConfigFile({});
    expect(getProviderCredentials()).toEqual({});
  });
});

describe("getRoutingRules / setRoutingRules", () => {
  it("returns undefined when no rules in config", () => {
    mockConfigFile({});
    expect(getRoutingRules()).toBeUndefined();
  });

  it("returns rules from config", () => {
    const rules = [{ taskType: "chat", modelId: "m1" }];
    mockConfigFile({ routingRules: rules });
    expect(getRoutingRules()).toEqual(rules);
  });

  it("writes rules to config", () => {
    mockConfigFile({});
    const rules = [{ taskType: "fast", modelId: "m2", conditions: { expectedAnswerLength: "short" } }];
    setRoutingRules(rules);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.routingRules).toEqual(rules);
  });
});

describe("getActiveModelId / setActiveModelId", () => {
  it("returns undefined when no active model", () => {
    mockConfigFile({});
    expect(getActiveModelId()).toBeUndefined();
  });

  it("returns active model id from config", () => {
    mockConfigFile({ activeModelId: "mimo-2.5-pro" });
    expect(getActiveModelId()).toBe("mimo-2.5-pro");
  });

  it("writes active model id to config", () => {
    mockConfigFile({});
    setActiveModelId("groq-llama");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.activeModelId).toBe("groq-llama");
  });
});

describe("isCloudConfigured", () => {
  it("returns false when env vars are empty and no dbConfig", () => {
    mockConfigFile({});
    expect(isCloudConfigured()).toBe(false);
  });

  it("returns true when env SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set", () => {
    mockConfigFile({});
    mockedEnv.SUPABASE_URL = "https://example.supabase.co";
    mockedEnv.SUPABASE_SERVICE_ROLE_KEY = "key";
    expect(isCloudConfigured()).toBe(true);
  });

  it("returns true when dbConfig has supabase credentials", () => {
    mockConfigFile({ dbConfig: { supabaseUrl: "https://x.supabase.co", supabaseServiceKey: "key" } });
    expect(isCloudConfigured()).toBe(true);
  });

  it("returns false when only one env var is set", () => {
    mockConfigFile({});
    mockedEnv.SUPABASE_URL = "https://example.supabase.co";
    expect(isCloudConfigured()).toBe(false);
  });
});

describe("isPostgresConfigured", () => {
  it("returns false when no DATABASE_URL and no dbConfig", () => {
    mockConfigFile({});
    expect(isPostgresConfigured()).toBe(false);
  });

  it("returns true when env DATABASE_URL is set", () => {
    mockConfigFile({});
    mockedEnv.DATABASE_URL = "postgres://localhost/db";
    expect(isPostgresConfigured()).toBe(true);
  });

  it("returns true when dbConfig has postgresUrl", () => {
    mockConfigFile({ dbConfig: { postgresUrl: "postgres://localhost/db" } });
    expect(isPostgresConfigured()).toBe(true);
  });
});

describe("getDbConfig / setDbConfig", () => {
  it("returns empty object when no dbConfig", () => {
    mockConfigFile({});
    expect(getDbConfig()).toEqual({});
  });

  it("returns dbConfig from file", () => {
    const dbConfig = { supabaseUrl: "https://x.co", supabaseServiceKey: "k" };
    mockConfigFile({ dbConfig });
    expect(getDbConfig()).toEqual(dbConfig);
  });

  it("writes dbConfig to file", () => {
    mockConfigFile({});
    const dbConfig = { postgresUrl: "postgres://localhost/db" };
    setDbConfig(dbConfig);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.dbConfig).toEqual(dbConfig);
  });
});

describe("lenient parsing", () => {
  it("returns valid fields from partial JSON", () => {
    mockConfigFile({ providers: [{ id: "p1", name: "P1", type: "ollama", baseURL: "http://a", enabled: true }] });
    expect(getProviders()).toEqual([{ id: "p1", name: "P1", type: "ollama", baseURL: "http://a", enabled: true }]);
    expect(getStorageMode()).toBe("local"); // missing storageMode defaults to local
  });

  it("returns valid activeModelId even when other fields are missing", () => {
    mockConfigFile({ activeModelId: "custom-model" });
    expect(getActiveModelId()).toBe("custom-model");
    expect(getStorageMode()).toBe("local");
  });

  it("ignores invalid types for known fields", () => {
    mockConfigFile({ storageMode: "cloud", providers: "not-an-array", activeModelId: 123 });
    expect(getStorageMode()).toBe("cloud");
    expect(getProviders()).toEqual([]);
    expect(getActiveModelId()).toBeUndefined();
  });
});
