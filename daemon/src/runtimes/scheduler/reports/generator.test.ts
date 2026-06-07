import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockQuery = vi.fn();
const mockArticleList = vi.fn();
const mockConvList = vi.fn();
const mockGetMessages = vi.fn();
const mockScheduledGetAll = vi.fn();
const mockScheduledUpsert = vi.fn();

vi.mock("../../../db/factory.js", () => ({
  getRepositories: vi.fn(() => ({
    tasks: { query: mockQuery },
    articles: { list: mockArticleList },
    conversations: {
      list: mockConvList,
      getMessages: mockGetMessages,
    },
    scheduledTasks: {
      getAll: mockScheduledGetAll,
      upsert: mockScheduledUpsert,
    },
  })),
}));

vi.mock("../../../utils/errors.js", () => ({
  logError: vi.fn(),
}));

const { generateDailyReport, generateWeeklyReport, registerDefaultReportSchedules } = await import("./generator.js");

beforeEach(() => {
  vi.clearAllMocks();
  // Pin to a fixed date so tests are deterministic
  vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("generateDailyReport", () => {
  it("should generate a daily report with correct date", async () => {
    mockQuery.mockResolvedValue([
      { id: "1", status: "done", dueDate: "2026-06-04T10:00:00Z", createdAt: "2026-06-04T08:00:00Z" },
      { id: "2", status: "pending", dueDate: "2026-06-04T12:00:00Z", createdAt: "2026-06-04T08:00:00Z" },
    ]);
    mockArticleList.mockResolvedValue([]);
    mockConvList.mockResolvedValue([]);

    const report = await generateDailyReport();

    expect(report).toContain("# 每日报告");
    expect(report).toContain("完成: 1 / 2");
    expect(report).toContain("完成率: 50%");
  });

  it("should return 0% completion rate when no tasks", async () => {
    mockQuery.mockResolvedValue([]);
    mockArticleList.mockResolvedValue([]);
    mockConvList.mockResolvedValue([]);

    const report = await generateDailyReport();

    expect(report).toContain("完成: 0 / 0");
    expect(report).toContain("完成率: 0%");
  });
});

describe("generateWeeklyReport", () => {
  it("should generate a weekly report with date range", async () => {
    mockQuery.mockResolvedValue([]);
    mockArticleList.mockResolvedValue([]);
    mockConvList.mockResolvedValue([]);

    const report = await generateWeeklyReport();

    expect(report).toContain("# 每周报告");
    expect(report).toContain("~");
  });

  it("should include conversation highlights when available", async () => {
    mockQuery.mockResolvedValue([]);
    mockArticleList.mockResolvedValue([]);
    mockConvList.mockResolvedValue([
      { id: "c1", createdAt: new Date().toISOString() },
    ]);
    mockGetMessages.mockResolvedValue([
      { role: "user", content: "帮我查看今天的任务" },
    ]);

    const report = await generateWeeklyReport();

    expect(report).toContain("## 对话亮点");
    expect(report).toContain("帮我查看今天的任务");
  });
});

describe("registerDefaultReportSchedules", () => {
  it("should register daily and weekly schedules when none exist", async () => {
    mockScheduledGetAll.mockResolvedValue([]);

    await registerDefaultReportSchedules();

    expect(mockScheduledUpsert).toHaveBeenCalledTimes(2);
    expect(mockScheduledUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "daily-report", cronExpr: "0 21 * * *" })
    );
    expect(mockScheduledUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "weekly-report", cronExpr: "0 21 * * 0" })
    );
  });

  it("should skip existing schedules", async () => {
    mockScheduledGetAll.mockResolvedValue([
      { name: "daily-report" },
      { name: "weekly-report" },
    ]);

    await registerDefaultReportSchedules();

    expect(mockScheduledUpsert).not.toHaveBeenCalled();
  });
});
