/**
 * Two-stage barge-in state machine (BaiLongma pattern).
 *
 * States:  idle → ducking → confirmed
 * - idle:      No voice activity detected
 * - ducking:   Voice detected for ~50ms → reduce TTS volume
 * - confirmed: Voice sustained for ~160ms → stop TTS, send pre-buffer to ASR
 *
 * The machine is pure — no side effects. The caller reads `state` and
 * `pendingAction` after each `feed()` call and acts on them.
 */

export type BargeInState = 'idle' | 'ducking' | 'confirmed';

export interface BargeInConfig {
  /** RMS volume threshold to consider "voice detected" (0-255 scale) */
  threshold: number;
  /** Milliseconds of sustained voice to trigger ducking (Stage 1) */
  duckTriggerMs: number;
  /** Milliseconds of sustained voice to confirm barge-in (Stage 2) */
  confirmMs: number;
  /** Milliseconds of silence to reset from ducking back to idle */
  silenceResetMs: number;
  /** Milliseconds of silence to trigger volume restore after ducking. Defaults to silenceResetMs */
  decayMs: number;
}

export const DEFAULT_BARGE_IN_CONFIG: BargeInConfig = {
  threshold: 62,
  duckTriggerMs: 50,
  confirmMs: 160,
  silenceResetMs: 200,
  decayMs: 200,
};

export type BargeInAction = 'none' | 'duck' | 'barge-in' | 'restore';

export class BargeInStateMachine {
  private state: BargeInState = 'idle';
  private config: BargeInConfig;
  private voiceAccumMs = 0;
  private silenceAccumMs = 0;
  private lastTimestamp: number | null = null;

  constructor(config?: Partial<BargeInConfig>) {
    const merged = { ...DEFAULT_BARGE_IN_CONFIG, ...config };
    // decayMs defaults to silenceResetMs when not explicitly provided
    if (config && !('decayMs' in config)) {
      merged.decayMs = merged.silenceResetMs;
    }
    this.config = merged;
  }

  getState(): BargeInState {
    return this.state;
  }

  reset(): void {
    this.state = 'idle';
    this.voiceAccumMs = 0;
    this.silenceAccumMs = 0;
    this.lastTimestamp = null;
  }

  /**
   * Feed a volume sample (0-255 RMS) and a timestamp (ms).
   * Returns the action the caller should take.
   */
  feed(volume: number, nowMs: number): BargeInAction {
    const elapsed = this.lastTimestamp !== null ? nowMs - this.lastTimestamp : 0;
    this.lastTimestamp = nowMs;

    const isVoice = volume >= this.config.threshold;

    switch (this.state) {
      case 'idle': {
        if (isVoice) {
          this.voiceAccumMs += elapsed;
          this.silenceAccumMs = 0;
          if (this.voiceAccumMs >= this.config.duckTriggerMs) {
            this.state = 'ducking';
            return 'duck';
          }
        } else {
          this.voiceAccumMs = 0;
        }
        return 'none';
      }

      case 'ducking': {
        if (isVoice) {
          this.voiceAccumMs += elapsed;
          this.silenceAccumMs = 0;
          if (this.voiceAccumMs >= this.config.confirmMs) {
            this.state = 'confirmed';
            return 'barge-in';
          }
        } else {
          this.silenceAccumMs += elapsed;
          if (this.silenceAccumMs >= this.config.decayMs) {
            // Decay detected: voice stopped, restore TTS volume
            this.state = 'idle';
            this.voiceAccumMs = 0;
            this.silenceAccumMs = 0;
            return 'restore';
          }
        }
        return 'none';
      }

      case 'confirmed':
        // Terminal state — caller must reset() after handling
        return 'barge-in';
    }
  }
}
