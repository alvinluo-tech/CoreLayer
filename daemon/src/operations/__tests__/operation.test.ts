import { describe, it, expect } from "vitest";
import type { OperationPreview, OperationReceipt } from "../domain/operation.js";
import { formatReceiptMessage } from "../receipts/operation-receipt.js";

describe("OperationPreview", () => {
  it("has required fields", () => {
    const preview: OperationPreview = {
      operationId: "op_1",
      kind: "conversation.cleanup_by_query",
      title: "清理对话",
      summary: "将删除 5 条对话",
      risk: "high",
      reversible: false,
      targetCount: 5,
      targets: [
        { id: "c1", label: "TICK: heartbeat", type: "conversation" },
      ],
      warnings: ["该操作不可撤销。"],
      payload: { conversationIds: ["c1"] },
    };

    expect(preview.operationId).toBeTruthy();
    expect(preview.kind).toBe("conversation.cleanup_by_query");
    expect(preview.risk).toBe("high");
    expect(preview.reversible).toBe(false);
    expect(preview.targetCount).toBe(5);
    expect(preview.targets).toHaveLength(1);
    expect(preview.warnings).toHaveLength(1);
  });
});

describe("OperationReceipt", () => {
  it("has required fields", () => {
    const receipt: OperationReceipt = {
      operationId: "op_1",
      kind: "conversation.batch_delete",
      success: true,
      executedAt: new Date().toISOString(),
      affectedCount: 3,
      affectedTargets: [
        { id: "c1", label: "TICK: heartbeat", type: "conversation" },
      ],
    };

    expect(receipt.operationId).toBeTruthy();
    expect(receipt.success).toBe(true);
    expect(receipt.affectedCount).toBe(3);
  });
});

describe("formatReceiptMessage", () => {
  it("formats success receipt", () => {
    const receipt: OperationReceipt = {
      operationId: "op_1",
      kind: "conversation.batch_delete",
      success: true,
      executedAt: new Date().toISOString(),
      affectedCount: 3,
      affectedTargets: [
        { id: "c1", label: "TICK: heartbeat", type: "conversation" },
        { id: "c2", label: "TICK: autonomous", type: "conversation" },
        { id: "c3", label: "TICK: scheduled", type: "conversation" },
      ],
    };

    const message = formatReceiptMessage(receipt);
    expect(message).toContain("成功");
    expect(message).toContain("3");
    expect(message).toContain("TICK: heartbeat");
  });

  it("formats failure receipt", () => {
    const receipt: OperationReceipt = {
      operationId: "op_1",
      kind: "conversation.batch_delete",
      success: false,
      executedAt: new Date().toISOString(),
      affectedCount: 0,
      error: "Database write failed",
    };

    const message = formatReceiptMessage(receipt);
    expect(message).toContain("失败");
    expect(message).toContain("Database write failed");
  });

  it("truncates long target lists", () => {
    const targets = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      label: `Conversation ${i}`,
      type: "conversation",
    }));

    const receipt: OperationReceipt = {
      operationId: "op_1",
      kind: "conversation.batch_delete",
      success: true,
      executedAt: new Date().toISOString(),
      affectedCount: 10,
      affectedTargets: targets,
    };

    const message = formatReceiptMessage(receipt);
    expect(message).toContain("还有 5 个");
  });
});
