import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(import.meta.dirname, "..");

function readFile(relativePath: string): string {
  return readFileSync(resolve(srcDir, relativePath), "utf-8");
}

describe("Runtime entrypoint guards", () => {
  it("conversations.ts should not call handleMessageInConversation in runtime paths", () => {
    const source = readFile("http/routes/conversations.ts");
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

  it("conversations.ts should not call streamMessageInConversation", () => {
    const source = readFile("http/routes/conversations.ts");
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
    const source = readFile("runtimes/scheduler/scheduler.ts");
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
    const source = readFile("runtimes/scheduler/scheduler.ts");
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
    const source = readFile("runtimes/agent/run.ts");
    expect(source).toContain("handleMessageInConversation");
  });

  it("run-stream-executor.ts should use streamChat (allowed)", () => {
    const source = readFile("runtimes/agent/stream.ts");
    expect(source).toContain("streamChat");
  });

  it("ai-tool-wrapper.ts should pass toolCallId to toolRuntime.execute", () => {
    const source = readFile("runtimes/tool/adapters/ai-tool-wrapper.ts");
    expect(source).toContain("toolCallId");
  });

  it("skills/executor.ts should accept optional runtime context", () => {
    const source = readFile("skills/executor.ts");
    expect(source).toContain("SkillRuntimeContext");
    expect(source).toContain("runtimeContext");
  });

  it("conversations.ts should not import handleMessageInConversation", () => {
    const source = readFile("http/routes/conversations.ts");
    const lines = source.split("\n");
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("handleMessageInConversation") && line.includes("import")) {
        violations.push(`  line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("conversations.ts should not import streamMessageInConversation", () => {
    const source = readFile("http/routes/conversations.ts");
    const lines = source.split("\n");
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("streamMessageInConversation") && line.includes("import")) {
        violations.push(`  line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("runtimes/index.ts boundary guards", () => {
  it("runtimes/index.ts must not import from orchestrator", () => {
    const source = readFile("runtimes/index.ts");
    expect(source).not.toContain('"../orchestrator/');
    expect(source).not.toContain("'../orchestrator/");
  });

  it("runtimes/index.ts must not import from tools/", () => {
    const source = readFile("runtimes/index.ts");
    expect(source).not.toContain('"../tools/');
    expect(source).not.toContain("'../tools/");
  });

  it("runtimes/index.ts must not import from persistence/", () => {
    const source = readFile("runtimes/index.ts");
    expect(source).not.toContain('"../persistence/');
    expect(source).not.toContain("'../persistence/");
  });

  it("runtimes/index.ts must not import from utils/", () => {
    const source = readFile("runtimes/index.ts");
    expect(source).not.toContain('"../utils/');
    expect(source).not.toContain("'../utils/");
  });

  it("runtimes/index.ts must not import from config/", () => {
    const source = readFile("runtimes/index.ts");
    expect(source).not.toContain('"../config/');
    expect(source).not.toContain("'../config/");
  });

  it("http/routes must not import from runtimes/index.ts", () => {
    const routeFiles = [
      "http/routes/chat.ts",
      "http/routes/voice.ts",
      "http/routes/tools.ts",
      "http/routes/approval.ts",
      "http/routes/scheduled-tasks.ts",
      "http/routes/conversations.ts",
    ];
    for (const file of routeFiles) {
      const source = readFile(file);
      const violations: string[] = [];
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("import") && line.includes("runtimes/index")) {
          violations.push(`  ${file}:${i + 1}: ${line.trim()}`);
        }
      }
      expect(violations).toEqual([]);
    }
  });
});

describe("Runtime directory naming guards", () => {
  const forbiddenDirs = [
    "runtimes/agent-runtime",
    "runtimes/tool-runtime",
    "runtimes/coding-runtime",
    "runtimes/computer-control-runtime",
    "runtimes/voice-runtime",
    "runtimes/scheduler-runtime",
  ];

  for (const dir of forbiddenDirs) {
    it(`${dir} must not exist`, () => {
      const fullPath = resolve(srcDir, dir);
      expect(existsSync(fullPath)).toBe(false);
    });
  }
});
