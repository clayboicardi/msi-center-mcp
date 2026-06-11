import type { MachineProfile } from "../machineProfiles.js";

// MSI Vector A16 HX A8WHG (Ryzen 9 8940HX, RTX 5070 Ti Laptop, MSI Center
// 2.0.70, EC firmware family 15MM). Live-calibrated 2026-06-11 by clicking
// through the UI while a registry watcher recorded each write.
export const VECTOR_A16_HX_PROFILE: MachineProfile = {
  id: "msi-vector-a16-hx",
  display_name: "MSI Vector A16 HX (A8WHG)",
  matcher: {
    ec_version_prefixes: ["15MM"]
  },
  mappings: {
    userScenarioMode: {
      map: {
        1: "extreme_performance",
        2: "balanced",
        4: "eco_silent"
      },
      confidence: "verified_live",
      note: "Verified 2026-06-11 by live click-through (screenshot + registry watch): Extreme Performance=1, Balanced=2, ECO-Silent=4. Values 0 and 3 never observed on this build — likely the AI/Smart Auto and Silent slots used by other MSI models. Side effect observed live: selecting ECO-Silent auto-enables GeneralSetting\\WhisperMode (clears on leaving)."
    },
    scenarioPerformance: {
      map: {
        0: "comfort",
        1: "eco",
        2: "sport",
        3: "turbo"
      },
      confidence: "community",
      note: "EC shift-mode vocabulary from msi-ec/MControlCenter. CAUTION: how the 0_Scenario..5_Scenario preset ROWS correspond to UI scenarios is unverified — the verified User Scenario Mode ints (1/2/4) do not line up with row indices, so treat preset rows as informational only."
    },
    scenarioFan: {
      map: {
        0: "auto",
        1: "cooler_boost",
        2: "advanced"
      },
      confidence: "inferred",
      overrides: { 2: "verified_live" },
      note: "Fan=2 with Advanced selected verified 2026-06-11 (screenshot + registry). 0=auto and 1=cooler_boost inferred from this build's UI order (Auto, Cooler Boost, Advanced). The Advanced curve is the Scenario\\User_Fan registry string — the UI literally displays the 45/65/75/90/100/150 points, including the 150% full-speed sentinel."
    },
    gpuSwitch: {
      map: {
        0: "mshybrid",
        1: "discrete",
        2: "integrated"
      },
      confidence: "inferred",
      overrides: { 0: "verified_live" },
      note: "0=MSHybrid verified 2026-06-11 (screenshot + registry). Discrete/Integrated integers inferred; verifying them needs two reboots — not worth it. CUDA compute is unaffected by this switch either way."
    },
    batteryMaster: {
      map: {
        0: "best_for_mobility_charge_to_100",
        1: "balanced_charge_to_80",
        2: "best_for_battery_charge_to_60"
      },
      confidence: "community",
      note: "MSI Battery Master tiers: Best for Mobility (~100%), Balanced (~70-80%), Best for Battery (~50-60%). Integer order matches MSI Center UI order; calibrate by flipping the tier and diffing GeneralSetting\\BatteryMode."
    }
  }
};
