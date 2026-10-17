/**
 * Spill Store — reversible offloading of oversized tool output.
 *
 * Instead of destructively truncating large tool results, the full text is
 * persisted verbatim under <dataDir>/spill/<session>/ and the model receives
 * a structured handle: total size, on-disk locator, head/tail preview, and a
 * retrieval hint. Read-only tools can then re-inspect the full content.
 *
 * Any write failure propagates to the caller so it can fall back to lossy
 * truncation (never lose the turn entirely).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveAppPaths } from "../../../config/app-paths.js";

export interface SpillRef {
  locator: string;
  bytes: number;
  chars: number;
  preview: string;
  retrievalHint: string;
}

/** Tool output above this many characters is spilled to disk. */
export const SPILL_THRESHOLD_CHARS = 4000;

const PREVIEW_HEAD_CHARS = 1000;
const PREVIEW_TAIL_CHARS = 500;

/** Everything outside [a-zA-Z0-9._-] is unsafe in a cross-platform filename. */
const UNSAFE_SEGMENT_CHARS = /[^a-zA-Z0-9._-]/g;
const MAX_SEGMENT_CHARS = 120;

/**
 * Flatten a caller-supplied path segment into a single safe filename chunk.
 * Blocks directory traversal ("..", "/", "\"), drive separators (":"), and
 * other reserved Windows filename characters.
 */
function sanitizeSegment(segment: string, fallback: string): string {
  const cleaned = segment.replace(UNSAFE_SEGMENT_CHARS, "_").replace(/^\.+/, "");
  if (!cleaned) return fallback;
  return cleaned.length > MAX_SEGMENT_CHARS ? cleaned.slice(0, MAX_SEGMENT_CHARS) : cleaned;
}

export function saveSpill(
  content: string,
  options?: { sessionId?: string; toolName?: string; callId?: string },
): SpillRef {
  const { dataDir } = resolveAppPaths();
  const session = sanitizeSegment(options?.sessionId ?? "default", "default");
  const spillDir = join(dataDir, "spill", session);
  mkdirSync(spillDir, { recursive: true });

  const tool = sanitizeSegment(options?.toolName ?? "tool", "tool");
  const call = sanitizeSegment(options?.callId ?? String(Date.now()), "call");
  const locator = join(spillDir, `${tool}_${call}.txt`);

  writeFileSync(locator, content, "utf8");

  const bytes = Buffer.byteLength(content, "utf8");
  const chars = content.length;
  const head = content.slice(0, PREVIEW_HEAD_CHARS);
  const tail = content.slice(-PREVIEW_TAIL_CHARS);
  const omitted = Math.max(0, chars - PREVIEW_HEAD_CHARS - PREVIEW_TAIL_CHARS);
  const preview = `${head}\n\n... [${omitted} characters omitted] ...\n\n${tail}`;

  return {
    locator,
    bytes,
    chars,
    preview,
    retrievalHint:
      "Use file reading or grep tools with offset/limit to inspect the full content.",
  };
}
