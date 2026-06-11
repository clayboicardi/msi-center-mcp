import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  parseActivePowerScheme,
  parsePowerPlans,
  createPowerCfgProvider
} from "../src/adapters/powercfg.js";
import { parseNvidiaSmiCsv, createNvidiaSmiProvider } from "../src/adapters/nvidiaSmi.js";
import { createWindowsCimProvider, parseCimJson } from "../src/adapters/windowsCim.js";
import type { CommandRunner } from "../src/core/commandRunner.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

const runnerReturning = (stdout: string, ok = true): CommandRunner => ({
  run: async () => ({
    ok,
    exitCode: ok ? 0 : 1,
    stdout,
    stderr: ok ? "" : "missing",
    timedOut: false,
    commandName: "test",
    warnings: ok ? [] : ["command unavailable"]
  })
});

describe("powercfg parsing", () => {
  test("parses powercfg /list output and marks the active plan", () => {
    const result = parsePowerPlans(fixture("powercfg-list.txt"));

    expect(result.plans).toEqual([
      {
        guid: "381b4222-f694-41f0-9685-ff5bb260df2e",
        name: "Balanced",
        is_active: true
      },
      {
        guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
        name: "High performance",
        is_active: false
      },
      {
        guid: "a1841308-3541-4fab-bc81-f71556f20b4a",
        name: "Power saver",
        is_active: false
      }
    ]);
    expect(result.warnings).toEqual([]);
  });

  test("parses powercfg /getactivescheme output", () => {
    expect(parseActivePowerScheme(fixture("powercfg-active.txt"))).toEqual({
      guid: "381b4222-f694-41f0-9685-ff5bb260df2e",
      name: "Balanced",
      warnings: []
    });
  });

  test("reports malformed powercfg output without throwing", () => {
    const result = parsePowerPlans("not a power plan");

    expect(result.plans).toEqual([]);
    expect(result.warnings.join(" ")).toContain("No power plans");
  });

  test("reports missing powercfg as unavailable", async () => {
    const provider = createPowerCfgProvider(runnerReturning("", false));
    const result = await provider.listPlans();

    expect(result.plans).toEqual([]);
    expect(result.warnings.join(" ")).toContain("command unavailable");
  });
});

describe("nvidia-smi parsing", () => {
  test("parses the allowlisted nvidia-smi CSV query", () => {
    const result = parseNvidiaSmiCsv(fixture("nvidia-smi-query.csv"));

    expect(result.available).toBe(true);
    expect(result.name).toBe("NVIDIA GeForce RTX 5070 Ti Laptop GPU");
    expect(result.driver_version).toBe("576.80");
    expect(result.temperature_gpu_c).toBe(67);
    expect(result.utilization_gpu_percent).toBe(91);
    expect(result.memory_total_mb).toBe(12282);
    expect(result.power_draw_w).toBe(104.52);
    expect(result.pstate).toBe("P0");
    expect(result.warnings).toEqual([]);
  });

  test("reports malformed nvidia-smi output", () => {
    const result = parseNvidiaSmiCsv("only one column");

    expect(result.available).toBe(false);
    expect(result.warnings.join(" ")).toContain("Malformed");
  });

  test("reports missing nvidia-smi as unavailable", async () => {
    const provider = createNvidiaSmiProvider(runnerReturning("", false));
    const result = await provider.getGpuSnapshot();

    expect(result.available).toBe(false);
    expect(result.warnings.join(" ")).toContain("command unavailable");
  });
});

describe("CIM parsing", () => {
  test("parses structured CIM JSON", () => {
    const parsed = parseCimJson(fixture("cim-system.json"));

    expect(parsed.system.manufacturer).toContain("Micro-Star");
    expect(parsed.system.model).toContain("Vector");
    expect(parsed.system.cpu_name).toBe("AMD Ryzen 9 8940HX");
    expect(parsed.system.gpu_names).toContain("NVIDIA GeForce RTX 5070 Ti Laptop GPU");
    expect(parsed.battery.battery_percent).toBe(82);
    expect(parsed.warnings).toEqual([]);
  });

  test("reports CIM unavailable without hardware requirements", async () => {
    const provider = createWindowsCimProvider(runnerReturning("", false));

    const system = await provider.getSystemDetails();
    const battery = await provider.getBatteryStatus();

    expect(system.warnings.join(" ")).toContain("command unavailable");
    expect(battery.battery_present).toBe("unknown");
  });
});
