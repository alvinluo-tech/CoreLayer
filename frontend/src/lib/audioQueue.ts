import { voiceProfileManager } from './voiceProfile.js';

export class AudioQueueManager {
  private audioCtx: AudioContext;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private ttsUrl: string;
  private voice: string;
  private model: string;
  private buffers: Map<number, AudioBuffer> = new Map();
  private nextPlayIndex = 0;
  private totalExpected = 0;
  private pending = 0;
  private currentSource: AudioBufferSourceNode | null = null;
  private stopped = false;
  private completionResolve: (() => void) | null = null;

  constructor(ttsUrl: string, voice?: string) {
    this.audioCtx = new AudioContext();
    try {
      this.gainNode = this.audioCtx.createGain();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 32;
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    } catch {
      // Analyser creation may fail in some environments; TTS still works without it
    }
    this.ttsUrl = ttsUrl;
    this.voice = voice ?? voiceProfileManager.getVoiceName();
    this.model = voiceProfileManager.getTTSModel();
  }

  /**
   * Set playback volume (0.0 to 1.0).
   * Used for ducking during barge-in Stage 1.
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(
        Math.max(0, Math.min(1, volume)),
        this.audioCtx.currentTime
      );
    }
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
    // Replace non-standard English word "luo" (case-insensitive) with Chinese character "骆" so TTS pronounces it naturally instead of spelling out L-U-O.
    // We use positive lookahead/lookbehind assertions to ensure perfect boundary matching on mixed Chinese/English/punctuation text.
    const cleanedText = text
      .replace(/alvin\s+luo/gi, 'alvin 骆')
      .replace(/(?<![a-zA-Z])luo(?![a-zA-Z])/gi, '骆');

    const response = await fetch(this.ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanedText, model: this.model, voice: this.voice }),
    });
    if (!response.ok) {
      throw new Error(`TTS error ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx.decodeAudioData(arrayBuffer);
  }

  private tryPlay() {
    if (this.stopped) return;
    if (this.currentSource) return; // already playing

    const buffer = this.buffers.get(this.nextPlayIndex);
    if (!buffer) return; // next buffer not ready yet

    this.buffers.delete(this.nextPlayIndex);
    this.nextPlayIndex++;

    // Proactively resume AudioContext if it was suspended due to window focus loss or browser policies
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch((err) => {
        console.warn('[AudioQueue] Proactive AudioContext resume failed:', err);
      });
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    if (this.gainNode) {
      source.connect(this.gainNode);
    } else if (this.analyser) {
      source.connect(this.analyser);
    } else {
      source.connect(this.audioCtx.destination);
    }
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
      } catch {
        // Already stopped or disconnected
      }
      this.currentSource = null;
    }
    this.buffers.clear();
    if (this.completionResolve) {
      this.completionResolve();
      this.completionResolve = null;
    }
  }

  getVolume(): number {
    if (!this.analyser || this.stopped || !this.currentSource) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    return avg; // returns a number from 0 to 255
  }

  get isPlaying(): boolean {
    return this.currentSource !== null;
  }

  dispose() {
    this.stop();
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // Already disconnected
      }
      this.gainNode = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // Already disconnected
      }
      this.analyser = null;
    }
    this.audioCtx.close().catch(() => {});
  }
}
