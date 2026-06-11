import { POWERSHELL_CIM_QUERY } from "../core/commandRunner.js";
import type { CommandRunner } from "../core/commandRunner.js";
import { defaultConfig } from "../core/config.js";
import { numberOrNull } from "../core/result.js";
import type { BatteryStatus, SystemDetails } from "../telemetry/types.js";
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

export function parseCimJson(stdout: string): {
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
      system: emptySystemDetails(),
      battery: {
        ac_power: "unknown",
        battery_present: "unknown",
        battery_percent: null,
        charging_status: null,
        warnings: ["CIM output was not valid JSON."]
      },
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
    manufacturer: parsed.ComputerSystem?.Manufacturer ?? null,
    model: parsed.ComputerSystem?.Model ?? null,
    bios_version: parsed.BIOS?.SMBIOSBIOSVersion ?? null,
    bios_date: parsed.BIOS?.ReleaseDate ?? null,
    os_name: parsed.OperatingSystem?.Caption ?? null,
    os_version: parsed.OperatingSystem?.Version ?? null,
    os_build: parsed.OperatingSystem?.BuildNumber ?? null,
    cpu_name: parsed.Processor?.Name ?? null,
    cpu_core_count: numberOrNull(parsed.Processor?.NumberOfCores),
    cpu_logical_processor_count: numberOrNull(parsed.Processor?.NumberOfLogicalProcessors),
    gpu_names: gpuControllers
      .map((gpu) => gpu.Name)
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

  return { system, battery, warnings };
}

export function createWindowsCimProvider(
  runner: CommandRunner,
  timeoutMs = defaultConfig.commandTimeoutMs
): CimProvider {
  async function query() {
    return runner.run(
      "powershell-cim",
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_CIM_QUERY],
      timeoutMs
    );
  }

  return {
    async isCimAvailable() {
      const result = await query();
      return result.ok;
    },

    async getSystemDetails() {
      const result = await query();
      if (!result.ok) {
        return {
          system: emptySystemDetails(),
          warnings: result.warnings.length > 0 ? result.warnings : ["CIM query failed."]
        };
      }

      const parsed = parseCimJson(result.stdout);
      return {
        system: parsed.system,
        warnings: [...parsed.warnings, ...result.warnings]
      };
    },

    async getBatteryStatus() {
      const result = await query();
      if (!result.ok) {
        return {
          ac_power: "unknown",
          battery_present: "unknown",
          battery_percent: null,
          charging_status: null,
          warnings: result.warnings.length > 0 ? result.warnings : ["CIM battery query failed."]
        };
      }

      const parsed = parseCimJson(result.stdout);
      return {
        ...parsed.battery,
        warnings: [...parsed.battery.warnings, ...result.warnings]
      };
    }
  };
}
