import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  createMsiCenterRegistryProvider,
  parseRegQueryOutput
} from "../src/adapters/msiCenterRegistry.js";
import type { CommandRunner } from "../src/core/commandRunner.js";

const fixture = readFileSync(
  new URL("../fixtures/reg-query-base-module.txt", import.meta.url),
  "utf8"
);

const runnerReturning = (stdout: string, ok = true): CommandRunner => ({
  run: async () => ({
    ok,
    exitCode: ok ? 0 : 1,
    stdout,
    stderr: ok ? "" : "missing",
    timedOut: false,
    commandName: "reg-msi",
    warnings: ok ? [] : ["command unavailable"]
  })
});

describe("reg query parsing", () => {
  test("parses the real Base Module dump into keyed values", () => {
    const parsed = parseRegQueryOutput(fixture);

    const baseModule =
      parsed.keys[
        "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\MSI\\MSI Center\\Component\\Base Module"
      ];
    expect(baseModule?.Version).toBe("1.0.2605.0601");

    const userScenario = Object.entries(parsed.keys).find(([key]) =>
      key.endsWith("\\User Scenario")
    )?.[1];
    expect(userScenario?.Mode).toBe(1);

    const scenario = Object.entries(parsed.keys).find(([key]) => key.endsWith("\\Scenario"))?.[1];
    expect(scenario?.Default_Fan).toBe("38;44;50;58;64;86;38;44;50;58;64;86");
    expect(scenario?.ECversion).toContain("15MM");

    const general = Object.entries(parsed.keys).find(([key]) =>
      key.endsWith("\\GeneralSetting")
    )?.[1];
    expect(general?.GPU_Switch).toBe(0);
    expect(general?.BatteryMode).toBe(1);
  });

  test("hex REG_DWORD values become numbers", () => {
    const parsed = parseRegQueryOutput(
      [
        "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\MSI\\MSI Center\\Test",
        "    Big    REG_DWORD    0x3e9",
        "    Name    REG_SZ    hello world",
        "    Empty    REG_SZ    "
      ].join("\r\n")
    );

    const values = parsed.keys["HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\MSI\\MSI Center\\Test"];
    expect(values?.Big).toBe(1001);
    expect(values?.Name).toBe("hello world");
    expect(values?.Empty).toBe("");
  });

  test("degrades on malformed output with warnings", () => {
    const parsed = parseRegQueryOutput("complete garbage\nmore garbage");

    expect(Object.keys(parsed.keys)).toHaveLength(0);
    expect(parsed.warnings.join(" ")).toContain("No registry keys");
  });
});

describe("MSI Center registry provider", () => {
  test("reports available with merged keys when reg succeeds", async () => {
    const provider = createMsiCenterRegistryProvider(runnerReturning(fixture));

    const raw = await provider.getMsiCenterRaw();

    expect(raw.available).toBe(true);
    expect(Object.keys(raw.keys).length).toBeGreaterThan(5);
  });

  test("reports unavailable when reg.exe is missing", async () => {
    const provider = createMsiCenterRegistryProvider(runnerReturning("", false));

    const raw = await provider.getMsiCenterRaw();

    expect(raw.available).toBe(false);
    expect(raw.keys).toEqual({});
    expect(raw.warnings.join(" ")).toContain("unavailable");
  });

  test("silently skips allowlisted keys that don't exist on this machine family", async () => {
    // Laptops have Base Module but not the desktop keys; desktops the inverse.
    // A key that reg.exe reports as missing is expected cross-family noise,
    // not a warning-worthy failure.
    const runner: CommandRunner = {
      run: async (_adapter, _executable, args) => {
        const key = args[1] ?? "";
        if (key.includes("Base Module")) {
          return {
            ok: false,
            exitCode: 1,
            stdout: "",
            stderr: "ERROR: The system was unable to find the specified registry key or value.",
            timedOut: false,
            commandName: "reg-msi",
            warnings: ["Command failed: reg.exe query ..."]
          };
        }

        return {
          ok: true,
          exitCode: 0,
          stdout: fixture,
          stderr: "",
          timedOut: false,
          commandName: "reg-msi",
          warnings: []
        };
      }
    };

    const provider = createMsiCenterRegistryProvider(runner);
    const raw = await provider.getMsiCenterRaw();

    expect(raw.available).toBe(true);
    expect(raw.warnings).toEqual([]);
  });
});
