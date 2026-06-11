import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createConfig } from "../core/config.js";
import type { AppConfig } from "../core/config.js";
import { FORBIDDEN_TOOL_NAMES } from "../core/safety.js";
import { createDefaultProviders } from "../adapters/sensorProvider.js";
import type { TelemetryProviders } from "../adapters/sensorProvider.js";
import { compareTelemetryLogs } from "../telemetry/logCompare.js";
import { summarizeTelemetryLog } from "../telemetry/logSummary.js";
import {
  captureTelemetryLog,
  getPowerStatus,
  getSystemInfo,
  getTelemetrySnapshot
} from "../telemetry/snapshot.js";
import { decodeMsiCenterState } from "../knowledge/decode.js";
import { getKnowledgeEntry, listKnowledgeTopics } from "../knowledge/msiKnowledge.js";
import { dryRunProfile, listProfiles } from "../profiles/profileEngine.js";
import { checkProfileReadiness } from "../profiles/readiness.js";
import type { ProfileName } from "../profiles/profiles.js";
import {
  captureTelemetryLogInputSchema,
  checkProfileReadinessInputSchema,
  compareTelemetryLogsInputSchema,
  dryRunProfileInputSchema,
  emptyInputSchema,
  explainMsiSettingInputSchema,
  summarizeTelemetryLogInputSchema,
  telemetrySnapshotInputSchema
} from "./schemas.js";

export const TOOL_NAMES = [
  "get_system_info",
  "get_power_status",
  "list_power_plans",
  "get_active_power_plan",
  "get_gpu_snapshot",
  "get_telemetry_snapshot",
  "capture_telemetry_log",
  "summarize_telemetry_log",
  "compare_telemetry_logs",
  "list_profiles",
  "dry_run_profile",
  "get_msi_center_state",
  "get_battery_health",
  "explain_msi_setting",
  "check_profile_readiness"
] as const;

function packageVersion(): string {
  const pkg = createRequire(import.meta.url)("../../package.json") as { version?: string };
  return pkg.version ?? "0.0.0";
}

function toolResult(data: unknown) {
  const structuredContent = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent
  };
}

export interface MsiCenterMcpServer {
  server: McpServer;
  toolNames: readonly string[];
}

export interface MsiCenterMcpServerOptions {
  providers?: TelemetryProviders;
  config?: AppConfig;
}

export function createMsiCenterMcpServer(
  options: MsiCenterMcpServerOptions = {}
): MsiCenterMcpServer {
  const providers = options.providers ?? createDefaultProviders();
  const config = options.config ?? createConfig();
  const server = new McpServer({
    name: "msi-center-mcp",
    version: packageVersion()
  });

  for (const forbidden of FORBIDDEN_TOOL_NAMES) {
    if ((TOOL_NAMES as readonly string[]).includes(forbidden)) {
      throw new Error(`Forbidden tool registered: ${forbidden}`);
    }
  }

  server.registerTool(
    "get_system_info",
    {
      description: "Read manufacturer, model, OS, CPU, GPU, memory, and tool availability.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(await getSystemInfo(providers))
  );

  server.registerTool(
    "get_power_status",
    {
      description: "Read AC, battery, charging, and active Windows power plan status.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(await getPowerStatus(providers))
  );

  server.registerTool(
    "list_power_plans",
    {
      description: "List Windows power plans through read-only powercfg /list.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(await providers.powerPlans.listPlans())
  );

  server.registerTool(
    "get_active_power_plan",
    {
      description: "Read the active Windows power plan through powercfg /getactivescheme.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(await providers.powerPlans.getActivePlan())
  );

  server.registerTool(
    "get_gpu_snapshot",
    {
      description: "Read NVIDIA GPU telemetry through allowlisted nvidia-smi fields.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(await providers.gpu.getGpuSnapshot())
  );

  server.registerTool(
    "get_telemetry_snapshot",
    {
      description:
        "Read a combined system, power, GPU, OS, and optional process telemetry snapshot.",
      inputSchema: telemetrySnapshotInputSchema
    },
    async (args) =>
      toolResult(await getTelemetrySnapshot(providers, telemetrySnapshotInputSchema.parse(args)))
  );

  server.registerTool(
    "capture_telemetry_log",
    {
      description:
        "Synchronously capture a bounded JSONL telemetry log inside the local logs directory.",
      inputSchema: captureTelemetryLogInputSchema
    },
    async (args) =>
      toolResult(
        await captureTelemetryLog(captureTelemetryLogInputSchema.parse(args), providers, config)
      )
  );

  server.registerTool(
    "summarize_telemetry_log",
    {
      description: "Summarize a JSONL telemetry log after validating the log path.",
      inputSchema: summarizeTelemetryLogInputSchema
    },
    async (args) =>
      toolResult(await summarizeTelemetryLog(summarizeTelemetryLogInputSchema.parse(args), config))
  );

  server.registerTool(
    "compare_telemetry_logs",
    {
      description: "Compare two validated JSONL telemetry logs and provide practical caveats.",
      inputSchema: compareTelemetryLogsInputSchema
    },
    async (args) =>
      toolResult(await compareTelemetryLogs(compareTelemetryLogsInputSchema.parse(args), config))
  );

  server.registerTool(
    "list_profiles",
    {
      description: "List named dry-run-only performance profiles.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(listProfiles())
  );

  server.registerTool(
    "dry_run_profile",
    {
      description: "Reason about a named profile without changing any settings.",
      inputSchema: dryRunProfileInputSchema
    },
    async (args) => {
      const input = dryRunProfileInputSchema.parse(args);
      return toolResult(await dryRunProfile(input.profile, providers));
    }
  );

  server.registerTool(
    "get_msi_center_state",
    {
      description:
        "Read live MSI Center settings state (User Scenario, fan curves, GPU switch, Battery Master, AI Engine) from the registry. Decoded values carry confidence labels; raw values are included.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(decodeMsiCenterState(await providers.msiCenter.getMsiCenterRaw()))
  );

  server.registerTool(
    "get_battery_health",
    {
      description:
        "Read battery health (design vs full-charge capacity, wear, latest charge state) from MSI's AI_Battery log.",
      inputSchema: emptyInputSchema
    },
    async () => toolResult(await providers.batteryHealth.getBatteryHealth())
  );

  server.registerTool(
    "explain_msi_setting",
    {
      description:
        "Explain an MSI Center setting or machine-specific topic: what it does, how it works, values, tradeoffs, and per-workload recommendations.",
      inputSchema: explainMsiSettingInputSchema
    },
    async (args) => {
      const input = explainMsiSettingInputSchema.parse(args);
      return toolResult({
        entry: getKnowledgeEntry(input.topic) ?? null,
        available_topics: listKnowledgeTopics()
      });
    }
  );

  server.registerTool(
    "check_profile_readiness",
    {
      description:
        "Check live machine state against a named profile's readiness rules (e.g. llm_training) and report pass/fail/unknown per rule with manual fix steps. Read-only.",
      inputSchema: checkProfileReadinessInputSchema
    },
    async (args) => {
      const input = checkProfileReadinessInputSchema.parse(args);
      return toolResult(await checkProfileReadiness(input.profile as ProfileName, providers));
    }
  );

  return {
    server,
    toolNames: TOOL_NAMES
  };
}
