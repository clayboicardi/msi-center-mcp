import type { MsiCenterRawState, RegistryValues } from "../adapters/msiCenterRegistry.js";
import type { MappingConfidence, StringValueMapping, ValueMapping } from "./msiRegistryMap.js";
import { decodeWithMapping, decodeWithStringMapping } from "./msiRegistryMap.js";
import { selectMachineProfile } from "./machineProfiles.js";

export interface DecodedValue<T = string> {
  raw: number | string | null;
  decoded: T | null;
  confidence: MappingConfidence;
  note?: string;
}

export interface FanCurveBanks {
  cpu: number[];
  gpu: number[];
}

export interface ScenarioPreset {
  index: number;
  performance: DecodedValue;
  fan: DecodedValue;
}

// Desktop MSI Center (component family without Base Module): per-fan state
// under Setting\FANn — a mode int, a fixed duty, and (in smart mode) a
// temperature/duty curve of up to ~4 points.
export interface DesktopFanSetting {
  fan_key: string;
  mode: DecodedValue;
  duty_percent: number | null;
  curve: Array<{ temp_c: number; duty_percent: number }> | null;
}

export interface DesktopMsiCenterState {
  // SyncData\Mode_Scenario / Data_Scenario (display-name strings).
  scenario_name: string | null;
  available_scenarios: string[] | null;
  // Component\User Scenario\User Scenario internal vocabulary (differs from
  // the display names; e.g. "Performance" while SyncData says
  // "Extreme Performance").
  internal_mode: string | null;
  current_fan_mode: string | null;
  system_fans: DesktopFanSetting[];
  // Setting\GPU Sync Fan: the AI-Cooling-style "sync system fans to GPU
  // temperature" feature.
  gpu_sync_fan: {
    enabled_raw: number | null;
    mode_name: string | null;
  } | null;
  // Component\Graphics Fan Tool\ZeroFrozr (GPU zero-fan policy).
  zero_frozr: DecodedValue;
}

export interface MsiCenterState {
  available: boolean;
  machine_profile: {
    id: string;
    display_name: string;
    matched: boolean;
  };
  base_module_version: string | null;
  ec_version: string | null;
  user_scenario: DecodedValue;
  ai_engine_enabled: DecodedValue<boolean>;
  gpu_switch: DecodedValue;
  battery_master_mode: DecodedValue;
  whisper_mode_enabled: DecodedValue<boolean>;
  fan_curves: {
    default_temp_c: FanCurveBanks | null;
    default_fan_percent: FanCurveBanks | null;
    user_fan_percent: FanCurveBanks | null;
  };
  scenario_presets: ScenarioPreset[];
  // Populated when the desktop component family is present; null on
  // notebook-family machines.
  desktop: DesktopMsiCenterState | null;
  raw_keys: Record<string, RegistryValues>;
  warnings: string[];
}

function findKey(raw: MsiCenterRawState, suffix: string): RegistryValues | undefined {
  const lowered = `\\${suffix.toLowerCase()}`;
  return Object.entries(raw.keys).find(([key]) => key.toLowerCase().endsWith(lowered))?.[1];
}

function stringOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

