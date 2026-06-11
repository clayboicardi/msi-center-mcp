import { z } from "zod";

import { PROFILE_NAMES } from "../profiles/profiles.js";

export const emptyInputSchema = z.object({}).strict();

export const telemetrySnapshotInputSchema = z
  .object({
    includeProcesses: z.boolean().default(false)
  })
  .strict();

export const captureTelemetryLogInputSchema = z
  .object({
    label: z.string().max(80).optional(),
    durationSeconds: z.number().int().min(2).optional(),
    intervalSeconds: z.number().int().min(1).max(30).optional(),
    includeProcesses: z.boolean().default(false)
  })
  .strict();

export const summarizeTelemetryLogInputSchema = z
  .object({
    logPath: z.string().min(1)
  })
  .strict();

export const compareTelemetryLogsInputSchema = z
  .object({
    baselineLogPath: z.string().min(1),
    comparisonLogPath: z.string().min(1)
  })
  .strict();

export const dryRunProfileInputSchema = z
  .object({
    profile: z.enum(PROFILE_NAMES)
  })
  .strict();
