/**
 * Sensor system for detecting resource changes.
 * Sensors emit structured change events; the orchestrator decides what to do.
 */

export interface SensorChange {
  /** What changed (e.g., "file_modified", "config_reloaded") */
  type: string;
  /** Free-form detail about the change */
  detail: string;
}

export interface SensorChangeEvent {
  /** Name of the sensor that detected the change */
  sensorName: string;
  /** List of changes detected in this tick */
  changes: SensorChange[];
  /** Timestamp of the change detection */
  timestamp: string;
}

export interface Sensor {
  /** Unique name for the sensor */
  name: string;
  /** Check for changes. Returns changes if detected, null if nothing changed. */
  check(): Promise<SensorChange[] | null>;
  /** Check interval in milliseconds */
  interval: number;
}
