import { startScheduler, setIdleCallback, consolidateOnIdle } from "../runtimes/scheduler/scheduler.js";
import { registerDefaultReportSchedules } from "../runtimes/scheduler/reports/generator.js";
import { registerSensor, startSensors, setSensorChangeHandler } from "../runtimes/scheduler/sensors/registry.js";
import { createTodoSensor } from "../runtimes/scheduler/sensors/todo-sensor.js";
import { createReadingSensor } from "../runtimes/scheduler/sensors/reading-sensor.js";

export async function startBackgroundServices(): Promise<void> {
  // Start scheduler and register default report schedules
  await startScheduler();
  await registerDefaultReportSchedules();

  // Register idle consolidation callback
  setIdleCallback(consolidateOnIdle);

  // Register and start sensors for proactive memory updates
  setSensorChangeHandler((event) => {
    console.info(`[Sensor:${event.sensorName}] Change detected:`, event.changes.map((c) => c.detail).join("; "));
  });
  registerSensor(createTodoSensor());
  registerSensor(createReadingSensor());
  startSensors();
}
