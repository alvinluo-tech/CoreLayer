import { synthesizeSpeech, type TTSOptions } from "./tts.js";
import { logError } from "../../utils/errors.js";

/**
 * Sentence-level streaming TTS.
 *
 * Accumulates text from LLM streaming output, detects complete sentences,
 * and synthesizes audio in parallel. Designed for low first-play latency.
 *
 * Usage:
 *   const stt = new StreamingTTS(options);
 *   stt.onAudio((chunk) => sendToClient(chunk));
 *   for await (const delta of llmStream) stt.feed(delta);
 *   await stt.flush();
 */

// Sentence-ending punctuation for Chinese and English
const SENTENCE_BOUNDARY = /([。！？.!?\n]+)/g;

// Minimum characters to accumulate before attempting sentence detection.
// Chinese sentences can be short (e.g. "你好吗？" = 4 chars), so keep this low.
const MIN_CHUNK_CHARS = 2;

export interface StreamingTTSChunk {
  /** The sentence text that was synthesized */
  text: string;
  /** Audio buffer (WAV) */
  audio: Buffer;
  /** Index of this chunk (0-based) */
  index: number;
}

export interface StreamingTTSOptions {
  /** TTS model to use */
  model?: string;
  /** Voice preset */
  voice?: string;
  /** Playback speed */
  speed?: number;
}

type AudioCallback = (chunk: StreamingTTSChunk) => void;

export class StreamingTTS {
  private buffer = "";
  private chunks: StreamingTTSChunk[] = [];
  private pending: Promise<void>[] = [];
  private index = 0;
  private callback: AudioCallback | null = null;
  private options: StreamingTTSOptions;
  private closed = false;

  constructor(options: StreamingTTSOptions = {}) {
    this.options = options;
  }

  /** Register callback for synthesized audio chunks. */
  onAudio(callback: AudioCallback): void {
    this.callback = callback;
  }

  /**
   * Feed a text delta from the LLM stream.
   * Detects complete sentences and triggers parallel synthesis.
   */
  feed(delta: string): void {
    if (this.closed) return;
    this.buffer += delta;
    this.processBuffer(false);
  }

  /**
   * Flush remaining text after stream ends.
   * Returns when all pending synthesis completes.
   */
  async flush(): Promise<StreamingTTSChunk[]> {
    this.closed = true;
    this.processBuffer(true);

    // Wait for all pending synthesis
    await Promise.all(this.pending);

    // Return chunks in order
    return this.chunks.sort((a, b) => a.index - b.index);
  }

  /**
   * Process the buffer, extracting complete sentences.
   * @param force - If true, flush remaining text even without sentence boundary.
   */
  private processBuffer(force: boolean): void {
    if (this.buffer.length < MIN_CHUNK_CHARS && !force) return;

    const sentences = this.extractSentences(this.buffer, force);

    for (const sentence of sentences) {
      if (!sentence.trim()) continue;

      const idx = this.index++;
      const ttsOptions: TTSOptions = {
        text: sentence.trim(),
        model: this.options.model as TTSOptions["model"],
        voice: this.options.voice,
        speed: this.options.speed,
      };

      // Fire-and-forget synthesis with concurrency control
      const task = this.synthesizeAndEmit(ttsOptions, idx);
      this.pending.push(task);
    }
  }

  /**
   * Extract complete sentences from buffer.
   * Returns array of sentences and updates internal buffer with remainder.
   */
  private extractSentences(text: string, force: boolean): string[] {
    const sentences: string[] = [];
    let lastMatch = 0;

    // Split on sentence-ending punctuation
    const regex = new RegExp(SENTENCE_BOUNDARY.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const endIndex = match.index + match[0].length;
      const sentence = text.slice(lastMatch, endIndex).trim();
      if (sentence.length >= MIN_CHUNK_CHARS || force) {
        sentences.push(sentence);
        lastMatch = endIndex;
      }
    }

    // Update buffer with remaining text
    this.buffer = text.slice(lastMatch);

    // If force mode, also emit remaining buffer
    if (force && this.buffer.trim()) {
      sentences.push(this.buffer.trim());
      this.buffer = "";
    }

    return sentences;
  }

  /**
   * Synthesize a single sentence and emit via callback.
   */
  private async synthesizeAndEmit(options: TTSOptions, idx: number): Promise<void> {
    try {
      const audio = await synthesizeSpeech(options);
      const chunk: StreamingTTSChunk = {
        text: options.text,
        audio,
        index: idx,
      };
      this.chunks.push(chunk);
      this.callback?.(chunk);
    } catch (err) {
      logError("StreamingTTS/synthesize", `Failed to synthesize chunk ${idx}: ${err}`);
    }
  }
}

/**
 * Split text into sentences for batch TTS synthesis.
 * Used by the non-streaming synthesize-batch endpoint.
 */
export function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  const regex = new RegExp(SENTENCE_BOUNDARY.source, "g");
  let lastMatch = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const endIndex = match.index + match[0].length;
    const sentence = text.slice(lastMatch, endIndex).trim();
    if (sentence.length >= MIN_CHUNK_CHARS) {
      sentences.push(sentence);
    }
    lastMatch = endIndex;
  }

  const remainder = text.slice(lastMatch).trim();
  if (remainder.length >= MIN_CHUNK_CHARS) {
    sentences.push(remainder);
  }

  return sentences;
}
