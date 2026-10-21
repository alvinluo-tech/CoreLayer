import { describe, it, expect, beforeEach, vi } from "vitest";

let capturedExecute: ((args: unknown) => Promise<unknown>) | null = null;

vi.mock("../registry.js", () => ({
  registerTool: (_name: string, definition: { execute: (args: unknown) => Promise<unknown> }) => {
    capturedExecute = definition.execute;
  },
}));

const { registerCodeIntelligenceTools } = await import("../code-intelligence.js");

beforeEach(() => {
  capturedExecute = null;
  registerCodeIntelligenceTools();
});

describe("get_code_skeleton tool", () => {
  const sampleCode = `
export interface Config {
  port: number;
}

export function startServer(cfg: Config): void {
  const x = 1 + 2;
  console.log("running", x);
}
`;

  it("registers get_code_skeleton with an execute function", () => {
    expect(capturedExecute).toBeTypeOf("function");
  });

  it("extracts whole-file skeleton from inline content", async () => {
    const fn = capturedExecute!;
    const result = (await fn({
      filePath: "src/server.ts",
      content: sampleCode,
    })) as { mode: string; skeleton: string; note: string };

    expect(result.mode).toBe("file_skeleton");
    expect(result.skeleton).toContain("interface Config");
    expect(result.skeleton).toContain("export function startServer");
    expect(result.skeleton).toContain("/* [body pruned:");
    expect(result.skeleton).not.toContain("const x = 1 + 2;");
    expect(result.note).toContain("compressed vs full unpruned source");
  });

  it("extracts focal symbol implementation and neighborhood", async () => {
    const fn = capturedExecute!;
    const result = (await fn({
      filePath: "src/server.ts",
      content: sampleCode,
      focalSymbol: "startServer",
    })) as { mode: string; targetName: string; skeleton: string };

    expect(result.mode).toBe("focal_with_neighborhood");
    expect(result.targetName).toBe("startServer");
    expect(result.skeleton).toContain("FOCAL IMPLEMENTATION");
    expect(result.skeleton).toContain("console.log(\"running\", x);");
  });

  it("safely reports error when file does not exist on disk", async () => {
    const fn = capturedExecute!;
    const result = (await fn({
      filePath: "non-existent-fake-path.ts",
    })) as { error: string };

    expect(result.error).toContain("File not found");
  });
});
