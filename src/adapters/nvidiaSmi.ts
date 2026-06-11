import { getNvidiaQueryArg } from "../core/commandRunner.js";
import type { CommandRunner } from "../core/commandRunner.js";
import { defaultConfig } from "../core/config.js";
import { numberOrNull } from "../core/result.js";
import type { GpuSnapshot } from "../telemetry/types.js";
import type { GpuProvider } from "./sensorProvider.js";

const FIELD_NAMES = [
  "name",
  "driver_version",
  "temperature_gpu_c",
  "utilization_gpu_percent",
  "utilization_memory_percent",
  "memory_total_mb",
  "memory_used_mb",
  "memory_free_mb",
  "power_draw_w",
  "clocks_current_graphics_mhz",
  "clocks_current_memory_mhz",
  "pstate"
] as const;

function emptyGpuSnapshot(warnings: string[] = []): GpuSnapshot {
  return {
    available: false,
    name: null,
    driver_version: null,
    temperature_gpu_c: null,
    utilization_gpu_percent: null,
    utilization_memory_percent: null,
    memory_total_mb: null,
    memory_used_mb: null,
    memory_free_mb: null,
    power_draw_w: null,
    clocks_current_graphics_mhz: null,
    clocks_current_memory_mhz: null,
    pstate: null,
    unavailable_fields: [...FIELD_NAMES],
    warnings
  };
}

function splitCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      columns.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  columns.push(current.trim());
  return columns;
}

export function parseNvidiaSmiCsv(stdout: string): GpuSnapshot {
  const line = stdout
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find(Boolean);

  if (!line) {
    return emptyGpuSnapshot(["nvidia-smi returned no GPU telemetry rows."]);
  }

  const columns = splitCsvLine(line);
  if (columns.length !== FIELD_NAMES.length) {
    return emptyGpuSnapshot([
      `Malformed nvidia-smi CSV output: expected ${FIELD_NAMES.length} columns, got ${columns.length}.`
    ]);
  }

  const snapshot: GpuSnapshot = {
    available: true,
    name: columns[0] && columns[0] !== "N/A" ? columns[0] : null,
    driver_version: columns[1] && columns[1] !== "N/A" ? columns[1] : null,
    temperature_gpu_c: numberOrNull(columns[2]),
    utilization_gpu_percent: numberOrNull(columns[3]),
    utilization_memory_percent: numberOrNull(columns[4]),
    memory_total_mb: numberOrNull(columns[5]),
    memory_used_mb: numberOrNull(columns[6]),
    memory_free_mb: numberOrNull(columns[7]),
    power_draw_w: numberOrNull(columns[8]),
    clocks_current_graphics_mhz: numberOrNull(columns[9]),
    clocks_current_memory_mhz: numberOrNull(columns[10]),
    pstate: columns[11] && columns[11] !== "N/A" ? columns[11] : null,
    unavailable_fields: [],
    warnings: []
  };

  snapshot.unavailable_fields = FIELD_NAMES.filter((field) => snapshot[field] === null);
  return snapshot;
}

export function createNvidiaSmiProvider(
  runner: CommandRunner,
  timeoutMs = defaultConfig.commandTimeoutMs
): GpuProvider {
  return {
    async getGpuSnapshot() {
      const result = await runner.run(
        "nvidia-smi",
        "nvidia-smi",
        [getNvidiaQueryArg(), "--format=csv,noheader,nounits"],
        timeoutMs
      );

      if (!result.ok) {
        return emptyGpuSnapshot(
          result.warnings.length > 0 ? result.warnings : ["nvidia-smi query failed."]
        );
      }

      const parsed = parseNvidiaSmiCsv(result.stdout);
      return {
        ...parsed,
        warnings: [...parsed.warnings, ...result.warnings]
      };
    }
  };
}
