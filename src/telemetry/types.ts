export type UnknownBoolean = boolean | "unknown";

export interface PowerPlan {
  guid: string;
  name: string;
  is_active: boolean;
}

export interface PowerPlanList {
  available: boolean;
  plans: PowerPlan[];
  warnings: string[];
}

export interface ActivePowerPlan {
  available: boolean;
  guid: string | null;
  name: string | null;
  warnings: string[];
}

export interface BatteryStatus {
  ac_power: UnknownBoolean;
  battery_present: UnknownBoolean;
  battery_percent: number | null;
  charging_status: string | null;
  warnings: string[];
}

export interface CimSnapshot {
  available: boolean;
  system: SystemDetails;
  battery: BatteryStatus;
  warnings: string[];
}

export interface PowerStatus extends BatteryStatus {
  active_power_plan_guid: string | null;
  active_power_plan_name: string | null;
  provider_status: {
    powercfg_available: boolean;
    cim_available: boolean;
  };
}

export interface SystemDetails {
  manufacturer: string | null;
  model: string | null;
  bios_version: string | null;
  bios_date: string | null;
  os_name: string | null;
  os_version: string | null;
  os_build: string | null;
  cpu_name: string | null;
  cpu_core_count: number | null;
  cpu_logical_processor_count: number | null;
  gpu_names: string[];
  total_memory_bytes: number | null;
}

export interface SystemInfo extends SystemDetails {
  powercfg_available: boolean;
  nvidia_smi_available: boolean;
  cim_available: boolean;
  warnings: string[];
}

export interface GpuSnapshot {
  available: boolean;
  name: string | null;
  driver_version: string | null;
  temperature_gpu_c: number | null;
  utilization_gpu_percent: number | null;
  utilization_memory_percent: number | null;
  memory_total_mb: number | null;
  memory_used_mb: number | null;
  memory_free_mb: number | null;
  power_draw_w: number | null;
  clocks_current_graphics_mhz: number | null;
  clocks_current_memory_mhz: number | null;
  pstate: string | null;
  unavailable_fields: string[];
  warnings: string[];
}

export interface OsSnapshot {
  platform: string;
  arch: string;
  release: string;
  uptime_seconds: number;
  cpu_load_percent: number | null;
  memory_total_bytes: number;
  memory_free_bytes: number;
  memory_used_bytes: number;
}

export interface ProcessSummary {
  available: boolean;
  processes: Array<{
    pid: number;
    name: string;
    cpu_percent: number | null;
    memory_bytes: number | null;
  }>;
  warnings: string[];
}

export interface TelemetrySnapshot {
  timestamp: string;
  system: SystemInfo;
  power: PowerStatus;
  active_power_plan: ActivePowerPlan;
  gpu: GpuSnapshot;
  os: OsSnapshot;
  processes?: ProcessSummary;
  warnings: string[];
  unavailable_fields: string[];
}

export interface StatSummary {
  min: number;
  avg: number;
  max: number;
}

export interface TelemetryLogSummary {
  sample_count: number;
  duration_seconds: number | null;
  gpu_temperature_c: StatSummary | null;
  gpu_utilization_percent: StatSummary | null;
  gpu_power_draw_w: StatSummary | null;
  memory_used_bytes: {
    first: number;
    last: number;
    delta: number;
  } | null;
  active_power_plan_observations: string[];
  warnings: string[];
  missing_fields: string[];
}
