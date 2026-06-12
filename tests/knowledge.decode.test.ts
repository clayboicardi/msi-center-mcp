import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { parseRegQueryOutput } from "../src/adapters/msiCenterRegistry.js";
import { decodeMsiCenterState, parseFanCurve } from "../src/knowledge/decode.js";

const fixture = readFileSync(
  new URL("../fixtures/reg-query-base-module.txt", import.meta.url),
  "utf8"
);

const desktopFixture = readFileSync(
  new URL("../fixtures/reg-query-desktop-b760m.txt", import.meta.url),
  "utf8"
);

function rawStateFromFixture() {
  const parsed = parseRegQueryOutput(fixture);
  return { available: true, keys: parsed.keys, warnings: parsed.warnings };
}

function rawDesktopStateFromFixture() {
  const parsed = parseRegQueryOutput(desktopFixture);
  return { available: true, keys: parsed.keys, warnings: parsed.warnings };
}

describe("MSI Center state decoding", () => {
  test("decodes the real Base Module dump with confidence labels", () => {
    const state = decodeMsiCenterState(rawStateFromFixture());

    expect(state.available).toBe(true);
    // EC firmware prefix 15MM selects the calibrated Vector A16 HX profile.
    expect(state.machine_profile.id).toBe("msi-vector-a16-hx");
    expect(state.machine_profile.matched).toBe(true);
    expect(state.base_module_version).toBe("1.0.2605.0601");
    expect(state.ec_version).toContain("15MM");

    // Calibrated live 2026-06-11: Mode=1 is Extreme Performance on this build.
    expect(state.user_scenario.raw).toBe(1);
    expect(state.user_scenario.decoded).toBe("extreme_performance");
    expect(state.user_scenario.confidence).toBe("verified_live");

    expect(state.ai_engine_enabled.decoded).toBe(false);
    expect(state.gpu_switch.raw).toBe(0);
    expect(state.battery_master_mode.raw).toBe(1);
    expect(state.whisper_mode_enabled.decoded).toBe(false);
  });

  test("decodes fan curves into CPU and GPU banks", () => {
    const state = decodeMsiCenterState(rawStateFromFixture());

    expect(state.fan_curves.default_temp_c).toEqual({
      cpu: [0, 55, 62, 69, 75, 81],
      gpu: [0, 50, 55, 60, 65, 70]
    });
    expect(state.fan_curves.user_fan_percent?.cpu).toEqual([45, 65, 75, 90, 100, 150]);
  });

  test("decodes all six scenario presets", () => {
    const state = decodeMsiCenterState(rawStateFromFixture());

    expect(state.scenario_presets).toHaveLength(6);
    const turbo = state.scenario_presets.find((preset) => preset.performance.decoded === "turbo");
    expect(turbo?.index).toBe(4);
    const coolerBoost = state.scenario_presets.find(
      (preset) => preset.fan.decoded === "cooler_boost"
    );
    expect(coolerBoost?.index).toBe(1);
  });

  test("unrecognized machines fall back to the generic profile at reduced confidence", () => {
    const state = decodeMsiCenterState({
      available: true,
      keys: {
        "HKEY_LOCAL_MACHINE\\...\\Base Module\\User Scenario": { Mode: 1 },
        "HKEY_LOCAL_MACHINE\\...\\Base Module\\Scenario": { ECversion: "17ZZIMS1.000" }
      },
      warnings: []
    });

    expect(state.machine_profile.id).toBe("generic-msi");
    expect(state.machine_profile.matched).toBe(false);
    // Same hypothesis map, but never presented as verified on foreign hardware.
    expect(state.user_scenario.decoded).toBe("extreme_performance");
    expect(state.user_scenario.confidence).toBe("inferred");
    expect(state.warnings.join(" ")).toContain("generic MSI profile");
  });

  test("unknown raw values decode to null with unknown confidence", () => {
    const state = decodeMsiCenterState({
      available: true,
      keys: {
        "HKEY_LOCAL_MACHINE\\...\\Base Module\\User Scenario": { Mode: 99 },
        "HKEY_LOCAL_MACHINE\\...\\Base Module\\GeneralSetting": { GPU_Switch: 42 }
      },
      warnings: []
    });

    expect(state.user_scenario.raw).toBe(99);
    expect(state.user_scenario.decoded).toBeNull();
    expect(state.user_scenario.confidence).toBe("unknown");
    expect(state.gpu_switch.decoded).toBeNull();
  });

  test("unavailable raw state decodes to an unavailable snapshot", () => {
    const state = decodeMsiCenterState({ available: false, keys: {}, warnings: ["nope"] });

    expect(state.available).toBe(false);
    expect(state.user_scenario.raw).toBeNull();
    expect(state.warnings).toContain("nope");
  });

  test("parseFanCurve rejects malformed strings", () => {
    expect(parseFanCurve("1;2;3")).toBeNull();
    expect(parseFanCurve("a;b;c;d;e;f;g;h;i;j;k;l")).toBeNull();
    expect(parseFanCurve(null)).toBeNull();
  });
});

