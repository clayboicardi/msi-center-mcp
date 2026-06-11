export const PROFILE_NAMES = [
  "balanced_daily",
  "gaming_ac",
  "quiet_work",
  "battery_saver",
  "cooldown"
] as const;

export type ProfileName = (typeof PROFILE_NAMES)[number];

export interface ProfileDefinition {
  name: ProfileName;
  description: string;
  intended_future_actions: string[];
}

export interface ProfileList {
  profiles: ProfileDefinition[];
}

export interface DryRunProfileResult {
  profile: ProfileName;
  current_detected_state: {
    ac_power: boolean | "unknown";
    battery_percent: number | null;
    active_power_plan_name: string | null;
    gpu_available: boolean;
    gpu_temperature_gpu_c: number | null;
  };
  planned_future_actions: string[];
  safety_checks: string[];
  blocked_actions: string[];
  warnings: string[];
  note: "v0.1 dry run only; no settings were changed";
}
