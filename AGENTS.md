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
