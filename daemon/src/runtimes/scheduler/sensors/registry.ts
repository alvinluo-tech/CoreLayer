import type { Sensor, SensorChangeEvent } from "./types.js";
import { logError } from "../../../shared/errors.js";

/**
 * Sensor registry — manages lifecycle and change detection.
 * Stores last-known state per sensor, triggers callbacks on change,
 * and enforces a minimum debounce interval between triggers.
 */

interface SensorEntry {
  sensor: Sensor;
  /** Last known state hash (for change detection) */
  lastState: string;
  /** Timestamp of last trigger for debounce */
  lastTriggerMs: number;
  /** Active interval timer */
  timer: ReturnType<typeof setInterval> | null;
}

interface RegistryState {
  sensors: Map<string, SensorEntry>;
  /** Minimum ms between triggers for the same sensor */
  debounceMs: number;
  /** Callback invoked when a sensor detects changes */
  onChange: ((event: SensorChangeEvent) => void) | null;
  running: boolean;
}

const state: RegistryState = {
  sensors: new Map(),
  debounceMs: 5000,
  onChange: null,
  running: false,
};

/**
 * Register a sensor.
 */
export function registerSensor(sensor: Sensor): void {
  state.sensors.set(sensor.name, {
    sensor,
    lastState: "",
    lastTriggerMs: 0,
    timer: null,
  });
}

/**
 * Unregister a sensor by name.
 */
export function unregisterSensor(name: string): boolean {
  const entry = state.sensors.get(name);
  if (entry?.timer) {
    clearInterval(entry.timer);
  }
  return state.sensors.delete(name);
}

/**
 * Start all registered sensors.
 */
export function startSensors(): void {
  if (state.running) return;
  state.running = true;

  for (const [name, entry] of state.sensors) {
    entry.timer = setInterval(async () => {
      await tickSensor(name, entry);
    }, entry.sensor.interval);
  }
}

/**
 * Stop all sensors.
 */
export function stopSensors(): void {
  state.running = false;
  for (const entry of state.sensors.values()) {
    if (entry.timer) {
      clearInterval(entry.timer);
      entry.timer = null;
    }
  }
}

/**
 * Set the callback for sensor change events.
 */
export function setSensorChangeHandler(callback: (event: SensorChangeEvent) => void): void {
  state.onChange = callback;
}

/**
 * Set minimum debounce interval (ms) between triggers for the same sensor.
 */
export function setDebounceMs(ms: number): void {
  state.debounceMs = ms;
}

/**
 * Check if the sensor registry is running.
 */
export function isRunning(): boolean {
  return state.running;
}

/**
 * Get all registered sensor names.
 */
export function getSensorNames(): string[] {
  return Array.from(state.sensors.keys());
}

// ---- Internal ----

async function tickSensor(name: string, entry: SensorEntry): Promise<void> {
  try {
    const changes = await entry.sensor.check();
    if (!changes || changes.length === 0) return;

    // Debounce check
    const now = Date.now();
    if (now - entry.lastTriggerMs < state.debounceMs) return;

    entry.lastTriggerMs = now;

    const event: SensorChangeEvent = {
      sensorName: name,
      changes,
      timestamp: new Date().toISOString(),
    };

    state.onChange?.(event);
  } catch (err) {
    logError(`Sensor/${name}`, err);
  }
}
