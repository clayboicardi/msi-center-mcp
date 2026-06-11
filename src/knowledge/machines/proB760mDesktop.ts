import type { MachineProfile } from "../machineProfiles.js";
import { GENERIC_MSI_PROFILE } from "./genericMsi.js";

// MSI PRO B760M-VC WIFI (MS-7D37) desktop — i5-14400F, RTX 4060, MSI Center
// SDK 3.2026.0526.01. Desktop MSI Center has no Base Module component: the
// active scenario is a display-name string under SyncData, system fans live
// under Setting\FANn (NCT6687D SuperIO), and the GPU zero-fan policy under
// Component\Graphics Fan Tool. Mappings below were taken from a single
// registry dump on 2026-06-11 and ship at "inferred" until live-calibrated.
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
      confidence: "inferred",
      note: "SyncData\\Mode_Scenario carries the scenario display name; SyncData\\Data_Scenario lists this build's four scenarios (Extreme Performance, Balanced, Silent, Customize). Observed in a single dump 2026-06-11 — flip each scenario in MSI Center and diff to verify."
    },
    desktopSystemFanMode: {
      map: {
        1: "smart_fan",
        2: "manual"
      },
      confidence: "inferred",
      note: "Setting\\FANn\\Mode hypothesis from one dump: FAN1 (Mode=1) carries a 4-point Level_N_T/D curve while FAN2/4/5 (Mode=2) carry only a fixed Duty — so 1=smart curve, 2=manual duty. Uncalibrated; flip a fan mode in MSI Center and diff."
    },
    desktopZeroFrozr: {
      map: {},
      confidence: "unknown",
      note: "Component\\Graphics Fan Tool\\ZeroFrozr observed at 2 with Zero Frozr supported (IsSupport_ZeroFrozr=1); the int vocabulary (on/off/auto) is uncalibrated — toggle Zero Frozr in MSI Center and diff before trusting."
    }
  }
};
