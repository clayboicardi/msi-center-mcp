import type { CommandRunner } from "../core/commandRunner.js";
import { defaultConfig } from "../core/config.js";
import type { ActivePowerPlan, PowerPlanList } from "../telemetry/types.js";
import type { PowerPlanProvider } from "./sensorProvider.js";

const PLAN_LINE = /Power Scheme GUID:\s*([0-9a-fA-F-]{36})\s+\(([^)]+)\)\s*(\*)?/i;

export function parsePowerPlans(stdout: string): PowerPlanList {
  const plans = stdout
    .split(/\r?\n/)
    .map((line) => PLAN_LINE.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({
      guid: match[1]?.toLowerCase() ?? "",
      name: match[2]?.trim() ?? "",
      is_active: Boolean(match[3])
    }))
    .filter((plan) => plan.guid && plan.name);

  return {
    plans,
    warnings: plans.length === 0 ? ["No power plans could be parsed from powercfg output."] : []
  };
}

export function parseActivePowerScheme(stdout: string): ActivePowerPlan {
  const match = PLAN_LINE.exec(stdout);

  if (!match) {
    return {
      guid: null,
      name: null,
      warnings: ["No active power scheme could be parsed from powercfg output."]
    };
  }

  return {
    guid: match[1]?.toLowerCase() ?? null,
    name: match[2]?.trim() ?? null,
    warnings: []
  };
}

export function createPowerCfgProvider(
  runner: CommandRunner,
  timeoutMs = defaultConfig.commandTimeoutMs
): PowerPlanProvider {
  return {
    async isPowerCfgAvailable() {
      const result = await runner.run("powercfg", "powercfg", ["/getactivescheme"], timeoutMs);
      return result.ok;
    },

    async listPlans() {
      const result = await runner.run("powercfg", "powercfg", ["/list"], timeoutMs);
      if (!result.ok) {
        return {
          plans: [],
          warnings: result.warnings.length > 0 ? result.warnings : ["powercfg /list failed."]
        };
      }

      const parsed = parsePowerPlans(result.stdout);
      return {
        ...parsed,
        warnings: [...parsed.warnings, ...result.warnings]
      };
    },

    async getActivePlan() {
      const result = await runner.run("powercfg", "powercfg", ["/getactivescheme"], timeoutMs);
      if (!result.ok) {
        return {
          guid: null,
          name: null,
          warnings:
            result.warnings.length > 0 ? result.warnings : ["powercfg /getactivescheme failed."]
        };
      }

      const parsed = parseActivePowerScheme(result.stdout);
      return {
        ...parsed,
        warnings: [...parsed.warnings, ...result.warnings]
      };
    }
  };
}
