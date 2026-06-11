import type {
  ActivePowerPlan,
  BatteryStatus,
  GpuSnapshot,
  OsSnapshot,
  PowerPlanList,
  PowerStatus,
  ProcessSummary,
  SystemDetails
} from "../telemetry/types.js";
import type { TelemetryProviders } from "./sensorProvider.js";

type PartialPowerStatus = Partial<Omit<PowerStatus, "provider_status" | "warnings">>;

export interface FakeProviderOverrides {
  power?: PartialPowerStatus;
  gpu?: Partial<GpuSnapshot>;
  system?: Partial<SystemDetails>;
}

const activePlan: ActivePowerPlan = {
  available: true,
  guid: "381b4222-f694-41f0-9685-ff5bb260df2e",
  name: "Balanced",
  warnings: []
};

const plans: PowerPlanList = {
  available: true,
  plans: [
    {
      guid: activePlan.guid ?? "",
      name: "Balanced",
      is_active: true
    },
    {
      guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
      name: "High performance",
      is_active: false
    },
    {
      guid: "a1841308-3541-4fab-bc81-f71556f20b4a",
      name: "Power saver",
      is_active: false
    }
  ],
  warnings: []
};

const systemDetails: SystemDetails = {
  manufacturer: "Micro-Star International Co., Ltd.",
  model: "Vector A16 HX A8WHG",
  bios_version: "E15M1AMS.10D",
  bios_date: "2026-03-01T00:00:00.000000+000",
  os_name: "Microsoft Windows 11 Home",
  os_version: "10.0.26100",
  os_build: "26100",
  cpu_name: "AMD Ryzen 9 8940HX",
  cpu_core_count: 16,
  cpu_logical_processor_count: 32,
  gpu_names: ["NVIDIA GeForce RTX 5070 Ti Laptop GPU", "AMD Radeon Graphics"],
  total_memory_bytes: 17_018_621_952
};

const batteryStatus: BatteryStatus = {
  ac_power: true,
  battery_present: true,
  battery_percent: 82,
  charging_status: "ac_power",
  warnings: []
};

const gpuSnapshot: GpuSnapshot = {
  available: true,
  name: "NVIDIA GeForce RTX 5070 Ti Laptop GPU",
  driver_version: "576.80",
  temperature_gpu_c: 67,
  utilization_gpu_percent: 91,
  utilization_memory_percent: 42,
  memory_total_mb: 12282,
  memory_used_mb: 8192,
  memory_free_mb: 4090,
  power_draw_w: 104.52,
  clocks_current_graphics_mhz: 2430,
  clocks_current_memory_mhz: 8001,
  pstate: "P0",
  unavailable_fields: [],
  warnings: []
};

const osSnapshot: OsSnapshot = {
  platform: "win32",
  arch: "x64",
  release: "10.0.26100",
  uptime_seconds: 3600,
  cpu_load_percent: 32,
  memory_total_bytes: 17_018_621_952,
  memory_free_bytes: 6_000_000_000,
  memory_used_bytes: 11_018_621_952
};

const processSummary: ProcessSummary = {
  available: true,
  processes: [
    {
      pid: 1000,
      name: "Code.exe",
      cpu_percent: 4,
      memory_bytes: 500_000_000
    }
  ],
  warnings: []
};

const MSI_BASE = "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\MSI\\MSI Center\\Component\\Base Module";

// Mirrors the values observed on the real Vector A16 HX (see
// fixtures/reg-query-base-module.txt).
const msiCenterKeys: Record<string, Record<string, string | number>> = {
  [MSI_BASE]: { Version: "1.0.2605.0601" },
  [`${MSI_BASE}\\User Scenario`]: { Mode: 1, Intelligent: 0 },
  [`${MSI_BASE}\\Scenario`]: {
    ECversion: "15MMIMS1.10107282025",
    Default_Temp: "0;55;62;69;75;81;0;50;55;60;65;70",
    Default_Fan: "38;44;50;58;64;86;38;44;50;58;64;86",
    User_Fan: "45;65;75;90;100;150;45;65;75;90;100;150"
  },
  [`${MSI_BASE}\\GeneralSetting`]: { GPU_Switch: 0, BatteryMode: 1, WhisperMode: 0 },
  [`${MSI_BASE}\\0_Scenario`]: { Performance: 0, Fan: 0 },
  [`${MSI_BASE}\\1_Scenario`]: { Performance: 0, Fan: 1 },
  [`${MSI_BASE}\\4_Scenario`]: { Performance: 3, Fan: 0 }
};

const batteryHealth = {
  available: true,
  designed_capacity_mwh: 87395,
  full_charge_capacity_mwh: 84192,
  wear_percent: 3.7,
  latest: {
    time: "2026/06/10 05:15:42",
    ac_power: true as const,
    charge_percent: 97
  },
  sample_count: 5,
  log_path: "C:\\ProgramData\\MSI\\AI_Battery\\20266_log.csv",
  warnings: []
};

export function createFakeProviders(overrides: FakeProviderOverrides = {}): TelemetryProviders {
  const mergedSystem = { ...systemDetails, ...overrides.system };
  const mergedBattery = { ...batteryStatus, ...overrides.power };
  const mergedGpu = { ...gpuSnapshot, ...overrides.gpu };

  return {
    powerPlans: {
      listPlans: async () => plans,
      getActivePlan: async () => activePlan
    },
    cim: {
      getCimSnapshot: async () => ({
        available: true,
        system: mergedSystem,
        battery: mergedBattery,
        warnings: []
      })
    },
    gpu: {
      getGpuSnapshot: async () => mergedGpu
    },
    os: {
      getOsSnapshot: () => osSnapshot
    },
    processes: {
      getProcessSummary: async () => processSummary
    },
    msiCenter: {
      getMsiCenterRaw: async () => ({
        available: true,
        keys: msiCenterKeys,
        warnings: []
      })
    },
    batteryHealth: {
      getBatteryHealth: async () => batteryHealth
    }
  };
}
