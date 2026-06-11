import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  MSI_REG_KEYS,
  POWERSHELL_CIM_QUERY,
  createCommandRunner
} from "../src/core/commandRunner.js";
import { defaultConfig } from "../src/core/config.js";
import { resolveLogPath, sanitizeLogLabel } from "../src/core/paths.js";
import { READ_ONLY_MODE, assertReadOnlyConfig } from "../src/core/safety.js";

describe("default safety config", () => {
  test("keeps writes disabled in read-only mode", () => {
    expect(defaultConfig.mode).toBe(READ_ONLY_MODE);
    expect(defaultConfig.writesEnabled).toBe(false);
    expect(assertReadOnlyConfig(defaultConfig)).toEqual([]);
  });

  test("sanitizes labels for log file names", () => {
    expect(sanitizeLogLabel("Gaming AC ../ run!!")).toBe("gaming-ac-run");
  });

  test("rejects path traversal outside the logs directory", async () => {
    const logsDirectory = await mkdtemp(path.join(tmpdir(), "msi-center-mcp-logs-"));

    expect(() =>
      resolveLogPath("../secret.jsonl", {
        ...defaultConfig,
        logsDirectory,
        allowExternalLogPaths: false
      })
    ).toThrow(/outside/);
  });
});

describe("safe command runner", () => {
  test("rejects unknown adapters before execution", async () => {
    const calls: unknown[] = [];
    const runner = createCommandRunner({
      execFileImpl: (file, args, options, callback) => {
        calls.push({ file, args, options });
        callback(null, "", "");
        return {} as never;
      }
    });

    await expect(runner.run("not-allowed", "cmd.exe", ["/c", "echo nope"])).rejects.toThrow(
      /not allowlisted/
    );
    expect(calls).toEqual([]);
  });

  test("uses execFile with argument arrays and shell disabled", async () => {
    const calls: Array<{ file: string; args: readonly string[]; shell: unknown }> = [];
    const runner = createCommandRunner({
      execFileImpl: (file, args, options, callback) => {
        calls.push({ file, args: args ?? [], shell: options?.shell });
        callback(null, "ok", "");
        return {} as never;
      }
    });

    const result = await runner.run("powercfg", "powercfg", ["/list"]);

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ file: "powercfg", args: ["/list"], shell: false }]);
  });

  test("reports timedOut when the child process is killed by the timeout", async () => {
    const runner = createCommandRunner({
      execFileImpl: (_file, _args, _options, callback) => {
        const error = new Error("Command was killed") as NodeJS.ErrnoException & {
          killed?: boolean;
          signal?: string;
        };
        error.killed = true;
        error.signal = "SIGTERM";
        callback(error, "", "");
        return {} as never;
      }
    });

    const result = await runner.run("powercfg", "powercfg", ["/list"], 50);

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.warnings.join(" ")).toContain("timed out");
  });

  test("rejects write-capable powercfg arguments", async () => {
    const runner = createCommandRunner({
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
        return {} as never;
      }
    });

    await expect(
      runner.run("powercfg", "powercfg", ["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"])
    ).rejects.toThrow(/Arguments are not allowed/);
  });

  test("rejects unapproved nvidia-smi query fields", async () => {
    const runner = createCommandRunner({
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
        return {} as never;
      }
    });

    await expect(
      runner.run("nvidia-smi", "nvidia-smi", [
        "--query-gpu=name,power.limit",
        "--format=csv,noheader,nounits"
      ])
    ).rejects.toThrow(/Arguments are not allowed/);
  });

  test("requires PowerShell CIM calls to use -Command with fixed read-only query text", async () => {
    const calls: Array<{ file: string; args: readonly string[]; shell: unknown }> = [];
    const runner = createCommandRunner({
      execFileImpl: (file, args, options, callback) => {
        calls.push({ file, args: args ?? [], shell: options?.shell });
        callback(null, "{}", "");
        return {} as never;
      }
    });

    await runner.run("powershell-cim", "powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      POWERSHELL_CIM_QUERY
    ]);

    expect(calls[0]?.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    expect(calls[0]?.shell).toBe(false);

    await expect(
      runner.run("powershell-cim", "powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "Get-CimInstance -ClassName Win32_ComputerSystem | ConvertTo-Json"
      ])
    ).rejects.toThrow(/Arguments are not allowed/);
  });

  test("rejects PowerShell CIM scripts that append unapproved commands", async () => {
    const runner = createCommandRunner({
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "{}", "");
        return {} as never;
      }
    });

    await expect(
      runner.run("powershell-cim", "powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance -ClassName Win32_ComputerSystem; Remove-Item C:\\temp\\x | ConvertTo-Json"
      ])
    ).rejects.toThrow(/Arguments are not allowed/);
  });

  test("allows reg query only against the fixed MSI Center keys", async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const runner = createCommandRunner({
      execFileImpl: (file, args, _options, callback) => {
        calls.push({ file, args: args ?? [] });
        callback(null, "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\MSI\\MSI Center", "");
        return {} as never;
      }
    });

    for (const key of MSI_REG_KEYS) {
      const result = await runner.run("reg-msi", "reg.exe", ["query", key, "/s"]);
      expect(result.ok).toBe(true);
    }

    expect(calls).toHaveLength(MSI_REG_KEYS.length);
  });

  test("rejects reg writes and non-allowlisted reg keys", async () => {
    const runner = createCommandRunner({
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "", "");
        return {} as never;
      }
    });
    const baseModuleKey = MSI_REG_KEYS[0];

    await expect(
      runner.run("reg-msi", "reg.exe", ["add", baseModuleKey, "/v", "Mode", "/d", "2"])
    ).rejects.toThrow(/Arguments are not allowed/);
    await expect(
      runner.run("reg-msi", "reg.exe", ["delete", baseModuleKey, "/f"])
    ).rejects.toThrow(/Arguments are not allowed/);
    await expect(
      runner.run("reg-msi", "reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft", "/s"])
    ).rejects.toThrow(/Arguments are not allowed/);
    await expect(runner.run("reg-msi", "reg.exe", ["query", baseModuleKey])).rejects.toThrow(
      /Arguments are not allowed/
    );
    await expect(
      runner.run("reg-msi", "reg.exe", ["query", baseModuleKey, "/s", "/v", "Mode"])
    ).rejects.toThrow(/Arguments are not allowed/);
    await expect(
      runner.run("reg-msi", "cmd.exe", ["query", baseModuleKey, "/s"])
    ).rejects.toThrow(/not allowed for adapter/);
  });

  test("does not allow unused process-list command surface in v0.1", async () => {
    const runner = createCommandRunner({
      execFileImpl: (_file, _args, _options, callback) => {
        callback(null, "[]", "");
        return {} as never;
      }
    });

    await expect(
      runner.run("process-list", "powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-Process | Select-Object Id,ProcessName | ConvertTo-Json"
      ])
    ).rejects.toThrow(/not allowlisted/);
  });
});
