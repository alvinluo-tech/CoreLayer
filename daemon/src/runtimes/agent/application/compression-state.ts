/**
 * Per-conversation compression state management.
 * Prevents concurrent/duplicate compressions and enforces cooldowns.
 */

type CompressionEntry = { inProgress: boolean; lastCompressedAt: number; compressCountThisTurn: number };

const compressionState = new Map<string, CompressionEntry>();

/** Minimum interval between compressions for the same conversation (ms) */
const COMPRESSION_COOLDOWN_MS = 30_000;

/** Maximum compressions allowed per conversation turn */
const MAX_COMPRESSIONS_PER_TURN = 3;

export function shouldSkipCompression(conversationId: string): boolean {
  const state = compressionState.get(conversationId);
  if (!state) return false;
  if (state.inProgress) return true;
  if (Date.now() - state.lastCompressedAt < COMPRESSION_COOLDOWN_MS) return true;
  if (state.compressCountThisTurn >= MAX_COMPRESSIONS_PER_TURN) return true;
  return false;
}

export function markCompressionStarted(conversationId: string): void {
  const existing = compressionState.get(conversationId);
  compressionState.set(conversationId, {
    inProgress: true,
    lastCompressedAt: existing?.lastCompressedAt ?? 0,
    compressCountThisTurn: (existing?.compressCountThisTurn ?? 0) + 1,
  });
}

export function markCompressionFinished(conversationId: string): void {
  const state = compressionState.get(conversationId);
  if (state) {
    state.inProgress = false;
    state.lastCompressedAt = Date.now();
  } else {
    compressionState.set(conversationId, { inProgress: false, lastCompressedAt: Date.now(), compressCountThisTurn: 0 });
  }
}

/**
 * Reset compression count for a conversation at the start of a new turn.
 */
export function resetCompressionCount(conversationId: string): void {
  const state = compressionState.get(conversationId);
  if (state) {
    state.compressCountThisTurn = 0;
  }
}
