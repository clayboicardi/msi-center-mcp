# Codex Session Prompt: Build Low-Risk MSI Laptop Performance Telemetry MCP

Read this entire file and execute it as your prompt for this session.

You are Codex, working locally inside this project folder:

```text
C:\Users\clayboicardi\Projects\msi-center-mcp
```

Your job is to create a complete, well-structured repository for a **low-risk Windows 11 MCP server**. This MCP server will eventually be installed and used by **Claude Code**. You are only building the MCP server repository.

---

## 1. Critical Role Separation

- **Codex is the builder.**
- **Claude Code is the future MCP client/user.**
- Do **not** configure Claude Code.
- Do **not** run `claude mcp add`.
- Do **not** run `/mcp`.
- Do **not** edit `~/.claude`, `.claude`, `.mcp.json`, Claude Code settings, or any Claude configuration.
- Do **not** wire this MCP into Claude Code, Codex, or any other client.
- Build, test, and document the server only.

If you believe you need to inspect Claude Code configuration, first explain:

1. Which exact file you want to read.
2. Why it is necessary for building this MCP server.
3. Whether a safer alternative exists.

Never modify Claude Code configuration in this task.

Claude Code configuration files include, but are not limited to:

```text
%USERPROFILE%\.claude\settings.json
%USERPROFILE%\.claude.json
.claude\settings.json
.claude\settings.local.json
.mcp.json
```

---

## 2. Launch Assumptions and Workspace Boundary

Assume you are running inside this project folder only:

```text
C:\Users\clayboicardi\Projects\msi-center-mcp
```

Treat this folder as the workspace boundary.

Do not read or write files outside this folder except for standard package-manager caches and normal dependency installation behavior after user approval.

Do not:

- Modify user-level Codex configuration.
- Modify Claude Code configuration.
- Run `codex update`.
- Attempt to fix or change the user’s shell, profile, terminal, PowerShell installation, or Codex installation.
- Browse broadly or perform open-ended online research.

If a command needs network access, explain why and ask for approval first.

Package installation is allowed only for normal development dependencies needed by this repo.

---

## 3. Project Context

Target machine:

- Device type: MSI gaming laptop, not a desktop.
- Model: MSI Vector A16 HX A8WHG-048US.
- CPU: AMD Ryzen 9 8940HX.
- GPU: NVIDIA GeForce RTX 5070 Ti Laptop GPU, 12GB VRAM.
- OS: Windows 11 Home.
- RAM: 16GB DDR5.
- Display: 16-inch QHD+ 2560 x 1600, 240Hz.
- Storage: 1TB NVMe SSD.

User goal:

- Start low risk.
- Build a local MCP that helps Claude Code inspect telemetry, compare logs, and reason about safe performance profiles.
- Do not modify laptop settings in v0.1.

---

## 4. MCP Compatibility Requirements

Build a local **stdio MCP server** suitable for later use by Claude Code.

Requirements:

- Use stdio transport.
- Do not create an HTTP/SSE server unless there is a strong reason and the user explicitly approves it.
- Ensure `stdout` is reserved exclusively for valid MCP protocol messages.
- Use `stderr` for diagnostics.
- Use local log files for persistent debug logs.
- Do not print banners, progress messages, warnings, debug output, or ordinary logs to `stdout`.
- The server should be usable later as a process-spawned local MCP server.
- The built server should be launchable with a simple command such as:

```text
node dist/index.js
```

- Do not configure Claude Code to use it.
- Do not install or launch MCP Inspector unless explicitly asked later.
- A smoke test that constructs the server and lists registered tools in-process is enough for v0.1.

---

## 5. Primary Goal

Create **v0.1** of a local read-only Windows telemetry MCP server with:

1. System information inspection.
2. Power/battery state inspection.
3. Windows power plan inspection.
4. NVIDIA GPU telemetry inspection through read-only queries if `nvidia-smi` is available.
5. Combined telemetry snapshots.
6. Bounded JSONL telemetry log capture.
7. Telemetry log summarization.
8. Telemetry log comparison.
9. Dry-run performance profile reasoning.
10. A clean, tested, documented TypeScript project.

v0.1 must be read-only except for writing local JSONL telemetry logs inside the project-controlled logs directory.

---

## 6. Technology Preferences

Use:

