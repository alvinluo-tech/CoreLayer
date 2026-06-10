/**
 * Operation Receipt formatting.
 *
 * Formats OperationReceipt into human-readable text that can be
 * appended to the conversation as a system message after execution.
 */

import type { OperationReceipt } from "../domain/operation.js";

/**
 * Format an operation receipt as a conversation message.
 * This is appended to the conversation after an approved tool is executed,
 * so the user (and LLM) can see exactly what happened.
 */
export function formatReceiptMessage(receipt: OperationReceipt): string {
  const status = receipt.success ? "成功" : "失败";
  const lines: string[] = [];

  lines.push(`[Operation Receipt] ${receipt.kind} — ${status}`);

  if (receipt.affectedCount > 0) {
    lines.push(`影响了 ${receipt.affectedCount} 个目标。`);
  }

  if (receipt.affectedTargets?.length) {
    const previews = receipt.affectedTargets.slice(0, 5);
    for (const t of previews) {
      lines.push(`  - ${t.label} (${t.type})`);
    }
    if (receipt.affectedTargets.length > 5) {
      lines.push(`  ... 还有 ${receipt.affectedTargets.length - 5} 个`);
    }
  }

  if (receipt.error) {
    lines.push(`错误: ${receipt.error}`);
  }

  return lines.join("\n");
}
