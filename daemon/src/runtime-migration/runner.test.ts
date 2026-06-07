import { describe, it, expect, beforeEach } from "vitest";
import {
  registerMigration,
  runMigrations,
  getSchemaVersion,
  setSchemaVersion,
  isProtocolCompatible,
  clearMigrations,
  RUNTIME_PROTOCOL_VERSION,
} from "./index.js";

describe("MigrationRunner", () => {
  beforeEach(() => {
    clearMigrations();
  });

  it("runs pending migrations successfully", async () => {
    let executed = false;
    registerMigration({
      id: "test-1",
      component: "daemon",
      targetVersion: 1,
      description: "Test migration",
      up: async () => { executed = true; },
    });

    const result = await runMigrations("daemon", 0);
    expect(result.status).toBe("completed");
    expect(result.applied).toContain("test-1");
    expect(result.failed).toHaveLength(0);
    expect(executed).toBe(true);
  });

  it("skips migrations at or below current version", async () => {
    let executed = false;
    registerMigration({
      id: "test-old",
      component: "daemon",
      targetVersion: 1,
      description: "Old migration",
      up: async () => { executed = true; },
    });

    const result = await runMigrations("daemon", 1);
    expect(result.status).toBe("completed");
    expect(result.applied).toHaveLength(0);
    expect(executed).toBe(false);
  });

  it("enters degraded mode on migration failure", async () => {
    registerMigration({
      id: "test-fail",
      component: "daemon",
      targetVersion: 1,
      description: "Failing migration",
      up: async () => { throw new Error("Migration failed"); },
    });

    const result = await runMigrations("daemon", 0);
    expect(result.status).toBe("degraded");
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe("test-fail");
    expect(result.failed[0].error).toBe("Migration failed");
  });

  it("runs migrations in order", async () => {
    const order: number[] = [];
    registerMigration({
      id: "test-2",
      component: "daemon",
      targetVersion: 2,
      description: "Second",
      up: async () => { order.push(2); },
    });
    registerMigration({
      id: "test-1",
      component: "daemon",
      targetVersion: 1,
      description: "First",
      up: async () => { order.push(1); },
    });

    await runMigrations("daemon", 0);
    expect(order).toEqual([1, 2]);
  });

  it("tracks schema version after migration", async () => {
    registerMigration({
      id: "test-v1",
      component: "daemon",
      targetVersion: 1,
      description: "Initial schema",
      up: async () => {},
    });

    await runMigrations("daemon", 0);
    const version = getSchemaVersion("daemon");
    expect(version).toBeDefined();
    expect(version!.version).toBe(1);
    expect(version!.description).toBe("Initial schema");
  });

  it("setSchemaVersion updates correctly", () => {
    setSchemaVersion("runtime", 5, "Test version");
    const version = getSchemaVersion("runtime");
    expect(version!.version).toBe(5);
    expect(version!.component).toBe("runtime");
  });

  it("isProtocolCompatible returns true for same version", () => {
    expect(isProtocolCompatible(1, 1)).toBe(true);
  });

  it("isProtocolCompatible returns false for different versions", () => {
    expect(isProtocolCompatible(1, 2)).toBe(false);
    expect(isProtocolCompatible(2, 1)).toBe(false);
  });

  it("RUNTIME_PROTOCOL_VERSION is defined", () => {
    expect(RUNTIME_PROTOCOL_VERSION).toBe(1);
  });
});
