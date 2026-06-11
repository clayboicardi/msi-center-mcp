# Claude Code Handoff: MSI Center MCP v0.1

> **HISTORICAL DOCUMENT (2026-06-10).** This describes Codex's v0.1 as handed off. Claude Code has since reviewed it, fixed the real-hardware bugs (CIM query 4x duplication, timeout detection, cwd-dependent logs dir), and shipped v0.2 with MSI Center registry insight, battery health, a knowledge base, and profile readiness checks. Current truth: README.md, SECURITY.md, AGENTS.md, docs/msi-center-knowledge.md, and the plan at docs/superpowers/plans/2026-06-10-msi-center-insight-v0.2.md.

This document is context for a cold-start Claude Code session. It summarizes what Codex built in this repository, why it is shaped this way, what was verified, and where future work can begin.

It is not intended to be an additional restriction layer for Claude Code. The current implementation has a deliberately read-only v0.1 product contract because that was the requested first build. If the user and Claude decide to expand beyond that contract, update the code, tests, README, SECURITY, and AGENTS files deliberately so the repository stays honest about what it does.

## Session Context

Repository path:

```text
<workspace>\msi-center-mcp
```

The original Codex prompt is preserved at:

```text
codex_msi_center_mcp_prompt.md
```

The project was built as a local stdio MCP server intended for later use by Claude Code. Codex did not configure Claude Code, did not run `claude mcp add`, did not edit Claude settings, and did not wire this server into any client. Git was initialized locally, but no commit was made.

The user installed npm dependencies manually after Codex reported preflight details and requested approval. Local tooling observed during the session:

```text
Node: v26.3.0
npm: 11.16.0
git: 2.54.0.windows.1
```

## Target Machine Context

The intended real hardware target is an MSI gaming laptop:

- Model: MSI Vector A16 HX A8WHG-048US
- CPU: AMD Ryzen 9 8940HX
- GPU: NVIDIA GeForce RTX 5070 Ti Laptop GPU, 12GB VRAM
- OS: Windows 11 Home
- RAM: 16GB DDR5
- Display: 16-inch QHD+ 2560 x 1600, 240Hz
- Storage: 1TB NVMe SSD

Default tests do not require this hardware. Fake providers are used so CI or another machine can run tests without MSI hardware, Windows-only telemetry, `nvidia-smi`, or `powercfg`.

## Current Product Scope

v0.1 is a read-only telemetry MCP server, except for writing local JSONL telemetry logs inside the configured logs directory.

Current tools:

1. `get_system_info`
2. `get_power_status`
3. `list_power_plans`
4. `get_active_power_plan`
5. `get_gpu_snapshot`
6. `get_telemetry_snapshot`
7. `capture_telemetry_log`
8. `summarize_telemetry_log`
9. `compare_telemetry_logs`
10. `list_profiles`
11. `dry_run_profile`

The implementation intentionally does not apply performance profiles, change Windows power plans, write MSI Center settings, change fans, change GPU/CPU clocks, change voltages, change NVIDIA power limits, write registry values, or expose arbitrary shell/PowerShell execution.

## Dependency Set

Runtime dependencies:

```text
@modelcontextprotocol/sdk
zod
```

Dev dependencies:

```text
typescript
vitest
eslint
@eslint/js
typescript-eslint
prettier
tsx
@types/node
```

Scripts in `package.json`:

```json
{
  "build": "tsc -p tsconfig.json",
  "start": "node dist/index.js",
  "dev": "tsx src/index.ts",
  "test": "vitest run --pool=threads",
  "test:watch": "vitest --pool=threads",
  "lint": "eslint . && prettier --check .",
  "format": "prettier --write .",
  "typecheck": "tsc -p tsconfig.json --noEmit"
}
```

Vitest uses `--pool=threads` because the default fork pool hit `spawn EPERM` in Codex's sandbox. Threads work locally in this workspace and keep the test suite fast.

## Repository Shape

Important top-level files:

```text
AGENTS.md
README.md
SECURITY.md
package.json
package-lock.json
tsconfig.json
eslint.config.js
prettier.config.js
.editorconfig
.gitignore
.prettierignore
```

Fixtures:

```text
fixtures/powercfg-list.txt
fixtures/powercfg-active.txt
fixtures/nvidia-smi-query.csv
fixtures/cim-system.json
fixtures/sample-log-a.jsonl
fixtures/sample-log-b.jsonl
```

