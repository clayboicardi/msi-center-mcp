# Security Policy

## Threat Model

This project runs locally and exposes telemetry tools to a future MCP client. The main risks are accidental hardware setting changes, arbitrary command execution, leaking private local data into logs, or widening a read-only tool into a write-capable control surface.

## Safety Boundaries

v0.1 is read-only except for local JSONL telemetry logs under the configured logs directory.

The server does not:

- Expose arbitrary shell execution.
- Expose arbitrary PowerShell execution.
- Require admin elevation.
- Write raw hardware controls.
- Write MSI Center settings.
- Write GPU tuning settings.
- Write fan tuning settings.
- Change power plans.
- Modify registry, BIOS, firmware, clocks, voltages, or power limits.

## Command Boundary

All real subprocess calls must use allowlisted adapters and argument arrays through `execFile` with `shell: false`.

Allowed command families:

- Read-only `powercfg` queries.
- Read-only `nvidia-smi` queries.
- Fixed PowerShell CIM queries against approved classes.

No MCP tool may expose the command runner directly.

## Logs And Privacy

Telemetry logs are JSONL files. By default they stay inside `./logs`, reject traversal, and do not permit external paths. Labels are sanitized before use in filenames.

Process command lines, browser URLs, personal file scanning, and external log locations are disabled by default.

## Future Write Checklist

Future write support must require all of the following before any implementation is accepted:

- `config.writesEnabled === true`.
- Runtime mode is not `read_only`.
- Caller requested `dryRun === false`.
- Explicit confirmation string.
- Allowlisted target name or GUID.
- Rollback state saved first.
- Tests for allowed and denied cases.
- Clear documentation of risk and recovery behavior.

## Review Checklist

Before merging future changes, reviewers should confirm:

- No arbitrary command or PowerShell execution was added.
- No hardware-control library, driver, kernel, WinRing0, EC/register, BIOS, firmware, or registry write path was added.
- All command arguments are fixed or allowlisted.
- Timeouts are enforced.
- stdout remains reserved for MCP protocol output.
- Logs remain bounded and path-safe.
- Default tests pass without MSI hardware, `nvidia-smi`, or `powercfg`.
