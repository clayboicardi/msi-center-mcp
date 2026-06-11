import { appendFile } from "node:fs/promises";
import { setTimeout as sleepMs } from "node:timers/promises";

import type { AppConfig } from "../core/config.js";
import { ValidationError } from "../core/errors.js";
import { buildTelemetryLogPath, ensureLogsDirectory } from "../core/paths.js";
import { mergeWarnings } from "../core/result.js";
import type { TelemetryProviders } from "../adapters/sensorProvider.js";
import type {
  ActivePowerPlan,
  PowerStatus,
  SystemInfo,
  TelemetryLogSummary,
  TelemetrySnapshot
} from "./types.js";
import { summarizeSnapshots } from "./logSummary.js";

export interface TelemetrySnapshotInput {
  includeProcesses?: boolean;
}

export interface CaptureTelemetryLogInput extends TelemetrySnapshotInput {
  label?: string;
  durationSeconds?: number;
  intervalSeconds?: number;
}

export interface CaptureTelemetryLogResult {
  log_path: string;
  sample_count: number;
  started_at: string;
  ended_at: string;
  summary: TelemetryLogSummary;
  warnings: string[];
}

export interface CaptureOptions {
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function getSystemInfo(providers: TelemetryProviders): Promise<SystemInfo> {
  const [powercfgAvailable, nvidiaSmiAvailable, cimAvailable, systemDetails] = await Promise.all([
    providers.powerPlans.isPowerCfgAvailable(),
    providers.gpu.isNvidiaSmiAvailable(),
    providers.cim.isCimAvailable(),
    providers.cim.getSystemDetails()
  ]);

  return {
    ...systemDetails.system,
    powercfg_available: powercfgAvailable,
    nvidia_smi_available: nvidiaSmiAvailable,
    cim_available: cimAvailable,
    warnings: systemDetails.warnings
  };
}

export async function getPowerStatus(providers: TelemetryProviders): Promise<PowerStatus> {
  const [activePlan, battery, powercfgAvailable, cimAvailable] = await Promise.all([
    providers.powerPlans.getActivePlan(),
    providers.cim.getBatteryStatus(),
    providers.powerPlans.isPowerCfgAvailable(),
    providers.cim.isCimAvailable()
  ]);

  return {
    ...battery,
    active_power_plan_guid: activePlan.guid,
    active_power_plan_name: activePlan.name,
    provider_status: {
      powercfg_available: powercfgAvailable,
      cim_available: cimAvailable
    },
    warnings: mergeWarnings(battery.warnings, activePlan.warnings)
  };
}

export async function getTelemetrySnapshot(
  providers: TelemetryProviders,
  input: TelemetrySnapshotInput = {}
): Promise<TelemetrySnapshot> {
  const includeProcesses = input.includeProcesses ?? false;
  const [system, power, activePowerPlan, gpu] = await Promise.all([
    getSystemInfo(providers),
    getPowerStatus(providers),
    providers.powerPlans.getActivePlan(),
    providers.gpu.getGpuSnapshot()
  ]);
  const os = providers.os.getOsSnapshot();
  const processes = includeProcesses
    ? await providers.processes.getProcessSummary(false)
    : undefined;
  const warnings = mergeWarnings(
    system.warnings,
    power.warnings,
    activePowerPlan.warnings,
    gpu.warnings,
    processes?.warnings
  );
  const unavailableFields = [
    ...gpu.unavailable_fields.map((field) => `gpu.${field}`),
    ...(os.cpu_load_percent === null ? ["os.cpu_load_percent"] : []),
    ...(processes && !processes.available ? ["processes"] : [])
  ];

  return {
    timestamp: new Date().toISOString(),
    system,
    power,
    active_power_plan: activePowerPlan,
    gpu,
    os,
    ...(processes ? { processes } : {}),
    warnings,
    unavailable_fields: unavailableFields
  };
}

function validateCaptureInput(
  input: CaptureTelemetryLogInput,
  config: AppConfig
): Required<CaptureTelemetryLogInput> {
  const durationSeconds = input.durationSeconds ?? 30;
  const intervalSeconds = input.intervalSeconds ?? config.defaultIntervalSeconds;
  const label = input.label ?? "";
  const includeProcesses = input.includeProcesses ?? false;

  if (durationSeconds < 2 || durationSeconds > config.maxLogDurationSeconds) {
    throw new ValidationError(
      `durationSeconds must be between 2 and ${config.maxLogDurationSeconds}.`
    );
  }

  if (intervalSeconds < 1 || intervalSeconds > 30) {
    throw new ValidationError("intervalSeconds must be between 1 and 30.");
  }

  return { durationSeconds, intervalSeconds, label, includeProcesses };
}

export async function captureTelemetryLog(
  input: CaptureTelemetryLogInput,
  providers: TelemetryProviders,
  config: AppConfig,
  options: CaptureOptions = {}
): Promise<CaptureTelemetryLogResult> {
  const normalized = validateCaptureInput(input, config);
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? sleepMs;
  const startedAt = now();
  await ensureLogsDirectory(config);
  const logPath = buildTelemetryLogPath(config, normalized.label, startedAt);
  const sampleCount = Math.floor(normalized.durationSeconds / normalized.intervalSeconds) + 1;
  const samples: TelemetrySnapshot[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = await getTelemetrySnapshot(providers, {
      includeProcesses: normalized.includeProcesses
    });
    sample.timestamp = now().toISOString();
    samples.push(sample);
    await appendFile(logPath, `${JSON.stringify(sample)}\n`, "utf8");

    if (index < sampleCount - 1) {
      await sleep(normalized.intervalSeconds * 1000);
    }
  }

  const endedAt = now();
  const summary = summarizeSnapshots(samples);

  return {
    log_path: logPath,
    sample_count: samples.length,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    summary,
    warnings: summary.warnings
  };
}

export function activePowerPlanFromStatus(power: PowerStatus): ActivePowerPlan {
  return {
    guid: power.active_power_plan_guid,
    name: power.active_power_plan_name,
    warnings: power.warnings
  };
}
