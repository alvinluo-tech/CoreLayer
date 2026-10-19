import { describe, expect, it } from "vitest";
import { evaluateSkillTrust, recordExecution, FAILURE_THRESHOLD } from "../governance.js";
import type { SkillManifest, SkillExecutionRecord } from "../types.js";

function manifest(overrides: Partial<SkillManifest> = {}, history?: SkillExecutionRecord[]): SkillManifest {
  return {
    name: "test-skill",
    title: "Test",
    description: "test",
    version: "1.0.0",
    triggers: [],
    toolsUsed: [],
    risk: "low",
    steps: [],
    ...(history ? { provenance: { history } } : {}),
    ...overrides,
  };
}

function history(...outcomes: boolean[]): SkillExecutionRecord[] {
  return outcomes.map((success, i) => ({ success, executedAt: new Date(2026, 0, i + 1).toISOString() }));
}

describe("evaluateSkillTrust", () => {
  it("does not run a skill that has never been executed", () => {
    // Accumulating a skill is not evidence that it works.
    const trust = evaluateSkillTrust(manifest());
    expect(trust.auto).toBe(false);
    expect(trust.reason).toContain("no recorded successful execution");
  });

  it("runs a skill with a success record", () => {
    const trust = evaluateSkillTrust(manifest({}, history(true, true)));
    expect(trust.auto).toBe(true);
  });

  it("demotes a skill after consecutive failures", () => {
    const trust = evaluateSkillTrust(
      manifest({}, history(true, false, false, false)),
    );
    expect(trust.auto).toBe(false);
    expect(trust.reason).toContain(`${FAILURE_THRESHOLD} consecutive`);
  });

  it("keeps a skill trusted when failures are not consecutive", () => {
    const trust = evaluateSkillTrust(manifest({}, history(false, true, false, true)));
    expect(trust.auto).toBe(true);
  });

  it("honours explicit deprecation", () => {
    const trust = evaluateSkillTrust(
      manifest({ deprecatedAt: "2026-10-01T00:00:00Z", deprecationReason: "superseded" }, history(true)),
    );
    expect(trust.auto).toBe(false);
    expect(trust.reason).toContain("superseded");
  });

  it("honours suggest-only autonomy", () => {
    const trust = evaluateSkillTrust(manifest({ autonomy: "suggest" }, history(true)));
    expect(trust.auto).toBe(false);
  });

  it("never succeeds means never automatic", () => {
    const trust = evaluateSkillTrust(manifest({}, history(false, false)));
    expect(trust.auto).toBe(false);
    expect(trust.reason).toContain("never succeeded");
  });
});

describe("recordExecution", () => {
  it("appends outcomes without mutating the input manifest", () => {
    const original = manifest();
    const updated = recordExecution(original, { success: true });

    expect(original.provenance).toBeUndefined();
    expect(updated.provenance?.history).toHaveLength(1);
    expect(updated.provenance?.history?.[0].success).toBe(true);
  });

  it("bounds retained history", () => {
    let current = manifest();
    for (let i = 0; i < 30; i++) current = recordExecution(current, { success: true }, 20);

    expect(current.provenance?.history).toHaveLength(20);
  });

  it("makes a repeatedly failing skill untrusted", () => {
    let current = manifest({}, history(true));
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      current = recordExecution(current, { success: false, error: "boom" });
    }

    expect(evaluateSkillTrust(current).auto).toBe(false);
  });
});
