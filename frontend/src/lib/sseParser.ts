export interface SSEEvent {
  event: string;
  data: string;
}

export interface SSEParserCallbacks {
  onEvent: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Stateful SSE parser that handles partial lines across chunks.
 * Parses the SSE protocol (event: / data: lines) and calls back per complete event.
 */
export function createSSEParser(callbacks: SSEParserCallbacks) {
  let buffer = '';
  let currentEvent = 'token';

  return {
    /**
     * Feed a chunk of text from the SSE stream.
     * Partial lines are buffered until the next chunk.
     */
    feed(chunk: string): void {
      buffer += chunk;
      const lines = buffer.split('\n');
      // Last element may be incomplete — buffer it
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (!data) continue;
          callbacks.onEvent({ event: currentEvent, data });
        }
      }
    },

    /**
     * Flush any remaining buffer. Call when the stream ends.
     */
    flush(): void {
      if (buffer.length > 0) {
        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6);
          if (data) {
            callbacks.onEvent({ event: currentEvent, data });
          }
        }
        buffer = '';
      }
    },

    reset(): void {
      buffer = '';
      currentEvent = 'token';
    },
  };
}
