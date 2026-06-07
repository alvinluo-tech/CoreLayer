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
    DATABASE_URL: "",
  },
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { env } from "./env.js";
import {
  getStorageMode,
  setStorageMode,
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
  mockedEnv.STORAGE_MODE = "local";
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

describe("isCloudConfigured", () => {
  it("returns false when no dbConfig", () => {
    mockConfigFile({});
    expect(isCloudConfigured()).toBe(false);
  });

  it("returns true when dbConfig has supabase credentials", () => {
    mockConfigFile({ dbConfig: { supabaseUrl: "https://x.supabase.co", supabaseServiceKey: "key" } });
    expect(isCloudConfigured()).toBe(true);
  });

  it("returns false when only supabaseUrl is set in dbConfig", () => {
    mockConfigFile({ dbConfig: { supabaseUrl: "https://x.supabase.co" } });
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
