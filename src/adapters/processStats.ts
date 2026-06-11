import type { ProcessSummary } from "../telemetry/types.js";
import type { ProcessProvider } from "./sensorProvider.js";

export function createProcessStatsProvider(): ProcessProvider {
  return {
    async getProcessSummary(includeCommandLines: boolean): Promise<ProcessSummary> {
      const warnings = [
        includeCommandLines
          ? "Process command lines are disabled in v0.1."
          : "Process summary is unavailable in v0.1."
      ];

      return {
        available: false,
        processes: [],
        warnings
      };
    }
  };
}
