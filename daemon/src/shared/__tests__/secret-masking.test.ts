import { describe, it, expect } from "vitest";
import {
  maskSecret,
  maskObjectSecrets,
  SENSITIVE_KEY_PATTERNS,
} from "../secret-masking.js";

// ── maskSecret ──────────────────────────────────────────────────────────

describe("maskSecret", () => {
  it("fully masks strings of 8 characters or fewer", () => {
    expect(maskSecret("short")).toBe("*****");
    expect(maskSecret("12345678")).toBe("********");
    expect(maskSecret("abc")).toBe("***");
  });

  it("shows first 4 and last 4 for strings longer than 8 characters", () => {
    // "sk-1234567890abcdef" is 19 chars: prefix "sk-1" + 11 asterisks + suffix "cdef"
    expect(maskSecret("sk-1234567890abcdef")).toBe("sk-1***********cdef");
    // "abcdefghij" is 10 chars: prefix "abcd" + 2 asterisks + suffix "ghij"
    expect(maskSecret("abcdefghij")).toBe("abcd**ghij");
  });

  it("handles exactly 9 characters", () => {
    expect(maskSecret("123456789")).toBe("1234*6789");
  });

  it("handles very long strings", () => {
    const long = "a".repeat(100);
    const masked = maskSecret(long);
    expect(masked).toBe("aaaa" + "*".repeat(92) + "aaaa");
    expect(masked.length).toBe(100);
  });

  it("returns empty string for empty input", () => {
    expect(maskSecret("")).toBe("");
  });
});

// ── SENSITIVE_KEY_PATTERNS ──────────────────────────────────────────────

describe("SENSITIVE_KEY_PATTERNS", () => {
  it("matches common sensitive key names", () => {
    const sensitiveKeys = [
      "apiKey",
      "api_key",
      "token",
      "secret",
      "password",
      "authorization",
      "bearer",
      "API_KEY",
      "SecretToken",
      "auth_token",
    ];

    for (const key of sensitiveKeys) {
      const isMatch = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
      expect(isMatch, `Expected "${key}" to match a sensitive pattern`).toBe(
        true,
      );
    }
  });

  it("does not match non-sensitive key names", () => {
    const safeKeys = ["name", "id", "title", "description", "count", "url"];

    for (const key of safeKeys) {
      const isMatch = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
      expect(isMatch, `Expected "${key}" to NOT match`).toBe(false);
    }
  });
});

// ── maskObjectSecrets ───────────────────────────────────────────────────

describe("maskObjectSecrets", () => {
  it("masks values of sensitive keys", () => {
    const input = {
      apiKey: "sk-1234567890abcdef",
      token: "bearer-xyz123",
    };
    const result = maskObjectSecrets(input);

    // "sk-1234567890abcdef" is 19 chars: "sk-1" + 11 asterisks + "cdef"
    expect(result.apiKey).toBe("sk-1***********cdef");
    // "bearer-xyz123" is 13 chars: "bear" + 5 asterisks + "z123"
    expect(result.token).toBe("bear*****z123");
  });

  it("leaves non-sensitive keys unchanged", () => {
    const input = {
      name: "test-repo",
      count: 42,
      apiKey: "sk-abcdef",
    };
    const result = maskObjectSecrets(input);

    expect(result.name).toBe("test-repo");
    expect(result.count).toBe(42);
    expect(result.apiKey).toBe("sk-a*cdef");
  });

  it("recursively masks nested objects", () => {
    const input = {
      config: {
        provider: "openai",
        apiKey: "sk-supersecret12345",
        settings: {
          token: "tok-abcdef123456",
          name: "default",
        },
      },
    };
    const result = maskObjectSecrets(input);

    expect(result.config).toBeDefined();
    const config = result.config as Record<string, unknown>;
    expect(config.provider).toBe("openai");
    // "sk-supersecret12345" is 19 chars: "sk-s" + 11 asterisks + "2345"
    expect(config.apiKey).toBe("sk-s***********2345");

    const settings = config.settings as Record<string, unknown>;
    // "tok-abcdef123456" is 16 chars: "tok-" + 8 asterisks + "3456"
    expect(settings.token).toBe("tok-********3456");
    expect(settings.name).toBe("default");
  });

  it("masks arrays containing sensitive strings", () => {
    const input = {
      tokens: ["tok-aaaa1111", "tok-bbbb2222"],
      tags: ["production", "api"],
    };
    const result = maskObjectSecrets(input);

    expect(result.tokens).toEqual(["tok-****1111", "tok-****2222"]);
    expect(result.tags).toEqual(["production", "api"]);
  });

  it("masks arrays of objects with sensitive keys", () => {
    const input = {
      providers: [
        { name: "openai", apiKey: "sk-aaa111" },
        { name: "anthropic", apiKey: "sk-bbb222" },
      ],
    };
    const result = maskObjectSecrets(input);
    const providers = result.providers as Array<Record<string, unknown>>;

    expect(providers[0].name).toBe("openai");
    expect(providers[0].apiKey).toBe("sk-a*a111");
    expect(providers[1].name).toBe("anthropic");
    expect(providers[1].apiKey).toBe("sk-b*b222");
  });

  it("returns the same value for null/undefined fields", () => {
    const input = {
      name: "test",
      empty: null,
      missing: undefined,
    };
    const result = maskObjectSecrets(input);

    expect(result.name).toBe("test");
    expect(result.empty).toBeNull();
    expect(result.missing).toBeUndefined();
  });

  it("does not mutate the original object", () => {
    const input = {
      apiKey: "sk-original1234",
      name: "test",
    };
    const originalApiKey = input.apiKey;
    maskObjectSecrets(input);

    expect(input.apiKey).toBe(originalApiKey);
  });

  it("masks sensitive keys with short values fully", () => {
    const input = {
      password: "short",
    };
    const result = maskObjectSecrets(input);

    expect(result.password).toBe("*****");
  });

  it("handles empty objects", () => {
    const result = maskObjectSecrets({});
    expect(result).toEqual({});
  });

  it("masks Bearer tokens in authorization header", () => {
    const input = {
      headers: {
        authorization: "Bearer sk-proj-1234567890abcdef",
        "content-type": "application/json",
      },
    };
    const result = maskObjectSecrets(input);
    const headers = result.headers as Record<string, unknown>;

    // "Bearer sk-proj-1234567890abcdef" is 31 chars: "Bear" + 23 asterisks + "cdef"
    expect(headers.authorization).toBe("Bear***********************cdef");
    expect(headers["content-type"]).toBe("application/json");
  });
});
