import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(import.meta.dirname, "..");

function readFile(relativePath: string): string {
  return readFileSync(resolve(srcDir, relativePath), "utf-8");
}

describe("Runtime entrypoint guards", () => {
  it("conversations.ts should not call handleMessageInConversation in runtime paths", () => {
    const source = readFile("api/conversations.ts");
    // Allowed: import statement and regenerate route (line ~312)
    // Disallowed: any other direct call in streaming/non-streaming routes
    const lines = source.split("\n");
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("handleMessageInConversation(") && !line.includes("import")) {
        // Allow in regenerate route (context: around line 312)
        if (i > 300 && i < 320) continue;
        violations.push(`  line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("conversations.ts should not call streamMessageInConversation", () => {
    const source = readFile("api/conversations.ts");
    const lines = source.split("\n");
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("streamMessageInConversation(") && !line.includes("import")) {
        violations.push(`  line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("scheduler.ts should not call handleMessageInConversation", () => {
    const source = readFile("scheduler.ts");
    const lines = source.split("\n");
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("handleMessageInConversation(") && !line.includes("import")) {
        violations.push(`  line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("scheduler.ts should not call streamMessageInConversation", () => {
    const source = readFile("scheduler.ts");
    const lines = source.split("\n");
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("streamMessageInConversation(") && !line.includes("import")) {
        violations.push(`  line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("run-executor.ts should use handleMessageInConversation (allowed)", () => {
    const source = readFile("runtime/run-executor.ts");
    expect(source).toContain("handleMessageInConversation");
  });

  it("run-stream-executor.ts should use streamChat (allowed)", () => {
    const source = readFile("runtime/run-stream-executor.ts");
    expect(source).toContain("streamChat");
  });
});
