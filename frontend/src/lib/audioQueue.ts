export class AudioQueueManager {
  private audioCtx: AudioContext;
  private ttsUrl: string;
  private voice: string;
  private buffers: Map<number, AudioBuffer> = new Map();
  private nextPlayIndex = 0;
  private totalExpected = 0;
  private pending = 0;
  private currentSource: AudioBufferSourceNode | null = null;
  private stopped = false;
  private completionResolve: (() => void) | null = null;

  constructor(ttsUrl: string, voice = "茉莉") {
    this.audioCtx = new AudioContext();
    this.ttsUrl = ttsUrl;
    this.voice = voice;
  }

  setTotalExpected(count: number) {
    this.totalExpected = count;
  }

  enqueue(sentence: string, index: number) {
    if (this.stopped) return;
    this.pending++;
    this.synthesize(sentence)
      .then((buffer) => {
        if (this.stopped) return;
        this.buffers.set(index, buffer);
        this.tryPlay();
      })
      .catch((err) => {
        console.error(`[AudioQueue] TTS failed for chunk ${index}:`, err);
      })
      .finally(() => {
        this.pending--;
      });
  }

  private async synthesize(text: string): Promise<AudioBuffer> {
    // Replace non-standard English word "luo" (case-insensitive) with Chinese character "骆" so TTS pronounces it naturally instead of spelling out L-U-O
    const cleanedText = text.replace(/\bluo\b/gi, "骆");

    const response = await fetch(this.ttsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanedText, model: "mimo-v2.5-tts", voice: this.voice }),
    });
    if (!response.ok) {
      throw new Error(`TTS error ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return this.audioCtx.decodeAudioData(arrayBuffer);
  }

  private tryPlay() {
    if (this.stopped) return;
    if (this.currentSource) return; // already playing

    const buffer = this.buffers.get(this.nextPlayIndex);
    if (!buffer) return; // next buffer not ready yet

    this.buffers.delete(this.nextPlayIndex);
    this.nextPlayIndex++;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);
    this.currentSource = source;

    source.onended = () => {
      this.currentSource = null;
      this.tryPlay();
      this.checkCompletion();
    };

    source.start();
  }

  private checkCompletion() {
    if (
      this.pending === 0 &&
      this.buffers.size === 0 &&
      !this.currentSource &&
      this.nextPlayIndex >= this.totalExpected &&
      this.completionResolve
    ) {
      this.completionResolve();
    }
  }

  waitForCompletion(): Promise<void> {
    if (
      this.pending === 0 &&
      this.buffers.size === 0 &&
      !this.currentSource &&
      this.nextPlayIndex >= this.totalExpected
    ) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.completionResolve = resolve;
    });
  }

  stop() {
    this.stopped = true;
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {}
      this.currentSource = null;
    }
    this.buffers.clear();
    if (this.completionResolve) {
      this.completionResolve();
      this.completionResolve = null;
    }
  }

  get isPlaying(): boolean {
    return this.currentSource !== null;
  }

  dispose() {
    this.stop();
    this.audioCtx.close().catch(() => {});
  }
}
