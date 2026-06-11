import type { StringValueMapping, ValueMapping } from "./msiRegistryMap.js";
import { GENERIC_MSI_PROFILE } from "./machines/genericMsi.js";
import { PRO_B760M_DESKTOP_PROFILE } from "./machines/proB760mDesktop.js";
import { VECTOR_A16_HX_PROFILE } from "./machines/vectorA16Hx.js";

// Machine-specific decode tables. MSI persists the same registry layout
// across models, but the integer semantics (which Mode is which scenario,
// which scenarios even exist) vary per machine. Profiles are selected at
// runtime from signals the registry itself provides, and unrecognized
// machines fall back to the generic profile at non-verified confidence.

export interface ProfileMappings {
  userScenarioMode: ValueMapping;
  scenarioPerformance: ValueMapping;
  scenarioFan: ValueMapping;
  gpuSwitch: ValueMapping;
  batteryMaster: ValueMapping;
  // Desktop MSI Center (component family without Base Module): the active
  // scenario is a display-name string under SyncData, system fans live under
  // Setting\FANn, and the GPU zero-fan policy under Component\Graphics Fan
  // Tool. Absent on notebook-only profiles.
  desktopScenarioName?: StringValueMapping;
  desktopSystemFanMode?: ValueMapping;
  desktopZeroFrozr?: ValueMapping;
}

export interface MachineMatcher {
  // Any-of prefix match against Scenario\ECversion. The EC firmware prefix
  // identifies the board family (e.g. "15MM" = Vector A16 HX A8WHG) — the
  // same convention the Linux msi-ec driver uses.
  ec_version_prefixes?: string[];
  // Any-of match against BaseInfo\PlatformType.
  platform_types?: number[];
  // Any-of case-insensitive match against BaseInfo\Model (e.g. "7D37" =
  // PRO B760M-VC WIFI). Desktop builds have no EC version string, so the
  // board model is their identifying signal.
  model_ids?: string[];
}

export interface MachineProfile {
  id: string;
  display_name: string;
  // null marks the generic fallback; it is never auto-matched.
  matcher: MachineMatcher | null;
  mappings: ProfileMappings;
}

export interface MachineSignals {
  ec_version: string | null;
  platform_type: number | null;
  model: string | null;
}

// Calibrated profiles, checked in order. Add new machines here.
export const MACHINE_PROFILES: MachineProfile[] = [
  VECTOR_A16_HX_PROFILE,
  PRO_B760M_DESKTOP_PROFILE
];

function matcherApplies(matcher: MachineMatcher, signals: MachineSignals): boolean {
  let constrained = false;

  if (matcher.ec_version_prefixes?.length) {
    constrained = true;
    const ec = signals.ec_version;
    if (!ec || !matcher.ec_version_prefixes.some((prefix) => ec.startsWith(prefix))) {
      return false;
    }
  }

  if (matcher.platform_types?.length) {
    constrained = true;
    if (signals.platform_type === null || !matcher.platform_types.includes(signals.platform_type)) {
      return false;
    }
  }

  if (matcher.model_ids?.length) {
    constrained = true;
    const model = signals.model?.toLowerCase();
    if (!model || !matcher.model_ids.some((id) => id.toLowerCase() === model)) {
      return false;
    }
  }

  return constrained;
}

export function selectMachineProfile(signals: MachineSignals): {
  profile: MachineProfile;
  matched: boolean;
} {
  for (const profile of MACHINE_PROFILES) {
    if (profile.matcher && matcherApplies(profile.matcher, signals)) {
      return { profile, matched: true };
    }
  }

  return { profile: GENERIC_MSI_PROFILE, matched: false };
}