Source tree:

```text
src/
  index.ts
  mcp/
    server.ts
    schemas.ts
  core/
    commandRunner.ts
    config.ts
    errors.ts
    logger.ts
    paths.ts
    result.ts
    safety.ts
  adapters/
    fakeProviders.ts
    nodeOs.ts
    nvidiaSmi.ts
    powercfg.ts
    processStats.ts
    sensorProvider.ts
    windowsCim.ts
  profiles/
    defaultProfiles.ts
    profileEngine.ts
    profiles.ts
  telemetry/
    logCompare.ts
    logSummary.ts
    snapshot.ts
    types.ts
```

Tests:

```text
tests/adapters.parsers.test.ts
tests/core.safety.test.ts
tests/mcp.test.ts
tests/profiles.test.ts
tests/telemetry.test.ts
```

## Architecture

The code is split around provider interfaces rather than direct hardware calls:

- `src/adapters/sensorProvider.ts` defines the provider interfaces and `createDefaultProviders()`.
- Real adapters call Windows/NVIDIA tools through the safe command runner.
- Fake providers return deterministic data for tests.
- Telemetry composition functions depend on `TelemetryProviders`, not directly on subprocesses.

This keeps the MCP tool layer thin and lets tests exercise behavior without hardware or OS dependencies.

### MCP Entrypoint

`src/index.ts` creates config, creates default providers, constructs the MCP server, and connects it to `StdioServerTransport`.

It does not print banners or startup messages. stdout is reserved for MCP protocol messages. Fatal startup errors are sent through the logger, which writes to stderr and a local debug log.

Manual dev run:

```powershell
npm run build
node dist/index.js
```

### MCP Registration

`src/mcp/server.ts` registers all tools with the official TypeScript MCP SDK. Tool callbacks return both:

- `content`: pretty JSON text for human-readable clients.
- `structuredContent`: object-shaped JSON for clients that consume structured MCP results.

The test `tests/mcp.test.ts` now uses the SDK `Client` and `InMemoryTransport` to initialize against the server, list tools, and call `get_system_info`. This is stronger than checking only an internal wrapper array.

### Schemas

`src/mcp/schemas.ts` uses Zod for tool input validation:

- Empty tools use a strict empty object schema.
- `get_telemetry_snapshot` accepts `includeProcesses`.
- `capture_telemetry_log` accepts `label`, `durationSeconds`, `intervalSeconds`, and `includeProcesses`.
- Log tools require string paths.
- `dry_run_profile` restricts profile names to the five supported profiles.

Config-aware limits, such as `maxLogDurationSeconds`, are enforced in the telemetry implementation rather than hard-coded into the MCP schema.

## Core Safety Design

### Config Defaults

`src/core/config.ts` defines:

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

`logsDirectory` is resolved to an absolute path when `createConfig()` is used.

### Command Runner

`src/core/commandRunner.ts` is the only subprocess gateway for real command adapters.

It uses:

- `execFile`
- argument arrays
- `shell: false`
- `windowsHide: true`
- timeout
- separate stdout/stderr capture
- structured result objects

Allowed adapters in v0.1:

```text
powercfg
nvidia-smi
powershell-cim
```

The command runner rejects unknown adapters before execution.

#### powercfg

Allowed:

```text
powercfg /list
powercfg /getactivescheme
```

Tests explicitly reject write-capable examples such as `powercfg /setactive`.

#### nvidia-smi

Allowed:

```text
nvidia-smi -L
nvidia-smi --query-gpu=name,driver_version,temperature.gpu,utilization.gpu,utilization.memory,memory.total,memory.used,memory.free,power.draw,clocks.current.graphics,clocks.current.memory,pstate --format=csv,noheader,nounits
```

Tests explicitly reject unapproved fields such as `power.limit`.

#### PowerShell CIM

The PowerShell adapter uses:

```text
powershell.exe -NoProfile -NonInteractive -Command <fixed query>
```

During the review pass, Codex tightened this from "contains `Get-CimInstance` and `ConvertTo-Json`" to exact fixed-script matching. This prevents a future internal caller from appending arbitrary commands while still claiming to be a CIM query.

The fixed script reads only these classes:

- `Win32_ComputerSystem`
- `Win32_BIOS`
- `Win32_OperatingSystem`
- `Win32_Processor`
- `Win32_VideoController`
- `Win32_Battery`

