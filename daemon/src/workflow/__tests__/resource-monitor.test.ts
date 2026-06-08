/**
 * Unit tests for the resource monitor.
 *
 * Validates that getResourceStatus returns structurally valid metrics
 * from the OS APIs without requiring system-level assertions.
 */

import { describe, it, expect, vi } from "vitest";
import os from "os";

// Mock the process-spawner to control externalProcessCount
vi.mock("../../runtimes/coding/process-spawner.js", () => ({
  getActiveProcessCount: () => 2,
}));

import { getResourceStatus, isResourcePressureHigh } from "../resource-monitor.js";

describe("getResourceStatus", () => {
  it("returns a valid ResourceStatus object", () => {
    const status = getResourceStatus();

    expect(status).toBeDefined();
    expect(typeof status).toBe("object");
  });

  it("diskFreeGb is a non-negative number", () => {
    const status = getResourceStatus();
    expect(typeof status.diskFreeGb).toBe("number");
    expect(status.diskFreeGb).toBeGreaterThanOrEqual(0);
  });

  it("externalProcessCount is a number", () => {
    const status = getResourceStatus();
    expect(typeof status.externalProcessCount).toBe("number");
    expect(status.externalProcessCount).toBe(2);
  });

  it("memoryPercent is a number between 0 and 100", () => {
    const status = getResourceStatus();
    expect(typeof status.memoryPercent).toBe("number");
    expect(status.memoryPercent).toBeGreaterThanOrEqual(0);
    expect(status.memoryPercent).toBeLessThanOrEqual(100);
  });

  it("freeMemoryMb is a non-negative number", () => {
    const status = getResourceStatus();
    expect(typeof status.freeMemoryMb).toBe("number");
    expect(status.freeMemoryMb).toBeGreaterThanOrEqual(0);
  });

  it("totalMemoryMb is a positive number", () => {
    const status = getResourceStatus();
    expect(typeof status.totalMemoryMb).toBe("number");
    expect(status.totalMemoryMb).toBeGreaterThan(0);
  });

  it("cpuUsagePercent is a non-negative number", () => {
    const status = getResourceStatus();
    expect(typeof status.cpuUsagePercent).toBe("number");
    expect(status.cpuUsagePercent).toBeGreaterThanOrEqual(0);
  });

  it("uptimeSeconds is a positive number", () => {
    const status = getResourceStatus();
    expect(typeof status.uptimeSeconds).toBe("number");
    expect(status.uptimeSeconds).toBeGreaterThan(0);
  });

  it("platform matches os.platform()", () => {
    const status = getResourceStatus();
    expect(status.platform).toBe(os.platform());
  });
});

describe("isResourcePressureHigh", () => {
  it("returns a boolean", () => {
    const result = isResourcePressureHigh();
    expect(typeof result).toBe("boolean");
  });
});
