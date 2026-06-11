import type { AppConfig } from "./config.js";

export const READ_ONLY_MODE = "read_only" as const;

export const FORBIDDEN_TOOL_NAMES = [
  "run_command",
  "run_powershell",
  "set_power_plan",
  "apply_profile",
  "set_fan_curve",
  "set_gpu_clock",
  "set_gpu_power_limit"
] as const;

export function assertReadOnlyConfig(config: AppConfig): string[] {
  const warnings: string[] = [];

  if (config.mode !== READ_ONLY_MODE) {
    warnings.push("Only read_only mode is supported in v0.1.");
  }

  if (config.writesEnabled) {
    warnings.push("writesEnabled must remain false in v0.1.");
  }

  return warnings;
}
