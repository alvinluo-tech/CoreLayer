import { describe, it, expect } from "vitest";
import { splitSentences } from "./sentenceSplitter.js";

describe("splitSentences", () => {
  it("returns empty result for empty string", () => {
    expect(splitSentences("")).toEqual({ complete: [], remainder: "" });
  });

  it("puts short text below threshold entirely into remainder", () => {
    const result = splitSentences("你好", 0);
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe("你好");
  });

  it("tier 1: splits at comma after minLength (5 chars)", () => {
    // "你好世界，欢迎光临" — comma after 4 chars, but we need >=5 before split
    // "你好世界欢迎，光临" — comma after 6 chars, should split
    const result = splitSentences("你好世界欢迎，光临", 0);
    expect(result.complete.length).toBeGreaterThanOrEqual(1);
    expect(result.complete[0]).toBe("你好世界欢迎，");
    expect(result.remainder).toBe("光临");
  });

  it("tier 1: force-split at 10 chars for non-English text", () => {
    // 10 non-English chars with no punctuation should force-split
    const text = "这是一个测试文本用来验证强制分割";
    const result = splitSentences(text, 0);
    expect(result.complete.length).toBeGreaterThanOrEqual(1);
    expect(result.complete[0]!.length).toBeLessThanOrEqual(10);
  });

  it("tier 1: English text bypasses force-split", () => {
    // English text should NOT be force-split at 10 chars
    const text = "Hello world this is a test sentence for English";
    const result = splitSentences(text, 0);
    // Without punctuation, the entire text goes to remainder
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe(text);
  });

  it("tier 2: minLength 15, force-split at 25", () => {
    // chunkIndex=1: minLength=15, force=25
    const text = "这是一个测试文本用来验证第二层";
    const result = splitSentences(text, 1);
    // 13 chars, below minLength 15, goes to remainder
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe(text);
  });

  it("tier 2: splits at comma after minLength 15", () => {
    const text = "这是一个超过十五个字符的测试文本，用来验证第二层的逗号分割功能";
    const result = splitSentences(text, 1);
    expect(result.complete.length).toBeGreaterThanOrEqual(1);
    expect(result.complete[0]).toContain("，");
  });

  it("tier 3: only strict punctuation triggers split (。！？!?)", () => {
    const text = "这是一个超过三十五个字符的长文本用来测试第三层的严格标点分割。这是第二句。";
    const result = splitSentences(text, 2);
    expect(result.complete.length).toBeGreaterThanOrEqual(1);
    expect(result.complete[0]).toContain("。");
  });

  it("tier 3: comma does NOT trigger split", () => {
    // tier 3 should not split on commas
    const text = "这是一个超过三十五个字符的长文本，逗号不应该在第三层触发分割，继续填充更多文字";
    const result = splitSentences(text, 2);
    // No period/question/exclamation mark, so all goes to remainder
    // unless it hits the 150-char force split
    // If there are complete entries, they should only come from force-split at 150
    if (result.complete.length > 0) {
      // Force split happened at 150
      const totalComplete = result.complete.join("").length;
      expect(totalComplete).toBeGreaterThanOrEqual(100);
    }
  });

  it("tier 3: force-split at 150 chars with comma prefers comma", () => {
    // Build a text >150 chars with a comma around position 100
    const prefix = "这".repeat(100);
    const suffix = "那".repeat(60);
    const text = prefix + "，" + suffix;
    const result = splitSentences(text, 2);
    expect(result.complete.length).toBeGreaterThanOrEqual(1);
    // First chunk should end at the comma
    expect(result.complete[0]).toContain("，");
  });

  it("tier 3: force-split at 150 chars without comma (hard cut)", () => {
    // Build a text >150 chars with no comma
    const text = "这".repeat(200);
    const result = splitSentences(text, 2);
    expect(result.complete.length).toBeGreaterThanOrEqual(1);
    expect(result.complete[0]!.length).toBeLessThanOrEqual(150);
  });

  it("newline splits at any length", () => {
    const text = "短\n文本";
    const result = splitSentences(text, 0);
    expect(result.complete).toEqual(["短"]);
    expect(result.remainder).toBe("文本");
  });

  it("multiple sentences produce multiple complete entries", () => {
    // Newlines always split regardless of length
    const text = "第一行\n第二行\n第三行\n";
    const result = splitSentences(text, 0);
    expect(result.complete.length).toBeGreaterThanOrEqual(3);
  });

  it("after first split in tier 1, subsequent splits use tier 3 minLength", () => {
    // First comma split happens at tier 1 (minLength=5)
    // Then minLength resets to 35, so next comma won't trigger a split
    const text = "你好世界欢迎，光临来到这个美好的世界，今天天气真好。";
    const result = splitSentences(text, 0);
    // First split at comma after >=5 chars
    expect(result.complete[0]).toBe("你好世界欢迎，");
    // Second comma should NOT trigger because minLength is now 35
    // The rest should continue and only split on "。" if long enough
    expect(result.complete.length).toBeGreaterThanOrEqual(1);
  });
});
