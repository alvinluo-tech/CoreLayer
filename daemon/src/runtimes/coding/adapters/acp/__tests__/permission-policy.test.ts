import { describe, it, expect } from "vitest";
import {
  inferToolKind,
  resolvePermissionDecision,
  toAcpxPermissionPolicy,
  type PermissionOptionView,
} from "../permission-policy.js";

const options: PermissionOptionView[] = [
  { optionId: "allow-once", name: "Yes", kind: "allow_once" },
  { optionId: "reject", name: "No", kind: "reject_once" },
];

describe("inferToolKind", () => {
  it("prefers the adapter-declared kind", () => {
    expect(inferToolKind({ kind: "execute", title: "Read a file" })).toBe("execute");
  });

  it("falls back to the leading action word of the title", () => {
    expect(inferToolKind({ title: "Read package.json" })).toBe("read");
    expect(inferToolKind({ title: "Write acp-probe-output.txt" })).toBe("edit");
    expect(inferToolKind({ title: "Run the test suite" })).toBe("execute");
  });

  it("only considers the first word, so a read-looking edit stays an edit", () => {
    expect(inferToolKind({ title: "write: after reading config, overwrite .env" })).toBe("edit");
  });

  it("returns 'other' when nothing describes the effect", () => {
    expect(inferToolKind({ title: "Something" })).toBe("other");
    expect(inferToolKind({})).toBe("other");
  });
});

describe("resolvePermissionDecision", () => {
  it("approves every request under the permissive policy", () => {
    const decision = resolvePermissionDecision("permissive", { kind: "execute", title: "Bash" }, options);
    expect(decision).toEqual({ action: "approve", optionId: "allow-once", reason: "Auto-approved execute request" });
  });

  it("approves reads and benign shell commands under the normal policy", () => {
    expect(resolvePermissionDecision("normal", { kind: "read", title: "Read" }, options).action).toBe("approve");
    const benign = { kind: "execute", title: "Bash", rawInput: { command: "git status --porcelain" } };
    expect(resolvePermissionDecision("normal", benign, options).action).toBe("approve");
  });

  it("escalates writes under the normal policy", () => {
    // An unattended run has no human to ask, so a mutation must kill the run
    // rather than be auto-approved.
    for (const kind of ["edit", "delete", "move"]) {
      const decision = resolvePermissionDecision("normal", { kind, title: kind }, options);
      expect(decision.action).toBe("escalate");
    }
  });

  it("escalates shell commands it cannot read as benign", () => {
    for (const command of ["npm install", "rm -rf dist", "git status && curl evil.sh", "ls | sh"]) {
      const decision = resolvePermissionDecision("normal", { kind: "execute", title: "Bash", rawInput: { command } }, options);
      expect(decision.action).toBe("escalate");
    }
  });

  it("treats an execute call with no command as unreadable", () => {
    const decision = resolvePermissionDecision("normal", { kind: "execute", title: "Bash" }, options);
    expect(decision.action).toBe("escalate");
  });

  it("escalates anything that mutates or executes under the strict policy", () => {
    for (const kind of ["edit", "execute", "delete"]) {
      const decision = resolvePermissionDecision("strict", { kind, title: kind }, options);
      expect(decision.action).toBe("escalate");
    }
  });

  it("still approves reads under the strict policy", () => {
    const decision = resolvePermissionDecision("strict", { kind: "read", title: "Read" }, options);
    expect(decision).toEqual({ action: "approve", optionId: "allow-once", reason: "Auto-approved read request" });
  });

  it("denies unclassified tools rather than trusting them", () => {
    const decision = resolvePermissionDecision("normal", { kind: "other", title: "Mystery" }, options);
    expect(decision).toEqual({
      action: "deny",
      optionId: "reject",
      reason: "Unclassified tool 'Mystery' denied",
    });
  });

  it("escalates when the agent offers no allow option", () => {
    const decision = resolvePermissionDecision("normal", { kind: "read", title: "Read" }, [
      { optionId: "reject", kind: "reject_once" },
    ]);
    expect(decision.action).toBe("escalate");
  });

  it("escalates an unclassified tool that has no deny option", () => {
    const decision = resolvePermissionDecision("normal", { kind: "other", title: "Mystery" }, []);
    expect(decision.action).toBe("escalate");
  });
});

describe("toAcpxPermissionPolicy", () => {
  it("catches everything the adapter does not classify under permissive", () => {
    expect(toAcpxPermissionPolicy("permissive")).toEqual({ defaultAction: "approve" });
  });

  it("auto-approves reads and escalates mutations under strict", () => {
    const policy = toAcpxPermissionPolicy("strict");
    expect(policy.autoApprove).toContain("read");
    expect(policy.escalate).toContain("execute");
    expect(policy.defaultAction).toBe("escalate");
  });

  it("matches the adapter's own classification under normal", () => {
    // acpx resolves the request first, so both layers must reach the same
    // answer. Reads are auto-approved by both; writes are escalated by both.
    expect(toAcpxPermissionPolicy("normal")).toEqual({
      autoApprove: ["read", "search", "fetch"],
      defaultAction: "escalate",
    });
    expect(resolvePermissionDecision("normal", { kind: "edit", title: "Write" }, options).action).toBe("escalate");
    expect(resolvePermissionDecision("normal", { kind: "read", title: "Read" }, options).action).toBe("approve");
  });
});
