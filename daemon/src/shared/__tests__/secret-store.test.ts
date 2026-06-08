import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SecretStore } from "../secret-store.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "secret-store-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("SecretStore", () => {
  it("stores and retrieves a secret", () => {
    const store = new SecretStore(tempDir);
    store.set("myKey", "myValue");

    expect(store.get("myKey")).toBe("myValue");
  });

  it("returns undefined for unknown keys", () => {
    const store = new SecretStore(tempDir);

    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("overwrites an existing secret", () => {
    const store = new SecretStore(tempDir);
    store.set("key", "value1");
    store.set("key", "value2");

    expect(store.get("key")).toBe("value2");
  });

  it("deletes a secret", () => {
    const store = new SecretStore(tempDir);
    store.set("key", "value");
    store.delete("key");

    expect(store.get("key")).toBeUndefined();
  });

  it("delete is a no-op for nonexistent keys", () => {
    const store = new SecretStore(tempDir);

    // Should not throw
    store.delete("nonexistent");
    expect(store.list()).toEqual([]);
  });

  it("lists all secret keys", () => {
    const store = new SecretStore(tempDir);
    store.set("alpha", "1");
    store.set("beta", "2");
    store.set("gamma", "3");

    const keys = store.list();
    expect(keys.sort()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("lists only keys, not values", () => {
    const store = new SecretStore(tempDir);
    store.set("apiKey", "sk-secret123");

    const keys = store.list();
    expect(keys).toEqual(["apiKey"]);
    // Verify no secret values appear
    expect(JSON.stringify(keys)).not.toContain("sk-secret");
  });

  it("returns empty list for empty store", () => {
    const store = new SecretStore(tempDir);

    expect(store.list()).toEqual([]);
  });

  it("persists secrets to disk as JSON", () => {
    const store = new SecretStore(tempDir);
    store.set("key1", "value1");
    store.set("key2", "value2");

    const filePath = join(tempDir, "secrets.json");
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({ key1: "value1", key2: "value2" });
  });

  it("persists across different SecretStore instances (same file)", () => {
    const store1 = new SecretStore(tempDir);
    store1.set("persistent", "secret-value");

    // Create a new instance pointing to the same directory
    const store2 = new SecretStore(tempDir);
    expect(store2.get("persistent")).toBe("secret-value");
  });

  it("creates parent directory if it does not exist", () => {
    const nestedDir = join(tempDir, "nested", "dir");
    const store = new SecretStore(nestedDir);
    store.set("key", "value");

    expect(existsSync(join(nestedDir, "secrets.json"))).toBe(true);
    expect(store.get("key")).toBe("value");
  });

  it("handles multiple independent secrets", () => {
    const store = new SecretStore(tempDir);
    store.set("openai-key", "sk-oai123");
    store.set("anthropic-key", "sk-ant456");
    store.set("github-token", "ghp_789");

    expect(store.get("openai-key")).toBe("sk-oai123");
    expect(store.get("anthropic-key")).toBe("sk-ant456");
    expect(store.get("github-token")).toBe("ghp_789");
    expect(store.list()).toHaveLength(3);
  });

  it("resetCache forces re-read from disk", () => {
    const store = new SecretStore(tempDir);
    store.set("key", "value1");

    // Modify directly via a second instance
    const store2 = new SecretStore(tempDir);
    store2.set("key", "value2");

    // Without resetCache, first store may still see cached value
    store.resetCache();
    expect(store.get("key")).toBe("value2");
  });

  it("gracefully handles corrupted JSON file", () => {
    // Write invalid JSON
    const fs = require("fs");
    fs.writeFileSync(join(tempDir, "secrets.json"), "{invalid json!!!");

    const store = new SecretStore(tempDir);

    // Should not throw, should start fresh
    expect(store.get("anything")).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it("gracefully handles unreadable file", () => {
    // Write a file then make it a directory (will cause read to fail)
    const fs = require("fs");
    const filePath = join(tempDir, "secrets.json");
    fs.mkdirSync(filePath);

    const store = new SecretStore(tempDir);

    // Should not throw
    expect(store.get("anything")).toBeUndefined();
  });
});
