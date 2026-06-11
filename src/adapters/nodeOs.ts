import os from "node:os";

import type { OsSnapshot } from "../telemetry/types.js";
import type { NodeOsProvider } from "./sensorProvider.js";

interface CpuTimes {
  idle: number;
  total: number;
}

function readCpuTimes(): CpuTimes {
  return os.cpus().reduce(
    (acc, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return {
        idle: acc.idle + cpu.times.idle,
        total: acc.total + total
      };
    },
    { idle: 0, total: 0 }
  );
}

function calculateCpuLoad(previous: CpuTimes | null, current: CpuTimes): number | null {
  if (!previous) {
    return null;
  }

  const idleDelta = current.idle - previous.idle;
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
}

export function createNodeOsProvider(): NodeOsProvider {
  let previousCpuTimes: CpuTimes | null = null;

  return {
    getOsSnapshot() {
      const currentCpuTimes = readCpuTimes();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const snapshot: OsSnapshot = {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime_seconds: os.uptime(),
        cpu_load_percent: calculateCpuLoad(previousCpuTimes, currentCpuTimes),
        memory_total_bytes: totalMemory,
        memory_free_bytes: freeMemory,
        memory_used_bytes: totalMemory - freeMemory
      };

      previousCpuTimes = currentCpuTimes;
      return snapshot;
    }
  };
}
