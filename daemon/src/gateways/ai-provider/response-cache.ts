/**
 * SHA-256 hashed 128-entry LRU cache for pure-text generateText results.
 * Not suitable for streaming responses.
 */

import { createHash } from "crypto";

const MAX_ENTRIES = 128;

interface CacheEntry {
  hash: string;
  response: string;
  createdAt: number;
}

export class ResponseCache {
  private entries = new Map<string, CacheEntry>();

  /** Compute SHA-256 hash of the input string. */
  static hash(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  /** Get a cached response by hash. Returns undefined on miss. */
  get(hash: string): string | undefined {
    const entry = this.entries.get(hash);
    if (!entry) return undefined;
    // Move to end (most recently used) by re-inserting
    this.entries.delete(hash);
    this.entries.set(hash, entry);
    return entry.response;
  }

  /** Cache a response. Evicts the oldest entry if at capacity. */
  set(hash: string, response: string): void {
    // If already exists, update (move to end)
    if (this.entries.has(hash)) {
      this.entries.delete(hash);
    }
    // Evict oldest if at capacity
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(hash, { hash, response, createdAt: Date.now() });
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries.clear();
  }
}

export const responseCache = new ResponseCache();