describe("Desktop MSI Center state decoding (PRO B760M-VC WIFI)", () => {
  test("matches the desktop profile from PlatformType + board model", () => {
    const state = decodeMsiCenterState(rawDesktopStateFromFixture());

    expect(state.machine_profile.id).toBe("msi-pro-b760m-vc-wifi");
    expect(state.machine_profile.matched).toBe(true);
    // Desktop component family: no Base Module, no EC version string.
    expect(state.ec_version).toBeNull();
    expect(state.base_module_version).toBeNull();
  });

  test("decodes the active scenario from the SyncData display-name string", () => {
    const state = decodeMsiCenterState(rawDesktopStateFromFixture());

    expect(state.user_scenario.raw).toBe("Extreme Performance");
    expect(state.user_scenario.decoded).toBe("extreme_performance");
    // Live-calibrated 2026-06-11: all four scenario names watched in the
    // registry during a UI click-through.
    expect(state.user_scenario.confidence).toBe("verified_live");
  });

  test("the transient 'None' scenario decodes to unknown, never a false value", () => {
    // While the Cooling Wizard UI is open, MSI Center flaps Mode_Scenario
    // between the real scenario and 'None' at sub-second cadence.
    const keys = parseRegQueryOutput(desktopFixture).keys;
    const syncDataKey = Object.keys(keys).find((key) => key.endsWith("\\SyncData")) ?? "";
    const state = decodeMsiCenterState({
      available: true,
      keys: {
        ...keys,
        [syncDataKey]: { ...keys[syncDataKey], Mode_Scenario: "None" }
      },
      warnings: []
    });

    expect(state.user_scenario.raw).toBe("None");
    expect(state.user_scenario.decoded).toBeNull();
    expect(state.user_scenario.confidence).toBe("unknown");
  });

  test("surfaces desktop fan state with raw values and honest confidence", () => {
    const state = decodeMsiCenterState(rawDesktopStateFromFixture());
    const desktop = state.desktop;

    expect(desktop).not.toBeNull();
    expect(desktop?.available_scenarios).toEqual([
      "Extreme Performance",
      "Balanced",
      "Silent",
      "Customize"
    ]);

    expect(desktop?.system_fans).toHaveLength(4);
    const fan1 = desktop?.system_fans.find((fan) => fan.fan_key === "FAN1");
    expect(fan1?.mode.raw).toBe(1);
    expect(fan1?.mode.decoded).toBe("smart_fan");
    expect(fan1?.mode.confidence).toBe("inferred");
    expect(fan1?.duty_percent).toBe(100);
    expect(fan1?.curve).toEqual([
      { temp_c: 0, duty_percent: 20 },
      { temp_c: 45, duty_percent: 35 },
      { temp_c: 65, duty_percent: 70 },
      { temp_c: 80, duty_percent: 100 }
    ]);

    const fan4 = desktop?.system_fans.find((fan) => fan.fan_key === "FAN4");
    expect(fan4?.duty_percent).toBe(50);
    expect(fan4?.curve).toBeNull();

    expect(desktop?.gpu_sync_fan?.enabled_raw).toBe(1);
    expect(desktop?.gpu_sync_fan?.mode_name).toBe("Performance");

    // Zero Frozr vocabulary inferred by correlation (Engine\ZeroFrozrStatus
    // flipped 2->1 live on UI toggle-off); persisted value never watched.
    expect(desktop?.zero_frozr.raw).toBe(2);
    expect(desktop?.zero_frozr.decoded).toBe("on");
    expect(desktop?.zero_frozr.confidence).toBe("inferred");
  });

  test("laptop-only settings stay null/unknown on the desktop", () => {
    const state = decodeMsiCenterState(rawDesktopStateFromFixture());

    expect(state.gpu_switch.raw).toBeNull();
    expect(state.battery_master_mode.raw).toBeNull();
    expect(state.whisper_mode_enabled.raw).toBeNull();
    expect(state.fan_curves.default_temp_c).toBeNull();
    expect(state.scenario_presets).toHaveLength(0);
  });

  test("the laptop fixture has no desktop section", () => {
    const state = decodeMsiCenterState(rawStateFromFixture());

    expect(state.desktop).toBeNull();
  });

  test("unrecognized desktops fall back to generic but still decode scenario names", () => {
    const state = decodeMsiCenterState({
      available: true,
      keys: {
        "HKEY_LOCAL_MACHINE\\...\\MSI Center\\BaseInfo": { PlatformType: 4, Model: "9Z99" },
        "HKEY_LOCAL_MACHINE\\...\\MSI Center\\SyncData": {
          Mode_Scenario: "Silent",
          Data_Scenario: "Extreme Performance,Balanced,Silent"
        }
      },
      warnings: []
    });

    expect(state.machine_profile.id).toBe("generic-msi");
    expect(state.machine_profile.matched).toBe(false);
    expect(state.user_scenario.raw).toBe("Silent");
    expect(state.user_scenario.decoded).toBe("silent");
    expect(state.user_scenario.confidence).toBe("inferred");
    expect(state.desktop?.available_scenarios).toEqual([
      "Extreme Performance",
      "Balanced",
      "Silent"
    ]);
  });
});
