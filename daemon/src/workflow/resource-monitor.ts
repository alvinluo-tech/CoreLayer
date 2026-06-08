/**
 * Resource Monitor — provides cross-platform system resource metrics.
 *
 * Uses Node.js os module for memory and CPU info.
 * Avoids os.loadavg() on Windows where it's not meaningful.
 */

import os from "os";

export interface ResourceStatus {
  memoryPercent: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  cpuUsagePercent: number;
  uptimeSeconds: number;
  platform: string;
}

let previousCpuTimes: { idle: number; total: number } | null = null;

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }

  const current = { idle: totalIdle / cpus.length, total: totalTick / cpus.length };

  if (!previousCpuTimes) {
    previousCpuTimes = current;
    return 0;
  }

  const idleDiff = current.idle - previousCpuTimes.idle;
  const totalDiff = current.total - previousCpuTimes.total;
  previousCpuTimes = current;

  if (totalDiff === 0) return 0;
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

export function getResourceStatus(): ResourceStatus {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    memoryPercent: Math.round((usedMem / totalMem) * 100),
    freeMemoryMb: Math.round(freeMem / (1024 * 1024)),
    totalMemoryMb: Math.round(totalMem / (1024 * 1024)),
    cpuUsagePercent: getCpuUsage(),
    uptimeSeconds: Math.round(os.uptime()),
    platform: os.platform(),
  };
}

export function isResourcePressureHigh(): boolean {
  const status = getResourceStatus();
  return status.memoryPercent > 85 || status.cpuUsagePercent > 90;
}
