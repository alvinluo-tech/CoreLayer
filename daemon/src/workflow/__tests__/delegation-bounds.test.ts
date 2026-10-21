import { describe, it, expect } from "vitest";
import {
  DelegationRejected,
  MAX_DELEGATION_TIMEOUT_MS,
  MAX_DELEGATION_PROMPT_CHARS,
  MIN_DELEGATION_TIMEOUT_MS,
  intersectGlobs,
  narrowDelegationBounds,
  narrowPaths,
  rootDelegationBounds,
  validateDelegationRequest,
  type DelegationBounds,
} from "../delegation-bounds.js";

const wideParent: DelegationBounds = {
  allowedPaths: [],
  testCommands: [],
  requiredArtifactTypes: [],
  timeoutMs: 300_000,
  allowedTools: [],
};

describe("narrowPaths", () => {
  it("adopts the child's scope when the parent was never confined", () => {
    expect(narrowPaths([], ["src/**"])).toEqual(["src/**"]);
  });

  it("inherits the parent's scope when the child names none", () => {
    expect(narrowPaths(["src/**"], undefined)).toEqual(["src/**"]);
  });

  it("keeps the narrower of two nested globs", () => {
    expect(narrowPaths(["src/**"], ["src/auth/**"])).toEqual(["src/auth/**"]);
  });

  it("keeps the parent's glob when the child asks for something wider", () => {
    expect(narrowPaths(["src/auth/**"], ["src/**"])).toEqual(["src/auth/**"]);
    expect(narrowPaths(["src/auth/**"], ["**"])).toEqual(["src/auth/**"]);
  });

  it("refuses a scope that does not overlap the parent's", () => {
    expect(() => narrowPaths(["src/**"], ["docs/**"])).toThrow(DelegationRejected);
  });

  it("merges overlapping wildcard segments", () => {
    expect(narrowPaths(["src/*.ts"], ["src/a*.ts"])).toEqual(["src/a*.ts"]);
    expect(narrowPaths(["src/a*.ts"], ["src/*.ts"])).toEqual(["src/a*.ts"]);
  });
});

describe("intersectGlobs", () => {
  it("treats identical patterns as themselves", () => {
    expect(intersectGlobs("src/**", "src/**")).toBe("src/**");
  });

  it("returns null for disjoint literals", () => {
    expect(intersectGlobs("src/a.ts", "src/b.ts")).toBeNull();
  });

  it("lets a trailing ** absorb a deeper sibling", () => {
    expect(intersectGlobs("src/**", "src/a/b/c.ts")).toBe("src/a/b/c.ts");
    expect(intersectGlobs("src/a/b/c.ts", "src/**")).toBe("src/a/b/c.ts");
  });
});

describe("narrowDelegationBounds", () => {
  it("never widens the timeout, and respects the caller's smaller request", () => {
    expect(narrowDelegationBounds(wideParent, { task: "t", timeoutMs: 60_000 }).timeoutMs).toBe(60_000);
    expect(narrowDelegationBounds(wideParent, { task: "t", timeoutMs: 900_000 }).timeoutMs).toBe(300_000);
  });

  it("clamps a timeout to the sanctioned range", () => {
    expect(narrowDelegationBounds(wideParent, { task: "t", timeoutMs: 1 }).timeoutMs).toBe(
      MIN_DELEGATION_TIMEOUT_MS,
    );
    expect(
      narrowDelegationBounds({ ...wideParent, timeoutMs: MAX_DELEGATION_TIMEOUT_MS * 2 }, { task: "t" })
        .timeoutMs,
    ).toBe(MAX_DELEGATION_TIMEOUT_MS);
  });

  it("adds checks rather than replacing them", () => {
    const parent = { ...wideParent, testCommands: ["npm test"] };
    const result = narrowDelegationBounds(parent, { task: "t", testCommands: ["npm run lint"] });
    expect(result.testCommands).toEqual(["npm test", "npm run lint"]);
  });

  it("cannot drop a parent check by naming only its own", () => {
    const parent = { ...wideParent, testCommands: ["npm test"] };
    expect(narrowDelegationBounds(parent, { task: "t" }).testCommands).toEqual(["npm test"]);
  });

  it("intersects tools and refuses a tool the parent does not hold", () => {
    const parent = { ...wideParent, allowedTools: ["read", "edit"] };
    expect(narrowDelegationBounds(parent, { task: "t", allowedTools: ["read"] }).allowedTools).toEqual([
      "read",
    ]);
    expect(() => narrowDelegationBounds(parent, { task: "t", allowedTools: ["shell"] })).toThrow(
      DelegationRejected,
    );
  });

  it("keeps the parent's executor and model pinned", () => {
    const parent = { ...wideParent, executor: "acp", executorModel: "deepseek-v4.1-flash" };
    const result = narrowDelegationBounds(parent, { task: "t", executor: "claude-code" });
    expect(result.executor).toBe("acp");
    expect(result.executorModel).toBe("deepseek-v4.1-flash");
  });
});

describe("validateDelegationRequest", () => {
  it("accepts a normal request", () => {
    expect(() => validateDelegationRequest({ task: "fix the parser" }, wideParent)).not.toThrow();
  });

  it("rejects an empty task", () => {
    expect(() => validateDelegationRequest({ task: "   " }, wideParent)).toThrow(/needs a task/i);
  });

  it("rejects a task that is really a document", () => {
    const task = "x".repeat(MAX_DELEGATION_PROMPT_CHARS + 1);
    expect(() => validateDelegationRequest({ task }, wideParent)).toThrow(/limit/i);
  });

  it("rejects paths that leave the repository", () => {
    for (const path of ["../outside/**", "/etc/**", "C:/Windows/**", "src/../../x/**"]) {
      expect(() => validateDelegationRequest({ task: "t", allowedPaths: [path] }, wideParent)).toThrow(
        /inside the repository/i,
      );
    }
  });

  it("rejects switching executor or model away from the parent's pin", () => {
    const pinned = { ...wideParent, executor: "acp", executorModel: "deepseek-v4.1-flash" };
    expect(() =>
      validateDelegationRequest({ task: "t", executor: "claude-code" }, pinned),
    ).toThrow(/may not switch executor/i);
    expect(() =>
      validateDelegationRequest({ task: "t", executorModel: "gpt-5" }, pinned),
    ).toThrow(/may not switch model/i);
  });

  it("rejects a non-numeric timeout", () => {
    expect(() =>
      validateDelegationRequest({ task: "t", timeoutMs: Number.NaN }, wideParent),
    ).toThrow(/timeoutMs/i);
  });
});

describe("rootDelegationBounds", () => {
  it("defaults to the widest budget so a top-level run is not silently capped", () => {
    expect(rootDelegationBounds().timeoutMs).toBe(MAX_DELEGATION_TIMEOUT_MS);
  });

  it("carries the user's scope through as the ceiling", () => {
    const root = rootDelegationBounds({
      allowedPaths: ["src/**"],
      testCommands: ["npm test"],
      timeoutMs: 120_000,
    });
    expect(root.allowedPaths).toEqual(["src/**"]);
    expect(root.testCommands).toEqual(["npm test"]);
    expect(root.timeoutMs).toBe(120_000);
  });

  it("clamps an over-large timeout instead of trusting it", () => {
    expect(rootDelegationBounds({ timeoutMs: 10_000_000 }).timeoutMs).toBe(MAX_DELEGATION_TIMEOUT_MS);
  });
});
