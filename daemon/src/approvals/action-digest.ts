/**
 * Action fingerprints for approvals: "what you approve is what executes".
 *
 * An approval row stores the arguments the model proposed. Between the click
 * and the dispatch nobody re-derives them, so a tool result or a file that
 * changed under the run can substitute a different call for the one the human
 * saw. The fingerprint is computed from the arguments that will actually be
 * dispatched and compared against the approved one before execution.
 *
 * Canonicalisation matters more than hashing: two argument objects that mean
 * the same call must produce the same digest, or every approval would look
 * forged. Object keys are sorted, `undefined` members are dropped, and
 * `-0`/`NaN`/`Infinity` are rejected rather than silently coerced.
 */

import { createHash } from "node:crypto";

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()));
}

function normalize(value: unknown, seen: Set<object>): unknown {
  if (value === null) return null;
  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError("Cannot fingerprint a non-finite number");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (type === "bigint") return { $bigint: String(value) };
  if (type === "undefined") return { $undefined: true };
  if (type === "function" || type === "symbol") {
    throw new TypeError(`Cannot fingerprint a ${type}`);
  }

  const object = value as object;
  if (seen.has(object)) throw new TypeError("Cannot fingerprint a circular value");
  seen.add(object);
  try {
    if (Array.isArray(object)) return object.map((item) => normalize(item, seen));
    if (object instanceof Date) return { $date: object.toISOString() };
    const record = object as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const member = record[key];
      if (member === undefined) continue;
      out[key] = normalize(member, seen);
    }
    return out;
  } finally {
    seen.delete(object);
  }
}

/** Stable digest of one tool call's identity: tool id plus canonical arguments. */
export function actionDigest(toolId: string, args: unknown): string {
  return createHash("sha256").update(`${toolId}\u0000${canonicalize(args)}`).digest("hex");
}

/**
 * True when the call about to run is the call that was approved.
 *
 * An approval recorded before digests existed has no digest; those rows keep
 * the old behaviour (verify nothing) rather than failing every in-flight
 * approval on upgrade. New rows always carry one.
 */
export function matchesApprovedAction(
  approvedDigest: string | null | undefined,
  toolId: string,
  args: unknown,
): boolean {
  if (!approvedDigest) return true;
  return actionDigest(toolId, args) === approvedDigest;
}
