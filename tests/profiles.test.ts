import { describe, expect, test } from "vitest";

import { createFakeProviders } from "../src/adapters/fakeProviders.js";
import { dryRunProfile, listProfiles } from "../src/profiles/profileEngine.js";

describe("dry-run profiles", () => {
  test("lists named v0.1 profiles without applying anything", () => {
    expect(listProfiles().profiles.map((profile) => profile.name)).toEqual([
      "balanced_daily",
      "gaming_ac",
      "quiet_work",
      "battery_saver",
      "cooldown"
    ]);
  });

  test.each(["balanced_daily", "gaming_ac", "quiet_work", "battery_saver", "cooldown"] as const)(
    "dry-runs %s without changing settings",
    async (profile) => {
      const result = await dryRunProfile(profile, createFakeProviders());

      expect(result.profile).toBe(profile);
      expect(result.note).toBe("v0.1 dry run only; no settings were changed");
      expect(result.planned_future_actions.length).toBeGreaterThan(0);
      expect(result.safety_checks).toContain("Read-only mode is enforced.");
    }
  );

  test("blocks gaming_ac when the machine is on battery", async () => {
    const result = await dryRunProfile(
      "gaming_ac",
      createFakeProviders({ power: { ac_power: false } })
    );

    expect(result.blocked_actions.join(" ")).toContain("AC power");
  });
});
