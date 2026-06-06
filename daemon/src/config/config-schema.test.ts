import { describe, it, expect } from "vitest";
import { configSchema, validateConfig, type JarvisConfigInput } from "./config-schema.js";

describe("configSchema", () => {
  it("accepts a valid full config", () => {
    const valid: JarvisConfigInput = {
      version: 1,
      activeProvider: "mimo",
      activeModel: "mimo-v2.5-pro",
      providers: [
        { id: "mimo", name: "MiMo", type: "openai_compatible", baseURL: "https://example.com/v1", enabled: true },
      ],
      routingRules: [{ taskType: "chat", modelId: "mimo-2.5-pro" }],
      defaults: {
        temperature: 0.7,
        maxTokens: 4096,
        maxSteps: 20,
        streamTimeout: 120_000,
        turnTimeout: 180_000,
        memoryMinScore: 0.3,
      },
      tick: {
        enabled: true,
        intervalMinutes: 30,
      },
    };
    const result = configSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts minimal config with defaults filled", () => {
    const minimal = {};
    const result = configSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.defaults.temperature).toBe(0.7);
      expect(result.data.defaults.maxSteps).toBe(20);
    }
  });

  it("rejects invalid temperature range", () => {
    const result = configSchema.safeParse({ defaults: { temperature: 5.0 } });
    expect(result.success).toBe(false);
  });

  it("rejects negative maxTokens", () => {
    const result = configSchema.safeParse({ defaults: { maxTokens: -1 } });
    expect(result.success).toBe(false);
  });

  it("rejects provider with invalid type", () => {
    const result = configSchema.safeParse({
      providers: [{ id: "x", name: "X", type: "grpc", baseURL: "http://x", enabled: true }],
    });
    expect(result.success).toBe(false);
  });
});

describe("validateConfig", () => {
  it("returns validated config with defaults for empty input", () => {
    const result = validateConfig({});
    expect(result.valid).toBe(true);
    expect(result.config!.version).toBe(1);
    expect(result.config!.defaults.temperature).toBe(0.7);
  });

  it("returns errors for invalid input", () => {
    const result = validateConfig({ defaults: { temperature: 999 } });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fills missing defaults", () => {
    const result = validateConfig({ activeProvider: "test" });
    expect(result.valid).toBe(true);
    expect(result.config!.defaults.maxSteps).toBe(20);
    expect(result.config!.defaults.streamTimeout).toBe(120_000);
  });

  it("preserves provided values over defaults", () => {
    const result = validateConfig({ defaults: { temperature: 0.3 } });
    expect(result.valid).toBe(true);
    expect(result.config!.defaults.temperature).toBe(0.3);
    expect(result.config!.defaults.maxSteps).toBe(20);
  });
});