// Fan curve registry strings hold 12 ';'-joined integers: 6 CPU-fan points
// followed by 6 GPU-fan points (temperatures for Default_Temp, duty percent
// for *_Fan; percent values above 100 act as a full-speed/boost sentinel).
export function parseFanCurve(value: string | number | null | undefined): FanCurveBanks | null {
  const text = stringOrNull(value);
  if (!text) {
    return null;
  }

  const numbers = text.split(";").map((part) => Number(part.trim()));
  if (numbers.length !== 12 || numbers.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return {
    cpu: numbers.slice(0, 6),
    gpu: numbers.slice(6)
  };
}

function splitScenarioList(value: string | number | null | undefined): string[] | null {
  const text = stringOrNull(value);
  if (!text) {
    return null;
  }

  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

// Setting\FANn smart-fan curves are flat Level_<i>_T / Level_<i>_D value
// pairs (temperature °C / duty percent), present only in smart mode.
function parseDesktopFanCurve(
  values: RegistryValues
): Array<{ temp_c: number; duty_percent: number }> | null {
  const points: Array<{ temp_c: number; duty_percent: number }> = [];

  for (let level = 1; level <= 10; level += 1) {
    const temp = values[`Level_${level}_T`];
    const duty = values[`Level_${level}_D`];
    if (typeof temp !== "number" || typeof duty !== "number") {
      break;
    }

    points.push({ temp_c: temp, duty_percent: duty });
  }

  return points.length > 0 ? points : null;
}

function decodeNumberOrUnknown(
  raw: string | number | null | undefined,
  mapping: ValueMapping | undefined,
  fallbackNote: string
): DecodedValue {
  if (!mapping) {
    return { raw: raw ?? null, decoded: null, confidence: "unknown", note: fallbackNote };
  }

  return decodeWithMapping(typeof raw === "number" ? raw : null, mapping);
}

function decodeStringOrUnknown(
  raw: string | number | null | undefined,
  mapping: StringValueMapping | undefined,
  fallbackNote: string
): DecodedValue {
  if (!mapping) {
    return { raw: raw ?? null, decoded: null, confidence: "unknown", note: fallbackNote };
  }

  return decodeWithStringMapping(raw, mapping);
}

function decodeBooleanFlag(
  raw: string | number | null | undefined,
  note: string
): DecodedValue<boolean> {
  const rawValue = raw ?? null;
  const decoded = rawValue === 0 ? false : rawValue === 1 ? true : null;

  return {
    raw: rawValue,
    decoded,
    confidence: decoded === null ? "unknown" : "inferred",
    note
  };
}

export function decodeMsiCenterState(raw: MsiCenterRawState): MsiCenterState {
  const warnings = [...raw.warnings];
  const baseModule = findKey(raw, "Base Module");
  const userScenario = findKey(raw, "User Scenario");
  const scenario = findKey(raw, "Scenario");
  const general = findKey(raw, "GeneralSetting");
  const baseInfo = findKey(raw, "BaseInfo");
  const syncData = findKey(raw, "SyncData");

  const ecVersion = stringOrNull(scenario?.ECversion);
  const model = stringOrNull(baseInfo?.Model);
  const { profile, matched } = selectMachineProfile({
    ec_version: ecVersion,
    platform_type: typeof baseInfo?.PlatformType === "number" ? baseInfo.PlatformType : null,
    model
  });
  const mappings = profile.mappings;

  if (raw.available && !userScenario && !syncData) {
    warnings.push("User Scenario registry key was not found; MSI Center may have changed layout.");
  }

  if (raw.available && !matched) {
    warnings.push(
      `No calibrated machine profile matched (EC: ${ecVersion ?? "unknown"}, model: ${model ?? "unknown"}); decoding with the generic MSI profile at reduced confidence.`
    );
  }

  const scenarioPresets: ScenarioPreset[] = [];
  for (let index = 0; index <= 5; index += 1) {
    const preset = findKey(raw, `${index}_Scenario`);
    if (!preset) {
      continue;
    }

    scenarioPresets.push({
      index,
      performance: decodeWithMapping(
        typeof preset.Performance === "number" ? preset.Performance : null,
        mappings.scenarioPerformance
      ),
      fan: decodeWithMapping(
        typeof preset.Fan === "number" ? preset.Fan : null,
        mappings.scenarioFan
      )
    });
  }

  // Desktop component family (no Base Module).
  const desktopUserScenario = findKey(raw, "User Scenario\\User Scenario");
  const gpuSyncFan = findKey(raw, "Setting\\GPU Sync Fan");
  const graphicsFanTool = findKey(raw, "Graphics Fan Tool");

  const systemFans: DesktopFanSetting[] = [];
  for (let index = 0; index <= 15; index += 1) {
    const fan = findKey(raw, `Setting\\FAN${index}`);
    if (!fan) {
      continue;
    }

    systemFans.push({
      fan_key: `FAN${index}`,
      mode: decodeNumberOrUnknown(
        fan.Mode,
        mappings.desktopSystemFanMode,
        "No desktop fan-mode mapping in this machine profile."
      ),
      duty_percent: typeof fan.Duty === "number" ? fan.Duty : null,
      curve: parseDesktopFanCurve(fan)
    });
  }

  const desktop: DesktopMsiCenterState | null =
    syncData || systemFans.length > 0 || gpuSyncFan
      ? {
          scenario_name: stringOrNull(syncData?.Mode_Scenario),
          available_scenarios: splitScenarioList(syncData?.Data_Scenario),
          internal_mode: stringOrNull(desktopUserScenario?.RealMode),
          current_fan_mode: stringOrNull(desktopUserScenario?.CurrentFanMode),
          system_fans: systemFans,
          gpu_sync_fan: gpuSyncFan
            ? {
                enabled_raw: typeof gpuSyncFan.Control === "number" ? gpuSyncFan.Control : null,
                mode_name: stringOrNull(gpuSyncFan.Mode)
              }
            : null,
          zero_frozr: decodeNumberOrUnknown(
            graphicsFanTool?.ZeroFrozr,
            mappings.desktopZeroFrozr,
            "No Zero Frozr mapping in this machine profile."
          )
        }
      : null;

  // Notebooks store the scenario as a Base Module int; desktops as a
  // display-name string. Prefer the int when present, fall back to the name.
  const notebookScenarioMode = typeof userScenario?.Mode === "number" ? userScenario.Mode : null;
  const desktopScenarioName = stringOrNull(syncData?.Mode_Scenario);
  const userScenarioValue =
    notebookScenarioMode === null && desktopScenarioName !== null
      ? decodeStringOrUnknown(
          desktopScenarioName,
          mappings.desktopScenarioName,
          "No desktop scenario-name mapping in this machine profile."
        )
      : decodeWithMapping(notebookScenarioMode, mappings.userScenarioMode);

  return {
    available: raw.available,
    machine_profile: {
      id: profile.id,
      display_name: profile.display_name,
      matched
    },
    base_module_version: stringOrNull(baseModule?.Version),
    ec_version: ecVersion,
    user_scenario: userScenarioValue,
    ai_engine_enabled: decodeBooleanFlag(
      userScenario?.Intelligent,
      "User Scenario\\Intelligent: 1 when the AI/Smart Auto engine drives scenario switching."
    ),
    gpu_switch: decodeWithMapping(
      typeof general?.GPU_Switch === "number" ? general.GPU_Switch : null,
      mappings.gpuSwitch
    ),
    battery_master_mode: decodeWithMapping(
      typeof general?.BatteryMode === "number" ? general.BatteryMode : null,
      mappings.batteryMaster
    ),
    whisper_mode_enabled: decodeBooleanFlag(
      general?.WhisperMode,
      "GeneralSetting\\WhisperMode: NVIDIA WhisperMode frame-rate capping for quieter fans."
    ),
    fan_curves: {
      default_temp_c: parseFanCurve(scenario?.Default_Temp),
      default_fan_percent: parseFanCurve(scenario?.Default_Fan),
      user_fan_percent: parseFanCurve(scenario?.User_Fan)
    },
    scenario_presets: scenarioPresets,
    desktop,
    raw_keys: raw.keys,
    warnings
  };
}
