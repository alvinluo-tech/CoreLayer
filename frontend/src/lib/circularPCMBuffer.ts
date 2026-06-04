/**
 * Circular PCM buffer for voice pre-buffering.
 *
 * During TTS playback, microphone audio chunks are continuously written here.
 * On barge-in, the buffered audio (last ~300ms) is flushed and sent to ASR
 * so the beginning of the user's interruption is not lost.
 */

export interface CircularPCMBufferConfig {
  /** Maximum number of chunks to keep in the ring buffer */
  maxChunks: number;
}

export const DEFAULT_CIRCULAR_BUFFER_CONFIG: CircularPCMBufferConfig = {
  maxChunks: 20, // ~500ms at 25ms per chunk (4096 samples @ 16kHz)
};

export class CircularPCMBuffer {
  private buffer: Float32Array[];
  private writeIndex = 0;
  private count = 0;
  private maxChunks: number;

  constructor(config?: Partial<CircularPCMBufferConfig>) {
    const cfg = { ...DEFAULT_CIRCULAR_BUFFER_CONFIG, ...config };
    this.maxChunks = cfg.maxChunks;
    this.buffer = new Array(this.maxChunks);
  }

  /**
   * Push a PCM chunk into the ring buffer.
   * Overwrites the oldest chunk when full.
   */
  push(chunk: Float32Array): void {
    this.buffer[this.writeIndex] = new Float32Array(chunk);
    this.writeIndex = (this.writeIndex + 1) % this.maxChunks;
    if (this.count < this.maxChunks) {
      this.count++;
    }
  }

  /**
   * Flush all buffered chunks in chronological order.
   * Returns a copy — the buffer is cleared after flushing.
   */
  flush(): Float32Array[] {
    if (this.count === 0) return [];

    const result: Float32Array[] = [];
    const startIndex = (this.writeIndex - this.count + this.maxChunks) % this.maxChunks;

    for (let i = 0; i < this.count; i++) {
      const idx = (startIndex + i) % this.maxChunks;
      const chunk = this.buffer[idx];
      if (chunk) {
        result.push(new Float32Array(chunk));
      }
    }

    this.clear();
    return result;
  }

  /**
   * Clear the buffer without returning data.
   */
  clear(): void {
    this.buffer = new Array(this.maxChunks);
    this.writeIndex = 0;
    this.count = 0;
  }

  /**
   * Number of chunks currently buffered.
   */
  get size(): number {
    return this.count;
  }

  /**
   * Whether the buffer is empty.
   */
  get isEmpty(): boolean {
    return this.count === 0;
  }
}
