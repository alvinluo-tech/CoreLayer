import { describe, it, expect } from "vitest";
import {
  extractSymbolsFromSource,
  generateFileSkeleton,
} from "../symbol-extractor.js";

describe("Symbol Extractor", () => {
  const sampleTypeScriptSource = `
/**
 * Configuration options for math processing.
 */
export interface MathOptions {
  precision: number;
  strict?: boolean;
}

export type MathMode = "fast" | "accurate";

export enum OperationType {
  ADD = "add",
  SUBTRACT = "sub",
}

/**
 * Calculates compound interest.
 */
export async function calculateInterest(
  principal: number,
  rate: number,
  options: MathOptions,
): Promise<number> {
  validateInput(principal);
  const factor = 1 + rate;
  let total = principal;
  for (let i = 0; i < options.precision; i++) {
    total = total * factor;
  }
  return total;
}

export const helperArrow = (x: number): number => {
  const y = x * 2;
  return y + 1;
};

export class CalculatorEngine {
  public readonly id: string = "calc-v1";

  constructor(opts: MathOptions) {
    this.init(opts);
  }

  public compute(val: number): number {
    const res = val * 42;
    return res;
  }
}
`;

  it("extracts interfaces, types, and enums with 100% signature fidelity", () => {
    const symbols = extractSymbolsFromSource("math.ts", sampleTypeScriptSource);

    const iface = symbols.find((s) => s.name === "MathOptions");
    expect(iface).toBeDefined();
    expect(iface?.kind).toBe("interface");
    expect(iface?.skeleton).toContain("precision: number;");
    expect(iface?.skeleton).toContain("strict?: boolean;");

    const typeAlias = symbols.find((s) => s.name === "MathMode");
    expect(typeAlias).toBeDefined();
    expect(typeAlias?.kind).toBe("type_alias");
    expect(typeAlias?.skeleton).toContain('"fast" | "accurate"');

    const enumSym = symbols.find((s) => s.name === "OperationType");
    expect(enumSym).toBeDefined();
    expect(enumSym?.kind).toBe("enum");
    expect(enumSym?.skeleton).toContain('ADD = "add"');
  });

  it("collapses function implementation bodies and preserves JSDoc comments", () => {
    const symbols = extractSymbolsFromSource("math.ts", sampleTypeScriptSource);

    const fn = symbols.find((s) => s.name === "calculateInterest");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("function");
    expect(fn?.skeleton).toContain("Calculates compound interest");
    expect(fn?.skeleton).toContain("export async function calculateInterest(");
    expect(fn?.skeleton).toContain("/* [body pruned:");
    // Verifies body was collapsed and internal loop was pruned
    expect(fn?.skeleton).not.toContain("validateInput(principal);");
    expect(fn?.skeleton).not.toContain("for (let i = 0;");

    // Full content is still preserved for target focal access
    expect(fn?.fullContent).toContain("validateInput(principal);");

    // Token compression ratio test
    expect(fn!.tokenEstimate.skeleton).toBeLessThan(fn!.tokenEstimate.full);
  });

  it("extracts arrow functions and prunes their block bodies", () => {
    const symbols = extractSymbolsFromSource("math.ts", sampleTypeScriptSource);

    const arrow = symbols.find((s) => s.name === "helperArrow");
    expect(arrow).toBeDefined();
    expect(arrow?.kind).toBe("function");
    expect(arrow?.skeleton).toContain("const helperArrow = (x: number): number => {");
    expect(arrow?.skeleton).toContain("/* [body pruned:");
    expect(arrow?.skeleton).not.toContain("const y = x * 2;");
  });

  it("extracts classes and collapses methods and constructors while preserving properties", () => {
    const symbols = extractSymbolsFromSource("math.ts", sampleTypeScriptSource);

    const cls = symbols.find((s) => s.name === "CalculatorEngine");
    expect(cls).toBeDefined();
    expect(cls?.kind).toBe("class");
    expect(cls?.skeleton).toContain("class CalculatorEngine");
    expect(cls?.skeleton).toContain("public readonly id: string");
    expect(cls?.skeleton).toContain("/* [constructor pruned] */");
    expect(cls?.skeleton).toContain("/* [method pruned] */");
    expect(cls?.skeleton).not.toContain("this.init(opts);");
    expect(cls?.skeleton).not.toContain("const res = val * 42;");
  });

  it("detects symbol invocation calls inside function bodies", () => {
    const symbols = extractSymbolsFromSource("math.ts", sampleTypeScriptSource);

    const fn = symbols.find((s) => s.name === "calculateInterest");
    expect(fn?.calls).toContain("validateInput");

    const cls = symbols.find((s) => s.name === "CalculatorEngine");
    expect(cls?.calls).toContain("init");
  });

  it("generates a unified file skeleton markdown", () => {
    const skeleton = generateFileSkeleton("math.ts", sampleTypeScriptSource);

    expect(skeleton).toContain("// === Code Skeleton: math.ts ===");
    expect(skeleton).toContain("interface MathOptions");
    expect(skeleton).toContain("export async function calculateInterest");
    expect(skeleton).toContain("/* [body pruned:");
    expect(skeleton).toContain("class CalculatorEngine");
    // Ensure raw calculation logic is absent from file-level skeleton
    expect(skeleton).not.toContain("total = total * factor;");
  });

  it("gracefully handles empty source code", () => {
    const symbols = extractSymbolsFromSource("empty.ts", "");
    expect(symbols).toEqual([]);

    const skeleton = generateFileSkeleton("empty.ts", "   ");
    expect(skeleton).toContain("(No top-level symbols detected)");
  });
});
