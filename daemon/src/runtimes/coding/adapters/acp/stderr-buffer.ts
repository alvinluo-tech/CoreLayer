/**
 * Bounded memory of a child process's stderr.
 *
 * ACP adapters have been measured reporting a fatal provider error on stderr
 * while the protocol still answered `stopReason: end_turn`. That tail is often
 * the only evidence of why a turn produced nothing, so it is kept even though
 * the line is also streamed to the transcript.
 *
 * Bounded because one failed OpenClaw run wrote 35 KB to stderr, and the buffer
 * lives as long as the run.
 */

const DEFAULT_MAX_BYTES = 16 * 1024;
const DEFAULT_MAX_LINES = 200;

export interface StderrBuffer {
  push(chunk: string): void;
  /** The retained tail, oldest first. */
  lines(): string[];
  text(): string;
}

export function createStderrBuffer(
  maxBytes = DEFAULT_MAX_BYTES,
  maxLines = DEFAULT_MAX_LINES,
): StderrBuffer {
  const kept: string[] = [];
  let bytes = 0;

  return {
    push(chunk: string): void {
      for (const raw of chunk.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        kept.push(line);
        bytes += line.length + 1;
        while (kept.length > maxLines || bytes > maxBytes) {
          const dropped = kept.shift();
          if (dropped === undefined) break;
          bytes -= dropped.length + 1;
        }
      }
    },
    lines(): string[] {
      return [...kept];
    },
    text(): string {
      return kept.join("\n");
    },
  };
}
