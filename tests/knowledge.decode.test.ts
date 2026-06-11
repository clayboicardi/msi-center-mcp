import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { parseRegQueryOutput } from "../src/adapters/msiCenterRegistry.js";
import { decodeMsiCenterState, parseFanCurve } from "../src/knowledge/decode.js";

const fixture = readFileSync(
  new URL("../fixtures/reg-query-base-module.txt", import.meta.url),
  "utf8"
);

function rawStateFromFixture() {
  const parsed = parseRegQueryOutput(fixture);
  return { available: true, keys: parsed.keys, warnings: parsed.warnings };
}

describe("MSI Center state decoding", () => {
  test("decodes the real Base Module dump with confidence labels", () => {
    const state = decodeMsiCenterState(rawStateFromFixture());

    expect(state.available).toBe(true);
    expect(state.base_module_version).toBe("1.0.2605.0601");
    expect(state.ec_version).toContain("15MM");

    expect(state.user_scenario.raw).toBe(1);
    // Uncalibrated mappings must surface as hypotheses, never as facts.
    expect(["inferred", "community", "unknown"]).toContain(state.user_scenario.confidence);

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
    const silent = state.scenario_presets.find((preset) => preset.fan.decoded === "silent");
    expect(silent?.index).toBe(1);
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
