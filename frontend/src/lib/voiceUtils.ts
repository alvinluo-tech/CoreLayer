export const HALLUCINATION_PATTERNS = [
  '请不吝点赞',
  '订阅',
  '转发',
  '打赏',
  '支持',
  '栏目',
  '字幕',
  '谢谢观看',
  '谢谢收看',
  '感谢观看',
  '下集',
  '拜拜',
  '再见',
  '字幕由',
  '制作',
  '敬请关注',
];

/** ASR noise patterns - common non-speech artifacts from speech recognition */
export const ASR_NOISE_PATTERNS: RegExp[] = [
  /^[啊哈嗯哦额呃嘢唉哎哟噢]+$/, // Pure filler syllables
  /^[。，、！？….,!?]+$/, // Punctuation only
  /^[\s]+$/, // Whitespace only
  /^[0-9]+$/, // Digits only (ASR misfire)
  /^[a-z]$/i, // Single letter
  /(.)\1{2,}/, // 3+ consecutive identical characters (e.g., "啊啊啊")
];

/** Maximum characters for voice response before truncation */
export const VOICE_MAX_CHARS = 200;

/** Check if ASR result is noise (single filler characters, repeated noise) */
export function isASRNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return ASR_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Filter noise from multiple ASR results */
export function filterASRNoise(results: string[]): string[] {
  return results.filter((r) => !isASRNoise(r));
}

/** Check if ASR result is a hallucination (known spam phrases) */
export function isASRHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return HALLUCINATION_PATTERNS.some((p) => trimmed.includes(p));
}

/** Max retry attempts for hallucination detection */
const ASR_MAX_RETRIES = 1;

/**
 * Transcribe with retry on hallucination.
 * If the first transcription matches a hallucination pattern, retries once.
 * @param transcribeFn - The actual transcription function
 * @returns The transcribed text, or empty string if all attempts are hallucinations
 */
export async function transcribeWithRetry(transcribeFn: () => Promise<string>): Promise<string> {
  for (let attempt = 0; attempt <= ASR_MAX_RETRIES; attempt++) {
    const text = await transcribeFn();
    if (!text || !isASRHallucination(text)) {
      return text;
    }
    // Hallucination detected, retry if we haven't exhausted retries
  }
  return '';
}

/** Strip markdown formatting for voice output */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/\[.+?\]\(.+?\)/g, '') // links
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^[-*]\s+/gm, '') // bullet lists
    .replace(/^\d+\.\s+/gm, '') // numbered lists
    .replace(/^>\s+/gm, '') // blockquotes
    .replace(/\n{2,}/g, '\n') // collapse blank lines
    .trim();
}

/** Truncate voice response to maxChars, trying to end at sentence boundary */
export function truncateVoiceResponse(text: string, maxChars: number = VOICE_MAX_CHARS): string {
  if (!text) return text;

  const stripped = stripMarkdown(text);
  if (stripped.length <= maxChars) return stripped;

  // Try to truncate at sentence boundary
  const sentenceEnders = /[。！？.,!?]/;
  let cutPoint = -1;
  for (let i = maxChars - 1; i >= Math.floor(maxChars * 0.6); i--) {
    const char = stripped[i];
    if (char !== undefined && sentenceEnders.test(char)) {
      cutPoint = i + 1;
      break;
    }
  }

  if (cutPoint === -1) cutPoint = maxChars;
  return stripped.slice(0, cutPoint) + '...';
}

export function getSpokenText(text: string): string {
  let result = '';
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const thoughtStart = text.indexOf('<thought>', currentIndex);
    if (thoughtStart === -1) {
      result += text.slice(currentIndex);
      break;
    }

    result += text.slice(currentIndex, thoughtStart);

    const thoughtEnd = text.indexOf('</thought>', thoughtStart);
    if (thoughtEnd === -1) {
      break;
    }

    currentIndex = thoughtEnd + '</thought>'.length;
  }

  return result;
}

export function playSciFiChime() {
  try {
    const ctx = new (
      window.AudioContext ||
      ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)
    )();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
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
    console.warn('Failed to play sci-fi chime programmatically:', e);
  }
}
