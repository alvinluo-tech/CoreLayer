import { describe, it, expect, beforeEach } from "vitest";
import { AuditLog } from "../audit.js";

describe("AuditLog", () => {
  let log: AuditLog;

  beforeEach(() => {
    log = new AuditLog();
  });

  describe("log()", () => {
    it("generates id and timestamp on logged entries", () => {
      const entry = log.log({
        action: "execute",
        toolId: "t1",
        toolName: "Tool 1",
        appId: "app1",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      expect(entry.id).toBeDefined();
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
    });

    it("preserves all input fields", () => {
      const entry = log.log({
        action: "execute",
        toolId: "t1",
        toolName: "Tool 1",
        appId: "app1",
        args: { key: "value" },
        result: "failure",
        riskLevel: "high",
        confirmedByUser: true,
        error: "something broke",
      });

      expect(entry.action).toBe("execute");
      expect(entry.toolId).toBe("t1");
      expect(entry.toolName).toBe("Tool 1");
      expect(entry.appId).toBe("app1");
      expect(entry.args).toEqual({ key: "value" });
      expect(entry.result).toBe("failure");
      expect(entry.riskLevel).toBe("high");
      expect(entry.confirmedByUser).toBe(true);
      expect(entry.error).toBe("something broke");
    });

    it("returns the logged entry", () => {
      const entry = log.log({
        action: "test",
        toolId: "t1",
        toolName: "T1",
        appId: "a1",
        args: null,
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      expect(entry).toMatchObject({
        action: "test",
        toolId: "t1",
        result: "success",
      });
    });
  });

  describe("truncation", () => {
    it("truncates entries when exceeding maxEntries", () => {
      const smallLog = new AuditLog(3);

      for (let i = 0; i < 5; i++) {
        smallLog.log({
          action: "execute",
          toolId: `t${i}`,
          toolName: `Tool ${i}`,
          appId: "app",
          args: {},
          result: "success",
          riskLevel: "low",
          confirmedByUser: false,
        });
      }

      expect(smallLog.size).toBe(3);
    });

    it("keeps the most recent entries after truncation", () => {
      const smallLog = new AuditLog(2);

      smallLog.log({
        action: "execute",
        toolId: "first",
        toolName: "First",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      smallLog.log({
        action: "execute",
        toolId: "second",
        toolName: "Second",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      smallLog.log({
        action: "execute",
        toolId: "third",
        toolName: "Third",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      expect(smallLog.size).toBe(2);
      const entries = smallLog.getEntries();
      expect(entries[0].toolId).toBe("third");
      expect(entries[1].toolId).toBe("second");
    });
  });

  describe("getEntries()", () => {
    it("returns entries in newest-first order", () => {
      log.log({
        action: "execute",
        toolId: "first",
        toolName: "First",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      log.log({
        action: "execute",
        toolId: "second",
        toolName: "Second",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      const entries = log.getEntries();
      expect(entries[0].toolId).toBe("second");
      expect(entries[1].toolId).toBe("first");
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        log.log({
          action: "execute",
          toolId: `t${i}`,
          toolName: `Tool ${i}`,
          appId: "app",
          args: {},
          result: "success",
          riskLevel: "low",
          confirmedByUser: false,
        });
      }

      const entries = log.getEntries(3);
      expect(entries).toHaveLength(3);
    });

    it("returns all entries when no limit specified", () => {
      for (let i = 0; i < 5; i++) {
        log.log({
          action: "execute",
          toolId: `t${i}`,
          toolName: `Tool ${i}`,
          appId: "app",
          args: {},
          result: "success",
          riskLevel: "low",
          confirmedByUser: false,
        });
      }

      expect(log.getEntries()).toHaveLength(5);
    });
  });

  describe("getEntriesByTool()", () => {
    it("filters entries by toolId", () => {
      log.log({
        action: "execute",
        toolId: "tool-a",
        toolName: "A",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      log.log({
        action: "execute",
        toolId: "tool-b",
        toolName: "B",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      log.log({
        action: "execute",
        toolId: "tool-a",
        toolName: "A2",
        appId: "app",
        args: {},
        result: "failure",
        riskLevel: "low",
        confirmedByUser: false,
      });

      const entries = log.getEntriesByTool("tool-a");
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.toolId === "tool-a")).toBe(true);
    });

    it("returns empty array when no entries match toolId", () => {
      log.log({
        action: "execute",
        toolId: "tool-a",
        toolName: "A",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      expect(log.getEntriesByTool("nonexistent")).toEqual([]);
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) {
        log.log({
          action: "execute",
          toolId: "tool-a",
          toolName: "A",
          appId: "app",
          args: {},
          result: "success",
          riskLevel: "low",
          confirmedByUser: false,
        });
      }

      expect(log.getEntriesByTool("tool-a", 2)).toHaveLength(2);
    });
  });

  describe("getEntriesByApp()", () => {
    it("filters entries by appId", () => {
      log.log({
        action: "execute",
        toolId: "t1",
        toolName: "T1",
        appId: "app-a",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      log.log({
        action: "execute",
        toolId: "t2",
        toolName: "T2",
        appId: "app-b",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      const entries = log.getEntriesByApp("app-a");
      expect(entries).toHaveLength(1);
      expect(entries[0].appId).toBe("app-a");
    });

    it("returns empty array when no entries match appId", () => {
      expect(log.getEntriesByApp("nonexistent")).toEqual([]);
    });

    it("respects limit", () => {
      for (let i = 0; i < 3; i++) {
        log.log({
          action: "execute",
          toolId: "t1",
          toolName: "T1",
          appId: "app-a",
          args: {},
          result: "success",
          riskLevel: "low",
          confirmedByUser: false,
        });
      }

      expect(log.getEntriesByApp("app-a", 1)).toHaveLength(1);
    });
  });

  describe("getDeniedEntries()", () => {
    it("returns only denied entries", () => {
      log.log({
        action: "execute",
        toolId: "t1",
        toolName: "T1",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      log.log({
        action: "execute",
        toolId: "t2",
        toolName: "T2",
        appId: "app",
        args: {},
        result: "denied",
        riskLevel: "high",
        confirmedByUser: false,
      });
      log.log({
        action: "execute",
        toolId: "t3",
        toolName: "T3",
        appId: "app",
        args: {},
        result: "cancelled",
        riskLevel: "high",
        confirmedByUser: false,
      });

      const denied = log.getDeniedEntries();
      expect(denied).toHaveLength(1);
      expect(denied[0].result).toBe("denied");
    });

    it("returns empty array when no denied entries", () => {
      log.log({
        action: "execute",
        toolId: "t1",
        toolName: "T1",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      expect(log.getDeniedEntries()).toEqual([]);
    });

    it("respects limit", () => {
      for (let i = 0; i < 3; i++) {
        log.log({
          action: "execute",
          toolId: `t${i}`,
          toolName: `T${i}`,
          appId: "app",
          args: {},
          result: "denied",
          riskLevel: "high",
          confirmedByUser: false,
        });
      }

      expect(log.getDeniedEntries(2)).toHaveLength(2);
    });
  });

  describe("clear()", () => {
    it("removes all entries", () => {
      log.log({
        action: "execute",
        toolId: "t1",
        toolName: "T1",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      log.log({
        action: "execute",
        toolId: "t2",
        toolName: "T2",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });

      expect(log.size).toBe(2);
      log.clear();
      expect(log.size).toBe(0);
      expect(log.getEntries()).toEqual([]);
    });
  });

  describe("size", () => {
    it("returns 0 for empty log", () => {
      expect(log.size).toBe(0);
    });

    it("returns correct count after logging", () => {
      log.log({
        action: "execute",
        toolId: "t1",
        toolName: "T1",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      expect(log.size).toBe(1);

      log.log({
        action: "execute",
        toolId: "t2",
        toolName: "T2",
        appId: "app",
        args: {},
        result: "success",
        riskLevel: "low",
        confirmedByUser: false,
      });
      expect(log.size).toBe(2);
    });
  });
});
