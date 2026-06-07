import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  requestComputerControl,
  setComputerControlPermission,
  setScreenCaptureEnabled,
  revokeAllPermissions,
  getPermissionStatuses,
  getComputerControlStatus,
  resetComputerControlState,
} from "../computer-control-runtime.js";
import { COMPUTER_CONTROL_RISK } from "../types.js";

// Mock OSCapabilityBroker
const mockRequestCapability = vi.fn();
vi.mock("../../../capabilities/os-capability-broker.js", () => ({
  getCapabilityBroker: () => ({
    requestCapability: mockRequestCapability,
  }),
}));

// Mock repositories
const mockAuditLogCreate = vi.fn();
vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    auditLog: { create: mockAuditLogCreate },
  }),
}));

describe("ComputerControlRuntime", () => {
  beforeEach(() => {
    resetComputerControlState();
    mockRequestCapability.mockReset();
    mockAuditLogCreate.mockReset();
  });

  it("denies screenshot when screen capture is disabled", async () => {
    setScreenCaptureEnabled(false);

    const result = await requestComputerControl({
      actorId: "agent-1",
      operation: "screenshot",
      reason: "Capture screen for analysis",
    });

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.deniedReason).toContain("Screen capture is disabled");
    expect(mockRequestCapability).not.toHaveBeenCalled();
  });

  it("denies operation when blanket permission is revoked", async () => {
    setComputerControlPermission("click", false);

    const result = await requestComputerControl({
      actorId: "agent-1",
      operation: "click",
      coordinates: { x: 100, y: 200 },
    });

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.deniedReason).toContain("disabled by user permission");
  });

  it("allows operation through OSCapabilityBroker", async () => {
    mockRequestCapability.mockResolvedValue({
      decision: "allow",
      reason: "Auto-approved",
    });

    const result = await requestComputerControl({
      actorId: "agent-1",
      operation: "click",
      coordinates: { x: 100, y: 200 },
      reason: "Click submit button",
    });

    expect(result.success).toBe(true);
    expect(result.operation).toBe("click");
    expect(mockRequestCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "agent-1",
        capability: "window.control",
        riskLevel: "high",
      }),
    );
  });

  it("returns denied when broker denies the request", async () => {
    mockRequestCapability.mockResolvedValue({
      decision: "deny",
      reason: "Not allowed",
    });

    const result = await requestComputerControl({
      actorId: "agent-1",
      operation: "type_text",
      text: "hello",
    });

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.deniedReason).toBe("Not allowed");
  });

  it("returns denied when approval is required", async () => {
    mockRequestCapability.mockResolvedValue({
      decision: "approval_required",
      reason: "High risk operation",
    });

    const result = await requestComputerControl({
      actorId: "agent-1",
      operation: "key_combo",
      keys: ["ctrl", "c"],
    });

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.deniedReason).toContain("Approval required");
  });

  it("returns correct risk levels for operations", () => {
    expect(COMPUTER_CONTROL_RISK.screenshot).toBe("high");
    expect(COMPUTER_CONTROL_RISK.type_text).toBe("critical");
    expect(COMPUTER_CONTROL_RISK.click).toBe("high");
    expect(COMPUTER_CONTROL_RISK.scroll).toBe("medium");
    expect(COMPUTER_CONTROL_RISK["window.close"]).toBe("critical");
    expect(COMPUTER_CONTROL_RISK.file_select).toBe("critical");
  });

  it("getPermissionStatuses returns all operations", () => {
    const statuses = getPermissionStatuses();
    expect(statuses).toHaveLength(13);
    expect(statuses.map((s) => s.operation)).toContain("screenshot");
    expect(statuses.map((s) => s.operation)).toContain("click");
    expect(statuses.map((s) => s.operation)).toContain("type_text");
  });

  it("getComputerControlStatus tracks counters", async () => {
    mockRequestCapability.mockResolvedValue({ decision: "allow", reason: "ok" });

    await requestComputerControl({ actorId: "a", operation: "scroll", scrollDelta: { x: 0, y: -100 } });
    setComputerControlPermission("click", false);
    await requestComputerControl({ actorId: "a", operation: "click", coordinates: { x: 0, y: 0 } });

    const status = getComputerControlStatus();
    expect(status.totalRequests).toBe(2);
    expect(status.approvedRequests).toBe(1);
    expect(status.deniedRequests).toBe(1);
    expect(status.screenCaptureEnabled).toBe(true);
  });

  it("revokeAllPermissions clears all overrides", () => {
    setComputerControlPermission("click", false);
    setComputerControlPermission("type_text", false);
    revokeAllPermissions();

    const statuses = getPermissionStatuses();
    const clickStatus = statuses.find((s) => s.operation === "click");
    expect(clickStatus?.enabled).toBe(true);
    expect(clickStatus?.blanketApproved).toBe(false);
  });

  it("screenshot operation writes audit event with sensitiveData", async () => {
    setScreenCaptureEnabled(true);
    mockRequestCapability.mockResolvedValue({ decision: "allow", reason: "ok" });

    await requestComputerControl({
      actorId: "agent-1",
      operation: "screenshot",
      reason: "Capture for analysis",
    });

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "computer-control.screenshot",
        metadata: expect.objectContaining({ sensitiveData: true }),
      }),
    );
  });
});
