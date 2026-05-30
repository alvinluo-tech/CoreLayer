import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    AI_PROVIDER: "mimo",
    MIMO_API_KEY: "test-mimo-key",
    MIMO_API_URL: "https://api.test.com/v1",
    GROQ_API_KEY: "",
    OPENROUTER_API_KEY: "",
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
vi.mock("../ai/provider.js", () => ({
  getModel: vi.fn(() => ({})),
}));
vi.mock("../tools/registry.js", () => ({
  getAllTools: vi.fn(() => []),
  getTool: vi.fn(() => null),
}));
vi.mock("../db/factory.js", () => ({
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
import { env } from "../config/env.js";

// ---- isAiConfigured ----

describe("isAiConfigured", () => {
  beforeEach(() => {
    // Reset to a valid default configuration
    vi.mocked(env).AI_PROVIDER = "mimo";
    vi.mocked(env).MIMO_API_KEY = "test-mimo-key";
    vi.mocked(env).GROQ_API_KEY = "";
    vi.mocked(env).OPENROUTER_API_KEY = "";
    // Also clear any process.env keys that the source reads
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns true when AI_PROVIDER and MIMO_API_KEY are set", () => {
    expect(isAiConfigured()).toBe(true);
  });

  it("returns false when AI_PROVIDER is set but no API keys exist", () => {
    vi.mocked(env).MIMO_API_KEY = "";
    vi.mocked(env).GROQ_API_KEY = "";
    vi.mocked(env).OPENROUTER_API_KEY = "";

    expect(isAiConfigured()).toBe(false);
  });

  it("returns false when no AI_PROVIDER is set even if a key exists", () => {
    vi.mocked(env).AI_PROVIDER = "";
    vi.mocked(env).MIMO_API_KEY = "some-key";

    expect(isAiConfigured()).toBe(false);
  });

  it("returns true when AI_PROVIDER and GROQ_API_KEY are set", () => {
    vi.mocked(env).MIMO_API_KEY = "";
    vi.mocked(env).GROQ_API_KEY = "groq-key";

    expect(isAiConfigured()).toBe(true);
  });

  it("returns true when AI_PROVIDER and OPENROUTER_API_KEY are set", () => {
    vi.mocked(env).MIMO_API_KEY = "";
    vi.mocked(env).OPENROUTER_API_KEY = "openrouter-key";

    expect(isAiConfigured()).toBe(true);
  });

  it("returns true when AI_PROVIDER and OPENAI_API_KEY env var are set", () => {
    vi.mocked(env).MIMO_API_KEY = "";
    vi.mocked(env).GROQ_API_KEY = "";
    vi.mocked(env).OPENROUTER_API_KEY = "";
    process.env.OPENAI_API_KEY = "openai-key";

    expect(isAiConfigured()).toBe(true);
  });

  it("returns true when AI_PROVIDER and ANTHROPIC_API_KEY env var are set", () => {
    vi.mocked(env).MIMO_API_KEY = "";
    vi.mocked(env).GROQ_API_KEY = "";
    vi.mocked(env).OPENROUTER_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "anthropic-key";

    expect(isAiConfigured()).toBe(true);
  });
});

// ---- generateTitleFromMessage ----

describe("generateTitleFromMessage", () => {
  it("returns the message unchanged when shorter than 30 characters", () => {
    expect(generateTitleFromMessage("hello world")).toBe("hello world");
  });

  it("returns the message unchanged when exactly 30 characters", () => {
    const msg = "a".repeat(30);
    expect(generateTitleFromMessage(msg)).toBe(msg);
  });

  it("truncates to 30 characters plus '...' when longer than 30", () => {
    const msg = "a".repeat(31);
    expect(generateTitleFromMessage(msg)).toBe("a".repeat(30) + "...");
  });

  it("replaces newlines with spaces before truncating", () => {
    const msg = "first line\nsecond line\nthird";
    // After replace: "first line second line third" (28 chars, under 30)
    expect(generateTitleFromMessage(msg)).toBe("first line second line third");
  });

  it("truncates after newline replacement if still too long", () => {
    const msg = "first line\nsecond line\nthird line extra characters here";
    const result = generateTitleFromMessage(msg);
    expect(result.length).toBe(33); // 30 + "..."
    expect(result).toMatch(/\.\.\.$/);
  });

  it("returns empty string for empty input", () => {
    expect(generateTitleFromMessage("")).toBe("");
  });

  it("trims leading and trailing whitespace", () => {
    expect(generateTitleFromMessage("  hello  ")).toBe("hello");
  });
});
