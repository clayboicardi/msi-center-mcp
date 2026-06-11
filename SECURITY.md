# Security Policy

## Threat Model

This project runs locally and exposes read-only telemetry and MSI Center insight tools to an MCP client (Claude Code). The main risks are accidental hardware setting changes, arbitrary command execution, leaking private local data into logs, or widening a read-only tool into a write-capable control surface.

## Safety Boundaries

v0.2 is read-only except for local JSONL telemetry logs under the configured logs directory.

The server does not:

- Expose arbitrary shell or PowerShell execution.
- Require admin elevation (the elevated `root/WMI` MSI_ACPI interface was explicitly rejected as an adapter surface).
- Write hardware controls, MSI Center settings, GPU/fan tuning, or power plans.
- Modify the registry (registry access is `reg.exe query`, read-only, two fixed keys).
- Modify BIOS, firmware, clocks, voltages, or power limits.

## Command Boundary

All real subprocess calls must use allowlisted adapters and argument arrays through `execFile` with `shell: false` and timeouts:

| Adapter          | Executable       | Allowed surface                                                               |
| ---------------- | ---------------- | ----------------------------------------------------------------------------- |
| `powercfg`       | `powercfg`       | `/list`, `/getactivescheme` only                                              |
| `nvidia-smi`     | `nvidia-smi`     | One fixed `--query-gpu=<allowlisted fields>` read query                       |
| `powershell-cim` | `powershell.exe` | One fixed read-only CIM script (exact-text match), approved `Win32_*` classes |
| `reg-msi`        | `reg.exe`        | `query <key> /s` where key ∈ {MSI Center `Component\Base Module`, `BaseInfo`} |

No MCP tool exposes the command runner directly. Safety tests assert rejection of write-shaped arguments (`powercfg /setactive`, `reg add`/`delete`, non-allowlisted registry keys, appended PowerShell commands, unapproved nvidia-smi fields).

## Filesystem Boundary

- Telemetry logs: JSONL files inside the configured logs directory; labels sanitized; traversal rejected; external paths disabled by default (`MSI_CENTER_MCP_ALLOW_EXTERNAL_LOG_PATHS`).
- Read-only reads of MSI's own data: `C:\ProgramData\MSI\AI_Battery\*_log.csv` (battery capacity history). No other paths outside the package are touched.
- Process command lines, browser URLs, and personal file scanning remain disabled.

## Future Write Checklist

Any future write support (e.g. `powercfg /setactive`) must require all of the following before implementation is accepted:

- `config.writesEnabled === true` and runtime mode is not `read_only`.
- Caller requested `dryRun === false` plus an explicit confirmation string.
- Allowlisted target name or GUID.
- Rollback state saved first.
- Tests for allowed and denied cases.
- Clear documentation of risk and recovery behavior.

MSI Center settings themselves (EC writes) stay manual-with-guidance regardless: the WMI/EC write interface needs admin and carries hardware risk.

## Review Checklist

Before merging future changes, confirm:

- No arbitrary command or PowerShell execution was added.
- No hardware-control library, driver, kernel, WinRing0, EC/register, BIOS, firmware, or registry write path was added.
- All command arguments are fixed or allowlisted; timeouts enforced.
- stdout remains reserved for MCP protocol output.
- Logs remain bounded and path-safe.
- Default tests pass without MSI hardware, `nvidia-smi`, `powercfg`, or MSI Center installed.
