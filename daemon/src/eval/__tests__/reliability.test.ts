import { describe, it, expect } from "vitest";
import { compareRuns, formatReport, summarizeReliability } from "../reliability.js";

describe("summarizeReliability", () => {
  it("reports per-attempt rate and pass^k separately", () => {
    // 4 of 5 attempts succeed. pass@5 would be 1.0; pass^5 must be 0.
    const report = summarizeReliability([{ taskId: "t", outcomes: [true, true, true, true, false] }], 5);
    expect(report.meanPassRate).toBeCloseTo(0.8);
    expect(report.meanPassAll).toBe(0);
  });

  it("counts a task as reliable only when every attempt passed", () => {
    const report = summarizeReliability(
      [
        { taskId: "a", outcomes: [true, true, true] },
        { taskId: "b", outcomes: [true, true, false] },
      ],
      3,
    );
    expect(report.tasks.find((task) => task.taskId === "a")?.passAll).toBe(1);
    expect(report.tasks.find((task) => task.taskId === "b")?.passAll).toBe(0);
    expect(report.meanPassAll).toBeCloseTo(0.5);
    expect(report.meanPassRate).toBeCloseTo((1 + 2 / 3) / 2);
  });

  it("does not credit a task with fewer attempts than k", () => {
    const report = summarizeReliability([{ taskId: "a", outcomes: [true] }], 3);
    expect(report.tasks[0].passAll).toBe(0);
    expect(report.tasks[0].passRate).toBe(1);
  });

  it("collapses to the per-attempt rate when k is 1", () => {
    const report = summarizeReliability([{ taskId: "a", outcomes: [true, false] }], 1);
    expect(report.meanPassAll).toBeCloseTo(report.meanPassRate);
  });

  it("groups by tag", () => {
    const report = summarizeReliability(
      [
        { taskId: "a", outcomes: [true, true], tags: ["write"] },
        { taskId: "b", outcomes: [false, false], tags: ["write", "edit"] },
      ],
      2,
    );
    expect(report.byTag.write.tasks).toBe(2);
    expect(report.byTag.write.meanPassAll).toBeCloseTo(0.5);
    expect(report.byTag.edit.meanPassAll).toBe(0);
  });

  it("rejects a k below one", () => {
    expect(() => summarizeReliability([], 0)).toThrow(/at least 1/);
  });
});

describe("compareRuns", () => {
  const base = summarizeReliability([{ taskId: "a", outcomes: [true, true, true] }], 3);

  it("calls a large drop a regression", () => {
    const worse = summarizeReliability([{ taskId: "a", outcomes: [true, false, false] }], 3);
    expect(compareRuns(base, worse).verdict).toBe("regressed");
  });

  it("brings back no change inside the noise band", () => {
    const nearly = base;
    expect(compareRuns(base, nearly).verdict).toBe("unchanged");
  });

  it("reports the deltas it used", () => {
    const worse = summarizeReliability([{ taskId: "a", outcomes: [false, false, false] }], 3);
    const result = compareRuns(base, worse);
    expect(result.passAllDelta).toBeCloseTo(-1);
  });
});

describe("formatReport", () => {
  it("names every unreliable task with its score", () => {
    const report = summarizeReliability(
      [
        { taskId: "good", outcomes: [true, true] },
        { taskId: "flaky", outcomes: [true, false] },
      ],
      2,
    );
    const text = formatReport(report);
    expect(text).toContain("good");
    expect(text).not.toMatch(/^\s+good/m);
    expect(text).toContain("flaky  1/2");
  });
});
