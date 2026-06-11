# msi-center-mcp

Read-only Windows 11 laptop telemetry MCP server for an MSI Vector A16 HX A8WHG-class machine.

This repository is built by Codex as a local MCP server project. The future target client is Claude Code, but this task does not configure Claude Code and does not wire this server into any MCP client.

## What It Does

- Reads system, BIOS, OS, CPU, GPU, and memory information when available.
- Reads AC/battery status and the active Windows power plan.
- Lists Windows power plans with read-only `powercfg /list`.
- Reads NVIDIA telemetry with allowlisted `nvidia-smi` fields when `nvidia-smi` is available.
- Creates combined telemetry snapshots.
- Captures bounded JSONL telemetry logs inside `./logs`.
- Summarizes and compares telemetry logs.
- Lists and dry-runs named performance profiles.

## What It Does Not Do

- It does not configure Claude Code.
- It does not change Windows power plans.
- It does not change MSI Center settings.
- It does not change fans, fan curves, clocks, voltages, power limits, registry values, BIOS, or firmware.
- It does not expose arbitrary command execution or arbitrary PowerShell execution.
- It does not require admin privileges.
- It does not require runtime network access.

## Requirements

- Windows 11 for real telemetry adapters.
- Node.js 20 or newer.
- Optional: `nvidia-smi` on PATH for NVIDIA GPU telemetry.
- Optional: `powercfg` and PowerShell CIM availability for Windows power and system details.

Tests use fake providers and do not require MSI hardware, Windows, `nvidia-smi`, or `powercfg`.

## Development Commands

```powershell
npm install
npm run build
npm test
npm run lint
npm run typecheck
```

Run the stdio server manually for development only:

```powershell
npm run build
node dist/index.js
```

The server reserves stdout for MCP protocol messages. Diagnostics go to stderr and local logs.

## MCP Tools

- `get_system_info`
- `get_power_status`
- `list_power_plans`
- `get_active_power_plan`
- `get_gpu_snapshot`
- `get_telemetry_snapshot`
- `capture_telemetry_log`
- `summarize_telemetry_log`
- `compare_telemetry_logs`
- `list_profiles`
- `dry_run_profile`

Example `get_gpu_snapshot` shape:

```json
{
  "available": true,
  "name": "NVIDIA GeForce RTX 5070 Ti Laptop GPU",
  "temperature_gpu_c": 67,
  "utilization_gpu_percent": 91,
  "power_draw_w": 104.52,
  "warnings": []
}
```

Example dry-run note:

```json
{
  "profile": "gaming_ac",
  "blocked_actions": [],
  "note": "v0.1 dry run only; no settings were changed"
}
```

## Safety Model

All real command calls go through allowlisted adapters and `execFile` argument arrays with `shell: false`.

Allowed command surfaces in v0.1:

- `powercfg /list`
- `powercfg /getactivescheme`
- `nvidia-smi -L`
- `nvidia-smi --query-gpu=<allowlisted fields> --format=csv,noheader,nounits`
- Fixed, read-only PowerShell CIM queries for approved `Win32_*` classes

There is no generic command runner MCP tool.

## Privacy And Logs

Telemetry captures are JSONL files written under `./logs` by default. Log labels are sanitized, capture duration is bounded, and path traversal is rejected. External log paths are disabled by default.

Process details are not collected by default. v0.1 returns process summary as unavailable unless safely expanded later, and command lines remain disabled.

## Future Roadmap

Possible v0.2 work can add carefully reviewed dry-run-to-apply flows for Windows power-plan changes only after explicit safeguards exist. Any future write path must require read-only mode to be disabled, writes to be enabled, explicit confirmation, allowlisted targets, rollback state, and tests for both allowed and denied cases.

Claude Code can use stdio MCP servers later, but this repository intentionally stops at building and testing the server.
