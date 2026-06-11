export const PROFILE_NAMES = [
  "balanced_daily",
  "gaming_ac",
  "quiet_work",
  "battery_saver",
  "cooldown",
  "llm_inference",
  "llm_training"
] as const;

export type ProfileName = (typeof PROFILE_NAMES)[number];

export type RuleSeverity = "required" | "recommended";

export interface ReadinessExpectation {
  equals?: string | number | boolean;
  oneOf?: Array<string | number | boolean>;
  min?: number;
  max?: number;
}

// Declarative check against the live ReadinessContext. `field` is a dotted
// path (e.g. "msi.user_scenario.decoded"); null/missing values evaluate to
// "unknown" rather than "fail" so uncalibrated registry mappings never
// produce false alarms.
export interface ReadinessRule {
  id: string;
  severity: RuleSeverity;
  field: string;
  expect: ReadinessExpectation;
  description: string;
  manual_fix: string;
}

export interface ProfileDefinition {
  name: ProfileName;
  description: string;
  intended_future_actions: string[];
  readiness_rules: ReadinessRule[];
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
