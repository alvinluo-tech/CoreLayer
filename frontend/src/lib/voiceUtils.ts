export const HALLUCINATION_PATTERNS = [
  "请不吝点赞", "订阅", "转发", "打赏", "支持", "栏目",
  "字幕", "谢谢观看", "谢谢收看", "感谢观看", "下集",
  "拜拜", "再见", "字幕由", "制作", "敬请关注",
];

export function getSpokenText(text: string): string {
  let result = "";
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const thoughtStart = text.indexOf("<thought>", currentIndex);
    if (thoughtStart === -1) {
      result += text.slice(currentIndex);
      break;
    }

    result += text.slice(currentIndex, thoughtStart);

    const thoughtEnd = text.indexOf("</thought>", thoughtStart);
    if (thoughtEnd === -1) {
      break;
    }

    currentIndex = thoughtEnd + "</thought>".length;
  }

  return result;
}

export function playSciFiChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1108.73, now);
    osc2.frequency.exponentialRampToValueAtTime(2217.46, now + 0.2);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.8);

    osc2.start(now);
    osc2.stop(now + 0.8);
  } catch (e) {
    console.warn("Failed to play sci-fi chime programmatically:", e);
  }
}
