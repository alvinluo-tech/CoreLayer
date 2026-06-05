import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { configManager, invalidateConfigCache, onConfigChange, startConfigWatcher, stopConfigWatcher } from "./config-manager.js";

// Use a temp directory for tests
const TEST_DIR = join(tmpdir(), `jarvis-test-${Date.now()}`);
const ORIGINAL_JARVIS_HOME = process.env.JARVIS_HOME;

describe("ConfigManager", () => {
  beforeEach(() => {
    // Set JARVIS_HOME to temp directory
    process.env.JARVIS_HOME = TEST_DIR;
    invalidateConfigCache();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Restore original JARVIS_HOME
    if (ORIGINAL_JARVIS_HOME !== undefined) {
      process.env.JARVIS_HOME = ORIGINAL_JARVIS_HOME;
    } else {
      delete process.env.JARVIS_HOME;
    }
    invalidateConfigCache();
    stopConfigWatcher();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("getConfig", () => {
    it("should return default config when no file exists", () => {
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.version).toBe(1);
      expect(config.activeProvider).toBeDefined();
      expect(config.activeModel).toBeDefined();
      expect(config.providers).toBeInstanceOf(Array);
      expect(config.defaults).toBeDefined();
    });

    it("should read config from file", () => {
      const configPath = join(TEST_DIR, "config.json");
      const customConfig = {
        version: 1,
        activeProvider: "custom",
        activeModel: "custom-model",
        providers: [],
        routingRules: [],
        defaults: {
          temperature: 0.5,
          maxTokens: 2048,
          maxSteps: 10,
          streamTimeout: 60000,
          turnTimeout: 90000,
          memoryMinScore: 0.2,
        },
      };
      writeFileSync(configPath, JSON.stringify(customConfig));

      const config = configManager.getConfig();
      expect(config.activeProvider).toBe("custom");
      expect(config.activeModel).toBe("custom-model");
    });

    it("should cache config after first read", () => {
      const config1 = configManager.getConfig();
      const config2 = configManager.getConfig();
      expect(config1).toBe(config2); // Same reference due to caching
    });

    it("should invalidate cache after write", () => {
      const config1 = configManager.getConfig();
      configManager.updateConfig({ activeProvider: "new-provider" });
      const config2 = configManager.getConfig();
      expect(config1).not.toBe(config2); // Different reference after cache invalidation
      expect(config2.activeProvider).toBe("new-provider");
    });
  });

  describe("updateConfig", () => {
    it("should update config and persist to file", () => {
      configManager.updateConfig({ activeProvider: "updated" });
      const config = configManager.getConfig();
      expect(config.activeProvider).toBe("updated");

      // Verify file was written
      const configPath = join(TEST_DIR, "config.json");
      expect(existsSync(configPath)).toBe(true);
      const fileContent = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(fileContent.activeProvider).toBe("updated");
    });

    it("should merge with existing config", () => {
      configManager.updateConfig({ activeProvider: "first" });
      configManager.updateConfig({ activeModel: "second" });

      const config = configManager.getConfig();
      expect(config.activeProvider).toBe("first");
      expect(config.activeModel).toBe("second");
    });
  });

  describe("credentials", () => {
    it("should return empty object when no credentials file exists", () => {
      const creds = configManager.getCredentials();
      expect(creds).toEqual({});
    });

    it("should set and get credential", () => {
      configManager.setCredential("test-provider", "test-api-key");
      const creds = configManager.getCredentials();
      expect(creds["test-provider"]).toBe("test-api-key");
    });

    it("should remove credential", () => {
      configManager.setCredential("test-provider", "test-api-key");
      configManager.removeCredential("test-provider");
      const creds = configManager.getCredentials();
      expect(creds["test-provider"]).toBeUndefined();
    });

    it("should persist credentials to file", () => {
      configManager.setCredential("provider1", "key1");
      configManager.setCredential("provider2", "key2");

      const credsPath = join(TEST_DIR, "credentials.json");
      expect(existsSync(credsPath)).toBe(true);
      const fileContent = JSON.parse(readFileSync(credsPath, "utf-8"));
      expect(fileContent.provider1).toBe("key1");
      expect(fileContent.provider2).toBe("key2");
    });
  });

  describe("providers", () => {
    it("should get providers list", () => {
      const providers = configManager.getProviders();
      expect(providers).toBeInstanceOf(Array);
    });

    it("should set a new provider", () => {
      configManager.setProvider("new-provider", {
        name: "New Provider",
        type: "openai_compatible",
        baseURL: "https://api.example.com/v1",
        enabled: true,
      });

      const providers = configManager.getProviders();
      const found = providers.find((p) => p.id === "new-provider");
      expect(found).toBeDefined();
      expect(found?.name).toBe("New Provider");
    });

    it("should update existing provider", () => {
      // First add a provider
      configManager.setProvider("my-provider", {
        name: "Original",
        type: "openai_compatible",
        baseURL: "https://original.com",
        enabled: true,
      });

      // Update it
      configManager.setProvider("my-provider", {
        name: "Updated",
        type: "openai_compatible",
        baseURL: "https://updated.com",
        enabled: false,
      });

      const providers = configManager.getProviders();
      const found = providers.find((p) => p.id === "my-provider");
      expect(found?.name).toBe("Updated");
      expect(found?.enabled).toBe(false);
    });

    it("should remove provider", () => {
      configManager.setProvider("to-remove", {
        name: "Remove Me",
        type: "openai_compatible",
        baseURL: "https://remove.me",
        enabled: true,
      });

      configManager.removeProvider("to-remove");

      const providers = configManager.getProviders();
      expect(providers.find((p) => p.id === "to-remove")).toBeUndefined();
    });

    it("should get provider config", () => {
      configManager.setProvider("my-api", {
        name: "My API",
        type: "openai_compatible",
        baseURL: "https://my-api.com/v1",
        enabled: true,
      });
      configManager.setCredential("my-api", "my-secret-key");

      const providerConfig = configManager.getProviderConfig("my-api");
      expect(providerConfig.baseURL).toBe("https://my-api.com/v1");
      expect(providerConfig.apiKey).toBe("my-secret-key");
    });

    it("should throw for unknown provider", () => {
      expect(() => configManager.getProviderConfig("nonexistent")).toThrow("Provider not configured");
    });
  });

  describe("active provider/model", () => {
    it("should get active provider", () => {
      const provider = configManager.getActiveProvider();
      expect(typeof provider).toBe("string");
    });

    it("should set active provider", () => {
      configManager.setActiveProvider("custom-provider");
      expect(configManager.getActiveProvider()).toBe("custom-provider");
    });

    it("should get active model", () => {
      const model = configManager.getActiveModel();
      expect(typeof model).toBe("string");
    });

    it("should set active model", () => {
      configManager.setActiveModel("custom-model");
      expect(configManager.getActiveModel()).toBe("custom-model");
    });
  });

  describe("routing rules", () => {
    it("should get routing rules", () => {
      const rules = configManager.getRoutingRules();
      expect(rules).toBeInstanceOf(Array);
    });

    it("should set routing rules", () => {
      const newRules = [
        { taskType: "fast", modelId: "groq-llama" },
        { taskType: "reasoning", modelId: "mimo-2.5-pro" },
      ];
      configManager.setRoutingRules(newRules);
      expect(configManager.getRoutingRules()).toEqual(newRules);
    });
  });

  describe("defaults", () => {
    it("should get max steps", () => {
      const maxSteps = configManager.getMaxSteps();
      expect(typeof maxSteps).toBe("number");
      expect(maxSteps).toBeGreaterThan(0);
    });

    it("should get stream timeout", () => {
      const timeout = configManager.getStreamTimeout();
      expect(typeof timeout).toBe("number");
      expect(timeout).toBeGreaterThan(0);
    });

    it("should get turn timeout", () => {
      const timeout = configManager.getTurnTimeout();
      expect(typeof timeout).toBe("number");
      expect(timeout).toBeGreaterThan(0);
    });

    it("should get memory min score", () => {
      const score = configManager.getMemoryMinScore();
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("config change listener", () => {
    it("should register and unregister listener", () => {
      const calls: any[] = [];
      const unsubscribe = onConfigChange((config) => {
        calls.push(config);
      });

      expect(typeof unsubscribe).toBe("function");
      unsubscribe(); // Should not throw
    });
  });

  describe("config watcher", () => {
    it("should start and stop watcher without errors", () => {
      startConfigWatcher();
      stopConfigWatcher(); // Should not throw
    });

    it("should be idempotent on start", () => {
      startConfigWatcher();
      startConfigWatcher(); // Second call should be no-op
      stopConfigWatcher();
    });
  });
});
