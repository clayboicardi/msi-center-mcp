import type { MachineProfile } from "../machineProfiles.js";
import { GENERIC_MSI_PROFILE } from "./genericMsi.js";

// MSI PRO B760M-VC WIFI (MS-7D37) desktop — i5-14400F, RTX 4060, MSI Center
// SDK 3.2026.0526.01. Desktop MSI Center has no Base Module component: the
// active scenario is a display-name string under SyncData, system fans live
// under Setting\FANn (NCT6687D SuperIO), and the GPU zero-fan policy under
// Component\Graphics Fan Tool. Scenario names live-calibrated 2026-06-11
// (click-through with a 600ms registry watcher); fan/Zero-Frozr ints remain
// inferred — flipping them requires Apply in Cooling Wizard, not exercised.
export const PRO_B760M_DESKTOP_PROFILE: MachineProfile = {
  id: "msi-pro-b760m-vc-wifi",
  display_name: "MSI PRO B760M-VC WIFI desktop (MS-7D37)",
  matcher: {
    platform_types: [4],
    model_ids: ["7D37"]
  },
  mappings: {
    // Notebook-family mappings inherited from the generic profile. The
    // registry values they decode (Base Module Mode ints, GPU_Switch,
    // BatteryMode, ...) do not exist on this desktop, so they only ever
    // produce null/unknown — kept for type completeness, not as claims.
    ...GENERIC_MSI_PROFILE.mappings,
    desktopScenarioName: {
      map: {
        "extreme performance": "extreme_performance",
        balanced: "balanced",
        silent: "silent",
        customize: "customize"
      },
      confidence: "verified_live",
      note: "Verified 2026-06-11 by live click-through with a registry watcher: each scenario click writes its display name to SyncData\\Mode_Scenario (all four observed). CAUTION: while the Cooling Wizard UI is open MSI Center flaps the value between the real scenario and the transient string 'None' at sub-second cadence — a null decode is usually that transient, re-read after closing MSI Center. Internal vocab in Component\\User Scenario\\User Scenario: Mode/RealMode say 'Performance' for Extreme Performance; CurrentFanMode says 'Balance' (no 'd') for Balanced and 'None' in Customize."
    },
    desktopSystemFanMode: {
      map: {
        1: "smart_fan",
        2: "manual"
      },
      confidence: "inferred",
      note: "Setting\\FANn\\Mode hypothesis from one dump: FAN1 (Mode=1) carries a 4-point Level_N_T/D curve while FAN2/4/5 (Mode=2) carry only a fixed Duty — so 1=smart curve, 2=manual duty. Not exercised during the 2026-06-11 calibration: this build's Cooling Wizard offers Performance/Silent/Custom fan modes (plus top-level 'Follow MSI Center Mode'/'BIOS mode'/'Customize'), and Setting\\FANn only changes when a mode is Applied. CoolingWizardMode=1 observed while CurrentFanMode tracked each scenario click — consistent with 'Follow MSI Center Mode' (fan policy follows the User Scenario)."
    },
    desktopZeroFrozr: {
      map: {
        1: "off",
        2: "on"
      },
      confidence: "inferred",
      note: "Inferred by correlation 2026-06-11: flipping the Zero Frozr UI toggle off (without Apply) flipped Component\\Engine\\ZeroFrozrStatus 2->1 live, and both Engine\\ZeroFrozrStatus and Graphics Fan Tool\\ZeroFrozr rest at 2 with Zero Frozr enabled. The persisted Graphics Fan Tool\\ZeroFrozr (the value decoded here) was never observed changing because Apply was not clicked — flip it with Apply and diff to upgrade to verified_live."
    }
  }
};
