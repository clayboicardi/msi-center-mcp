// Single source of truth for decoding raw MSI Center registry values into
// human-meaningful state. Every mapping carries a confidence level so MCP
// clients never over-trust an uncalibrated guess.
//
// Calibration workflow: flip a setting in the MSI Center UI, re-read
// "get_msi_center_state", diff the raw values, then update the map here and
// raise its confidence to "verified_live".
//
// Calibrated live on this machine 2026-06-11 (Clay clicking through the UI
// while a registry watcher recorded each write).

export type MappingConfidence = "verified_live" | "community" | "inferred" | "unknown";

export interface ValueMapping<T extends string = string> {
  map: Record<number, T>;
  confidence: MappingConfidence;
  // Per-raw-value confidence overrides for partially calibrated mappings.
  overrides?: Record<number, MappingConfidence>;
  note: string;
}

// MSI Center > Features > User Scenario. The Mode integer is written to
// HKLM\...\Base Module\User Scenario\Mode by MSIAPService.
// This build (Vector A16 HX, MSI Center 2.0.70) exposes exactly three
// scenarios: Extreme Performance, Balanced, ECO-Silent (plus the separate
// MSI AI Engine card, which drives User Scenario\Intelligent instead).
export const userScenarioModeMapping: ValueMapping = {
  map: {
    1: "extreme_performance",
    2: "balanced",
    4: "eco_silent"
  },
  confidence: "verified_live",
  note: "Verified 2026-06-11 by live click-through (screenshot + registry watch): Extreme Performance=1, Balanced=2, ECO-Silent=4. Values 0 and 3 never observed on this build — likely the AI/Smart Auto and Silent slots used by other MSI models. Side effect observed live: selecting ECO-Silent auto-enables GeneralSetting\\WhisperMode (clears on leaving)."
};

// Per-scenario preset rows 0_Scenario..5_Scenario store a Performance int.
// msi-ec (github.com/BeardOverflow/msi-ec) names the EC shift modes
// eco/comfort/sport/turbo; MControlCenter (github.com/dmitry-s93/MControlCenter)
// maps MSI user modes onto them.
export const scenarioPerformanceMapping: ValueMapping = {
  map: {
    0: "comfort",
    1: "eco",
    2: "sport",
    3: "turbo"
  },
  confidence: "community",
  note: "EC shift-mode vocabulary from msi-ec/MControlCenter. CAUTION: how the 0_Scenario..5_Scenario preset ROWS correspond to UI scenarios is unverified — the verified User Scenario Mode ints (1/2/4) do not line up with row indices, so treat preset rows as informational only."
};

// Fan mode per scenario. This build's UI (scenario gear icon > Fan Speed)
// offers exactly: Auto, Cooler Boost, Advanced.
export const scenarioFanMapping: ValueMapping = {
  map: {
    0: "auto",
    1: "cooler_boost",
    2: "advanced"
  },
  confidence: "inferred",
  overrides: { 2: "verified_live" },
  note: "Fan=2 with Advanced selected verified 2026-06-11 (screenshot + registry). 0=auto and 1=cooler_boost inferred from this build's UI order (Auto, Cooler Boost, Advanced). The Advanced curve is the Scenario\\User_Fan registry string — the UI literally displays the 45/65/75/90/100/150 points, including the 150% full-speed sentinel."
};

// User Scenario page > GPU Switch. Three-way on this build:
// Discrete / MSHybrid / Integrated (reboot required to change).
export const gpuSwitchMapping: ValueMapping = {
  map: {
    0: "mshybrid",
    1: "discrete",
    2: "integrated"
  },
  confidence: "inferred",
  overrides: { 0: "verified_live" },
  note: "0=MSHybrid verified 2026-06-11 (screenshot + registry). Discrete/Integrated integers inferred; verifying them needs two reboots — not worth it. CUDA compute is unaffected by this switch either way."
};

// MSI Center > Features > Battery Master (charge threshold).
export const batteryMasterMapping: ValueMapping = {
  map: {
    0: "best_for_mobility_charge_to_100",
    1: "balanced_charge_to_80",
    2: "best_for_battery_charge_to_60"
  },
  confidence: "community",
  note: "MSI Battery Master tiers: Best for Mobility (~100%), Balanced (~70-80%), Best for Battery (~50-60%). Integer order matches MSI Center UI order; calibrate by flipping the tier and diffing GeneralSetting\\BatteryMode."
};

export function decodeWithMapping<T extends string>(
  raw: number | string | null | undefined,
  mapping: ValueMapping<T>
): { raw: number | string | null; decoded: T | null; confidence: MappingConfidence; note: string } {
  const rawValue = raw ?? null;
  const decoded =
    typeof rawValue === "number" && rawValue in mapping.map
      ? (mapping.map[rawValue] ?? null)
      : null;
  const confidence =
    decoded === null
      ? "unknown"
      : ((typeof rawValue === "number" ? mapping.overrides?.[rawValue] : undefined) ??
        mapping.confidence);

  return {
    raw: rawValue,
    decoded,
    confidence,
    note: mapping.note
  };
}
