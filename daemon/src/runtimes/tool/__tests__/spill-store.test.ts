import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative } from "node:path";
import { saveSpill, SPILL_THRESHOLD_CHARS } from "../domain/spill-store.js";

let appDataRoot: string;
const prevMode = process.env.JARVIS_RUNTIME_MODE;
const prevDataDir = process.env.JARVIS_APP_DATA_DIR;

beforeAll(() => {
  appDataRoot = mkdtempSync(join(tmpdir(), "jarvis-spill-test-"));
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

function spillDataDir(): string {
  return join(appDataRoot, "data", "spill");
}

/** Assert a locator stays inside the sandboxed spill root (no escape). */
function expectConfined(locator: string): void {
  const rel = relative(spillDataDir(), locator);
  expect(rel).not.toMatch(/^\.\./);
  expect(resolve(locator).startsWith(resolve(spillDataDir()))).toBe(true);
}

describe("saveSpill", () => {
  it("writes the full content verbatim and returns an accurate handle", () => {
    const content = `line\n`.repeat(1200); // 6000 chars
    const ref = saveSpill(content, { sessionId: "s1", toolName: "grep", callId: "tc_1" });

    expect(ref.chars).toBe(content.length);
    expect(ref.bytes).toBe(Buffer.byteLength(content, "utf8"));
    expect(ref.locator.endsWith(join("s1", "grep_tc_1.txt"))).toBe(true);
    expectConfined(ref.locator);
    expect(readFileSync(ref.locator, "utf8")).toBe(content);
    expect(statSync(ref.locator).size).toBe(ref.bytes);
    expect(ref.retrievalHint).toMatch(/offset\/limit/);
  });

  it("builds a head-1000 / tail-500 preview with the omitted count", () => {
    const head = "H".repeat(1000);
    const middle = "M".repeat(2000);
    const tail = "T".repeat(500);
    const content = head + middle + tail;

    const ref = saveSpill(content, { sessionId: "s1", toolName: "cat", callId: "tc_2" });

    expect(ref.preview.startsWith("H".repeat(1000))).toBe(true);
    expect(ref.preview.endsWith("T".repeat(500))).toBe(true);
    expect(ref.preview).toContain(`... [${middle.length} characters omitted] ...`);
  });

  it("never reports a negative omitted count for short content", () => {
    const ref = saveSpill("tiny", { sessionId: "s1", toolName: "echo", callId: "tc_3" });
    expect(ref.chars).toBe(4);
    expect(ref.preview).not.toContain("-");
    expect(readFileSync(ref.locator, "utf8")).toBe("tiny");
  });

  it("falls back to a default session and tool when no options are given", () => {
    const ref = saveSpill("x".repeat(5000));
    expect(dirname(ref.locator)).toBe(join(spillDataDir(), "default"));
    expectConfined(ref.locator);
  });

  it("handles empty string content", () => {
    const ref = saveSpill("", { sessionId: "s1", toolName: "empty", callId: "tc_4" });
    expect(ref.bytes).toBe(0);
    expect(ref.chars).toBe(0);
    expect(readFileSync(ref.locator, "utf8")).toBe("");
  });

  it("blocks path traversal via sessionId and toolName", () => {
    const ref = saveSpill("payload", {
      sessionId: "../../evil",
      toolName: "..\\..\\windows\\system32\\cmd",
      callId: "tc_5",
    });

    expectConfined(ref.locator);
    expect(readFileSync(ref.locator, "utf8")).toBe("payload");
    // Nothing may be created outside the spill data dir.
    expect(statSync(join(appDataRoot, "data", "spill")).isDirectory()).toBe(true);
  });

  it("neutralizes reserved Windows filename characters", () => {
    const ref = saveSpill("payload", {
      sessionId: "con:<>/|?*",
      toolName: "tool name",
      callId: 'call"id',
    });

    expectConfined(ref.locator);
    // Only the filename may not contain reserved characters (the drive letter
    // of the absolute path legitimately contains ":").
    const fileName = ref.locator.split(/[\\/]/).pop() ?? "";
    expect(fileName).not.toMatch(/[:<>|?*"]/);
    expect(ref.locator).toContain("con_______");
    expect(readFileSync(ref.locator, "utf8")).toBe("payload");
  });

  it("clips oversized path segments to a bounded length", () => {
    const ref = saveSpill("payload", {
      sessionId: "s".repeat(500),
      toolName: "t".repeat(500),
      callId: "c".repeat(500),
    });

    const fileName = ref.locator.split(/[\\/]/).pop() ?? "";
    expect(fileName.length).toBeLessThanOrEqual(120 + 120 + 1 + 4); // tool_call.txt
    expectConfined(ref.locator);
  });

  it("supports very large payloads without degradation", () => {
    const big = "z".repeat(1_000_000);
    const ref = saveSpill(big, { sessionId: "s1", toolName: "big", callId: "tc_big" });
    expect(ref.chars).toBe(1_000_000);
    expect(readFileSync(ref.locator, "utf8").length).toBe(1_000_000);
  });

  it("counts multi-byte characters correctly for bytes vs chars", () => {
    const content = "你".repeat(3000); // 9000 bytes, 3000 chars
    const ref = saveSpill(content, { sessionId: "s1", toolName: "i18n", callId: "tc_i18n" });
    expect(ref.chars).toBe(3000);
    expect(ref.bytes).toBe(9000);
  });

  it("exposes the spill threshold constant used by trimToolResult", () => {
    expect(SPILL_THRESHOLD_CHARS).toBe(4000);
  });
});
