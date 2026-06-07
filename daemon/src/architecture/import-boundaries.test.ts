import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join, relative } from "path";

const srcDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(srcDir, "../..");

function readFile(relativePath: string): string {
  return readFileSync(resolve(srcDir, relativePath), "utf-8");
}

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      results.push(relative(srcDir, full).replace(/\\/g, "/"));
    }
  }
  return results;
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

describe("Forbidden top-level directories", () => {
  const forbiddenDirs = [
    "runtime",
    "api",
    "db",
    "capability",
    "coding-runtime",
    "computer-control",
    "voice",
    "model",
    "mcp",
  ];

  for (const dir of forbiddenDirs) {
    it(`daemon/src/${dir} must not exist`, () => {
      expect(existsSync(resolve(srcDir, dir))).toBe(false);
    });
  }
});

describe("Runtime modules must not import http/routes", () => {
  const runtimeFiles = listTsFiles(resolve(srcDir, "runtimes")).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test."),
  );

  for (const file of runtimeFiles) {
    it(`${file} must not import http/routes`, () => {
      const source = readFile(file);
      const violations: string[] = [];
      for (const [i, line] of source.split("\n").entries()) {
        if (line.includes("import") && line.includes("http/routes")) {
          violations.push(`  line ${i + 1}: ${line.trim()}`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Runtime modules must not import another runtime's private files", () => {
  const runtimeDirs = ["agent", "tool", "coding", "voice", "memory", "scheduler", "computer-control"];
  const runtimeFiles = listTsFiles(resolve(srcDir, "runtimes")).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test."),
  );

  for (const file of runtimeFiles) {
    const currentRuntime = runtimeDirs.find((r) => file.startsWith(`runtimes/${r}/`));
    if (!currentRuntime) continue;

    const otherRuntimes = runtimeDirs.filter((r) => r !== currentRuntime);

    it(`${file} must not import another runtime's application/domain`, () => {
      const source = readFile(file);
      const violations: string[] = [];
      for (const [i, line] of source.split("\n").entries()) {
        if (!line.includes("import")) continue;
        for (const other of otherRuntimes) {
          if (line.includes(`runtimes/${other}/application/`) || line.includes(`runtimes/${other}/domain/`)) {
            violations.push(`  line ${i + 1}: ${line.trim()}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Runtime modules must not directly import node:child_process", () => {
  const runtimeFiles = listTsFiles(resolve(srcDir, "runtimes")).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test."),
  );

  for (const file of runtimeFiles) {
    it(`${file} must not import node:child_process`, () => {
      const source = readFile(file);
      expect(source).not.toMatch(/import.*from\s+["']node:child_process/);
    });
  }
});

describe("Non-adapter daemon source must not import node:child_process", () => {
  const allDaemonFiles = listTsFiles(srcDir).filter(
    (f) =>
      !f.includes("__tests__") &&
      !f.includes(".test.") &&
      !f.includes("capabilities/adapters/"),
  );

  for (const file of allDaemonFiles) {
    it(`${file} must not import node:child_process`, () => {
      const source = readFile(file);
      expect(source).not.toMatch(/import.*from\s+["']node:child_process/);
    });
  }
});

describe("packages/* must not import daemon/* or frontend/*", () => {
  const packagesDir = resolve(rootDir, "packages");
  if (!existsSync(packagesDir)) return;

  const packageDirs = readdirSync(packagesDir).filter((d) =>
    statSync(join(packagesDir, d)).isDirectory(),
  );

  for (const pkg of packageDirs) {
    const tsFiles = listTsFiles(join(packagesDir, pkg));
    for (const file of tsFiles) {
      it(`${pkg}/${file} must not import daemon/ or frontend/`, () => {
        const fullPath = join(packagesDir, pkg, file);
        const source = readFileSync(fullPath, "utf-8");
        const violations: string[] = [];
        for (const [i, line] of source.split("\n").entries()) {
          if (line.includes("import") && (line.includes("/daemon/") || line.includes("/frontend/"))) {
            violations.push(`  line ${i + 1}: ${line.trim()}`);
          }
        }
        expect(violations).toEqual([]);
      });
    }
  }
});
