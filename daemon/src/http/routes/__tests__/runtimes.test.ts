import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockListCodingRuntimes: vi.fn(),
  mockGetCodingRuntime: vi.fn(),
  mockGetExecutablePath: vi.fn(),
  mockSpawnProcess: vi.fn(),
}));

vi.mock("../../../runtimes/coding/public-api.js", () => ({
  listCodingRuntimes: (...args: unknown[]) => mocks.mockListCodingRuntimes(...args),
  getCodingRuntime: (...args: unknown[]) => mocks.mockGetCodingRuntime(...args),
  getExecutablePath: (...args: unknown[]) => mocks.mockGetExecutablePath(...args),
  spawnProcess: (...args: unknown[]) => mocks.mockSpawnProcess(...args),
}));

vi.mock("../../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) => {
    return new Response(JSON.stringify({ error: message }), { status });
  }),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "../runtimes.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("runtimes routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockListCodingRuntimes.mockReturnValue([]);
    mocks.mockGetCodingRuntime.mockReturnValue(null);
    mocks.mockGetExecutablePath.mockReturnValue(null);
  });

  // ── GET /coding/diagnostics ──
  describe("GET /coding/diagnostics", () => {
    it("returns adapters when none registered", async () => {
      const res = await app.fetch(makeRequest("/coding/diagnostics"));
      const json = (await res.json()) as { adapters: { id: string; registered: boolean }[] };
      expect(res.status).toBe(200);
      expect(json.adapters).toHaveLength(3);
      expect(json.adapters.every((a) => a.registered === false)).toBe(true);
    });

    it("returns registered adapter with availability", async () => {
      mocks.mockListCodingRuntimes.mockReturnValue([{ id: "claude-code", name: "Claude Code" }]);
      mocks.mockGetCodingRuntime.mockReturnValue({
        discover: vi.fn().mockResolvedValue({
          available: true,
          version: "1.0.0",
          transport: "cli",
        }),
      });
      mocks.mockGetExecutablePath.mockReturnValue("/usr/bin/claude");

      const res = await app.fetch(makeRequest("/coding/diagnostics"));
      const json = (await res.json()) as { adapters: { id: string; registered: boolean; available: boolean; version: string | null }[] };
      const claude = json.adapters.find((a) => a.id === "claude-code");
      expect(claude?.registered).toBe(true);
      expect(claude?.available).toBe(true);
      expect(claude?.version).toBe("1.0.0");
    });

    it("handles discover() throwing an error", async () => {
      mocks.mockListCodingRuntimes.mockReturnValue([{ id: "codex", name: "Codex" }]);
      mocks.mockGetCodingRuntime.mockReturnValue({
        discover: vi.fn().mockRejectedValue(new Error("discover fail")),
      });

      const res = await app.fetch(makeRequest("/coding/diagnostics"));
      const json = (await res.json()) as { adapters: { id: string; available: boolean; reason: string | null }[] };
      const codex = json.adapters.find((a) => a.id === "codex");
      expect(codex?.available).toBe(false);
      expect(codex?.reason).toBe("discover fail");
    });

    it("returns all adapters even when some are registered", async () => {
      mocks.mockListCodingRuntimes.mockReturnValue([
        { id: "claude-code", name: "Claude Code" },
      ]);
      mocks.mockGetCodingRuntime.mockImplementation((id: string) => {
        if (id === "claude-code") {
          return {
            discover: vi.fn().mockResolvedValue({
              available: true,
              version: "2.0",
              transport: "cli",
            }),
          };
        }
        return null;
      });

      const res = await app.fetch(makeRequest("/coding/diagnostics"));
      const json = (await res.json()) as { adapters: { id: string; registered: boolean }[] };
      expect(json.adapters).toHaveLength(3);
      expect(json.adapters.filter((a) => a.registered)).toHaveLength(1);
    });

    it("returns fallback when listCodingRuntimes throws", async () => {
      mocks.mockListCodingRuntimes.mockImplementation(() => {
        throw new Error("registry broken");
      });
      const res = await app.fetch(makeRequest("/coding/diagnostics"));
      const json = (await res.json()) as { adapters: { id: string; available: boolean }[] };
      expect(res.status).toBe(200);
      expect(json.adapters).toHaveLength(3);
      expect(json.adapters.every((a) => a.available === false)).toBe(true);
    });
  });

  // ── GET /coding/diagnostics/health ──
  describe("GET /coding/diagnostics/health", () => {
    it("returns health info", async () => {
      mocks.mockListCodingRuntimes.mockReturnValue([{ id: "claude-code" }, { id: "codex" }]);
      const res = await app.fetch(makeRequest("/coding/diagnostics/health"));
      const json = (await res.json()) as { ok: boolean; registeredAdapterCount: number; registeredAdapters: string[] };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.registeredAdapterCount).toBe(2);
      expect(json.registeredAdapters).toContain("claude-code");
    });

    it("returns error health when listCodingRuntimes throws", async () => {
      mocks.mockListCodingRuntimes.mockImplementation(() => {
        throw new Error("broken");
      });
      const res = await app.fetch(makeRequest("/coding/diagnostics/health"));
      const json = (await res.json()) as { ok: boolean; registeredAdapterCount: number };
      expect(json.ok).toBe(false);
      expect(json.registeredAdapterCount).toBe(0);
    });
  });

  // ── POST /coding/:id/dry-run ──
  describe("POST /coding/:id/dry-run", () => {
    it("returns 404 for unknown adapter", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue(null);
      const res = await app.fetch(makeRequest("/coding/unknown/dry-run", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns 400 if executable not found", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue({ discover: vi.fn() });
      mocks.mockGetExecutablePath.mockReturnValue(null);
      const res = await app.fetch(makeRequest("/coding/claude-code/dry-run", "POST"));
      expect(res.status).toBe(400);
    });

    it("spawns process for claude-code", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue({ discover: vi.fn() });
      mocks.mockGetExecutablePath.mockReturnValue("/usr/bin/claude");
      mocks.mockSpawnProcess.mockResolvedValue({
        exitCode: 0,
        stdout: "dry-run-ok",
        stderr: "",
      });

      const res = await app.fetch(makeRequest("/coding/claude-code/dry-run", "POST"));
      const json = (await res.json()) as { success: boolean; stdout: string; durationMs: number };
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.stdout).toBe("dry-run-ok");
      expect(json.durationMs).toBeGreaterThanOrEqual(0);
      expect(mocks.mockSpawnProcess).toHaveBeenCalledWith(
        expect.objectContaining({ command: "claude" }),
      );
    });

    it("spawns process for codex", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue({ discover: vi.fn() });
      mocks.mockGetExecutablePath.mockReturnValue("/usr/bin/codex");
      mocks.mockSpawnProcess.mockResolvedValue({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const res = await app.fetch(makeRequest("/coding/codex/dry-run", "POST"));
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);
      expect(mocks.mockSpawnProcess).toHaveBeenCalledWith(
        expect.objectContaining({ command: "codex" }),
      );
    });

    it("spawns process for opencode", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue({ discover: vi.fn() });
      mocks.mockGetExecutablePath.mockReturnValue("/usr/bin/opencode");
      mocks.mockSpawnProcess.mockResolvedValue({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const res = await app.fetch(makeRequest("/coding/opencode/dry-run", "POST"));
      expect(res.status).toBe(200);
      expect(mocks.mockSpawnProcess).toHaveBeenCalledWith(
        expect.objectContaining({ command: "opencode" }),
      );
    });

    it("returns failure when exitCode is non-zero", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue({ discover: vi.fn() });
      mocks.mockGetExecutablePath.mockReturnValue("/usr/bin/claude");
      mocks.mockSpawnProcess.mockResolvedValue({
        exitCode: 1,
        stdout: "",
        stderr: "error output",
      });

      const res = await app.fetch(makeRequest("/coding/claude-code/dry-run", "POST"));
      const json = (await res.json()) as { success: boolean; exitCode: number };
      expect(json.success).toBe(false);
      expect(json.exitCode).toBe(1);
    });

    it("truncates long stdout/stderr", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue({ discover: vi.fn() });
      mocks.mockGetExecutablePath.mockReturnValue("/usr/bin/claude");
      const longOutput = "x".repeat(3000);
      mocks.mockSpawnProcess.mockResolvedValue({
        exitCode: 0,
        stdout: longOutput,
        stderr: longOutput,
      });

      const res = await app.fetch(makeRequest("/coding/claude-code/dry-run", "POST"));
      const json = (await res.json()) as { stdout: string; stderr: string };
      expect(json.stdout.length).toBeLessThanOrEqual(2000);
      expect(json.stderr.length).toBeLessThanOrEqual(2000);
    });

    it("returns 500 when spawnProcess throws", async () => {
      mocks.mockGetCodingRuntime.mockReturnValue({ discover: vi.fn() });
      mocks.mockGetExecutablePath.mockReturnValue("/usr/bin/claude");
      mocks.mockSpawnProcess.mockRejectedValue(new Error("spawn fail"));

      const res = await app.fetch(makeRequest("/coding/claude-code/dry-run", "POST"));
      expect(res.status).toBe(500);
    });
  });
});