- TypeScript.
- Node.js with a sensible current LTS-compatible setup.
- The official TypeScript MCP SDK package.
- Strict TypeScript.
- Zod or equivalent runtime schema validation.
- Vitest or Jest; prefer Vitest unless there is a good reason not to.
- ESLint and Prettier or equivalent lint/format tooling.
- ESM unless the MCP SDK or Windows runtime constraints make CommonJS better.
- A provider/adapter architecture so real Windows command adapters can be replaced by fake providers in tests.
- `child_process.execFile` or `spawn` with argument arrays, never shell string interpolation.
- Command timeouts.
- Structured errors and warnings.
- Graceful degradation when optional tools are unavailable.

Dependency hygiene:

- Prefer small, well-maintained dependencies.
- Ask before adding large, obscure, native, hardware-control, or driver-level dependencies.
- Do not add hardware-control libraries in v0.1.
- Do not add dependencies that require admin rights, drivers, kernel access, WinRing0, or raw device access.
- Pin normal semver ranges in `package.json`.
- If you need network access to verify the latest MCP package/API or install dependencies, ask for approval and explain the exact command first.

Preferred package manager:

- Use `npm` unless the existing workspace clearly uses another package manager.

---

## 7. Initial Folder Setup

This folder may be blank. Set it up as a proper project repository.

Create:

```text
package.json
package-lock.json, if npm is used
tsconfig.json
ESLint config
Prettier config
.gitignore
.editorconfig
README.md
SECURITY.md
AGENTS.md
src/ tree
tests/ or colocated test structure
fixtures/
logs/.gitkeep
dist/ ignored by git
coverage/ ignored by git
```

Initialize git if this is not already a git repository:

```text
git init
```

Do not create a remote.
Do not push anything.
Do not commit unless the user explicitly asks later.

If the folder is not empty:

- Inspect it.
- If it contains unrelated existing project files, stop and report instead of overwriting.
- If it only contains harmless placeholder files, proceed carefully.

---

## 8. Desired Repository Shape

Create something close to:

```text
msi-center-mcp/
  AGENTS.md
  README.md
  SECURITY.md
  package.json
  package-lock.json
  tsconfig.json
  .gitignore
  .editorconfig
  eslint.config.js or equivalent
  prettier.config.js or equivalent
  src/
    index.ts
    mcp/
      server.ts
      tools.ts
      schemas.ts
    core/
      commandRunner.ts
      errors.ts
      result.ts
      safety.ts
      config.ts
      paths.ts
      logger.ts
    adapters/
      powercfg.ts
      nvidiaSmi.ts
      windowsCim.ts
      nodeOs.ts
      processStats.ts
      sensorProvider.ts
      fakeProviders.ts
    profiles/
      profiles.ts
      profileEngine.ts
      defaultProfiles.ts
    telemetry/
      snapshot.ts
      logCapture.ts
      logSummary.ts
      logCompare.ts
      types.ts
  fixtures/
    powercfg-list.txt
    powercfg-active.txt
    nvidia-smi-query.csv
    cim-system.json
    sample-log-a.jsonl
    sample-log-b.jsonl
  logs/
    .gitkeep
  tests/ or colocated tests
```

This exact shape may be adjusted if the MCP SDK conventions strongly suggest a better layout, but keep the same safety and architecture goals.

---

## 9. Hard Safety Rules

v0.1 is read-only except for writing local JSONL telemetry logs.

Do **not** implement:

- Arbitrary command execution.
- Arbitrary PowerShell execution.
- A generic “run command” MCP tool.
- Admin elevation.
- MSI Center writes.
- MSI Center SDK integration.
- Mystic Light SDK integration.
- YAMDCC integration in v0.1.
- RWEverything.
- WinRing0.
- EC/register access.
- Fan curve writes.
- Voltage changes.
- CPU overclocking writes.
- GPU overclocking writes.
- NVIDIA tuning writes.
- NVIDIA power-limit writes.
- MSI Afterburner writes.
- BIOS writes.
- Firmware writes.
- Registry writes.
- Windows power plan writes in v0.1.
- Network access required at runtime.
- An indefinitely running background service.
- Command-line collection from user processes by default.
- Browser URL collection.
- Personal file path scanning outside this project.
- External log paths unless explicitly allowed by config; default must be false.
- Log path traversal.

---

## 10. Allowed Read-Only Command Surfaces for v0.1

Only these command surfaces are allowed in v0.1.

### 10.1 `powercfg`

Allowed:

```text
powercfg /list
powercfg /getactivescheme
```

