import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Sensor } from "./types.js";
import {
  registerSensor,
  unregisterSensor,
  startSensors,
  stopSensors,
  setSensorChangeHandler,
  setDebounceMs,
  isRunning,
  getSensorNames,
} from "./registry.js";

function createMockSensor(name: string, interval = 1000): Sensor {
  let callCount = 0;
  return {
    name,
    interval,
    check: vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        return [{ type: "test_change", detail: `${name} changed` }];
      }
      return null;
    }),
  };
}

describe("Sensor Registry", () => {
  beforeEach(() => {
    stopSensors();
    // Unregister all sensors from previous tests
    for (const name of getSensorNames()) {
      unregisterSensor(name);
    }
  });

  afterEach(() => {
    stopSensors();
  });

  describe("registration", () => {
    it("should register a sensor", () => {
      const sensor = createMockSensor("test-sensor");
      registerSensor(sensor);
      expect(getSensorNames()).toContain("test-sensor");
    });

    it("should unregister a sensor", () => {
      const sensor = createMockSensor("to-remove");
      registerSensor(sensor);
      expect(unregisterSensor("to-remove")).toBe(true);
      expect(getSensorNames()).not.toContain("to-remove");
    });

    it("should return false when unregistering nonexistent sensor", () => {
      expect(unregisterSensor("nonexistent")).toBe(false);
    });
  });

  describe("start/stop", () => {
    it("should track running state", () => {
      expect(isRunning()).toBe(false);
      startSensors();
      expect(isRunning()).toBe(true);
      stopSensors();
      expect(isRunning()).toBe(false);
    });

    it("should not double-start", () => {
      startSensors();
      startSensors(); // Should not throw
      expect(isRunning()).toBe(true);
    });
  });

  describe("change detection", () => {
    it("should call onChange when sensor detects changes", async () => {
      const sensor = createMockSensor("detecting", 100);
      registerSensor(sensor);

      const handler = vi.fn();
      setSensorChangeHandler(handler);

      startSensors();

      // Wait for 2 ticks (first returns null, second returns changes)
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          sensorName: "detecting",
          changes: [{ type: "test_change", detail: "detecting changed" }],
        }),
      );

      stopSensors();
    });

    it("should not call onChange when no changes detected", async () => {
      const sensor: Sensor = {
        name: "no-change",
        interval: 100,
        check: vi.fn().mockResolvedValue(null),
      };
      registerSensor(sensor);

      const handler = vi.fn();
      setSensorChangeHandler(handler);

      startSensors();
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(handler).not.toHaveBeenCalled();
      stopSensors();
    });
  });

  describe("debounce", () => {
    it("should debounce rapid triggers", async () => {
      const sensor: Sensor = {
        name: "rapid",
        interval: 50,
        check: vi.fn().mockResolvedValue([{ type: "tick", detail: "ok" }]),
      };
      registerSensor(sensor);

      const handler = vi.fn();
      setSensorChangeHandler(handler);
      setDebounceMs(200); // 200ms debounce

      startSensors();
      // Wait for ~3 ticks within debounce window
      await new Promise((resolve) => setTimeout(resolve, 180));

      // Should have triggered only once due to debounce
      expect(handler).toHaveBeenCalledTimes(1);
      stopSensors();
    });
  });

  describe("error handling", () => {
    it("should not crash when sensor.check throws", async () => {
      const sensor: Sensor = {
        name: "error-sensor",
        interval: 100,
        check: vi.fn().mockRejectedValue(new Error("check failed")),
      };
      registerSensor(sensor);

      const handler = vi.fn();
      setSensorChangeHandler(handler);

      startSensors();
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should not have called handler (error was caught)
      expect(handler).not.toHaveBeenCalled();
      stopSensors();
    });
  });
});
