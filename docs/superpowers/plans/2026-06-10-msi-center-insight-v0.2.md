# MSI Center Insight v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Codex's read-only telemetry MCP draft into a tool that gives Claude Code full read insight into MSI Center settings and verifies the machine is configured correctly for a named task (LLM inference/training, gaming, quiet, battery).

**Architecture:** Keep the v0.1 adapter/provider architecture and allowlisted command runner. Fix the real-hardware perf bugs (one CIM query per snapshot instead of four), then add a read-only MSI Center registry adapter (`reg.exe query` on two fixed HKLM keys), a battery-health adapter (MSI AI*Battery CSV), a curated knowledge base, and a profile-readiness checker. All writes remain out of scope (Clay's decision 2026-06-10): the server \_guides* manual MSI Center changes, never makes them.

**Tech Stack:** TypeScript (strict, NodeNext ESM), @modelcontextprotocol/sdk, zod, vitest (fake providers; no hardware needed for default tests).

**Decisions locked with Clay (2026-06-10):**

1. Write scope: read-only + guidance. No `powercfg /setactive` tool in v0.2.
2. Wiring: user-scope `claude mcp add` once validated.
3. Registry decoding: /multi:research community prior art + live calibration with Clay flipping MSI Center settings.

**Ground truth gathered on the target machine (this laptop):**

- CIM query via `powershell.exe` costs ~4.2 s per invocation; v0.1 runs it 4× per snapshot (~17 s/snapshot). Sampling at 2 s intervals is impossible and pollutes CPU readings.
- Real CIM output: `bios_date` arrives as `/Date(1753660800000)/`, `cpu_name` has trailing whitespace.
- Node execFile timeout kills with SIGTERM (`error.killed === true`); v0.1's `timedOut` detection never fires.
- `config.logsDirectory` resolves from `process.cwd()` — wrong once an MCP client spawns the server from an arbitrary cwd.
- MSI Center state lives in `HKLM\SOFTWARE\WOW6432Node\MSI\MSI Center\Component\Base Module\*` (no admin needed). WMI `root/WMI` MSI_ACPI classes require elevation — rejected as adapter surface.
- Battery health history: `C:\ProgramData\MSI\AI_Battery\*_log.csv` (`LogTime,DesignedCapacity,FullChargedCapacity,AC/DC,LifePercent`).
- Fixture captured: `fixtures/reg-query-base-module.txt` (real `reg query ... /s` output).

---

## Phase A — v0.1.1 correctness/perf fixes (no scope change)

### Task A0: Baseline commit

**Files:** all (initial commit of Codex's v0.1 as-is, plus plan doc and reg fixture)

- [ ] Add `.remember/` to `.gitignore`
- [ ] `git add -A && git commit -m "chore: codex v0.1 baseline"` — so every subsequent change is reviewable as a diff.

### Task A1: commandRunner timedOut detection

**Files:** Modify `src/core/commandRunner.ts`; Test `tests/core.safety.test.ts`

- [ ] Failing test: fake `execFileImpl` calls back with `{ message: "Command failed", killed: true, signal: "SIGTERM" }` error; expect `result.timedOut === true` and a warning mentioning the timeout.
- [ ] Implementation: `timedOut = Boolean(error && (error.killed === true || error.signal === "SIGTERM" || error.code === "ETIMEDOUT"))` via a local `ExecError` type extending `NodeJS.ErrnoException` with `killed?: boolean; signal?: NodeJS.Signals | null`.
- [ ] Run suite, commit.

### Task A2: One CIM/powercfg/nvidia-smi query per snapshot

**Files:** Modify `src/adapters/sensorProvider.ts`, `src/adapters/windowsCim.ts`, `src/adapters/powercfg.ts`, `src/adapters/nvidiaSmi.ts`, `src/adapters/fakeProviders.ts`, `src/telemetry/snapshot.ts`, `src/telemetry/types.ts`; Tests `tests/telemetry.test.ts`, `tests/adapters.parsers.test.ts`

- [ ] New type `CimSnapshot { available: boolean; system: SystemDetails; battery: BatteryStatus; warnings: string[] }`.
- [ ] `CimProvider` becomes `{ getCimSnapshot(): Promise<CimSnapshot> }` — ONE subprocess per call; availability derived from command success + JSON parse success.
- [ ] `ActivePowerPlan` gains `available: boolean` (powercfg responded); `PowerPlanProvider` drops `isPowerCfgAvailable` (derived). `GpuProvider` drops `isNvidiaSmiAvailable` (`GpuSnapshot.available` already carries it); remove the now-unused `nvidia-smi -L` allowlist entry.
- [ ] `snapshot.ts`: `getTelemetrySnapshot`/`getSystemInfo`/`getPowerStatus` each fan out exactly once — `Promise.all([cim.getCimSnapshot(), powerPlans.getActivePlan(), gpu.getGpuSnapshot()])` — and compose `SystemInfo`/`PowerStatus` from shared results via helpers `composeSystemInfo(...)`/`composePowerStatus(...)`. No nested re-querying.
- [ ] Test: counting fake providers assert exactly one CIM call per `get_telemetry_snapshot`.
- [ ] Run suite, commit.

### Task A3: Normalize real CIM output

**Files:** Modify `src/adapters/windowsCim.ts`, `fixtures/cim-system.json`; Test `tests/adapters.parsers.test.ts`

- [ ] `normalizeCimDate(value)`: `/Date(1753660800000)/` → ISO; DMTF `20260301000000.000000+000` → ISO; ISO passthrough; unparseable → null + warning. `trimToNull()` for all strings (real `cpu_name` has trailing spaces).
- [ ] Update fixture to the real-machine shapes (`/Date(...)/`, trailing whitespace) so tests prove normalization.
- [ ] Run suite, commit.

### Task A4: Config env loading + logs dir anchoring

**Files:** Modify `src/core/config.ts`; Test new `tests/core.config.test.ts`

- [ ] Default `logsDirectory` anchors to the **package root** (`path.resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "logs")`), not `process.cwd()`.
- [ ] Env overrides (defaults < env < explicit overrides): `MSI_CENTER_MCP_LOGS_DIR`, `MSI_CENTER_MCP_COMMAND_TIMEOUT_MS`, `MSI_CENTER_MCP_MAX_LOG_DURATION_SECONDS`, `MSI_CENTER_MCP_ALLOW_EXTERNAL_LOG_PATHS` (`"1"|"true"`). Invalid numeric env values are ignored.
- [ ] Run suite, commit.

### Task A5: Lean capture sampling

**Files:** Modify `src/telemetry/snapshot.ts`, `src/telemetry/types.ts`; Test `tests/telemetry.test.ts`

- [ ] New `TelemetryLogRecord`: `{ timestamp, gpu, os, active_power_plan, system?, power?, processes?, warnings }`. First record = full snapshot (system + power); middle records = gpu + os + active plan only (~300 ms collection); final record re-queries CIM so battery start/end is captured.
- [ ] Keep fixed `sleep(interval)` between samples but measure per-sample collection time; if it exceeds the interval, append warning `"Sampling fell behind: collection took Xms with a Ys interval."`.
- [ ] `logSummary.ts` already tolerates partial records (verify with test: middle records lack `system`, summary still works).
- [ ] Run suite, commit.

### Task A6: Small cleanups

**Files:** Modify `src/mcp/server.ts`, `src/telemetry/logCompare.ts`

- [ ] Server version single-sourced from `package.json` via `createRequire(import.meta.url)("../../package.json")`.
- [ ] `compareTelemetryLogs` warnings deduped via `mergeWarnings`.
- [ ] Run suite, commit.

---

## Phase B — MSI Center insight (v0.2 feature work)

### Task B1: `reg-msi` command adapter allowlist

**Files:** Modify `src/core/commandRunner.ts`; Test `tests/core.safety.test.ts`

- [ ] Allowlist entry: executable `reg.exe`, args exactly `["query", <key>, "/s"]` where `<key>` ∈ {`HKLM\SOFTWARE\WOW6432Node\MSI\MSI Center\Component\Base Module`, `HKLM\SOFTWARE\WOW6432Node\MSI\MSI Center\BaseInfo`}.
- [ ] Safety tests: reject `reg add`, `reg delete`, `reg query` on any other key, missing `/s` variants with extra args.
- [ ] Run suite, commit.

### Task B2: MSI Center registry adapter

**Files:** Create `src/adapters/msiCenterRegistry.ts`; Test `tests/adapters.msiRegistry.test.ts`; Fixture `fixtures/reg-query-base-module.txt` (already captured)

- [ ] `parseRegQueryOutput(stdout)`: header lines start `HKEY_LOCAL_MACHINE\...` (subkey path); value lines match `/^ {4}(.+?) {4}(REG_\w+) {4}(.*)$/`; `REG_DWORD` hex → number; others string. Returns `{ keys: Record<string, Record<string, string | number>>, warnings }`.
- [ ] Provider `MsiCenterProvider { getMsiCenterRaw(): Promise<MsiCenterRawState> }` where raw state = `{ available, base_module, base_info, warnings }` (2 reg queries, ~50 ms each).
- [ ] Tests parse the real fixture: assert `User Scenario` Mode value, fan-curve strings, `GeneralSetting` GPU_Switch present; malformed output degrades with warnings.
- [ ] Run suite, commit.

### Task B3: Decode layer with calibration-aware confidence

**Files:** Create `src/knowledge/msiRegistryMap.ts`, `src/knowledge/decode.ts`; Test `tests/knowledge.decode.test.ts`

- [ ] `type MappingConfidence = "verified_live" | "community" | "inferred" | "unknown"`. Every decoded value carries `{ raw, decoded, confidence, note? }` so Claude Code never over-trusts an uncalibrated mapping.
- [ ] `MsiCenterState`: msi_center_version, ec_version, user_scenario, ai_engine_enabled, gpu_switch, battery_master_mode, whisper_mode, fan curves (`Default_Temp`/`Default_Fan`/`User_Fan` decode: 12 ints `;`-joined = 6 CPU + 6 GPU; values >100 in fan banks are full-speed/boost sentinels), scenario_presets (0..5 → {performance, fan}), plus raw + warnings.
- [ ] Initial mappings ship at `community`/`inferred` confidence pending /multi:research output + live calibration; the map file is THE single place updated after calibration.
- [ ] Run suite, commit.

### Task B4: Battery health adapter

**Files:** Create `src/adapters/msiBatteryLog.ts`; Test `tests/adapters.batteryLog.test.ts`; Fixture `fixtures/ai-battery-log.csv`

- [ ] Reads newest `*_log.csv` in `C:\ProgramData\MSI\AI_Battery` (directory injectable for tests). Parses `LogTime,DesignedCapacity,FullChargedCapacity,AC/DC,LifePercent`.
- [ ] Output: `{ available, designed_capacity_mwh, full_charge_capacity_mwh, wear_percent, latest: { time, ac_power, charge_percent }, sample_count, warnings }`. Missing dir/files → `available: false` + warning (machine-agnostic default tests).
- [ ] Run suite, commit.

### Task B5: Knowledge base

**Files:** Create `src/knowledge/msiKnowledge.ts`, `docs/msi-center-knowledge.md`; Test `tests/knowledge.entries.test.ts`

- [ ] `KnowledgeEntry { id, title, ui_path, what_it_does, how_it_works, values?, tradeoffs, interactions, recommendations[], sources[], confidence }` for topics: `user_scenario`, `fan_modes_cooler_boost`, `gpu_switch_mshybrid_discrete`, `battery_master`, `whisper_mode`, `windows_power_plan_interplay`, `refresh_rate_and_power`, `llm_workloads_on_this_machine`, `telemetry_interpretation`.
- [ ] Content seeded from /multi:research synthesis (citations preserved in `sources`) + this machine's specifics (12 GB VRAM / 16 GB RAM ceiling guidance).
- [ ] Test: every topic id unique, all referenced ids resolvable, no empty bodies.
- [ ] Run suite, commit.

### Task B6: Profiles v2 + readiness rules

**Files:** Modify `src/profiles/profiles.ts`, `src/profiles/defaultProfiles.ts`; Create `src/profiles/readiness.ts`; Test `tests/profiles.test.ts`

- [ ] Add profiles `llm_inference`, `llm_training` (PROFILE_NAMES grows to 7 — additive, no breakage).
- [ ] Declarative `ReadinessRule { id, severity: "required"|"recommended", field (dotted path into ReadinessContext), expect { equals?|oneOf?|min?|max? }, description, manual_fix }` per profile. Evaluator returns `pass | fail | unknown` (unknown when the underlying decode confidence is `unknown` or value null — uncalibrated mappings must not produce false failures).
- [ ] `ReadinessContext = { msi: MsiCenterState, power: PowerStatus, active_plan: ActivePowerPlan, gpu: GpuSnapshot, os: OsSnapshot, battery_health }`, gathered with the same one-query-per-source discipline as Task A2.
- [ ] Run suite, commit.

### Task B7: New MCP tools + schemas

**Files:** Modify `src/mcp/schemas.ts`, `src/mcp/server.ts`, `src/adapters/sensorProvider.ts`, `src/adapters/fakeProviders.ts`; Test `tests/mcp.test.ts`

- [ ] Tools: `get_msi_center_state` (decoded + raw + confidence), `get_battery_health`, `explain_msi_setting` (`{ topic }` enum from knowledge ids), `check_profile_readiness` (`{ profile }` enum of 7) → `{ profile, ready, results[], warnings, note }`.
- [ ] In-memory SDK test: 15 tools listed; `get_msi_center_state` and `check_profile_readiness` callable with fake providers.
- [ ] Run suite, commit.

---

## Phase C — docs, calibration, wiring

### Task C1: Documentation rewrite for the CC era

**Files:** Modify `README.md`, `SECURITY.md`, `AGENTS.md`, `docs/claude-code-handoff.md` (mark as historical)

- [ ] README: new tool list, env config, MSI Center insight description, honest perf notes (CIM ≈ 4 s; capture cadence guidance), wiring instructions.
- [ ] SECURITY: command boundary now includes `reg.exe query` (2 fixed keys) and the fixed AI_Battery CSV read path; still no writes, no arbitrary execution, no admin.
- [ ] AGENTS.md: rewritten — builder is now Claude Code with Clay; keep hard safety rules (no EC/WMI writes, no arbitrary commands, no MSI Center writes); registration rules updated (user-scope wiring is approved); deliberate-expansion policy for any future write path (SECURITY checklist governs).
- [ ] Commit.

### Task C2: Calibration session (with Clay)

- [ ] Read /multi:research synthesis; fold sourced mappings into `msiRegistryMap.ts` at `community` confidence.
- [ ] Live calibration: Clay flips each User Scenario (and GPU switch / Battery Master if convenient) in MSI Center while CC re-reads the registry; update mappings to `verified_live`.
- [ ] Update `docs/msi-center-knowledge.md` with verified values. Commit.

### Task C3: Wire into Claude Code (user scope)

- [ ] `npm run build`; smoke: `node dist/index.js` over stdio stays silent on stdout.
- [ ] `claude mcp add --scope user msi-center -- node C:\Users\clayboicardi\Projects\msi-center-mcp\dist\index.js`
- [ ] Verify via `claude mcp list`; call `get_msi_center_state` from a fresh session. Commit + session summary to engram.
