import { describe, it, expect, beforeEach } from "vitest";
import { ResponseCache } from "./response-cache.js";

describe("ResponseCache", () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache();
  });

  it("should return undefined on cache miss", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("should return cached response on hit", () => {
    const hash = ResponseCache.hash("hello");
    cache.set(hash, "world");
    expect(cache.get(hash)).toBe("world");
  });

  it("should overwrite existing entry with same hash", () => {
    const hash = ResponseCache.hash("hello");
    cache.set(hash, "first");
    cache.set(hash, "second");
    expect(cache.get(hash)).toBe("second");
    expect(cache.size).toBe(1);
  });

  it("should evict oldest entry when at capacity", () => {
    // Fill to capacity
    for (let i = 0; i < 128; i++) {
      cache.set(`hash-${i}`, `response-${i}`);
    }
    expect(cache.size).toBe(128);

    // Add one more — should evict hash-0
    cache.set("hash-128", "response-128");
    expect(cache.size).toBe(128);
    expect(cache.get("hash-0")).toBeUndefined();
    expect(cache.get("hash-128")).toBe("response-128");
  });

  it("should move accessed entry to end (LRU)", () => {
    // Fill to capacity
    for (let i = 0; i < 128; i++) {
      cache.set(`hash-${i}`, `response-${i}`);
    }

    // Access hash-0 so it moves to end
    cache.get("hash-0");

    // Add new entry — should evict hash-1 (oldest untouched)
    cache.set("hash-new", "response-new");
    expect(cache.get("hash-0")).toBe("response-0"); // still present
    expect(cache.get("hash-1")).toBeUndefined(); // evicted
  });

  it("should report correct size", () => {
    expect(cache.size).toBe(0);
    cache.set("a", "1");
    expect(cache.size).toBe(1);
    cache.set("b", "2");
    expect(cache.size).toBe(2);
  });

  it("should clear all entries", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("should produce deterministic SHA-256 hashes", () => {
    const h1 = ResponseCache.hash("test input");
    const h2 = ResponseCache.hash("test input");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex length
  });

  it("should produce different hashes for different inputs", () => {
    const h1 = ResponseCache.hash("hello");
    const h2 = ResponseCache.hash("world");
    expect(h1).not.toBe(h2);
  });
});
