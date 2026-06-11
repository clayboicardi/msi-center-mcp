import path from "node:path";
import { fileURLToPath } from "node:url";

export type RuntimeMode = "read_only";

export interface AppConfig {
  mode: RuntimeMode;
  writesEnabled: boolean;
  maxLogDurationSeconds: number;
  defaultIntervalSeconds: number;
  logsDirectory: string;
  allowExternalLogPaths: boolean;
  commandTimeoutMs: number;
  includeProcessCommandLines: boolean;
  allowProcessList: boolean;
}

// MCP clients spawn this server from arbitrary working directories, so the
// default logs directory anchors to the package root, never process.cwd().
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const defaultConfig: AppConfig = Object.freeze({
  mode: "read_only",
  writesEnabled: false,
  maxLogDurationSeconds: 600,
  defaultIntervalSeconds: 2,
  logsDirectory: path.join(packageRoot, "logs"),
  allowExternalLogPaths: false,
  commandTimeoutMs: 10_000,
  includeProcessCommandLines: false,
  allowProcessList: true
});

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envNumber(name: string): number | undefined {
  const raw = envString(name);
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function envBoolean(name: string): boolean | undefined {
  const raw = envString(name)?.toLowerCase();
  if (raw === undefined) {
    return undefined;
  }

  if (raw === "1" || raw === "true") {
    return true;
  }

  if (raw === "0" || raw === "false") {
    return false;
  }

  return undefined;
}

function envOverrides(): Partial<AppConfig> {
  const overrides: Partial<AppConfig> = {};

  const logsDirectory = envString("MSI_CENTER_MCP_LOGS_DIR");
  if (logsDirectory !== undefined) {
    overrides.logsDirectory = logsDirectory;
  }

  const commandTimeoutMs = envNumber("MSI_CENTER_MCP_COMMAND_TIMEOUT_MS");
  if (commandTimeoutMs !== undefined) {
    overrides.commandTimeoutMs = commandTimeoutMs;
  }

  const maxLogDurationSeconds = envNumber("MSI_CENTER_MCP_MAX_LOG_DURATION_SECONDS");
  if (maxLogDurationSeconds !== undefined) {
    overrides.maxLogDurationSeconds = maxLogDurationSeconds;
  }

  const allowExternalLogPaths = envBoolean("MSI_CENTER_MCP_ALLOW_EXTERNAL_LOG_PATHS");
  if (allowExternalLogPaths !== undefined) {
    overrides.allowExternalLogPaths = allowExternalLogPaths;
  }

  return overrides;
}

export function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const config = {
    ...defaultConfig,
    ...envOverrides(),
    ...overrides
  };

  return {
    ...config,
    logsDirectory: path.resolve(config.logsDirectory)
  };
}
