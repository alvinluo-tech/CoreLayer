import { describe, it, expect } from "vitest";
import { SymbolGraph } from "../symbol-graph.js";
import { buildAdaptiveCodeContext } from "../pruning-service.js";

describe("SymbolGraph & PruningService", () => {
  const serviceA = `
export interface UserPayload {
  id: string;
  role: string;
}

export function validateUser(user: UserPayload): boolean {
  if (!user.id) return false;
  return user.role === "admin";
}

export async function processLogin(user: UserPayload): Promise<string> {
  const isValid = validateUser(user);
  if (!isValid) throw new Error("Unauthorized");
  return generateToken(user.id);
}
`;

  const serviceB = `
export function generateToken(userId: string): string {
  // Complex hashing logic with salt and crypto
  const salt = "salt-xyz-123";
  let hash = userId + salt;
  for (let i = 0; i < 100; i++) {
    hash = hash + "-" + i;
  }
  return "jwt-" + hash;
}
`;

  describe("SymbolGraph Topology", () => {
    it("indexes multiple files and resolves caller and callee edges", () => {
      const graph = new SymbolGraph();
      graph.addSourceFile("auth/login.ts", serviceA);
      graph.addSourceFile("auth/crypto.ts", serviceB);

      const loginSym = graph.getSymbol("processLogin");
      expect(loginSym).toBeDefined();

      const neighbors = graph.getNeighbors(loginSym!.id);
      expect(neighbors).toHaveLength(2);

      const neighborNames = neighbors.map((n) => n.symbol.name);
      expect(neighborNames).toContain("validateUser");
      expect(neighborNames).toContain("generateToken");

      // Verify generateToken knows processLogin is its caller
      const tokenSym = graph.getSymbol("generateToken");
      const tokenNeighbors = graph.getNeighbors(tokenSym!.id);
      expect(tokenNeighbors.map((n) => n.symbol.name)).toContain("processLogin");
      expect(tokenNeighbors.find((n) => n.symbol.name === "processLogin")?.relation).toContain("caller");
    });

    it("performs 1-hop adaptive AST pruning around a focal symbol", () => {
      const graph = new SymbolGraph();
      graph.addSourceFile("auth/login.ts", serviceA);
      graph.addSourceFile("auth/crypto.ts", serviceB);

      const pruned = graph.pruneAroundFocalSymbol("processLogin");
      expect(pruned.focalSymbol?.name).toBe("processLogin");
      expect(pruned.neighbors).toHaveLength(2);

      // Focal function has 100% full implementation
      expect(pruned.contextMarkdown).toContain("### FOCAL IMPLEMENTATION (Target)");
      expect(pruned.contextMarkdown).toContain('if (!isValid) throw new Error("Unauthorized");');

      // Callee generateToken has its body pruned into a skeleton
      expect(pruned.contextMarkdown).toContain("### 1-HOP NEIGHBORHOOD SKELETONS");
      expect(pruned.contextMarkdown).toContain("export function generateToken(userId: string): string {");
      expect(pruned.contextMarkdown).toContain("/* [body pruned:");
      expect(pruned.contextMarkdown).not.toContain("const salt = \"salt-xyz-123\";");

      // Token compression achieved
      expect(pruned.compressionRatio).toBeGreaterThan(0.0);
    });

    it("returns helpful message when focal symbol does not exist", () => {
      const graph = new SymbolGraph();
      graph.addSourceFile("auth/login.ts", serviceA);

      const pruned = graph.pruneAroundFocalSymbol("nonExistentFunction");
      expect(pruned.focalSymbol).toBeNull();
      expect(pruned.contextMarkdown).toContain('not found in indexed symbol graph');
    });
  });

  describe("PruningService Facade", () => {
    it("builds focal_with_neighborhood context when focalSymbolName is supplied", () => {
      const summary = buildAdaptiveCodeContext({
        filePath: "auth/login.ts",
        sourceCode: serviceA,
        focalSymbolName: "processLogin",
        relatedFiles: [{ filePath: "auth/crypto.ts", sourceCode: serviceB }],
      });

      expect(summary.mode).toBe("focal_with_neighborhood");
      expect(summary.targetName).toBe("processLogin");
      expect(summary.markdown).toContain("FOCAL IMPLEMENTATION");
      expect(summary.markdown).toContain("1-HOP NEIGHBORHOOD SKELETONS");
    });

    it("falls back to file_skeleton mode when focalSymbolName is omitted", () => {
      const summary = buildAdaptiveCodeContext({
        filePath: "auth/login.ts",
        sourceCode: serviceA,
      });

      expect(summary.mode).toBe("file_skeleton");
      expect(summary.markdown).toContain("// === Code Skeleton: auth/login.ts ===");
      expect(summary.markdown).toContain("interface UserPayload");
      expect(summary.markdown).toContain("export async function processLogin");
      expect(summary.markdown).toContain("/* [body pruned:");
      expect(summary.compressionRatio).toBeGreaterThan(0.0);
    });
  });
});
