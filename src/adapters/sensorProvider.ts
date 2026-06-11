import { createCommandRunner } from "../core/commandRunner.js";
import type {
  ActivePowerPlan,
  CimSnapshot,
  GpuSnapshot,
  OsSnapshot,
  PowerPlanList,
  ProcessSummary
} from "../telemetry/types.js";
import { createNvidiaSmiProvider } from "./nvidiaSmi.js";
import { createNodeOsProvider } from "./nodeOs.js";
import { createPowerCfgProvider } from "./powercfg.js";
import { createProcessStatsProvider } from "./processStats.js";
import { createWindowsCimProvider } from "./windowsCim.js";

export interface PowerPlanProvider {
  listPlans(): Promise<PowerPlanList>;
  getActivePlan(): Promise<ActivePowerPlan>;
}

export interface CimProvider {
  getCimSnapshot(): Promise<CimSnapshot>;
}

export interface GpuProvider {
  getGpuSnapshot(): Promise<GpuSnapshot>;
}

export interface NodeOsProvider {
  getOsSnapshot(): OsSnapshot;
}

export interface ProcessProvider {
  getProcessSummary(includeCommandLines: boolean): Promise<ProcessSummary>;
}

export interface TelemetryProviders {
  powerPlans: PowerPlanProvider;
  cim: CimProvider;
  gpu: GpuProvider;
  os: NodeOsProvider;
  processes: ProcessProvider;
}

export function createDefaultProviders(): TelemetryProviders {
  const commandRunner = createCommandRunner();

  return {
    powerPlans: createPowerCfgProvider(commandRunner),
    cim: createWindowsCimProvider(commandRunner),
    gpu: createNvidiaSmiProvider(commandRunner),
    os: createNodeOsProvider(),
    processes: createProcessStatsProvider()
  };
}