Not allowed:

```text
powercfg /setactive
powercfg /change
powercfg /setacvalueindex
powercfg /setdcvalueindex
```

### 10.2 `nvidia-smi`

Allowed:

```text
nvidia-smi -L
nvidia-smi --query-gpu=<allowlisted fields> --format=csv,noheader,nounits
```

Allowlisted query fields:

```text
name
driver_version
temperature.gpu
utilization.gpu
utilization.memory
memory.total
memory.used
memory.free
power.draw
clocks.current.graphics
clocks.current.memory
pstate
```

Not allowed:

- Clock changes.
- Power-limit changes.
- Persistence-mode changes.
- Any NVIDIA setting modification.

### 10.3 PowerShell/CIM Read-Only Queries

Allowed CIM classes:

```text
Win32_ComputerSystem
Win32_BIOS
Win32_OperatingSystem
Win32_Processor
Win32_VideoController
Win32_Battery
```

PowerShell subprocess rule:

- Invoke `powershell.exe` with:

```text
-NoProfile
-NonInteractive
-Command
```

- Do not rely on the user’s PowerShell profile.
- Do not use profile-loaded aliases or functions.
- Prefer structured JSON output from PowerShell using `ConvertTo-Json` where practical.
- Do not use `-ExecutionPolicy Bypass` unless absolutely necessary and explained first.
- Do not run scripts from disk.
- Do not run arbitrary PowerShell supplied by an MCP caller.

### 10.4 Node OS APIs

Allowed:

- CPU load approximation.
- Memory usage.
- Uptime.
- Platform/architecture/release.

### 10.5 Optional Process Summary

Optional only if simple and safe.

- Only collect process data if `includeProcesses` is true.
- Collect process name, PID, and CPU/memory basics if feasible.
- Do not collect command lines by default.
- Do not collect full executable paths by default.
- It is acceptable for process summary to return `unavailable` in v0.1 rather than overbuilding this feature.

---

## 11. Config Defaults

Create a config module with defaults equivalent to:

```json
{
  "mode": "read_only",
  "writesEnabled": false,
  "maxLogDurationSeconds": 600,
  "defaultIntervalSeconds": 2,
  "logsDirectory": "./logs",
  "allowExternalLogPaths": false,
  "commandTimeoutMs": 10000,
  "includeProcessCommandLines": false,
  "allowProcessList": true
}
```

Additional config expectations:

- Treat config as internal/local for v0.1.
- Do not require users to edit config to get read-only telemetry.
- Logs directory should default inside the project.
- Support future config expansion without enabling writes.

---

## 12. Command Runner Requirements

Implement a safe command runner used only by allowlisted adapters.

Requirements:

- Only support named allowlisted adapters.
- Use `execFile` or `spawn` with argument arrays.
- Do not use `shell: true`.
- Enforce timeout.
- Capture `stdout` and `stderr` separately.
- Return structured results, including:

```text
ok
exitCode
stdout
stderr
timedOut
commandName
warnings
```

- Do not expose raw command execution as an MCP tool.
- Do not expose a general command runner to callers.

---

## 13. MCP Tools to Expose in v0.1

Expose the following tools.

### 13.1 `get_system_info`

Input:

```json
{}
```

Output:

- Manufacturer/model if available.
- BIOS version/date if available.
- OS name/version/build if available.
- CPU name/core count if available.
- GPU names if available.
- Total memory if available.
- Tool availability flags:
  - `powercfg_available`
  - `nvidia_smi_available`
  - `cim_available`
- Warnings.

### 13.2 `get_power_status`

Input:

```json
{}
```

Output:

- `ac_power`: `true` / `false` / `unknown`.
- `battery_present`: `true` / `false` / `unknown`.
- `battery_percent`: number or `null`.
- `charging_status`: string or `null`.
- `active_power_plan_guid`: string or `null`.
- `active_power_plan_name`: string or `null`.
- Provider status and warnings.

### 13.3 `list_power_plans`

Input:

```json
{}
```

Output:

- `plans`: array of `{ guid, name, is_active }`.
- Warnings.
- Parser warnings if any.

### 13.4 `get_active_power_plan`

Input:

```json
{}
```

Output:

- `guid`.
- `name`.
- Warnings.

### 13.5 `get_gpu_snapshot`

Input:

```json
{}
```

Output:

- `available`: boolean.
- `name`.
- `driver_version`.
- `temperature_gpu_c`.
- `utilization_gpu_percent`.
- `utilization_memory_percent`.
- `memory_total_mb`.
- `memory_used_mb`.
- `memory_free_mb`.
- `power_draw_w`.
- `clocks_current_graphics_mhz`.
- `clocks_current_memory_mhz`.
- `pstate`.
- Unavailable fields.
- Warnings.

### 13.6 `get_telemetry_snapshot`

Input:

```json
{
  "includeProcesses": false
}
```

Output:

- Timestamp.
- System summary.
- Power status.
- Active power plan.
- GPU snapshot.
- CPU load approximation if available.
- Memory usage.
- Top processes only if `includeProcesses` is true and safely available.
- Warnings and unavailable fields.

### 13.7 `capture_telemetry_log`

Input:

```json
{
  "label": "optional short label",
  "durationSeconds": 30,
  "intervalSeconds": 2,
  "includeProcesses": false
}
```

Validation:

- `durationSeconds` must be between 2 and `config.maxLogDurationSeconds`, default max 600.
- `intervalSeconds` must be between 1 and 30.
- `label` must be sanitized.

Output:

- `log_path`.
- `sample_count`.
- `started_at`.
- `ended_at`.
- `summary`.
- `warnings`.

Behavior:

- Synchronously capture bounded samples.
- Do not leave a background process running.
- Write JSONL snapshots.
- Include final summary.
- Save logs inside the configured logs directory by default.

### 13.8 `summarize_telemetry_log`

Input:

```json
{
  "logPath": "path"
}
```

Validation:

- Path must be inside logs directory unless `allowExternalLogPaths` is true.
- Reject path traversal.

Output:

- Sample count.
- Duration.
- Min/avg/max GPU temperature if available.
- Min/avg/max GPU utilization if available.
- Min/avg/max GPU power if available.
- Memory usage trend if available.
- Active power plan observations.
- Warnings.
- Missing fields.

### 13.9 `compare_telemetry_logs`

Input:

```json
{
  "baselineLogPath": "path",
  "comparisonLogPath": "path"
}
```

Validation:

- Both paths must be inside logs directory unless `allowExternalLogPaths` is true.
- Reject path traversal.

Output:

- Side-by-side summary.
- Deltas for averages/max values where available.
- Practical interpretation:
  - Cooler/warmer.
  - Higher/lower GPU utilization.
  - Higher/lower power draw.
  - Likely better/worse sustained performance only if supported by data.
- Caveats about workload repeatability.
- Warnings.

### 13.10 `list_profiles`

Input:

```json
{}
```

Output named dry-run profiles only:

- `balanced_daily`
- `gaming_ac`
- `quiet_work`
- `battery_saver`
- `cooldown`

Each profile should describe intended future actions, but v0.1 must not apply them.

### 13.11 `dry_run_profile`

Input:

```json
{
  "profile": "balanced_daily"
}
```

Allowed profile values:

```text
balanced_daily
gaming_ac
quiet_work
battery_saver
cooldown
```

Output:

- Intended profile.
- Current detected state.
- Planned future actions.
- Safety checks.
- Blocked actions.
- Warnings.
- Explicit note:

```text
v0.1 dry run only; no settings were changed
```

---

## 14. Dry-Run Profile Definitions

Profiles are dry-run only in v0.1.

### 14.1 `balanced_daily`

Intended future behavior:

- Windows power plan: Balanced.
- MSI Center mode: Balanced, manual only.
- GPU mode: MSHybrid, manual/reboot only.
- Fan policy: MSI auto, manual only.

v0.1 behavior:

- Report current state.
- Suggest manual actions only.
- Change nothing.

### 14.2 `gaming_ac`

Intended future behavior:

- Require AC power.
- Windows power plan: High Performance or equivalent if present.
- MSI Center mode: Extreme Performance, manual only.
- GPU mode: Discrete, manual/reboot only.
- Fan policy: aggressive/Cooler Boost, manual only.

v0.1 behavior:

- If not on AC, mark blocked.
- Report current state.
- Suggest manual actions only.
- Change nothing.

### 14.3 `quiet_work`

Intended future behavior:

- Windows power plan: Balanced or Power Saver.
- MSI Center mode: Silent, manual only.
- GPU mode: MSHybrid, manual/reboot only.

v0.1 behavior:

- Report current state.
- Suggest manual actions only.
- Change nothing.

