import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createConfig, defaultConfig } from "../src/core/config.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENV_KEYS = [
  "MSI_CENTER_MCP_LOGS_DIR",
  "MSI_CENTER_MCP_COMMAND_TIMEOUT_MS",
  "MSI_CENTER_MCP_MAX_LOG_DURATION_SECONDS",
  "MSI_CENTER_MCP_ALLOW_EXTERNAL_LOG_PATHS"
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe("config", () => {
  test("anchors the default logs directory to the package root", () => {
    expect(defaultConfig.logsDirectory).toBe(path.join(packageRoot, "logs"));
  });

  test("logs directory does not follow process.cwd()", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "msi-center-mcp-cwd-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(temp);

    try {
      vi.resetModules();
      const freshConfig = await import("../src/core/config.js");
      expect(freshConfig.createConfig().logsDirectory).toBe(path.join(packageRoot, "logs"));
    } finally {
      cwdSpy.mockRestore();
    }
  });

  test("environment variables override defaults", () => {
    const envLogsDir = path.join(tmpdir(), "msi-center-mcp-env-logs");
    process.env.MSI_CENTER_MCP_LOGS_DIR = envLogsDir;
    process.env.MSI_CENTER_MCP_COMMAND_TIMEOUT_MS = "5000";
    process.env.MSI_CENTER_MCP_MAX_LOG_DURATION_SECONDS = "120";
    process.env.MSI_CENTER_MCP_ALLOW_EXTERNAL_LOG_PATHS = "true";

    const config = createConfig();

    expect(config.logsDirectory).toBe(path.resolve(envLogsDir));
    expect(config.commandTimeoutMs).toBe(5000);
    expect(config.maxLogDurationSeconds).toBe(120);
    expect(config.allowExternalLogPaths).toBe(true);
  });

  test("invalid numeric environment values are ignored", () => {
    process.env.MSI_CENTER_MCP_COMMAND_TIMEOUT_MS = "not-a-number";
    process.env.MSI_CENTER_MCP_MAX_LOG_DURATION_SECONDS = "-5";

    const config = createConfig();

    expect(config.commandTimeoutMs).toBe(defaultConfig.commandTimeoutMs);
    expect(config.maxLogDurationSeconds).toBe(defaultConfig.maxLogDurationSeconds);
  });

  test("explicit overrides beat environment variables", () => {
    process.env.MSI_CENTER_MCP_COMMAND_TIMEOUT_MS = "5000";

    const config = createConfig({ commandTimeoutMs: 7000 });

    expect(config.commandTimeoutMs).toBe(7000);
  });
});
