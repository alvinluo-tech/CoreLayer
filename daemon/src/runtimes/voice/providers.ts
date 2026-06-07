/**
 * Voice provider abstraction layer.
 *
 * Defines unified interfaces for TTS and ASR providers,
 * enabling easy switching between Groq Whisper, MiMo TTS,
 * Web API, and future providers.
 */

// ---- ASR (Speech-to-Text) ----

export interface ASROptions {
  /** Audio file buffer */
  audio: Buffer;
  /** Original filename (used to determine format) */
  filename?: string;
  /** Language hint (e.g., "zh", "en") */
  language?: string;
}

export interface ASRResult {
  text: string;
  language?: string;
  duration?: number;
  /** Provider that handled the transcription */
  provider: string;
}

export interface ASRProvider {
  /** Provider name for logging/config */
  readonly name: string;
  /** Check if this provider is available (credentials configured) */
  isAvailable(): boolean;
  /** Transcribe audio to text */
  transcribe(options: ASROptions): Promise<ASRResult>;
}

// ---- TTS (Text-to-Speech) ----

export interface TTSOptions {
  text: string;
  voice?: string;
  speed?: number;
}

export interface TTSResult {
  audio: Buffer;
  /** Provider that synthesized the audio */
  provider: string;
}

export interface TTSProvider {
  /** Provider name for logging/config */
  readonly name: string;
  /** Check if this provider is available (credentials configured) */
  isAvailable(): boolean;
  /** Synthesize text to audio buffer */
  synthesize(options: TTSOptions): Promise<TTSResult>;
}

// ---- Provider Registry ----

class ProviderRegistry {
  private asrProviders = new Map<string, ASRProvider>();
  private ttsProviders = new Map<string, TTSProvider>();

  registerASR(provider: ASRProvider): void {
    this.asrProviders.set(provider.name, provider);
  }

  registerTTS(provider: TTSProvider): void {
    this.ttsProviders.set(provider.name, provider);
  }

  getASR(name: string): ASRProvider | undefined {
    return this.asrProviders.get(name);
  }

  getTTS(name: string): TTSProvider | undefined {
    return this.ttsProviders.get(name);
  }

  /** Get all available ASR providers */
  getAvailableASR(): ASRProvider[] {
    return Array.from(this.asrProviders.values()).filter((p) => p.isAvailable());
  }

  /** Get all available TTS providers */
  getAvailableTTS(): TTSProvider[] {
    return Array.from(this.ttsProviders.values()).filter((p) => p.isAvailable());
  }

  /** Get the first available ASR provider, optionally preferring a specific one */
  getDefaultASR(preferred?: string): ASRProvider | null {
    if (preferred) {
      const p = this.asrProviders.get(preferred);
      if (p?.isAvailable()) return p;
    }
    return this.getAvailableASR()[0] ?? null;
  }

  /** Get the first available TTS provider, optionally preferring a specific one */
  getDefaultTTS(preferred?: string): TTSProvider | null {
    if (preferred) {
      const p = this.ttsProviders.get(preferred);
      if (p?.isAvailable()) return p;
    }
    return this.getAvailableTTS()[0] ?? null;
  }
}

export const voiceRegistry = new ProviderRegistry();
