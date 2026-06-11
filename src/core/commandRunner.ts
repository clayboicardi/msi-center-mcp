import { execFile as nodeExecFile } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";

import { defaultConfig } from "./config.js";
import { SafetyError } from "./errors.js";

export type CommandAdapter = "powercfg" | "nvidia-smi" | "powershell-cim";

export interface CommandResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  commandName: string;
  warnings: string[];
}

export interface CommandRunner {
  run(
    adapter: string,
    executable: string,
    args: readonly string[],
    timeoutMs?: number
  ): Promise<CommandResult>;
}

export type ExecFileImpl = (
  file: string,
  args: string[],
  options: ExecFileOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    stdout: string | Buffer,
    stderr: string | Buffer
  ) => void
) => unknown;

interface CommandRule {
  executable: string;
  validateArgs: (args: readonly string[]) => boolean;
}

const NVIDIA_QUERY_FIELDS = [
  "name",
  "driver_version",
  "temperature.gpu",
  "utilization.gpu",
  "utilization.memory",
  "memory.total",
  "memory.used",
  "memory.free",
  "power.draw",
  "clocks.current.graphics",
  "clocks.current.memory",
  "pstate"
] as const;

const NVIDIA_QUERY_ARG = `--query-gpu=${NVIDIA_QUERY_FIELDS.join(",")}`;

export const POWERSHELL_CIM_QUERY = `
$ErrorActionPreference = 'Stop'
$result = [ordered]@{
  ComputerSystem = Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object -First 1 Manufacturer,Model
  BIOS = Get-CimInstance -ClassName Win32_BIOS | Select-Object -First 1 SMBIOSBIOSVersion,ReleaseDate
  OperatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object -First 1 Caption,Version,BuildNumber,TotalVisibleMemorySize
  Processor = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors
  VideoController = @(Get-CimInstance -ClassName Win32_VideoController | Select-Object Name)
  Battery = Get-CimInstance -ClassName Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus
}
$result | ConvertTo-Json -Depth 5 -Compress
`.trim();

const RULES: Record<CommandAdapter, CommandRule> = {
  powercfg: {
    executable: "powercfg",
    validateArgs: (args) =>
      args.length === 1 &&
      (args[0]?.toLowerCase() === "/list" || args[0]?.toLowerCase() === "/getactivescheme")
  },
  "nvidia-smi": {
    executable: "nvidia-smi",
    validateArgs: (args) =>
      (args.length === 1 && args[0] === "-L") ||
      (args.length === 2 &&
        args[0] === NVIDIA_QUERY_ARG &&
        args[1] === "--format=csv,noheader,nounits")
  },
  "powershell-cim": {
    executable: "powershell.exe",
    validateArgs: (args) =>
      args.length === 4 &&
      args[0] === "-NoProfile" &&
      args[1] === "-NonInteractive" &&
      args[2] === "-Command" &&
      args[3] === POWERSHELL_CIM_QUERY
  }
};

export function getNvidiaQueryArg(): string {
  return NVIDIA_QUERY_ARG;
}

export function createCommandRunner(options: { execFileImpl?: ExecFileImpl } = {}): CommandRunner {
  const execFileImpl = options.execFileImpl ?? (nodeExecFile as ExecFileImpl);

  return {
    async run(adapter, executable, args, timeoutMs = defaultConfig.commandTimeoutMs) {
      const rule = RULES[adapter as CommandAdapter];
      if (!rule) {
        throw new SafetyError(`Command adapter is not allowlisted: ${adapter}`);
      }

      if (executable !== rule.executable) {
        throw new SafetyError(`Executable ${executable} is not allowed for adapter ${adapter}.`);
      }

      if (!rule.validateArgs(args)) {
        throw new SafetyError(
          `Arguments are not allowed for adapter ${adapter}: ${args.join(" ")}`
        );
      }

      return new Promise<CommandResult>((resolve) => {
        execFileImpl(
          executable,
          [...args],
          {
            shell: false,
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 1024 * 1024
          },
          (error, stdout, stderr) => {
            const exitCode = typeof error?.code === "number" ? error.code : error ? 1 : 0;
            const timedOut =
              error?.name === "TimeoutError" ||
              error?.message?.toLowerCase().includes("timed out") === true ||
              error?.code === "ETIMEDOUT";
            const stderrText = Buffer.isBuffer(stderr) ? stderr.toString("utf8") : stderr;
            const warnings: string[] = [];

            if (error) {
              warnings.push(error.message);
            }

            if (timedOut) {
              warnings.push(`Command timed out after ${timeoutMs}ms.`);
            }

            resolve({
              ok: !error,
              exitCode,
              stdout: Buffer.isBuffer(stdout) ? stdout.toString("utf8") : stdout,
              stderr: stderrText,
              timedOut,
              commandName: adapter,
              warnings
            });
          }
        );
      });
    }
  };
}
