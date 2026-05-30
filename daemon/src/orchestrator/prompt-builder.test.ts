import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt-builder.js";

describe("Prompt Builder", () => {
  it("should build a text system prompt with current date", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("Jarvis");
    expect(prompt).toContain("任务");
    expect(prompt).toContain("阅读清单");
    expect(prompt).toContain("中文");

    // Should contain today's date
    const today = new Date().toISOString().split("T")[0];
    expect(prompt).toContain(today);
  });

  it("should build a voice system prompt with speech guidelines", () => {
    const prompt = buildSystemPrompt("voice");

    expect(prompt).toContain("语音对话");
    expect(prompt).toContain("Jarvis");
    // Voice mode should forbid markdown and emojis
    expect(prompt).toContain("Markdown");
    expect(prompt).toContain("Emoji");

    const today = new Date().toISOString().split("T")[0];
    expect(prompt).toContain(today);
  });

  it("text and voice prompts are different", () => {
    const text = buildSystemPrompt("text");
    const voice = buildSystemPrompt("voice");
    expect(text).not.toBe(voice);
  });
});
