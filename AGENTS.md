# AGENTS.md

This repository is a read-only local MCP server giving Claude Code full insight into this MSI laptop: telemetry, Windows power state, live MSI Center settings, battery health, a settings knowledge base, and per-task readiness checks.

## History and ownership

- v0.1 was built by Codex under a deliberately restricted contract (`docs/claude-code-handoff.md`, historical).
- v0.2 onward is maintained by Claude Code working with Clay. The Codex-era prohibitions on touching Claude Code configuration no longer apply: Clay approved wiring this server into Claude Code at user scope (2026-06-10).

## Hard restrictions (still binding for any agent)

Do not add, in any form:

- Arbitrary command execution or arbitrary PowerShell execution.
- Admin elevation (the elevated `root/WMI` MSI_ACPI interface was evaluated and rejected).
- MSI Center writes, MSI Center SDK integration, EC/register access.
- Fan-curve writes, voltage changes, CPU/GPU overclocking writes, NVIDIA tuning writes.
- BIOS/firmware writes, registry writes (`reg.exe` stays query-only).
- Unrestricted filesystem writes (logs stay inside the configured logs directory).

Windows power-plan writes (`powercfg /setactive`) are the one candidate future write; it is NOT implemented and must pass the full SECURITY.md write checklist before it ever is.

## Working in this repo

- Every real subprocess goes through `src/core/commandRunner.ts` allowlists; new command surfaces need safety tests in `tests/core.safety.test.ts` proving rejection of write-shaped arguments.
- Default tests must keep passing without MSI hardware, Windows-only tools, or MSI Center installed (fake providers in `src/adapters/fakeProviders.ts`).
- Registry value semantics live in per-machine profiles under `src/knowledge/machines/` (selected at runtime via EC firmware signature; shared types in `src/knowledge/msiRegistryMap.ts`). Never present an `inferred` mapping as fact; calibrate live (flip the setting in MSI Center, diff `get_msi_center_state` raw values) and only then mark `verified_live`. New machines get a new profile file, not edits to someone else's calibration.
- stdout is reserved for MCP protocol output; diagnostics go to stderr and the local debug log.
- The performance invariant from the v0.2 refactor: one CIM / powercfg / nvidia-smi invocation per tool call. The CIM query costs seconds on real hardware — never reintroduce nested re-querying.
- `node scripts/smoke-real.mjs` is the manual real-hardware check (read-only); run it after adapter changes when on the MSI laptop.

## Safety principles

Use allowlisted adapters only. Use argument arrays, never shell strings. Apply command timeouts. Degrade gracefully when a sensor or MSI Center is unavailable. Keep tests passing. Prefer small, reviewable changes.
