/**
 * WeChat Channel — Webhook Signature Verification
 *
 * Verifies incoming WeChat webhook requests using SHA1 signature.
 */

import { createHash } from "node:crypto";
import type { WeChatConfig } from "./types.js";

export function verifyWeChatSignature(
  config: WeChatConfig,
  signature: string,
  timestamp: string,
  nonce: string,
): boolean {
  const arr = [config.token, timestamp, nonce].sort();
  const str = arr.join("");
  const hash = createHash("sha1").update(str).digest("hex");
  return hash === signature;
}