The unused `process-list` command runner adapter was removed during review. Real process summary remains a safe stub in v0.1.

## Adapter Details

### powercfg

`src/adapters/powercfg.ts` parses:

- `powercfg /list`
- `powercfg /getactivescheme`

Malformed output returns empty/null results with warnings rather than throwing.

### nvidia-smi

`src/adapters/nvidiaSmi.ts` parses one CSV row from the allowlisted query. Missing or `N/A` fields become `null` and are listed in `unavailable_fields`.

The parser handles quoted comma-containing fields at a basic CSV level. It currently uses the first non-empty row, so multi-GPU handling is intentionally simple.

### Windows CIM

`src/adapters/windowsCim.ts` runs the fixed PowerShell CIM script and parses JSON into:

- system details
- GPU names
- battery percent/status
- AC power approximation

CIM unavailability degrades to null/unknown values with warnings.

### Node OS

`src/adapters/nodeOs.ts` uses Node OS APIs for:

- platform
- architecture
- release
- uptime
- total/free/used memory
- approximate CPU load

CPU load is `null` on the first sample because it needs a previous reading to calculate a delta.

### Process Summary

`src/adapters/processStats.ts` intentionally returns unavailable in v0.1. It does not collect command lines, executable paths, browser URLs, or user file paths.

Fake providers return a simple process entry so telemetry composition can be tested when `includeProcesses` is true.

## Telemetry Flow

### Snapshots

`src/telemetry/snapshot.ts` composes:

- system info
- power status
- active power plan
- GPU snapshot
- OS snapshot
- optional process summary
- merged warnings
- unavailable fields

Because providers are injected, the same functions can run against fake providers or real adapters.

### Log Capture

`captureTelemetryLog()`:

- validates `durationSeconds` and `intervalSeconds`
- sanitizes labels through the path helper
- creates logs inside configured `logsDirectory`
- writes JSONL snapshots synchronously
- stops after a bounded number of samples
- returns final summary and metadata

Sample count is computed as:

```text
floor(durationSeconds / intervalSeconds) + 1
```

That captures the initial sample plus interval samples through the duration boundary.

### Log Summary

`src/telemetry/logSummary.ts` reads JSONL and calculates:

- sample count
- duration
- min/avg/max GPU temperature
- min/avg/max GPU utilization
- min/avg/max GPU power draw
- memory used first/last/delta
- observed power plan names
- warnings
- missing fields

During the review pass, malformed JSONL rows were changed from a thrown `SyntaxError` to skipped rows with a warning like:

```text
Malformed JSONL line 2 was skipped.
```

This makes log summarization more useful when one line is corrupt but the rest of the log is readable.

### Log Compare

`src/telemetry/logCompare.ts` summarizes both logs, computes deltas for average/max GPU temperature, utilization, and power, then produces practical interpretation strings plus caveats about workload repeatability.

## Profiles

Profiles are defined in `src/profiles/defaultProfiles.ts`:

- `balanced_daily`
- `gaming_ac`
- `quiet_work`
- `battery_saver`
- `cooldown`

`dryRunProfile()` reads current power/GPU state and returns:

- intended profile
- current detected state
- planned future actions
- safety checks
- blocked actions
- warnings
- note: `v0.1 dry run only; no settings were changed`

`gaming_ac` is blocked when AC power is not detected.

## Path And Log Safety

`src/core/paths.ts` provides:

- label sanitization
- logs directory creation
- timestamp-safe filenames
- inside-directory checks
- log path resolution

By default, log reads must resolve inside `logsDirectory`. Tests cover path traversal rejection.

Current implementation uses lexical path checks. It does not currently resolve symlinks with `realpath` before reads/writes. If future work expects hostile local filesystem conditions, symlink-aware path validation would be a good hardening step.

## Testing Coverage

Current test suite covers:

- `powercfg /list` parsing
- `powercfg /getactivescheme` parsing
- malformed/missing `powercfg`
- `nvidia-smi` CSV parsing
- malformed/missing `nvidia-smi`
- CIM JSON parsing
- CIM unavailable behavior
- fake-provider system info
- fake-provider power status
- telemetry snapshot composition
- capture validation
- bounded JSONL capture
- path traversal rejection
- malformed JSONL warning behavior
- log summary
- log comparison
- profile listing
- all dry-run profiles
- `gaming_ac` blocked on battery
- default read-only config
- unknown command adapter rejection
- `execFile` argument arrays and `shell: false`
- write-capable `powercfg` argument rejection
- unapproved `nvidia-smi` field rejection
- fixed PowerShell CIM command shape
- appended PowerShell command rejection
- unused process command surface rejection
- MCP server construction
- MCP SDK in-memory tool list and tool call
- no direct stdout writes in entrypoint

