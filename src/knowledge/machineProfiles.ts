import type { ValueMapping } from "./msiRegistryMap.js";
import { GENERIC_MSI_PROFILE } from "./machines/genericMsi.js";
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
}

export interface MachineMatcher {
  // Any-of prefix match against Scenario\ECversion. The EC firmware prefix
  // identifies the board family (e.g. "15MM" = Vector A16 HX A8WHG) — the
  // same convention the Linux msi-ec driver uses.
  ec_version_prefixes?: string[];
  // Any-of match against BaseInfo\PlatformType.
  platform_types?: number[];
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
}

// Calibrated profiles, checked in order. Add new machines here.
export const MACHINE_PROFILES: MachineProfile[] = [VECTOR_A16_HX_PROFILE];

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
