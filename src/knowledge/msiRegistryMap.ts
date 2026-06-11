// Single source of truth for decoding raw MSI Center registry values into
// human-meaningful state. Every mapping carries a confidence level so MCP
// clients never over-trust an uncalibrated guess.
//
// Calibration workflow: flip a setting in the MSI Center UI, re-read
// "get_msi_center_state", diff the raw values, then update the map here and
// raise its confidence to "verified_live".

export type MappingConfidence = "verified_live" | "community" | "inferred" | "unknown";

export interface ValueMapping<T extends string = string> {
  map: Record<number, T>;
  confidence: MappingConfidence;
  note: string;
}

// MSI Center > Features > User Scenario. The Mode integer is written to
// HKLM\...\Base Module\User Scenario\Mode by MSIAPService.
export const userScenarioModeMapping: ValueMapping = {
  map: {
    0: "extreme_performance",
    1: "balanced",
    2: "silent",
    3: "super_battery",
    4: "ai_smart_auto"
  },
  confidence: "inferred",
  note: "Order inferred from MSI Center 2.x UI ordering (Extreme Performance, Balanced, Silent, Super Battery, Smart Auto); NOT yet calibrated on this machine. Treat as a hypothesis until verified_live."
};

// Per-scenario preset rows 0_Scenario..5_Scenario store a Performance int.
// msi-ec (github.com/BeardOverflow/msi-ec) names the EC shift modes
// eco/comfort/sport/turbo; MControlCenter (github.com/dmitry-s93/MControlCenter)
// maps MSI user modes onto them: Extreme Performance=turbo, Super Battery=eco,
// Silent=comfort+silent fan, Balanced=comfort (or sport) + auto fan.
export const scenarioPerformanceMapping: ValueMapping = {
  map: {
    0: "comfort",
    1: "eco",
    2: "sport",
    3: "turbo"
  },
  confidence: "community",
  note: "EC shift-mode vocabulary from msi-ec/MControlCenter. Observed presets on this machine: 0:(comfort,auto) 1:(comfort,silent) 2/3:(sport,auto) 4:(turbo,auto) 5:(eco,auto) — consistent with Balanced/Silent/Game-Creator/Extreme/Super Battery."
};

export const scenarioFanMapping: ValueMapping = {
  map: {
    0: "auto",
    1: "silent",
    2: "advanced"
  },
  confidence: "inferred",
  note: "Fan mode vocabulary from MControlCenter (auto/silent/basic/advanced); integer assignment inferred from the Silent preset carrying Fan=1."
};

// MSI Center > General Settings > GPU switch (MSHybrid vs Discrete needs a reboot).
export const gpuSwitchMapping: ValueMapping = {
  map: {
    0: "mshybrid",
    1: "discrete"
  },
  confidence: "inferred",
  note: "0 observed on this machine, which shipped in MSHybrid mode. Calibrate by switching GPU mode in MSI Center (requires reboot) and diffing GeneralSetting\\GPU_Switch."
};

// MSI Center > General Settings > Battery Master (charge threshold).
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

  return {
    raw: rawValue,
    decoded,
    confidence: decoded === null ? "unknown" : mapping.confidence,
    note: mapping.note
  };
}
