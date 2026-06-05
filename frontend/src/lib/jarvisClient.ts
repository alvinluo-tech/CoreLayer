import { invoke } from '@tauri-apps/api/core';
import { createSSEParser } from './sseParser';
import { logger } from './logger';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

interface SSERequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  onEvent: (event: { event: string; data: string }) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

interface RequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

class JarvisClient {
  private daemonUrlPromise: Promise<string> | null = null;

  /**
   * Resolve and cache the daemon URL via Tauri IPC.
   * Subsequent calls return the cached value.
   */
  async getDaemonUrl(): Promise<string> {
    if (!this.daemonUrlPromise) {
      this.daemonUrlPromise = invoke<string>('get_daemon_url_command');
    }
    return this.daemonUrlPromise;
  }

  /** Reset cached URL (e.g., after settings change). */
  resetDaemonUrl(): void {
    this.daemonUrlPromise = null;
  }

  // ---- HTTP Methods with Retry ----

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async del(path: string, options?: RequestOptions): Promise<void> {
    await this.request<void>('DELETE', path, undefined, options);
  }

  // ---- SSE Streaming ----

  async streamSSE(options: SSERequestOptions): Promise<void> {
    const url = await this.getDaemonUrl();
    const fullUrl = `${url}${options.path}`;

    const response = await fetch(fullUrl, {
      method: options.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body reader');

    const decoder = new TextDecoder();
    const parser = createSSEParser({
      onEvent: options.onEvent,
      onError: options.onError,
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.flush();
    } finally {
      reader.releaseLock();
    }

    options.onDone?.();
  }

  // ---- Voice Operations ----

  async synthesize(text: string, voice?: string, model?: string): Promise<ArrayBuffer> {
    const url = await this.getDaemonUrl();
    const maxRetries = DEFAULT_MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${url}/api/voice/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, model }),
        });

        if (!response.ok) {
          throw new Error(`TTS failed (${response.status})`);
        }

        return response.arrayBuffer();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.name === 'AbortError' || lastError.message.includes('(')) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, DEFAULT_RETRY_DELAY_MS * (attempt + 1))
          );
        }
      }
    }

    throw new NetworkError(
      `TTS 请求失败，请检查 daemon 是否运行: ${lastError?.message}`,
      lastError ?? undefined
    );
  }

  async synthesizeBatch(
    sentences: string[],
    voice?: string,
    model?: string
  ): Promise<ArrayBuffer[]> {
    const url = await this.getDaemonUrl();

    try {
      const response = await fetch(`${url}/api/voice/synthesize-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentences, voice, model }),
      });

      if (!response.ok) {
        throw new Error(`Batch TTS failed (${response.status})`);
      }

      const data = (await response.json()) as { chunks: string[] };
      return data.chunks.map((b64) => {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
      });
    } catch (error) {
      // Fallback: batch endpoint unavailable, caller should use per-sentence
      logger.warn('[JarvisClient] Batch TTS unavailable, falling back to per-sentence:', error);
      throw error;
    }
  }

  /**
   * Streaming voice conversation with server-side TTS.
   * Yields text deltas and audio chunks as they arrive via SSE.
   */
  async *converseVoiceStream(
    message: string,
    conversationId?: string,
    options?: { voice?: string; speed?: number; signal?: AbortSignal }
  ): AsyncGenerator<
    | { type: 'delta'; text: string }
    | { type: 'tts_audio'; text: string; audio: ArrayBuffer; index: number }
    | { type: 'thinking'; text: string }
    | { type: 'done'; fullText: string; conversationId: string; ttsChunks: number }
    | { type: 'error'; error: string }
  > {
    const url = await this.getDaemonUrl();

    const response = await fetch(`${url}/api/voice/converse-voice-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId, ...options }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Voice stream error (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'delta';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            if (currentEvent === 'delta') {
              yield { type: 'delta', text: parsed.text };
            } else if (currentEvent === 'tts_audio') {
              const binary = atob(parsed.audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              yield {
                type: 'tts_audio',
                text: parsed.text,
                audio: bytes.buffer,
                index: parsed.index,
              };
            } else if (currentEvent === 'thinking') {
              yield { type: 'thinking', text: parsed.text };
            } else if (currentEvent === 'done') {
              yield {
                type: 'done',
                fullText: parsed.fullText,
                conversationId: parsed.conversationId,
                ttsChunks: parsed.ttsChunks,
              };
            } else if (currentEvent === 'error') {
              yield { type: 'error', error: parsed.error };
            }
          } catch {
            // Skip malformed JSON
          }
          currentEvent = 'delta';
        }
      }
    }
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    const url = await this.getDaemonUrl();
    const maxRetries = DEFAULT_MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        if (language) formData.append('language', language);

        const response = await fetch(`${url}/api/voice/transcribe`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Transcription failed (${response.status})`);
        }

        const result = (await response.json()) as { text: string };
        return result.text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.name === 'AbortError' || lastError.message.includes('(')) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, DEFAULT_RETRY_DELAY_MS * (attempt + 1))
          );
        }
      }
    }

    throw new NetworkError(
      `语音识别请求失败，请检查 daemon 是否运行: ${lastError?.message}`,
      lastError ?? undefined
    );
  }

  // ---- Tauri IPC Passthrough ----

  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  }

  // ---- Private ----

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = await this.getDaemonUrl();
    const fullUrl = `${url}${path}`;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(fullUrl, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
        }

        // Handle void responses
        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return undefined as T;
        }

        const data: unknown = await response.json();
        if (data === null || data === undefined) {
          throw new Error('Unexpected empty response body');
        }
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on abort or client errors
        if (
          lastError.name === 'AbortError' ||
          (lastError.message.includes('HTTP 4') && !lastError.message.includes('HTTP 429'))
        ) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
        }
      }
    }

    // Wrap network failures (Failed to fetch) in NetworkError for caller differentiation
    if (lastError && lastError.message.includes('Failed to fetch')) {
      throw new NetworkError('无法连接到 daemon，请确认 Jarvis 后端已启动', lastError);
    }

    throw lastError;
  }
}

export const jarvisClient = new JarvisClient();
