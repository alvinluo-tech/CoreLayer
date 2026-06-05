import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./tts.js", () => ({
  synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("fake-audio")),
}));

vi.mock("../utils/errors.js", () => ({
  logError: vi.fn(),
}));

import { StreamingTTS, splitIntoSentences } from "./streaming-tts.js";
import { synthesizeSpeech } from "./tts.js";

const mockSynthesize = vi.mocked(synthesizeSpeech);

describe("splitIntoSentences", () => {
  it("should split Chinese text on sentence boundaries", () => {
    const result = splitIntoSentences("你好吗？我很好。谢谢！");
    expect(result).toEqual(["你好吗？", "我很好。", "谢谢！"]);
  });

  it("should split English text on sentence boundaries", () => {
    const result = splitIntoSentences("Hello. How are you? Fine!");
    expect(result).toEqual(["Hello.", "How are you?", "Fine!"]);
  });

  it("should handle mixed Chinese and English", () => {
    const result = splitIntoSentences("Hello你好。How are you?");
    expect(result).toEqual(["Hello你好。", "How are you?"]);
  });

  it("should keep short fragments together when no boundary", () => {
    const result = splitIntoSentences("Hello world");
    expect(result).toEqual(["Hello world"]);
  });

  it("should handle newlines as boundaries", () => {
    const result = splitIntoSentences("Line one\nLine two\n");
    expect(result).toEqual(["Line one", "Line two"]);
  });

  it("should filter out single-char fragments", () => {
    const result = splitIntoSentences("a。b。");
    // "a。" is 2 chars = MIN_CHUNK_CHARS, so it passes
    expect(result).toEqual(["a。", "b。"]);
  });

  it("should handle empty string", () => {
    const result = splitIntoSentences("");
    expect(result).toEqual([]);
  });
});

describe("StreamingTTS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesize.mockResolvedValue(Buffer.from("fake-audio"));
  });

  it("should emit audio for complete sentences", async () => {
    const stt = new StreamingTTS();
    const chunks: { text: string; index: number }[] = [];
    stt.onAudio((chunk) => chunks.push({ text: chunk.text, index: chunk.index }));

    stt.feed("你好吗？我很好。");
    const result = await stt.flush();

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].index).toBe(0);
    expect(chunks[1].index).toBe(1);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("should accumulate partial text until sentence boundary", async () => {
    const stt = new StreamingTTS();
    const chunks: string[] = [];
    stt.onAudio((chunk) => chunks.push(chunk.text));

    // Feed partial text - should not trigger synthesis yet
    stt.feed("你好吗");
    expect(chunks).toHaveLength(0);

    // Feed sentence boundary - should trigger synthesis
    stt.feed("？我很好。");
    await stt.flush();

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.some((c) => c.includes("你好吗"))).toBe(true);
  });

  it("should flush remaining text on flush()", async () => {
    const stt = new StreamingTTS();
    const chunks: string[] = [];
    stt.onAudio((chunk) => chunks.push(chunk.text));

    stt.feed("这是一段没有标点的长文本需要在flush时处理");
    await stt.flush();

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("这是一段没有标点的长文本");
  });

  it("should handle multiple deltas incrementally", async () => {
    const stt = new StreamingTTS();
    const chunks: string[] = [];
    stt.onAudio((chunk) => chunks.push(chunk.text));

    stt.feed("第一句。");
    stt.feed("第二句。");
    stt.feed("第三句。");
    await stt.flush();

    expect(chunks).toHaveLength(3);
  });

  it("should not emit after close", async () => {
    const stt = new StreamingTTS();
    const chunks: string[] = [];
    stt.onAudio((chunk) => chunks.push(chunk.text));

    stt.feed("一些文本。");
    await stt.flush();

    // Feed after flush should be ignored
    stt.feed("更多文本。");
    await stt.flush();

    // Should not have more chunks from the second feed
    expect(chunks).toHaveLength(1);
  });

  it("should pass TTS options to synthesizeSpeech", async () => {
    const stt = new StreamingTTS({ voice: "茉莉", speed: 1.2 });
    stt.onAudio(() => {});
    stt.feed("测试语音选项。");
    await stt.flush();

    expect(mockSynthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: "茉莉",
        speed: 1.2,
      }),
    );
  });

  it("should handle synthesis errors gracefully", async () => {
    mockSynthesize.mockRejectedValueOnce(new Error("TTS API error"));

    const stt = new StreamingTTS();
    const chunks: string[] = [];
    stt.onAudio((chunk) => chunks.push(chunk.text));

    stt.feed("这句会失败。这句会成功。");
    await stt.flush();

    // One chunk should fail, the other should succeed
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("should return chunks in order from flush()", async () => {
    const stt = new StreamingTTS();
    stt.onAudio(() => {});

    stt.feed("第一句。第二句。第三句。");
    const result = await stt.flush();

    expect(result).toHaveLength(3);
    expect(result[0].index).toBe(0);
    expect(result[1].index).toBe(1);
    expect(result[2].index).toBe(2);
  });
});
