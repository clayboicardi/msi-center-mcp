import { readFile } from "node:fs/promises";

import type { AppConfig } from "../core/config.js";
import { resolveLogPath } from "../core/paths.js";
import { uniqueStrings } from "../core/result.js";
import type { StatSummary, TelemetryLogSummary, TelemetrySnapshot } from "./types.js";

type SnapshotRecord = Partial<TelemetrySnapshot> & {
  gpu?: Partial<TelemetrySnapshot["gpu"]>;
  os?: Partial<TelemetrySnapshot["os"]>;
  power?: Partial<TelemetrySnapshot["power"]>;
  warnings?: string[];
};

interface TelemetryLogReadResult {
  samples: SnapshotRecord[];
  warnings: string[];
}

export interface SummarizeTelemetryLogInput {
  logPath: string;
}

function stats(values: number[]): StatSummary | null {
  if (values.length === 0) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min, avg, max };
}

function collectNumbers(
  samples: SnapshotRecord[],
  getter: (sample: SnapshotRecord) => number | null | undefined
): number[] {
  return samples
    .map(getter)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function readTelemetryLogRecords(
  logPath: string,
  config: AppConfig
): Promise<TelemetryLogReadResult> {
  const safePath = resolveLogPath(logPath, config);
  const contents = await readFile(safePath, "utf8");
  const warnings: string[] = [];
  const samples = contents
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => Boolean(line))
    .flatMap(({ line, lineNumber }) => {
      try {
        return [JSON.parse(line) as SnapshotRecord];
      } catch {
        warnings.push(`Malformed JSONL line ${lineNumber} was skipped.`);
        return [];
      }
    });

  return { samples, warnings };
}

export function summarizeSnapshots(samples: SnapshotRecord[]): TelemetryLogSummary {
  const firstTimestamp = parseTimestamp(samples[0]?.timestamp);
  const lastTimestamp = parseTimestamp(samples.at(-1)?.timestamp);
  const durationSeconds =
    firstTimestamp === null || lastTimestamp === null
      ? null
      : Math.max(0, (lastTimestamp - firstTimestamp) / 1000);
  const memoryUsed = collectNumbers(samples, (sample) => sample.os?.memory_used_bytes);
  const temperature = stats(collectNumbers(samples, (sample) => sample.gpu?.temperature_gpu_c));
  const utilization = stats(
    collectNumbers(samples, (sample) => sample.gpu?.utilization_gpu_percent)
  );
  const power = stats(collectNumbers(samples, (sample) => sample.gpu?.power_draw_w));
  const missingFields: string[] = [];

  if (!temperature) {
    missingFields.push("gpu.temperature_gpu_c");
  }
  if (!utilization) {
    missingFields.push("gpu.utilization_gpu_percent");
  }
  if (!power) {
    missingFields.push("gpu.power_draw_w");
  }
  if (memoryUsed.length === 0) {
    missingFields.push("os.memory_used_bytes");
  }

  return {
    sample_count: samples.length,
    duration_seconds: durationSeconds,
    gpu_temperature_c: temperature,
    gpu_utilization_percent: utilization,
    gpu_power_draw_w: power,
    memory_used_bytes:
      memoryUsed.length > 0
        ? {
            first: memoryUsed[0] ?? 0,
            last: memoryUsed.at(-1) ?? 0,
            delta: (memoryUsed.at(-1) ?? 0) - (memoryUsed[0] ?? 0)
          }
        : null,
    active_power_plan_observations: uniqueStrings(
      samples.map(
        (sample) => sample.power?.active_power_plan_name ?? sample.active_power_plan?.name
      )
    ),
    warnings: uniqueStrings(
      samples.flatMap((sample) => [...(sample.warnings ?? []), ...(sample.gpu?.warnings ?? [])])
    ),
    missing_fields: missingFields
  };
}

export async function summarizeTelemetryLog(
  input: SummarizeTelemetryLogInput,
  config: AppConfig
): Promise<TelemetryLogSummary> {
  const readResult = await readTelemetryLogRecords(input.logPath, config);
  const summary = summarizeSnapshots(readResult.samples);

  return {
    ...summary,
    warnings: uniqueStrings([...summary.warnings, ...readResult.warnings])
  };
}
