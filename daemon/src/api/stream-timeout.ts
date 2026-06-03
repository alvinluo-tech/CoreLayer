/**
 * Stream timeout utility.
 * Wraps an async iterable with per-chunk timeout.
 * If no chunk arrives within `timeoutMs`, throws a TimeoutError.
 */

export const DEFAULT_STREAM_TIMEOUT_MS = 120_000; // 2 minutes

export class StreamTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Stream timeout: no chunk received within ${timeoutMs}ms`);
    this.name = "StreamTimeoutError";
  }
}

/**
 * Wraps an async iterable so that each iteration must resolve within
 * `timeoutMs` milliseconds. The timer resets after every successful yield.
 *
 * @throws {StreamTimeoutError} if a chunk takes longer than timeoutMs
 */
export async function* withStreamTimeout<T>(
  source: AsyncIterable<T>,
  timeoutMs: number,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();

  try {
    while (true) {
      const result = await Promise.race([
        iterator.next(),
        timeout(timeoutMs),
      ]);

      if (result.done) {
        return;
      }

      yield result.value;
    }
  } finally {
    // Ensure the source iterator is properly closed on early exit
    if (iterator.return) {
      await iterator.return(undefined);
    }
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new StreamTimeoutError(ms)), ms);
  });
}