### 14.4 `battery_saver`

Intended future behavior:

- Prefer unplugged/battery use.
- Windows power plan: Power Saver if available.
- MSI Center mode: Super Battery, manual only.
- GPU mode: MSHybrid/integrated if available, manual/reboot only.
- Refresh rate reduction may be suggested manually, not applied.

v0.1 behavior:

- Report current state.
- Suggest manual actions only.
- Change nothing.

### 14.5 `cooldown`

Intended future behavior:

- Temporarily increase fan cooling manually in MSI Center.
- Avoid launching writes.
- Suggest closing heavy processes if detected.

v0.1 behavior:

- Report thermal indicators.
- Suggest manual actions only.
- Change nothing.

---

## 15. Future v0.2 Placeholders

You may define interfaces/TODOs for later safe Windows power-plan writes, but do **not** enable real writes in v0.1.

Future write design should require all of:

- `config.writesEnabled === true`.
- Mode is not `read_only`.
- `dryRun === false`.
- Explicit confirmation string.
- Allowlisted plan GUID/name.
- Rollback state saved first.
- Tests covering allowed and denied cases.

Do not implement real write execution in v0.1.

---

## 16. Testing Requirements

Use fake providers so tests do not require real laptop hardware.

Default tests must not require:

- MSI hardware.
- `nvidia-smi`.
- `powercfg`.
- CIM availability.
- Windows-only runtime behavior.

Real adapters may have optional integration tests, but they must be skipped by default.

Add tests for:

- `powercfg /list` parser.
- `powercfg /getactivescheme` parser.
- `nvidia-smi` CSV parser.
- Missing `nvidia-smi`.
- Malformed `nvidia-smi` output.
- Missing `powercfg`.
- Malformed `powercfg` output.
- CIM unavailable.
- Battery unavailable.
- `get_system_info` with fake providers.
- `get_power_status` with fake providers.
- `get_telemetry_snapshot` with fake providers.
- `capture_telemetry_log` duration/interval validation.
- Log path sanitization.
- Path traversal rejection.
- Summarize log with sample fixtures.
- Compare logs with sample fixtures.
- `list_profiles`.
- `dry_run_profile` for all profiles.
- `gaming_ac` blocked on battery.
- No arbitrary command execution.
- No writes enabled in default config.
- Command runner uses allowlisted adapters and argument arrays.
- MCP server can be constructed and tools can be listed without hardware access.
- Server does not emit non-protocol startup text to stdout.

---

## 17. Documentation Requirements

### 17.1 `README.md`

README must include:

- What this MCP does.
- What this MCP intentionally does not do.
- Target future client: Claude Code.
- Builder: Codex.
- Reminder that this Codex task does not configure Claude Code.
- Requirements.
- Install/build/test commands.
- How to run the server manually for development only.
- Example tool outputs.
- Safety model.
- Privacy/logging notes.
- Future roadmap.
- A conceptual note that Claude Code can use stdio MCP servers later, but do not instruct Codex to run setup.
- No unsafe hardware-control instructions.

### 17.2 `SECURITY.md`

SECURITY must include:

- Threat model.
- Safety boundaries.
- No arbitrary shell.
- No admin requirement.
- No raw hardware writes.
- No MSI Center writes.
- No GPU tuning writes.
- No fan tuning writes.
- Logs and privacy.
- Safe future-write checklist.
- Review checklist for future changes.

### 17.3 `AGENTS.md`

Create this file early, before implementing most source files.

It should say:

```md
# AGENTS.md

This repository builds a low-risk local MCP server for Windows laptop performance telemetry.

## Primary client

The finished MCP server is intended to be installed and used by Claude Code.

Codex is being used only to design, implement, test, and document the MCP server. Codex must not configure Claude Code or wire this MCP into any client.

## Hard restrictions

Do not:
- Run `claude mcp add`.
- Run `/mcp`.
- Modify `~/.claude`.
- Modify `.claude`.
- Modify `.mcp.json`.
- Modify Claude Code settings.
- Configure this MCP in Claude Code.
- Add arbitrary command execution.
- Add arbitrary PowerShell execution.
- Add admin elevation.
- Add MSI Center writes.
- Add MSI Center SDK integration.
- Add EC/register access.
- Add fan-curve writes.
- Add voltage changes.
- Add CPU/GPU overclocking writes.
- Add NVIDIA tuning writes.
- Add MSI Afterburner writes.
- Add BIOS or firmware writes.
- Add registry writes.
- Add unrestricted filesystem writes.

## v0.1 scope

v0.1 is read-only except for writing local telemetry logs.

Allowed:
- Read system info.
- Read battery/AC status.
- Read Windows power plan state.
- Read NVIDIA GPU telemetry through read-only nvidia-smi queries.
- Capture bounded JSONL telemetry logs.
- Summarize logs.
- Compare logs.
- Dry-run named profiles.

Not allowed:
- Applying profiles.
- Changing power plans.
- Changing MSI Center settings.
- Changing fans.
- Changing GPU settings.

## Safety principles

Use allowlisted adapters only.
Use argument arrays, not shell string interpolation.
Apply command timeouts.
Gracefully degrade when sensors are unavailable.
Keep tests passing.
Prefer small, reviewable changes.
```

