import type { TelemetryProviders } from "../adapters/sensorProvider.js";
import type { BatteryHealth } from "../adapters/msiBatteryLog.js";
import { decodeMsiCenterState } from "../knowledge/decode.js";
import type { MsiCenterState } from "../knowledge/decode.js";
import { mergeWarnings } from "../core/result.js";
import { getTelemetrySnapshot } from "../telemetry/snapshot.js";
import type { ActivePowerPlan, GpuSnapshot, OsSnapshot, PowerStatus } from "../telemetry/types.js";
import { DEFAULT_PROFILES } from "./defaultProfiles.js";
import type {
  ProfileName,
  ReadinessExpectation,
  ReadinessRule,
  RuleSeverity
} from "./profiles.js";

export interface ReadinessContext {
  msi: MsiCenterState;
  power: PowerStatus;
  active_plan: ActivePowerPlan;
  gpu: GpuSnapshot;
  os: OsSnapshot;
  battery_health: BatteryHealth;
}

export type RuleStatus = "pass" | "fail" | "unknown";

export interface RuleResult {
  rule_id: string;
  severity: RuleSeverity;
  status: RuleStatus;
  description: string;
  actual: unknown;
  expected: ReadinessExpectation;
  manual_fix: string | null;
}

export interface ProfileReadinessResult {
  profile: ProfileName;
  ready: boolean;
  required_failures: number;
  recommended_failures: number;
  unknown_checks: number;
  results: RuleResult[];
  warnings: string[];
  note: string;
}

function resolveField(context: ReadinessContext, field: string): unknown {
  return field.split(".").reduce<unknown>((value, segment) => {
    if (value === null || value === undefined || typeof value !== "object") {
      return undefined;
    }

    return (value as Record<string, unknown>)[segment];
  }, context);
}

function matchesExpectation(value: unknown, expect: ReadinessExpectation): boolean {
  if (expect.equals !== undefined && value !== expect.equals) {
    return false;
  }

  if (expect.oneOf !== undefined && !expect.oneOf.includes(value as string | number | boolean)) {
    return false;
  }

  if (expect.min !== undefined && (typeof value !== "number" || value < expect.min)) {
    return false;
  }

  if (expect.max !== undefined && (typeof value !== "number" || value > expect.max)) {
    return false;
  }

  return true;
}

export function evaluateRule(rule: ReadinessRule, context: ReadinessContext): RuleResult {
  const actual = resolveField(context, rule.field);
  // null/undefined/"unknown" means the source could not tell us (e.g. an
  // uncalibrated registry mapping) — report unknown instead of failing.
  const indeterminate = actual === null || actual === undefined || actual === "unknown";
  const status: RuleStatus = indeterminate
    ? "unknown"
    : matchesExpectation(actual, rule.expect)
      ? "pass"
      : "fail";

  return {
    rule_id: rule.id,
    severity: rule.severity,
    status,
    description: rule.description,
    actual: actual ?? null,
    expected: rule.expect,
    manual_fix: status === "pass" ? null : rule.manual_fix
  };
}

export function evaluateProfileReadiness(
  profile: ProfileName,
  context: ReadinessContext
): ProfileReadinessResult {
  const definition = DEFAULT_PROFILES.find((candidate) => candidate.name === profile);
  if (!definition) {
    throw new Error(`Unknown profile: ${profile}`);
  }

  const results = definition.readiness_rules.map((rule) => evaluateRule(rule, context));
  const requiredFailures = results.filter(
    (result) => result.severity === "required" && result.status === "fail"
  ).length;
  const recommendedFailures = results.filter(
    (result) => result.severity === "recommended" && result.status === "fail"
  ).length;
  const unknownChecks = results.filter((result) => result.status === "unknown").length;

  return {
    profile,
    ready: requiredFailures === 0,
    required_failures: requiredFailures,
    recommended_failures: recommendedFailures,
    unknown_checks: unknownChecks,
    results,
    warnings: mergeWarnings(context.msi.warnings, context.power.warnings, context.gpu.warnings),
    note: "Read-only check: apply any fixes manually in MSI Center or Windows, then re-run."
  };
}

export async function checkProfileReadiness(
  profile: ProfileName,
  providers: TelemetryProviders
): Promise<ProfileReadinessResult> {
  const [snapshot, msiRaw, batteryHealth] = await Promise.all([
    getTelemetrySnapshot(providers, {}),
    providers.msiCenter.getMsiCenterRaw(),
    providers.batteryHealth.getBatteryHealth()
  ]);

  const context: ReadinessContext = {
    msi: decodeMsiCenterState(msiRaw),
    power: snapshot.power,
    active_plan: snapshot.active_power_plan,
    gpu: snapshot.gpu,
    os: snapshot.os,
    battery_health: batteryHealth
  };

  return evaluateProfileReadiness(profile, context);
}
