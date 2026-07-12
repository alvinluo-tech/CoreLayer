import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join, relative, dirname } from "path";

const srcDir = resolve(import.meta.dirname, "../..");
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

function extractModuleSpecifiers(line: string): string[] {
  const specifiers: string[] = [];

  const staticImportOrExportMatch = line.match(/from\s+["']([^"']+)["']/);
  if (staticImportOrExportMatch) {
    specifiers.push(staticImportOrExportMatch[1]);
  }

  const dynamicImportMatch = line.match(/import\s*\(\s*["']([^"']+)["']\s*\)/);
  if (dynamicImportMatch) {
    specifiers.push(dynamicImportMatch[1]);
  }

  const sideEffectImportMatch = line.match(/^\s*import\s+["']([^"']+)["']/);
  if (sideEffectImportMatch) {
    specifiers.push(sideEffectImportMatch[1]);
  }

  return specifiers;
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
  const privatePatterns = ["application/", "domain/", "adapters/"];

  const runtimeFiles = listTsFiles(resolve(srcDir, "runtimes")).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test."),
  );

  for (const file of runtimeFiles) {
    const currentRuntime = runtimeDirs.find((r) => file.startsWith(`runtimes/${r}/`));
    if (!currentRuntime) continue;

    const otherRuntimes = runtimeDirs.filter((r) => r !== currentRuntime);

    it(`${file} must not import another runtime's application/domain/adapters`, () => {
      const source = readFile(file);
      const fileDir = resolve(srcDir, dirname(file));
      const violations: string[] = [];

      for (const [i, line] of source.split("\n").entries()) {
        const specifiers = extractModuleSpecifiers(line);
        if (specifiers.length === 0) continue;

        for (const spec of specifiers) {
          if (!spec.startsWith(".")) continue;

          const resolved = resolve(fileDir, spec);
          const normalized = resolved.replace(/\\/g, "/");

          for (const other of otherRuntimes) {
            for (const pattern of privatePatterns) {
              if (normalized.includes(`runtimes/${other}/${pattern}`)) {
                violations.push(`  line ${i + 1}: ${line.trim()}`);
              }
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Runtime modules must import other runtimes only via public-api", () => {
  const runtimeDirs = ["agent", "tool", "coding", "voice", "memory", "scheduler", "computer-control"];

  const runtimeFiles = listTsFiles(resolve(srcDir, "runtimes")).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test.") && !f.endsWith("public-api.ts"),
  );

  for (const file of runtimeFiles) {
    const currentRuntime = runtimeDirs.find((r) => file.startsWith(`runtimes/${r}/`));
    if (!currentRuntime) continue;

    const otherRuntimes = runtimeDirs.filter((r) => r !== currentRuntime);

    it(`${file} must import other runtimes only through public-api`, () => {
      const source = readFile(file);
      const fileDir = resolve(srcDir, dirname(file));
      const violations: string[] = [];

      for (const [i, line] of source.split("\n").entries()) {
        const specifiers = extractModuleSpecifiers(line);
        if (specifiers.length === 0) continue;

        for (const spec of specifiers) {
          if (!spec.startsWith(".")) continue;

          const resolved = resolve(fileDir, spec);
          const normalized = resolved.replace(/\\/g, "/");

          for (const other of otherRuntimes) {
            const runtimeRoot = `runtimes/${other}/`;
            if (normalized.includes(runtimeRoot)) {
              const isPublicApi =
                normalized.endsWith("/public-api") ||
                normalized.endsWith("/public-api.ts") ||
                normalized.endsWith("/public-api.js");
              if (!isPublicApi) {
                violations.push(`  line ${i + 1}: ${line.trim()}`);
              }
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Non-runtime modules must import runtimes only via public-api", () => {
  const runtimeDirs = ["agent", "tool", "coding", "voice", "memory", "scheduler", "computer-control"];

  const nonRuntimeDirs = ["http/routes", "skills", "approvals", "plugins", "gateways", "legacy"];
  const nonRuntimeFiles: string[] = [];
  for (const dir of nonRuntimeDirs) {
    const fullPath = resolve(srcDir, dir);
    if (existsSync(fullPath)) {
      nonRuntimeFiles.push(...listTsFiles(fullPath));
    }
  }

  for (const file of nonRuntimeFiles) {
    if (file.includes("__tests__") || file.includes(".test.")) continue;

    it(`${file} must import runtimes only through public-api`, () => {
      const source = readFile(file);
      const fileDir = resolve(srcDir, dirname(file));
      const violations: string[] = [];

      for (const [i, line] of source.split("\n").entries()) {
        const specifiers = extractModuleSpecifiers(line);
        if (specifiers.length === 0) continue;

        for (const spec of specifiers) {
          if (!spec.startsWith(".")) continue;

          const resolved = resolve(fileDir, spec);
          const normalized = resolved.replace(/\\/g, "/");

          for (const runtime of runtimeDirs) {
            const runtimeRoot = `runtimes/${runtime}/`;
            if (normalized.includes(runtimeRoot)) {
              const isPublicApi =
                normalized.endsWith("/public-api") ||
                normalized.endsWith("/public-api.ts") ||
                normalized.endsWith("/public-api.js");
              if (!isPublicApi) {
                violations.push(`  line ${i + 1}: ${line.trim()}`);
              }
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe("Only capability/execution adapters may use child_process", () => {
  const allowedAuthorityPaths = [
    "capabilities/adapters/",
    "runtimes/coding/adapters/",
    "runtimes/coding/process-spawner.ts",
    "runtimes/coding/docker-environment.ts",
    "runtimes/external-agent/local-cli-adapter.ts",
  ];
  const allDaemonFiles = listTsFiles(srcDir).filter(
    (f) =>
      !f.includes("__tests__") &&
      !f.includes(".test.") &&
      !allowedAuthorityPaths.some((allowed) => f.startsWith(allowed)),
  );

  for (const file of allDaemonFiles) {
    it(`${file} must not acquire child_process authority`, () => {
      const source = readFile(file);
      expect(source).not.toMatch(
        /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](?:node:)?child_process["']/,
      );
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

describe("Bootstrap layer may import runtime internals for registration/startup", () => {
  const bootstrapFiles = listTsFiles(resolve(srcDir, "bootstrap")).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test."),
  );

  it("register-tools.ts may import tool adapter connectors and memory connector", () => {
    const source = readFile("bootstrap/register-tools.ts");
    const lines = source.split("\n").filter((l) => l.includes("import") && l.includes("runtimes/"));
    const allowedPatterns = [
      "runtimes/tool/adapters/native-tools/",
      "runtimes/memory/connector",
    ];
    for (const line of lines) {
      const hasAllowed = allowedPatterns.some((p) => line.includes(p));
      expect(hasAllowed).toBe(true);
    }
  });

  it("start-background-services.ts may import scheduler internals", () => {
    const source = readFile("bootstrap/start-background-services.ts");
    const lines = source.split("\n").filter((l) => l.includes("import") && l.includes("runtimes/"));
    for (const line of lines) {
      expect(line).toMatch(/runtimes\/scheduler\//);
    }
  });

  it("bootstrap must not import agent, voice, coding, or computer-control internals", () => {
    const forbiddenRuntimes = ["agent", "voice", "coding", "computer-control"];
    for (const file of bootstrapFiles) {
      const source = readFile(file);
      for (const runtime of forbiddenRuntimes) {
        expect(source).not.toMatch(new RegExp(`runtimes/${runtime}/(?!public-api)`));
      }
    }
  });
});

describe("Runtime modules must not import runtimes/index.ts", () => {
  const runtimeFiles = listTsFiles(resolve(srcDir, "runtimes")).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test."),
  );

  for (const file of runtimeFiles) {
    it(`${file} must not import runtimes/index.ts`, () => {
      const source = readFile(file);
      const fileDir = resolve(srcDir, dirname(file));
      const violations: string[] = [];

      for (const [i, line] of source.split("\n").entries()) {
        const specifiers = extractModuleSpecifiers(line);
        if (specifiers.length === 0) continue;

        for (const spec of specifiers) {
          // Skip bare module specifiers (not relative paths)
          if (!spec.startsWith(".")) continue;

          // Resolve the import relative to the file's directory
          const resolved = resolve(fileDir, spec);
          const normalized = resolved.replace(/\\/g, "/");

          // Check if it resolves to runtimes/index.ts (with or without .js extension)
          if (normalized.endsWith("/runtimes/index") || normalized.endsWith("/runtimes/index.js") || normalized.endsWith("/runtimes/index.ts")) {
            violations.push(`  line ${i + 1}: ${line.trim()}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