---

## 18. Development Scripts

`package.json` should include scripts similar to:

```json
{
  "scripts": {
    "build": "...",
    "start": "node dist/index.js",
    "dev": "...",
    "test": "...",
    "test:watch": "...",
    "lint": "...",
    "format": "...",
    "typecheck": "..."
  }
}
```

Include a clear server entrypoint.

If appropriate, include a `bin` entry such as:

```json
{
  "bin": {
    "msi-center-mcp": "./dist/index.js"
  }
}
```

Do not configure any MCP client to use it.

---

## 19. Acceptance Criteria

The task is complete when:

- Project is correctly initialized in the current folder.
- `AGENTS.md` exists and clearly prevents unsafe future expansion.
- `README.md` exists and clearly documents usage/safety.
- `SECURITY.md` exists and clearly documents threat model and boundaries.
- `npm install` succeeds, or equivalent if another package manager is selected.
- `npm run build` succeeds.
- `npm test` succeeds.
- `npm run lint` succeeds if lint is configured.
- MCP server can start locally.
- MCP tool list is available through a smoke test or in-process test.
- v0.1 tools are read-only except writing local JSONL telemetry logs.
- There is no code path that writes MSI Center settings.
- There is no code path that changes fans.
- There is no code path that changes GPU/CPU clocks, voltages, or power limits.
- There is no arbitrary shell execution tool.
- There is no arbitrary PowerShell execution tool.
- All real command calls use allowlisted adapters and argument arrays.
- Default tests pass without real MSI hardware.
- Default tests pass without requiring `nvidia-smi` or `powercfg` to exist.
- Server does not emit non-protocol startup text to stdout.
- Logs are JSONL, bounded, sanitized, and kept inside the configured logs directory by default.

---

## 20. Implementation Order

Follow this order:

1. Inspect the current folder.
2. Report preflight information listed in Section 21.
3. Wait for approval before dependency installation or network commands.
4. Initialize project files.
5. Create `AGENTS.md`.
6. Create `package.json`, TypeScript config, lint/format/test setup.
7. Create core types, result helpers, config, paths, safety checks.
8. Create fake providers.
9. Create parser tests and fixtures.
10. Implement `powercfg` parser/adapter.
11. Implement `nvidia-smi` parser/adapter.
12. Implement read-only CIM adapter.
13. Implement Node OS adapter.
14. Implement optional process summary adapter or return unavailable safely.
15. Implement telemetry snapshot composition.
16. Implement log capture.
17. Implement log summary.
18. Implement log comparison.
19. Implement dry-run profiles.
20. Implement MCP server/tools.
21. Add docs.
22. Run build, typecheck, tests, and lint.
23. Report exactly what was built, what remains intentionally stubbed, and what safety constraints are enforced.

Important: do not proceed to real setting changes in this task.

---

## 21. Final Preflight Before Implementation

Before doing project work, report:

1. The detected workspace root.
2. Whether the folder is empty or what files already exist.
3. Whether this is already a git repository.
4. The intended package manager.
5. The initial dependency list before installing anything.
6. Whether any command needs network access.
7. Whether the active workspace root matches:

```text
C:\Users\clayboicardi\Projects\msi-center-mcp
```

Then ask for approval before any network command or dependency installation.

Do not proceed if the workspace root is not:

```text
C:\Users\clayboicardi\Projects\msi-center-mcp
```

Do not run `codex update`.
Do not configure Claude Code.
Do not create or modify any Claude Code configuration files.

After preflight and normal dependency-install approval, proceed with implementation.
