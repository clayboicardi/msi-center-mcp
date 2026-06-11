import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "./config.js";
import { SafetyError, ValidationError } from "./errors.js";

export function sanitizeLogLabel(label?: string | null): string {
  if (!label) {
    return "";
  }

  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function ensureLogsDirectory(config: AppConfig): Promise<string> {
  const logsDirectory = path.resolve(config.logsDirectory);
  await mkdir(logsDirectory, { recursive: true });
  return logsDirectory;
}

export function formatTimestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function buildTelemetryLogPath(
  config: AppConfig,
  label: string | undefined,
  date: Date
): string {
  const safeLabel = sanitizeLogLabel(label);
  const suffix = safeLabel ? `-${safeLabel}` : "";
  return path.join(
    path.resolve(config.logsDirectory),
    `telemetry-${formatTimestampForFile(date)}${suffix}.jsonl`
  );
}

export function isPathInside(parentDirectory: string, candidatePath: string): boolean {
  const parent = path.resolve(parentDirectory);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveLogPath(logPath: string, config: AppConfig): string {
  const trimmed = logPath.trim();
  if (!trimmed) {
    throw new ValidationError("logPath is required.");
  }

  const logsDirectory = path.resolve(config.logsDirectory);
  const candidate = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(logsDirectory, trimmed);

  if (!config.allowExternalLogPaths && !isPathInside(logsDirectory, candidate)) {
    throw new SafetyError(`Log path is outside the configured logs directory: ${logPath}`);
  }

  return candidate;
}
