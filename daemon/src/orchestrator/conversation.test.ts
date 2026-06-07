import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    AI_PROVIDER: "mimo",
    MIMO_API_URL: "https://api.test.com/v1",
  },
}));

const mockCredentials: Record<string, string> = {};

vi.mock("../config/config-manager.js", () => ({
  configManager: {
    getCredentials: vi.fn(() => mockCredentials),
    getConfig: vi.fn(() => ({ providers: [] })),
    getProviderConfig: vi.fn(() => ({ baseURL: "", apiKey: "" })),
  },
}));

// Mock heavy dependencies so the module can be imported without side effects
vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  stepCountIs: vi.fn(),
}));
vi.mock("./prompt-builder.js", () => ({
  buildSystemPrompt: vi.fn(() => "system prompt"),
}));
vi.mock("../gateways/ai-provider/provider.js", () => ({
  getModel: vi.fn(() => ({})),
}));
vi.mock("../tools/registry.js", () => ({
  getAllTools: vi.fn(() => []),
  getTool: vi.fn(() => null),
}));
vi.mock("../persistence/factory.js", () => ({
  getRepositories: vi.fn(() => ({
    conversations: {
      addMessage: vi.fn(),
      getById: vi.fn(),
      getMessages: vi.fn(() => []),
      update: vi.fn(),
    },
  })),
}));
vi.mock("../utils/errors.js", () => ({
  classifyError: vi.fn(() => ({ code: "UNKNOWN", status: 500 })),
  extractErrorMessage: vi.fn(() => "mock error"),
  logError: vi.fn(),
}));

import { isAiConfigured, generateTitleFromMessage } from "./conversation.js";

// ---- isAiConfigured ----

describe("isAiConfigured", () => {
  beforeEach(() => {
    // Reset credentials — no keys by default
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
  });

  it("returns true when a credential is set", () => {
    mockCredentials["mimo"] = "test-key";
    expect(isAiConfigured()).toBe(true);
  });

  it("returns false when no credentials exist", () => {
    expect(isAiConfigured()).toBe(false);
  });

  it("returns false when all credentials are empty strings", () => {
    mockCredentials["mimo"] = "";
    mockCredentials["groq"] = "";
    expect(isAiConfigured()).toBe(false);
  });

  it("returns true when only groq key is set", () => {
    mockCredentials["groq"] = "groq-key";
    expect(isAiConfigured()).toBe(true);
  });

  it("returns true when only openrouter key is set", () => {
    mockCredentials["openrouter"] = "openrouter-key";
    expect(isAiConfigured()).toBe(true);
  });
});

// ---- generateTitleFromMessage ----

describe("generateTitleFromMessage", () => {
  it("returns the message when 30 characters or fewer", () => {
    const msg = "a".repeat(30);
    expect(generateTitleFromMessage(msg)).toBe(msg);
  });

  it("truncates to 30 characters plus '...' when longer than 30", () => {
    const msg = "a".repeat(31);
    expect(generateTitleFromMessage(msg)).toBe("a".repeat(30) + "...");
  });

  it("replaces newlines with spaces before truncating", () => {
    const msg = "first line\nsecond line\nthird";
    expect(generateTitleFromMessage(msg)).toBe("first line second line third");
  });

  it("truncates after newline replacement if still too long", () => {
    const msg = "first line\nsecond line\nthird line extra characters here";
    const result = generateTitleFromMessage(msg);
    expect(result.length).toBe(33);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("returns empty string for empty input", () => {
    expect(generateTitleFromMessage("")).toBe("");
  });

  it("trims leading and trailing whitespace", () => {
    expect(generateTitleFromMessage("  hello  ")).toBe("hello");
  });
});
