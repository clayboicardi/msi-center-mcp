import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { defaultConfig } from "../src/core/config.js";
import { createFakeProviders } from "../src/adapters/fakeProviders.js";
import {
  captureTelemetryLog,
  getPowerStatus,
  getSystemInfo,
  getTelemetrySnapshot
} from "../src/telemetry/snapshot.js";
import { summarizeTelemetryLog } from "../src/telemetry/logSummary.js";
import { compareTelemetryLogs } from "../src/telemetry/logCompare.js";

const fixturePath = (name: string) => path.resolve("fixtures", name);

describe("telemetry composition", () => {
  test("gets system info with fake providers", async () => {
    const result = await getSystemInfo(createFakeProviders());

    expect(result.manufacturer).toContain("Micro-Star");
    expect(result.model).toContain("Vector");
    expect(result.powercfg_available).toBe(true);
    expect(result.nvidia_smi_available).toBe(true);
    expect(result.cim_available).toBe(true);
  });

  test("gets power status with fake providers", async () => {
    const result = await getPowerStatus(createFakeProviders());

    expect(result.ac_power).toBe(true);
    expect(result.battery_present).toBe(true);
    expect(result.battery_percent).toBe(82);
    expect(result.active_power_plan_name).toBe("Balanced");
  });

  test("composes a telemetry snapshot without processes by default", async () => {
    const result = await getTelemetrySnapshot(createFakeProviders(), { includeProcesses: false });

    expect(result.timestamp).toMatch(/T/);
    expect(result.gpu.available).toBe(true);
    expect(result.processes).toBeUndefined();
  });

  test("queries each provider exactly once per snapshot", async () => {
    const base = createFakeProviders();
    let cimCalls = 0;
    let planCalls = 0;
    let gpuCalls = 0;
    const providers = {
      ...base,
      cim: {
        getCimSnapshot: async () => {
          cimCalls += 1;
          return base.cim.getCimSnapshot();
        }
      },
      powerPlans: {
        ...base.powerPlans,
        getActivePlan: async () => {
          planCalls += 1;
          return base.powerPlans.getActivePlan();
        }
      },
      gpu: {
        getGpuSnapshot: async () => {
          gpuCalls += 1;
          return base.gpu.getGpuSnapshot();
        }
      }
    };

    await getTelemetrySnapshot(providers, { includeProcesses: false });

    expect(cimCalls).toBe(1);
    expect(planCalls).toBe(1);
    expect(gpuCalls).toBe(1);
  });
});

describe("telemetry log capture and analysis", () => {
  test("validates capture duration and interval", async () => {
    await expect(
      captureTelemetryLog(
        { durationSeconds: 1, intervalSeconds: 1, includeProcesses: false },
        createFakeProviders(),
        defaultConfig
      )
    ).rejects.toThrow(/durationSeconds/);
  });

  test("captures bounded JSONL logs inside the configured logs directory", async () => {
    const logsDirectory = await mkdtemp(path.join(tmpdir(), "msi-center-mcp-capture-"));
    const config = { ...defaultConfig, logsDirectory };
    let tick = 0;

    const result = await captureTelemetryLog(
      { label: "Gaming AC", durationSeconds: 2, intervalSeconds: 1, includeProcesses: false },
      createFakeProviders(),
      config,
      {
        now: () => new Date(Date.UTC(2026, 5, 10, 20, 0, tick++)),
        sleep: async () => undefined
      }
    );

    expect(result.sample_count).toBe(3);
    expect(result.log_path.startsWith(logsDirectory)).toBe(true);
    expect(result.log_path).toContain("gaming-ac");

    const lines = (await readFile(result.log_path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] ?? "{}").gpu.available).toBe(true);
  });

  test("summarizes sample fixture logs", async () => {
    const summary = await summarizeTelemetryLog(
      { logPath: fixturePath("sample-log-a.jsonl") },
      { ...defaultConfig, allowExternalLogPaths: true }
    );

    expect(summary.sample_count).toBe(3);
    expect(summary.gpu_temperature_c?.avg).toBeCloseTo(65.33, 2);
    expect(summary.gpu_utilization_percent?.max).toBe(84);
    expect(summary.active_power_plan_observations).toContain("Balanced");
    expect(summary.warnings).toContain("sample warning");
  });

  test("summarizes valid JSONL rows and reports malformed rows as warnings", async () => {
    const logsDirectory = await mkdtemp(path.join(tmpdir(), "msi-center-mcp-summary-"));
    await writeFile(
      path.join(logsDirectory, "mixed.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-06-10T20:00:00.000Z",
          gpu: { temperature_gpu_c: 60 },
          os: { memory_used_bytes: 1000 },
          warnings: []
        }),
        "{not valid json}"
      ].join("\n"),
      "utf8"
    );

    const summary = await summarizeTelemetryLog(
      { logPath: "mixed.jsonl" },
      { ...defaultConfig, logsDirectory }
    );

    expect(summary.sample_count).toBe(1);
    expect(summary.gpu_temperature_c?.avg).toBe(60);
    expect(summary.warnings.join(" ")).toContain("Malformed JSONL line 2");
  });

  test("compares sample fixture logs", async () => {
    const comparison = await compareTelemetryLogs(
      {
        baselineLogPath: fixturePath("sample-log-a.jsonl"),
        comparisonLogPath: fixturePath("sample-log-b.jsonl")
      },
      { ...defaultConfig, allowExternalLogPaths: true }
    );

    expect(comparison.deltas.gpu_temperature_c_avg).toBeGreaterThan(0);
    expect(comparison.interpretation.join(" ")).toContain("warmer");
    expect(comparison.caveats.join(" ")).toContain("repeatability");
  });

  test("fixtures are JSONL", () => {
    const lines = readFileSync(fixturePath("sample-log-a.jsonl"), "utf8").trim().split("\n");

    expect(lines.every((line) => JSON.parse(line))).toBe(true);
  });
});
