import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { createMsiBatteryLogProvider } from "../src/adapters/msiBatteryLog.js";

const fixtureDirectory = fileURLToPath(new URL("../fixtures/ai-battery", import.meta.url));

describe("MSI AI_Battery log adapter", () => {
  test("reads battery health from the newest log", async () => {
    const provider = createMsiBatteryLogProvider(fixtureDirectory);

    const health = await provider.getBatteryHealth();

    expect(health.available).toBe(true);
    expect(health.designed_capacity_mwh).toBe(87395);
    expect(health.full_charge_capacity_mwh).toBe(84192);
    expect(health.wear_percent).toBeCloseTo(3.7, 1);
    // Latest row by LogTime, not file order.
    expect(health.latest?.time).toBe("2026/06/10 05:15:42");
    expect(health.latest?.ac_power).toBe(true);
    expect(health.latest?.charge_percent).toBe(97);
    expect(health.sample_count).toBe(5);
  });

  test("clamps negative wear to zero with a warning", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "msi-battery-"));
    await writeFile(
      path.join(temp, "1_log.csv"),
      ["LogTime,DesignedCapacity,FullChargedCapacity,AC/DC,LifePercent", "2026/06/10 05:15:42,87395,88073,AC,96"].join(
        "\n"
      ),
      "utf8"
    );
    const provider = createMsiBatteryLogProvider(temp);

    const health = await provider.getBatteryHealth();

    expect(health.wear_percent).toBe(0);
    expect(health.warnings.join(" ")).toContain("above its design capacity");
  });

  test("reports unavailable when the directory is missing", async () => {
    const provider = createMsiBatteryLogProvider("Z:\\does\\not\\exist");

    const health = await provider.getBatteryHealth();

    expect(health.available).toBe(false);
    expect(health.warnings.join(" ")).toContain("not readable");
  });

  test("reports unavailable when no parseable rows exist", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "msi-battery-empty-"));
    await writeFile(path.join(temp, "2_log.csv"), "LogTime,DesignedCapacity\ngarbage", "utf8");
    const provider = createMsiBatteryLogProvider(temp);

    const health = await provider.getBatteryHealth();

    expect(health.available).toBe(false);
    expect(health.warnings.join(" ")).toContain("no parseable rows");
  });
});
