import { describe, it, expect } from "vitest";
import { inferProviderFromUrl } from "./provider-resolver.js";

describe("inferProviderFromUrl", () => {
  it("should detect groq from api.groq.com", () => {
    expect(inferProviderFromUrl("https://api.groq.com/openai/v1")).toBe("groq");
  });

  it("should detect openrouter from openrouter.ai", () => {
    expect(inferProviderFromUrl("https://openrouter.ai/api/v1")).toBe("openrouter");
  });

  it("should detect anthropic from api.anthropic.com", () => {
    expect(inferProviderFromUrl("https://api.anthropic.com/v1")).toBe("anthropic");
  });

  it("should detect openai from api.openai.com", () => {
    expect(inferProviderFromUrl("https://api.openai.com/v1")).toBe("openai");
  });

  it("should detect gemini from generativelanguage.googleapis.com", () => {
    expect(inferProviderFromUrl("https://generativelanguage.googleapis.com/v1")).toBe("gemini");
  });

  it("should return null for unknown hostname", () => {
    expect(inferProviderFromUrl("https://custom-api.example.com/v1")).toBeNull();
  });

  it("should return null for invalid URL", () => {
    expect(inferProviderFromUrl("not-a-url")).toBeNull();
  });
});
