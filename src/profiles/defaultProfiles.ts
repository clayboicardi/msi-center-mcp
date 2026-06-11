import type { ProfileDefinition } from "./profiles.js";

export const DEFAULT_PROFILES: ProfileDefinition[] = [
  {
    name: "balanced_daily",
    description: "General daily-use profile for AC or battery use.",
    intended_future_actions: [
      "Windows power plan: Balanced.",
      "MSI Center mode: Balanced, manual only.",
      "GPU mode: MSHybrid, manual/reboot only.",
      "Fan policy: MSI auto, manual only."
    ]
  },
  {
    name: "gaming_ac",
    description: "Gaming-oriented profile that should only be considered while on AC power.",
    intended_future_actions: [
      "Require AC power.",
      "Windows power plan: High Performance or equivalent if present.",
      "MSI Center mode: Extreme Performance, manual only.",
      "GPU mode: Discrete, manual/reboot only.",
      "Fan policy: aggressive/Cooler Boost, manual only."
    ]
  },
  {
    name: "quiet_work",
    description: "Lower-noise work profile for light productivity.",
    intended_future_actions: [
      "Windows power plan: Balanced or Power Saver.",
      "MSI Center mode: Silent, manual only.",
      "GPU mode: MSHybrid, manual/reboot only."
    ]
  },
  {
    name: "battery_saver",
    description: "Battery-focused profile for unplugged use.",
    intended_future_actions: [
      "Prefer unplugged/battery use.",
      "Windows power plan: Power Saver if available.",
      "MSI Center mode: Super Battery, manual only.",
      "GPU mode: MSHybrid/integrated if available, manual/reboot only.",
      "Refresh rate reduction may be suggested manually, not applied."
    ]
  },
  {
    name: "cooldown",
    description: "Manual cooldown guidance based on current thermal indicators.",
    intended_future_actions: [
      "Temporarily increase fan cooling manually in MSI Center.",
      "Avoid launching writes.",
      "Suggest closing heavy processes if detected."
    ]
  }
];
