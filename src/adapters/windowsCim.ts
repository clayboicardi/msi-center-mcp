import { POWERSHELL_CIM_QUERY } from "../core/commandRunner.js";
import type { CommandRunner } from "../core/commandRunner.js";
import { defaultConfig } from "../core/config.js";
import { numberOrNull } from "../core/result.js";
import type { BatteryStatus, CimSnapshot, SystemDetails } from "../telemetry/types.js";
import type { CimProvider } from "./sensorProvider.js";

interface CimJson {
  ComputerSystem?: {
    Manufacturer?: string;
    Model?: string;
  };
  BIOS?: {
    SMBIOSBIOSVersion?: string;
    ReleaseDate?: string;
  };
  OperatingSystem?: {
    Caption?: string;
    Version?: string;
    BuildNumber?: string;
    TotalVisibleMemorySize?: number | string;
  };
  Processor?: {
    Name?: string;
    NumberOfCores?: number | string;
    NumberOfLogicalProcessors?: number | string;
  };
  VideoController?: Array<{ Name?: string }> | { Name?: string };
  Battery?: {
    EstimatedChargeRemaining?: number | string;
    BatteryStatus?: number | string;
  } | null;
}

const emptySystemDetails = (): SystemDetails => ({
  manufacturer: null,
  model: null,
  bios_version: null,
  bios_date: null,
  os_name: null,
  os_version: null,
  os_build: null,
  cpu_name: null,
  cpu_core_count: null,
  cpu_logical_processor_count: null,
  gpu_names: [],
  total_memory_bytes: null
});

const unknownBattery = (warnings: string[]): BatteryStatus => ({
  ac_power: "unknown",
  battery_present: "unknown",
  battery_percent: null,
  charging_status: null,
  warnings
});

function statusText(status: number | null): string | null {
  switch (status) {
    case 1:
      return "discharging";
    case 2:
      return "ac_power";
    case 3:
      return "fully_charged";
    case 6:
      return "charging";
    case 7:
      return "charging_high";
    case 8:
      return "charging_low";
    case 9:
      return "charging_critical";
    case 11:
      return "partially_charged";
    default:
      return status === null ? null : `status_${status}`;
  }
}

function batteryAcPower(status: number | null): boolean | "unknown" {
  if (status === 1) {
    return false;
  }

  if ([2, 3, 6, 7, 8, 9, 11].includes(status ?? -1)) {
    return true;
  }

  return "unknown";
}

export function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const MS_JSON_DATE = /^\/Date\((-?\d+)\)\/$/;
const DMTF_DATE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.\d{6}[+-]\d{3}$/;

export function normalizeCimDate(value: string | null | undefined): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const msJson = MS_JSON_DATE.exec(trimmed);
  if (msJson?.[1]) {
    const millis = Number(msJson[1]);
    return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
  }

  const dmtf = DMTF_DATE.exec(trimmed);
  if (dmtf) {
    const [, year, month, day, hour, minute, second] = dmtf;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : trimmed;
}

export function parseCimJson(stdout: string): {
  ok: boolean;
  system: SystemDetails;
  battery: BatteryStatus;
  warnings: string[];
} {
  const warnings: string[] = [];
  let parsed: CimJson;

  try {
    parsed = JSON.parse(stdout) as CimJson;
  } catch {
    return {
      ok: false,
      system: emptySystemDetails(),
      battery: unknownBattery(["CIM output was not valid JSON."]),
      warnings: ["CIM output was not valid JSON."]
    };
  }

  const gpuControllers = Array.isArray(parsed.VideoController)
    ? parsed.VideoController
    : parsed.VideoController
      ? [parsed.VideoController]
      : [];
  const batteryStatusCode = numberOrNull(parsed.Battery?.BatteryStatus);
  const batteryPercent = numberOrNull(parsed.Battery?.EstimatedChargeRemaining);
  const totalVisibleMemoryKb = numberOrNull(parsed.OperatingSystem?.TotalVisibleMemorySize);

  const system: SystemDetails = {
    manufacturer: trimToNull(parsed.ComputerSystem?.Manufacturer),
    model: trimToNull(parsed.ComputerSystem?.Model),
    bios_version: trimToNull(parsed.BIOS?.SMBIOSBIOSVersion),
    bios_date: normalizeCimDate(parsed.BIOS?.ReleaseDate),
    os_name: trimToNull(parsed.OperatingSystem?.Caption),
    os_version: trimToNull(parsed.OperatingSystem?.Version),
    os_build: trimToNull(parsed.OperatingSystem?.BuildNumber),
    cpu_name: trimToNull(parsed.Processor?.Name),
    cpu_core_count: numberOrNull(parsed.Processor?.NumberOfCores),
    cpu_logical_processor_count: numberOrNull(parsed.Processor?.NumberOfLogicalProcessors),
    gpu_names: gpuControllers
      .map((gpu) => trimToNull(gpu.Name))
      .filter((name): name is string => Boolean(name)),
    total_memory_bytes: totalVisibleMemoryKb === null ? null : totalVisibleMemoryKb * 1024
  };

  if (!parsed.Battery) {
    warnings.push("Battery CIM class returned no battery.");
  }

  const battery: BatteryStatus = {
    ac_power: parsed.Battery ? batteryAcPower(batteryStatusCode) : "unknown",
    battery_present: parsed.Battery ? true : "unknown",
    battery_percent: batteryPercent,
    charging_status: statusText(batteryStatusCode),
    warnings: parsed.Battery ? [] : ["Battery status is unavailable."]
  };

  return { ok: true, system, battery, warnings };
}

export function createWindowsCimProvider(
  runner: CommandRunner,
  timeoutMs = defaultConfig.commandTimeoutMs
): CimProvider {
  return {
    async getCimSnapshot(): Promise<CimSnapshot> {
      const result = await runner.run(
        "powershell-cim",
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_CIM_QUERY],
        timeoutMs
      );

      if (!result.ok) {
        const warnings = result.warnings.length > 0 ? result.warnings : ["CIM query failed."];
        return {
          available: false,
          system: emptySystemDetails(),
          battery: unknownBattery(warnings),
          warnings
        };
      }

      const parsed = parseCimJson(result.stdout);
      return {
        available: parsed.ok,
        system: parsed.system,
        battery: parsed.battery,
        warnings: [...parsed.warnings, ...result.warnings]
      };
    }
  };
}
