import { describe, it, expect } from "vitest";
import { extractTimeClues, mapToDateTimeRange } from "./temporal-memory.js";

describe("extractTimeClues", () => {
  it("extracts 'yesterday'", () => {
    const clues = extractTimeClues("我昨天说的那个项目");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("昨天");
  });

  it("extracts 'last week'", () => {
    const clues = extractTimeClues("上周的会议记录在哪里");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("上周");
  });

  it("extracts 'last month'", () => {
    const clues = extractTimeClues("上个月的报告");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("上个月");
  });

  it("extracts 'today'", () => {
    const clues = extractTimeClues("今天做了什么");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("今天");
  });

  it("extracts 'this week'", () => {
    const clues = extractTimeClues("这周的任务完成了吗");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("这周");
  });

  it("extracts 'N days ago'", () => {
    const clues = extractTimeClues("3天前我们讨论过");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("3天前");
  });

  it("extracts 'earlier this month'", () => {
    const clues = extractTimeClues("这个月早些时候");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("这个月");
  });

  it("extracts specific date like '3月15日'", () => {
    const clues = extractTimeClues("3月15日的会议");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("3月15日");
  });

  it("extracts 'last year'", () => {
    const clues = extractTimeClues("去年的年终总结");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("去年");
  });

  it("extracts 'this year'", () => {
    const clues = extractTimeClues("今年的目标");
    expect(clues).toHaveLength(1);
    expect(clues[0].original).toBe("今年");
  });

  it("returns empty for no time clues", () => {
    const clues = extractTimeClues("请帮我写一个函数");
    expect(clues).toHaveLength(0);
  });

  it("extracts multiple time clues", () => {
    const clues = extractTimeClues("从上周到这周的任务");
    expect(clues.length).toBeGreaterThanOrEqual(2);
  });
});

describe("mapToDateTimeRange", () => {
  const now = new Date("2026-06-04T12:00:00.000Z");

  it("maps 'yesterday' to correct range", () => {
    const range = mapToDateTimeRange("昨天", now);
    expect(range.start).toBe("2026-06-03T00:00:00.000Z");
    expect(range.end).toBe("2026-06-03T23:59:59.999Z");
  });

  it("maps 'today' to correct range", () => {
    const range = mapToDateTimeRange("今天", now);
    expect(range.start).toBe("2026-06-04T00:00:00.000Z");
    expect(range.end).toBe("2026-06-04T23:59:59.999Z");
  });

  it("maps 'last week' to correct range", () => {
    const range = mapToDateTimeRange("上周", now);
    expect(range.start).toBe("2026-05-25T00:00:00.000Z");
    expect(range.end).toBe("2026-05-31T23:59:59.999Z");
  });

  it("maps 'this week' to correct range", () => {
    const range = mapToDateTimeRange("这周", now);
    // This week starts on Monday (June 1 is Monday in 2026)
    expect(range.start).toBe("2026-06-01T00:00:00.000Z");
    expect(range.end).toBe("2026-06-07T23:59:59.999Z");
  });

  it("maps 'last month' to correct range", () => {
    const range = mapToDateTimeRange("上个月", now);
    expect(range.start).toBe("2026-05-01T00:00:00.000Z");
    expect(range.end).toBe("2026-05-31T23:59:59.999Z");
  });

  it("maps '3天前' to correct range", () => {
    const range = mapToDateTimeRange("3天前", now);
    expect(range.start).toBe("2026-06-01T00:00:00.000Z");
    expect(range.end).toBe("2026-06-01T23:59:59.999Z");
  });

  it("maps '去年' to correct range", () => {
    const range = mapToDateTimeRange("去年", now);
    expect(range.start).toBe("2025-01-01T00:00:00.000Z");
    expect(range.end).toBe("2025-12-31T23:59:59.999Z");
  });
});
