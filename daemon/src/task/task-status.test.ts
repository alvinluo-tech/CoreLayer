import { describe, it, expect } from "vitest";
import {
  normalizeTaskStatus,
  isTaskComplete,
  isTaskExecutable,
  isTaskTerminal,
  toLegacyTaskStatus,
  TASK_STATUSES,
} from "./task-status.js";

describe("Task Status Helpers", () => {
  describe("normalizeTaskStatus", () => {
    it("maps 'pending' to 'queued'", () => {
      expect(normalizeTaskStatus("pending")).toBe("queued");
    });

    it("maps 'in_progress' to 'running'", () => {
      expect(normalizeTaskStatus("in_progress")).toBe("running");
    });

    it("maps 'done' to 'completed'", () => {
      expect(normalizeTaskStatus("done")).toBe("completed");
    });

    it("returns canonical statuses unchanged", () => {
      expect(normalizeTaskStatus("queued")).toBe("queued");
      expect(normalizeTaskStatus("running")).toBe("running");
      expect(normalizeTaskStatus("completed")).toBe("completed");
      expect(normalizeTaskStatus("failed")).toBe("failed");
      expect(normalizeTaskStatus("cancelled")).toBe("cancelled");
      expect(normalizeTaskStatus("blocked")).toBe("blocked");
      expect(normalizeTaskStatus("draft")).toBe("draft");
      expect(normalizeTaskStatus("deleted")).toBe("deleted");
    });

    it("passes through unknown statuses", () => {
      expect(normalizeTaskStatus("unknown")).toBe("unknown");
    });
  });

  describe("isTaskComplete", () => {
    it("returns true for 'completed'", () => {
      expect(isTaskComplete("completed")).toBe(true);
    });

    it("returns true for legacy 'done'", () => {
      expect(isTaskComplete("done")).toBe(true);
    });

    it("returns false for non-completed statuses", () => {
      expect(isTaskComplete("pending")).toBe(false);
      expect(isTaskComplete("in_progress")).toBe(false);
      expect(isTaskComplete("queued")).toBe(false);
      expect(isTaskComplete("running")).toBe(false);
      expect(isTaskComplete("failed")).toBe(false);
      expect(isTaskComplete("blocked")).toBe(false);
      expect(isTaskComplete("deleted")).toBe(false);
    });
  });

  describe("isTaskExecutable", () => {
    it("returns true for 'queued'", () => {
      expect(isTaskExecutable("queued")).toBe(true);
    });

    it("returns true for legacy 'pending'", () => {
      expect(isTaskExecutable("pending")).toBe(true);
    });

    it("returns false for non-ready statuses", () => {
      expect(isTaskExecutable("running")).toBe(false);
      expect(isTaskExecutable("in_progress")).toBe(false);
      expect(isTaskExecutable("completed")).toBe(false);
      expect(isTaskExecutable("done")).toBe(false);
      expect(isTaskExecutable("failed")).toBe(false);
      expect(isTaskExecutable("blocked")).toBe(false);
      expect(isTaskExecutable("deleted")).toBe(false);
    });
  });

  describe("isTaskTerminal", () => {
    it("returns true for terminal statuses", () => {
      expect(isTaskTerminal("completed")).toBe(true);
      expect(isTaskTerminal("done")).toBe(true);
      expect(isTaskTerminal("failed")).toBe(true);
      expect(isTaskTerminal("cancelled")).toBe(true);
      expect(isTaskTerminal("deleted")).toBe(true);
    });

    it("returns false for non-terminal statuses", () => {
      expect(isTaskTerminal("pending")).toBe(false);
      expect(isTaskTerminal("queued")).toBe(false);
      expect(isTaskTerminal("in_progress")).toBe(false);
      expect(isTaskTerminal("running")).toBe(false);
      expect(isTaskTerminal("blocked")).toBe(false);
      expect(isTaskTerminal("draft")).toBe(false);
    });
  });

  describe("toLegacyTaskStatus", () => {
    it("maps 'queued' to 'pending'", () => {
      expect(toLegacyTaskStatus("queued")).toBe("pending");
    });

    it("maps 'running' to 'in_progress'", () => {
      expect(toLegacyTaskStatus("running")).toBe("in_progress");
    });

    it("maps 'completed' to 'done'", () => {
      expect(toLegacyTaskStatus("completed")).toBe("done");
    });

    it("passes through other statuses unchanged", () => {
      expect(toLegacyTaskStatus("failed")).toBe("failed");
      expect(toLegacyTaskStatus("cancelled")).toBe("cancelled");
      expect(toLegacyTaskStatus("blocked")).toBe("blocked");
      expect(toLegacyTaskStatus("deleted")).toBe("deleted");
      expect(toLegacyTaskStatus("draft")).toBe("draft");
    });

    it("normalizes legacy input first", () => {
      expect(toLegacyTaskStatus("done")).toBe("done");
      expect(toLegacyTaskStatus("pending")).toBe("pending");
      expect(toLegacyTaskStatus("in_progress")).toBe("in_progress");
    });
  });

  describe("TASK_STATUSES constant", () => {
    it("contains all canonical statuses", () => {
      expect(Object.values(TASK_STATUSES)).toContain("draft");
      expect(Object.values(TASK_STATUSES)).toContain("queued");
      expect(Object.values(TASK_STATUSES)).toContain("running");
      expect(Object.values(TASK_STATUSES)).toContain("blocked");
      expect(Object.values(TASK_STATUSES)).toContain("needs_review");
      expect(Object.values(TASK_STATUSES)).toContain("completed");
      expect(Object.values(TASK_STATUSES)).toContain("failed");
      expect(Object.values(TASK_STATUSES)).toContain("cancelled");
      expect(Object.values(TASK_STATUSES)).toContain("deleted");
    });
  });
});