Final verification at the end of Codex's review pass should be checked in the session summary, but the expected commands are:

```powershell
npm test
npm run typecheck
npm run build
npm run lint
```

There is also a built-server smoke check that starts `node dist/index.js`, closes stdin, and verifies stdout is empty.

## Review Pass Changes After Initial Build

After the initial implementation, Codex performed a deeper review and made these hardening changes:

1. Tightened PowerShell CIM validation to exact fixed-script matching.
2. Removed the unused `process-list` command runner adapter.
3. Added regression tests for rejected `powercfg /setactive` and rejected unapproved `nvidia-smi` fields.
4. Added regression tests for appended PowerShell command rejection.
5. Added malformed JSONL tolerance with warning reporting.
6. Added a protocol-level MCP test with SDK `Client` and `InMemoryTransport`.
7. Restored `structuredContent` in tool results while keeping pretty JSON text content.

## Known Limitations

These are current v0.1 limitations, not necessarily long-term decisions:

- Real process summary is stubbed as unavailable.
- No config file or environment variable loading exists yet.
- CIM queries are repeated in some combined calls. This is simple and safe, but not optimized.
- Multi-GPU `nvidia-smi` output is reduced to the first non-empty row.
- Log capture uses synchronous sequential sampling and does not stream progress.
- Log path checks are lexical, not symlink-aware.
- There are no default real-hardware integration tests.
- There is no MCP Inspector setup.
- Tool output schemas are not declared, even though structured content is returned.
- No npm audit was run by Codex during review because network commands require explicit approval in the Codex session. The user's install output reported zero vulnerabilities at install time.

## Suggested Next Steps For Claude And User

Good next steps, depending on what the user wants:

1. Run the test suite and smoke check in Claude's environment.
2. Run real adapter smoke checks on the MSI laptop:
   - `powercfg /list`
   - `powercfg /getactivescheme`
   - `nvidia-smi -L`
   - the allowlisted `nvidia-smi --query-gpu=...` command
   - a read-only CIM query
3. Add optional integration tests that are skipped by default and only run when explicitly enabled.
4. Add output schemas to MCP tools so structured content is formally validated.
5. Add config loading if the user wants runtime customization.
6. Optimize telemetry snapshots so one combined CIM query can feed both system and battery state in a single sample.
7. Decide whether real process summary should exist, and if so, keep it minimal and avoid command lines by default.
8. Add log retention, log listing, or cleanup tools if the user wants longer-term capture workflows.
9. Consider symlink-aware path validation for log reads/writes if local filesystem hardening matters.
10. Decide whether any v0.2 write features are worth pursuing. If yes, design them explicitly with tests, rollback behavior, and clear user-facing risk language.

## Fast Orientation For Future Edits

If changing command behavior:

- Start in `src/core/commandRunner.ts`.
- Add tests in `tests/core.safety.test.ts`.
- Keep real subprocess execution behind named adapters.

If changing telemetry output:

- Start in `src/telemetry/types.ts`.
- Update composition in `src/telemetry/snapshot.ts`.
- Update log summary/compare if log shape changes.
- Update fixtures and tests.

If changing MCP tools:

- Update schemas in `src/mcp/schemas.ts`.
- Update registration in `src/mcp/server.ts`.
- Add or update in-memory client tests in `tests/mcp.test.ts`.
- Reflect tool changes in README.

If changing profiles:

- Update definitions in `src/profiles/defaultProfiles.ts`.
- Update logic in `src/profiles/profileEngine.ts`.
- Update `tests/profiles.test.ts`.

If adding real hardware integration tests:

- Keep them skipped by default.
- Use environment variables or explicit script names to opt in.
- Avoid making default CI/dev tests depend on MSI hardware, `nvidia-smi`, `powercfg`, or Windows-only APIs.

## Final Note

The important design idea is not "never expand this." The important design idea is that the current repo has a small, reviewable read-only core with fake-provider tests. That makes it a good base for future user-directed expansion because each new capability can be added behind an adapter boundary, tested without hardware where possible, and documented honestly.
