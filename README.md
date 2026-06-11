# msi-center-mcp

Read-only MCP server giving Claude Code full insight into this MSI Vector A16 HX A8WHG laptop: hardware telemetry, Windows power state, **live MSI Center settings**, battery health, a curated knowledge base of what every MSI setting does, and per-task readiness checks (e.g. "is this machine configured correctly to train a model right now?").

v0.1 was built by Codex (`docs/claude-code-handoff.md`, historical). v0.2 was reviewed, fixed, and extended by Claude Code with Clay.

## What It Does

- Reads system, BIOS, OS, CPU, GPU, and memory information.
- Reads AC/battery status, Windows power plans, and the active plan.
- Reads NVIDIA telemetry through allowlisted `nvidia-smi` fields.
- **Reads live MSI Center state from the registry**: User Scenario, scenario presets, fan curves, GPU switch (MSHybrid/Discrete), Battery Master charge mode, AI Engine, WhisperMode, EC firmware version — with per-value confidence labels (`verified_live` / `community` / `inferred` / `unknown`).
- **Reads battery health** (design vs full-charge capacity, wear) from MSI's AI_Battery log.
- **Explains MSI settings** (`explain_msi_setting`): what each does, how it works, tradeoffs, and per-workload recommendations — including machine-specific LLM guidance (12GB VRAM / 16GB RAM).
- **Checks task readiness** (`check_profile_readiness`): evaluates live state against profiles like `llm_training` and reports pass/fail/unknown per rule with manual fix steps.
- Captures bounded JSONL telemetry logs; summarizes and compares them.

## What It Does Not Do

- It does not change anything: no Windows power plan writes, no MSI Center writes, no fan/clock/voltage/power-limit changes, no registry writes (registry access is `reg.exe query` only).
- It does not expose arbitrary command or PowerShell execution.
- It does not require admin privileges or runtime network access.

When state is wrong for a task, the server tells you exactly what to change manually in MSI Center or Windows; it never changes it for you. This is a deliberate decision (2026-06-10) — see SECURITY.md for the checklist any future write feature must pass.

## MCP Tools (15)

Telemetry: `get_system_info`, `get_power_status`, `list_power_plans`, `get_active_power_plan`, `get_gpu_snapshot`, `get_telemetry_snapshot`, `capture_telemetry_log`, `summarize_telemetry_log`, `compare_telemetry_logs`

Profiles: `list_profiles`, `dry_run_profile`, `check_profile_readiness` (profiles: `balanced_daily`, `gaming_ac`, `quiet_work`, `battery_saver`, `cooldown`, `llm_inference`, `llm_training`)

MSI insight: `get_msi_center_state`, `get_battery_health`, `explain_msi_setting`

### Typical Claude Code flows

- "Are we set up to train?" → `check_profile_readiness {"profile": "llm_training"}` → follow `manual_fix` strings for any failed rule.
- "What does Cooler Boost actually do?" → `explain_msi_setting {"topic": "fan_modes_cooler_boost"}`.
- "Did switching scenarios help?" → `capture_telemetry_log` before/after → `compare_telemetry_logs`.

## Performance Notes (real hardware)

- The PowerShell CIM query costs ~3-4s per invocation (powershell.exe spawn). Every snapshot-style tool runs it exactly once; `get_msi_center_state` (~80ms), `get_battery_health` (~2ms), and lean capture samples avoid it entirely.
- `capture_telemetry_log` middle samples read only fast sources (nvidia-smi, Node OS, powercfg); the first and last samples are full (battery start/end). Captures emit a warning if sampling falls behind the requested interval.
- Long captures block the tool call; keep `durationSeconds` well under your MCP client's tool timeout (30-60s is typical and sufficient).

## Confidence and Calibration

Raw MSI registry values are decoded through mapping tables in `src/knowledge/msiRegistryMap.ts`. Each decoded value carries a confidence label; `unknown`-confidence values evaluate to `unknown` (never `fail`) in readiness checks. To calibrate: flip a setting in MSI Center, re-run `get_msi_center_state`, diff the raw values, update the mapping, and raise its confidence to `verified_live`.

## Requirements

- Windows 11 for the real adapters (tests run anywhere via fake providers).
- Node.js 20+.
- Optional: `nvidia-smi` on PATH, `powercfg`, PowerShell, MSI Center installed (each degrades gracefully with warnings).

## Configuration

Defaults are read-only and need no setup. Environment overrides:

| Variable                                  | Default          | Meaning                              |
| ----------------------------------------- | ---------------- | ------------------------------------ |
| `MSI_CENTER_MCP_LOGS_DIR`                 | `<package>/logs` | Telemetry log directory              |
| `MSI_CENTER_MCP_COMMAND_TIMEOUT_MS`       | `10000`          | Subprocess timeout                   |
| `MSI_CENTER_MCP_MAX_LOG_DURATION_SECONDS` | `600`            | Capture duration ceiling             |
| `MSI_CENTER_MCP_ALLOW_EXTERNAL_LOG_PATHS` | `false`          | Allow log reads outside the logs dir |

## Development

```powershell
npm install
npm run build
npm test          # 75 tests, fake providers, no hardware needed
npm run lint
npm run typecheck
node scripts/smoke-real.mjs   # manual real-hardware smoke check (read-only)
```

Run the stdio server manually: `npm run build && node dist/index.js` (stdout is reserved for MCP protocol; diagnostics go to stderr and `logs/server-debug.log`).

## Claude Code Wiring

```powershell
claude mcp add --scope user msi-center -- node C:\Users\clayboicardi\Projects\msi-center-mcp\dist\index.js
```

User scope makes the tools available in every Claude Code session on this machine. After pulling changes, re-run `npm run build` — the registration points at `dist/`.

## Safety Model

All real command calls go through allowlisted adapters using `execFile` argument arrays with `shell: false`:

- `powercfg /list`, `powercfg /getactivescheme`
- `nvidia-smi --query-gpu=<allowlisted fields> --format=csv,noheader,nounits`
- One fixed, read-only PowerShell CIM script (approved `Win32_*` classes only)
- `reg.exe query` on exactly two MSI Center HKLM keys, `/s` only

File reads outside the package: MSI's battery log directory (`C:\ProgramData\MSI\AI_Battery`), read-only. There is no generic command runner tool. See `SECURITY.md`.
