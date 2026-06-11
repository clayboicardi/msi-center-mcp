import { describe, expect, test } from "vitest";

import { createFakeProviders } from "../src/adapters/fakeProviders.js";
import { decodeMsiCenterState } from "../src/knowledge/decode.js";
import { dryRunProfile, listProfiles } from "../src/profiles/profileEngine.js";
import { checkProfileReadiness, evaluateProfileReadiness } from "../src/profiles/readiness.js";
import { getTelemetrySnapshot } from "../src/telemetry/snapshot.js";

describe("dry-run profiles", () => {
  test("lists named profiles without applying anything", () => {
    expect(listProfiles().profiles.map((profile) => profile.name)).toEqual([
      "balanced_daily",
      "gaming_ac",
      "quiet_work",
      "battery_saver",
      "cooldown",
      "llm_inference",
      "llm_training"
    ]);
  });

  test.each([
    "balanced_daily",
    "gaming_ac",
    "quiet_work",
    "battery_saver",
    "cooldown",
    "llm_inference",
    "llm_training"
  ] as const)("dry-runs %s without changing settings", async (profile) => {
    const result = await dryRunProfile(profile, createFakeProviders());

    expect(result.profile).toBe(profile);
    expect(result.note).toBe("v0.1 dry run only; no settings were changed");
    expect(result.planned_future_actions.length).toBeGreaterThan(0);
    expect(result.safety_checks).toContain("Read-only mode is enforced.");
  });

  test("blocks gaming_ac when the machine is on battery", async () => {
    const result = await dryRunProfile(
      "gaming_ac",
      createFakeProviders({ power: { ac_power: false } })
    );

    expect(result.blocked_actions.join(" ")).toContain("AC power");
  });

  test("blocks llm_training when the machine is on battery", async () => {
    const result = await dryRunProfile(
      "llm_training",
      createFakeProviders({ power: { ac_power: false } })
    );

    expect(result.blocked_actions.join(" ")).toContain("AC power");
  });
});

describe("profile readiness", () => {
  test("llm_training on AC with fakes is ready but flags scenario and VRAM", async () => {
    const result = await checkProfileReadiness("llm_training", createFakeProviders());

    expect(result.ready).toBe(true);
    expect(result.required_failures).toBe(0);

    // Fake state: scenario Mode=1 (balanced hypothesis), GPU 67C with 8GB VRAM used.
    const scenario = result.results.find((entry) => entry.rule_id === "llm-train-scenario");
    expect(scenario?.status).toBe("fail");
    expect(scenario?.manual_fix).toContain("MSI Center");

    const vram = result.results.find((entry) => entry.rule_id === "llm-train-vram-free");
    expect(vram?.status).toBe("fail");
  });

  test("llm_training on battery is not ready", async () => {
    const result = await checkProfileReadiness(
      "llm_training",
      createFakeProviders({ power: { ac_power: false } })
    );

    expect(result.ready).toBe(false);
    expect(result.required_failures).toBeGreaterThan(0);
    const acRule = result.results.find((entry) => entry.rule_id === "llm-train-ac-power");
    expect(acRule?.status).toBe("fail");
  });

  test("balanced_daily passes with fake state", async () => {
    const result = await checkProfileReadiness("balanced_daily", createFakeProviders());

    expect(result.ready).toBe(true);
    expect(result.results.every((entry) => entry.status === "pass")).toBe(true);
  });

  test("uncalibrated MSI state evaluates to unknown, never fail", async () => {
    const providers = createFakeProviders();
    const snapshot = await getTelemetrySnapshot(providers, {});
    const context = {
      msi: decodeMsiCenterState({ available: false, keys: {}, warnings: [] }),
      power: snapshot.power,
      active_plan: snapshot.active_power_plan,
      gpu: snapshot.gpu,
      os: snapshot.os,
      battery_health: await providers.batteryHealth.getBatteryHealth()
    };

    const result = evaluateProfileReadiness("llm_training", context);

    const scenario = result.results.find((entry) => entry.rule_id === "llm-train-scenario");
    expect(scenario?.status).toBe("unknown");
    expect(result.unknown_checks).toBeGreaterThan(0);
    // Unknown checks never block readiness on their own.
    expect(result.ready).toBe(true);
  });
});
