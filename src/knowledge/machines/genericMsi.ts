import type { MachineProfile } from "../machineProfiles.js";

// Fallback profile for MSI machines this project has never been calibrated
// against. Ships the best-known hypotheses at honest (non-verified)
// confidence so readiness checks report "unknown" rather than false
// failures. To calibrate your machine, see docs/msi-center-knowledge.md.
export const GENERIC_MSI_PROFILE: MachineProfile = {
  id: "generic-msi",
  display_name: "Unrecognized MSI machine (uncalibrated)",
  matcher: null,
  mappings: {
    userScenarioMode: {
      map: {
        1: "extreme_performance",
        2: "balanced",
        4: "eco_silent"
      },
      confidence: "inferred",
      note: "Mode integers verified only on an MSI Vector A16 HX (EC 15MM); your model may use different integers or expose more scenarios (Silent, Super Battery, Smart Auto). Calibrate: flip each scenario in MSI Center, re-read get_msi_center_state, then add a machine profile (see docs/msi-center-knowledge.md)."
    },
    scenarioPerformance: {
      map: {
        0: "comfort",
        1: "eco",
        2: "sport",
        3: "turbo"
      },
      confidence: "community",
      note: "EC shift-mode vocabulary from msi-ec/MControlCenter. How the 0_Scenario..5_Scenario preset ROWS correspond to UI scenarios is unverified — treat preset rows as informational only."
    },
    scenarioFan: {
      map: {
        0: "auto",
        1: "cooler_boost",
        2: "advanced"
      },
      confidence: "inferred",
      note: "Fan mode integers inferred from the Vector A16 HX UI order (Auto, Cooler Boost, Advanced); some MSI builds also expose a Silent fan mode. Calibrate on your machine before trusting."
    },
    gpuSwitch: {
      map: {
        0: "mshybrid",
        1: "discrete",
        2: "integrated"
      },
      confidence: "inferred",
      note: "0=MSHybrid verified on the Vector A16 HX only. Desktop boards have no GPU switch; other laptops may map differently. CUDA compute is unaffected by this switch either way."
    },
    batteryMaster: {
      map: {
        0: "best_for_mobility_charge_to_100",
        1: "balanced_charge_to_80",
        2: "best_for_battery_charge_to_60"
      },
      confidence: "community",
      note: "MSI Battery Master tiers: Best for Mobility (~100%), Balanced (~70-80%), Best for Battery (~50-60%). Integer order matches MSI Center UI order; absent entirely on desktops."
    }
  }
};
