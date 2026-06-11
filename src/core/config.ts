import path from "node:path";

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

export const defaultConfig: AppConfig = Object.freeze({
  mode: "read_only",
  writesEnabled: false,
  maxLogDurationSeconds: 600,
  defaultIntervalSeconds: 2,
  logsDirectory: path.resolve(process.cwd(), "logs"),
  allowExternalLogPaths: false,
  commandTimeoutMs: 10_000,
  includeProcessCommandLines: false,
  allowProcessList: true
});

export function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const config = {
    ...defaultConfig,
    ...overrides
  };

  return {
    ...config,
    logsDirectory: path.resolve(config.logsDirectory)
  };
}
