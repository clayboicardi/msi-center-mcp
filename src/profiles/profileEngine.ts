import type { TelemetryProviders } from "../adapters/sensorProvider.js";
import { mergeWarnings } from "../core/result.js";
import { getPowerStatus } from "../telemetry/snapshot.js";
import { DEFAULT_PROFILES } from "./defaultProfiles.js";
import type { DryRunProfileResult, ProfileList, ProfileName } from "./profiles.js";

export function listProfiles(): ProfileList {
  return {
    profiles: DEFAULT_PROFILES
  };
}

export async function dryRunProfile(
  profile: ProfileName,
  providers: TelemetryProviders
): Promise<DryRunProfileResult> {
  const definition = DEFAULT_PROFILES.find((candidate) => candidate.name === profile);
  if (!definition) {
    throw new Error(`Unknown profile: ${profile}`);
  }

  const [power, gpu] = await Promise.all([
    getPowerStatus(providers),
    providers.gpu.getGpuSnapshot()
  ]);
  const blockedActions: string[] = [];

  if ((profile === "gaming_ac" || profile === "llm_training") && power.ac_power !== true) {
    blockedActions.push(`AC power is required before considering the ${profile} profile.`);
  }

  return {
    profile,
    current_detected_state: {
      ac_power: power.ac_power,
      battery_percent: power.battery_percent,
      active_power_plan_name: power.active_power_plan_name,
      gpu_available: gpu.available,
      gpu_temperature_gpu_c: gpu.temperature_gpu_c
    },
    planned_future_actions: definition.intended_future_actions,
    safety_checks: [
      "Read-only mode is enforced.",
      "No Windows power plan changes are executed.",
      "No MSI Center settings are changed.",
      "No fan, voltage, clock, registry, BIOS, or firmware writes are executed."
    ],
    blocked_actions: blockedActions,
    warnings: mergeWarnings(power.warnings, gpu.warnings),
    note: "v0.1 dry run only; no settings were changed"
  };
}
