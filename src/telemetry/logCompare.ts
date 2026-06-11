import type { AppConfig } from "../core/config.js";
import { mergeWarnings } from "../core/result.js";
import type { TelemetryLogSummary } from "./types.js";
import { summarizeTelemetryLog } from "./logSummary.js";

export interface CompareTelemetryLogsInput {
  baselineLogPath: string;
  comparisonLogPath: string;
}

export interface TelemetryLogComparison {
  baseline: TelemetryLogSummary;
  comparison: TelemetryLogSummary;
  deltas: {
    gpu_temperature_c_avg: number | null;
    gpu_temperature_c_max: number | null;
    gpu_utilization_percent_avg: number | null;
    gpu_utilization_percent_max: number | null;
    gpu_power_draw_w_avg: number | null;
    gpu_power_draw_w_max: number | null;
  };
  interpretation: string[];
  caveats: string[];
  warnings: string[];
}

function delta(
  baseline: number | null | undefined,
  comparison: number | null | undefined
): number | null {
  if (typeof baseline !== "number" || typeof comparison !== "number") {
    return null;
  }

  return comparison - baseline;
}

function describeDelta(
  deltaValue: number | null,
  warmerText: string,
  coolerText: string
): string | null {
  if (deltaValue === null || Math.abs(deltaValue) < 0.5) {
    return null;
  }

  return deltaValue > 0 ? warmerText : coolerText;
}

export async function compareTelemetryLogs(
  input: CompareTelemetryLogsInput,
  config: AppConfig
): Promise<TelemetryLogComparison> {
  const baseline = await summarizeTelemetryLog({ logPath: input.baselineLogPath }, config);
  const comparison = await summarizeTelemetryLog({ logPath: input.comparisonLogPath }, config);
  const deltas = {
    gpu_temperature_c_avg: delta(
      baseline.gpu_temperature_c?.avg,
      comparison.gpu_temperature_c?.avg
    ),
    gpu_temperature_c_max: delta(
      baseline.gpu_temperature_c?.max,
      comparison.gpu_temperature_c?.max
    ),
    gpu_utilization_percent_avg: delta(
      baseline.gpu_utilization_percent?.avg,
      comparison.gpu_utilization_percent?.avg
    ),
    gpu_utilization_percent_max: delta(
      baseline.gpu_utilization_percent?.max,
      comparison.gpu_utilization_percent?.max
    ),
    gpu_power_draw_w_avg: delta(baseline.gpu_power_draw_w?.avg, comparison.gpu_power_draw_w?.avg),
    gpu_power_draw_w_max: delta(baseline.gpu_power_draw_w?.max, comparison.gpu_power_draw_w?.max)
  };
  const interpretation = [
    describeDelta(
      deltas.gpu_temperature_c_avg,
      "Comparison log ran warmer on average.",
      "Comparison log ran cooler on average."
    ),
    describeDelta(
      deltas.gpu_utilization_percent_avg,
      "Comparison log had higher average GPU utilization.",
      "Comparison log had lower average GPU utilization."
    ),
    describeDelta(
      deltas.gpu_power_draw_w_avg,
      "Comparison log drew more GPU power on average.",
      "Comparison log drew less GPU power on average."
    )
  ].filter((value): value is string => Boolean(value));

  if (interpretation.length === 0) {
    interpretation.push("The logs do not show a meaningful telemetry difference.");
  }

  interpretation.push(
    "Sustained performance should only be judged when workload, room temperature, and run length are comparable."
  );

  return {
    baseline,
    comparison,
    deltas,
    interpretation,
    caveats: [
      "Telemetry log comparisons depend on workload repeatability.",
      "Dry-run profile reasoning does not prove game or benchmark performance by itself."
    ],
    warnings: mergeWarnings(baseline.warnings, comparison.warnings)
  };
}
