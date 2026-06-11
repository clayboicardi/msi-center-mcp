// Manual real-hardware smoke check (not part of the default test suite).
// Run on the MSI laptop after `npm run build`:
//   node scripts/smoke-real.mjs
// Exercises the real adapters: reg.exe, powercfg, nvidia-smi, PowerShell CIM,
// and the AI_Battery CSV. Read-only.
import { createDefaultProviders } from "../dist/adapters/sensorProvider.js";
import { decodeMsiCenterState } from "../dist/knowledge/decode.js";
import { checkProfileReadiness } from "../dist/profiles/readiness.js";
import { getTelemetrySnapshot } from "../dist/telemetry/snapshot.js";

const providers = createDefaultProviders();

let start = Date.now();
const raw = await providers.msiCenter.getMsiCenterRaw();
const state = decodeMsiCenterState(raw);
console.log(`\n=== get_msi_center_state (${Date.now() - start}ms) ===`);
console.log(
  JSON.stringify(
    {
      available: state.available,
      machine_profile: state.machine_profile,
      base_module_version: state.base_module_version,
      ec_version: state.ec_version,
      user_scenario: state.user_scenario,
      ai_engine_enabled: state.ai_engine_enabled,
      gpu_switch: state.gpu_switch,
      battery_master_mode: state.battery_master_mode,
      whisper_mode_enabled: state.whisper_mode_enabled,
      scenario_presets: state.scenario_presets.map((preset) => ({
        index: preset.index,
        performance: preset.performance.decoded ?? preset.performance.raw,
        fan: preset.fan.decoded ?? preset.fan.raw
      })),
      warnings: state.warnings
    },
    null,
    2
  )
);

start = Date.now();
const health = await providers.batteryHealth.getBatteryHealth();
console.log(`\n=== get_battery_health (${Date.now() - start}ms) ===`);
console.log(JSON.stringify(health, null, 2));

start = Date.now();
const snapshot = await getTelemetrySnapshot(providers, {});
console.log(`\n=== get_telemetry_snapshot (${Date.now() - start}ms) ===`);
console.log(
  JSON.stringify(
    {
      gpu: {
        name: snapshot.gpu.name,
        temperature_gpu_c: snapshot.gpu.temperature_gpu_c,
        memory_used_mb: snapshot.gpu.memory_used_mb,
        power_draw_w: snapshot.gpu.power_draw_w
      },
      power: {
        ac_power: snapshot.power.ac_power,
        battery_percent: snapshot.power.battery_percent,
        active_power_plan_name: snapshot.power.active_power_plan_name
      },
      warnings: snapshot.warnings
    },
    null,
    2
  )
);

start = Date.now();
const readiness = await checkProfileReadiness("llm_training", providers);
console.log(`\n=== check_profile_readiness llm_training (${Date.now() - start}ms) ===`);
console.log(
  JSON.stringify(
    {
      ready: readiness.ready,
      required_failures: readiness.required_failures,
      recommended_failures: readiness.recommended_failures,
      unknown_checks: readiness.unknown_checks,
      results: readiness.results.map((result) => ({
        rule: result.rule_id,
        status: result.status,
        actual: result.actual
      }))
    },
    null,
    2
  )
);
