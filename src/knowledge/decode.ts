import type { MsiCenterRawState, RegistryValues } from "../adapters/msiCenterRegistry.js";
import type { MappingConfidence } from "./msiRegistryMap.js";
import { decodeWithMapping } from "./msiRegistryMap.js";
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

  const ecVersion = stringOrNull(scenario?.ECversion);
  const { profile, matched } = selectMachineProfile({
    ec_version: ecVersion,
    platform_type: typeof baseInfo?.PlatformType === "number" ? baseInfo.PlatformType : null
  });
  const mappings = profile.mappings;

  if (raw.available && !userScenario) {
    warnings.push("User Scenario registry key was not found; MSI Center may have changed layout.");
  }

  if (raw.available && !matched) {
    warnings.push(
      `No calibrated machine profile matched (EC: ${ecVersion ?? "unknown"}); decoding with the generic MSI profile at reduced confidence.`
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

  return {
    available: raw.available,
    machine_profile: {
      id: profile.id,
      display_name: profile.display_name,
      matched
    },
    base_module_version: stringOrNull(baseModule?.Version),
    ec_version: ecVersion,
    user_scenario: decodeWithMapping(
      typeof userScenario?.Mode === "number" ? userScenario.Mode : null,
      mappings.userScenarioMode
    ),
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
    raw_keys: raw.keys,
    warnings
  };
}
