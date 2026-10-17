/**
 * Adversarial tests for trimToolResult's spill-then-degrade contract:
 * - Oversized output is spilled to disk and replaced by a structured handle.
 * - Any disk failure falls back to the legacy 70/30 head/tail truncation.
 * - Context segments cannot escape the spill directory.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";

const { mockWriteFileSync, mockMkdirSync } = vi.hoisted(() => {
  return {
    mockWriteFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof import("node:fs").writeFileSync>) =>
      mockWriteFileSync(...args),
    mkdirSync: (...args: Parameters<typeof import("node:fs").mkdirSync>) =>
      mockMkdirSync(...args),
  };
});

// The wrapper module imports toolRuntime transitively; neutralize it.
vi.mock("../public-api.js", () => ({
  toolRuntime: { execute: vi.fn() },
}));

import { SPILL_THRESHOLD_CHARS } from "../domain/spill-store.js";
import { trimToolResult as trimFromWrapper } from "../adapters/ai-tool-wrapper.js";

let appDataRoot: string;
const prevMode = process.env.JARVIS_RUNTIME_MODE;
const prevDataDir = process.env.JARVIS_APP_DATA_DIR;
// The mocked namespace delegates to the REAL fs (importActual bypasses vi.mock),
// never to the mock itself, otherwise delegation would recurse.
const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");

beforeAll(() => {
  appDataRoot = mkdtempSync(join(tmpdir(), "jarvis-trim-test-"));
  process.env.JARVIS_RUNTIME_MODE = "sidecar";
  process.env.JARVIS_APP_DATA_DIR = appDataRoot;
});

afterAll(() => {
  if (prevMode === undefined) delete process.env.JARVIS_RUNTIME_MODE;
  else process.env.JARVIS_RUNTIME_MODE = prevMode;
  if (prevDataDir === undefined) delete process.env.JARVIS_APP_DATA_DIR;
  else process.env.JARVIS_APP_DATA_DIR = prevDataDir;
  rmSync(appDataRoot, { recursive: true, force: true });
});

beforeEach(() => {
  mockWriteFileSync.mockReset().mockImplementation(realFs.writeFileSync);
  mockMkdirSync.mockReset().mockImplementation(realFs.mkdirSync);
});

function spillDir(): string {
  return join(appDataRoot, "data", "spill");
}

function expectConfined(locator: string): void {
  const rel = relative(spillDir(), locator);
  expect(rel).not.toMatch(/^\.\./);
  expect(resolve(locator).startsWith(resolve(spillDir()))).toBe(true);
}

describe("trimToolResult — spill path", () => {
  it("returns values at or below the threshold untouched", () => {
    const exact = "a".repeat(SPILL_THRESHOLD_CHARS);
    expect(trimFromWrapper(exact)).toBe(exact);
    expect(trimFromWrapper("short")).toBe("short");
  });

  it("returns null, undefined, and numbers unchanged", () => {
    expect(trimFromWrapper(null)).toBeNull();
    expect(trimFromWrapper(undefined)).toBeUndefined();
    expect(trimFromWrapper(42)).toBe(42);
  });

  it("returns small objects unchanged", () => {
    const smallObj = { data: "ok" };
    expect(trimFromWrapper(smallObj)).toEqual(smallObj);
  });

  it("spills oversized strings and returns a structured handle", () => {
    const content = `x`.repeat(5000);
    const result = trimFromWrapper(content, {
      sessionId: "conv-1",
      toolName: "read_file",
      callId: "tc_spill1",
    }) as string;

    expect(result.startsWith("[Tool Output Spilled]\n")).toBe(true);
    expect(result).toContain("Total Size: 5000 bytes (5000 characters).");
    expect(result).toContain("Full Content Saved To:");
    expect(result).toContain("Hint: Use file reading or grep tools");

    // The locator in the handle points at the verbatim full output.
    const locator = result.split("Full Content Saved To: ")[1].split("\n")[0].trim();
    expectConfined(locator);
    expect(readFileSync(locator, "utf8")).toBe(content);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("keeps the returned handle under the threshold", () => {
    const content = "y".repeat(1_000_000);
    const result = trimFromWrapper(content, { sessionId: "s", toolName: "t", callId: "c" }) as string;
    expect(result.length).toBeLessThanOrEqual(SPILL_THRESHOLD_CHARS);
    expect(result).toContain("1000000 characters");
  });

  it("spills objects whose JSON exceeds the threshold", () => {
    const bigObj = { data: "z".repeat(5000) };
    const result = trimFromWrapper(bigObj, {
      sessionId: "conv-2",
      toolName: "search",
      callId: "tc_obj",
    }) as string;

    expect(result.startsWith("[Tool Output Spilled]")).toBe(true);
    const locator = result.split("Full Content Saved To: ")[1].split("\n")[0].trim();
    expect(readFileSync(locator, "utf8")).toBe(JSON.stringify(bigObj));
  });

  it("confines hostile context segments to the spill directory", () => {
    const result = trimFromWrapper("p".repeat(5000), {
      sessionId: "../../escape",
      toolName: "tool/../../name",
      callId: 'id";del',
    }) as string;

    const locator = result.split("Full Content Saved To: ")[1].split("\n")[0].trim();
    expectConfined(locator);
    expect(readFileSync(locator, "utf8")).toBe("p".repeat(5000));
  });

  it("exports the same threshold as the spill store", () => {
    expect(SPILL_THRESHOLD_CHARS).toBe(4000);
  });
});

describe("trimToolResult — degraded fallback path", () => {
  it("falls back to 70/30 head/tail truncation when the disk write fails", () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error("ENOSPC: no space left on device");
    });

    const content = "a".repeat(5000);
    const result = trimFromWrapper(content) as string;

    expect(result).toContain("[结果已截断");
    expect(result.length).toBeLessThanOrEqual(SPILL_THRESHOLD_CHARS);
    expect(result.length).toBeLessThan(content.length);
    // Head preserved
    expect(result.startsWith("a".repeat(100))).toBe(true);
    // Tail preserved
    expect(result.endsWith("a".repeat(100))).toBe(true);
    // Approximately 70/30 split of the body budget
    const notice = "\n\n[结果已截断——过长，已保留首尾摘要]";
    const bodyLen = result.length - notice.length;
    const headLen = Math.floor(bodyLen * 0.7);
    expect(result.slice(0, headLen)).toBe("a".repeat(headLen));
  });

  it("falls back when creating the spill directory fails", () => {
    mockMkdirSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const result = trimFromWrapper("b".repeat(10000)) as string;
    expect(result).toContain("[结果已截断");
    expect(result.length).toBeLessThanOrEqual(SPILL_THRESHOLD_CHARS);
  });

  it("degrades gracefully for oversized objects too when the disk fails", () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error("EBUSY");
    });

    const result = trimFromWrapper({ data: "q".repeat(9000) }) as string;
    expect(typeof result).toBe("string");
    expect(result).toContain("[结果已截断");
  });

  it("never calls the spill store for empty strings", () => {
    expect(trimFromWrapper("")).toBe("");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
