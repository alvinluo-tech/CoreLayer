import { describe, it, expect } from "vitest";
import { parseNlTimeToCron } from "./nl-time-parse.js";

describe("parseNlTimeToCron", () => {
  describe("relative time", () => {
    it("should parse '5分钟后'", () => {
      const result = parseNlTimeToCron("5分钟后");
      expect(result).not.toBeNull();
      // Should be a 5-part cron string
      expect(result!.split(" ").length).toBe(5);
    });

    it("should parse '2小时后'", () => {
      const result = parseNlTimeToCron("2小时后");
      expect(result).not.toBeNull();
      expect(result!.split(" ").length).toBe(5);
    });

    it("should parse '30秒后'", () => {
      const result = parseNlTimeToCron("30秒后");
      expect(result).not.toBeNull();
    });
  });

  describe("daily patterns", () => {
    it("should parse '每天早上9点'", () => {
      expect(parseNlTimeToCron("每天早上9点")).toBe("0 9 * * *");
    });

    it("should parse '每天下午3点'", () => {
      expect(parseNlTimeToCron("每天下午3点")).toBe("0 15 * * *");
    });

    it("should parse '每天晚上10点'", () => {
      expect(parseNlTimeToCron("每天晚上10点")).toBe("0 22 * * *");
    });

    it("should parse '每天下午3:30'", () => {
      expect(parseNlTimeToCron("每天下午3:30")).toBe("30 15 * * *");
    });

    it("should parse '每天凌晨2点'", () => {
      expect(parseNlTimeToCron("每天凌晨2点")).toBe("0 2 * * *");
    });

    it("should parse '每天中午12点'", () => {
      expect(parseNlTimeToCron("每天中午12点")).toBe("0 12 * * *");
    });
  });

  describe("weekly patterns", () => {
    it("should parse '每周一早上9点'", () => {
      expect(parseNlTimeToCron("每周一早上9点")).toBe("0 9 * * 1");
    });

    it("should parse '每周三下午2点'", () => {
      expect(parseNlTimeToCron("每周三下午2点")).toBe("0 14 * * 3");
    });

    it("should parse '每周五晚上8点'", () => {
      expect(parseNlTimeToCron("每周五晚上8点")).toBe("0 20 * * 5");
    });

    it("should parse '每周日早上10点'", () => {
      expect(parseNlTimeToCron("每周日早上10点")).toBe("0 10 * * 0");
    });
  });

  describe("monthly patterns", () => {
    it("should parse '每月1号早上9点'", () => {
      expect(parseNlTimeToCron("每月1号早上9点")).toBe("0 9 1 * *");
    });

    it("should parse '每月15日下午3点'", () => {
      expect(parseNlTimeToCron("每月15日下午3点")).toBe("0 15 15 * *");
    });
  });

  describe("interval patterns", () => {
    it("should parse '每5分钟'", () => {
      expect(parseNlTimeToCron("每5分钟")).toBe("*/5 * * * *");
    });

    it("should parse '每2小时'", () => {
      expect(parseNlTimeToCron("每2小时")).toBe("0 */2 * * *");
    });

    it("should parse '每3天'", () => {
      expect(parseNlTimeToCron("每3天")).toBe("0 0 */3 * *");
    });
  });

  describe("unparseable input", () => {
    it("should return null for empty string", () => {
      expect(parseNlTimeToCron("")).toBeNull();
    });

    it("should return null for random text", () => {
      expect(parseNlTimeToCron("hello world")).toBeNull();
    });

    it("should return null for incomplete expression", () => {
      expect(parseNlTimeToCron("每天")).toBeNull();
    });
  });
});
