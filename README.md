# msi-center-mcp

A read-only [MCP](https://modelcontextprotocol.io) server that gives AI coding agents (Claude Code, or any MCP client) full insight into an MSI Windows machine: hardware telemetry, Windows power state, **live MSI Center settings decoded from the registry**, battery health, a curated knowledge base of what each MSI setting actually does, and per-task readiness checks — e.g. _"is this machine configured correctly to train a model right now?"_

```text
> check_profile_readiness {"profile": "llm_training"}
ready: true — 8/8 rules pass
  ✓ AC power            ✓ GPU present (nvidia-smi)
  ✓ MSI User Scenario = Extreme Performance   ✓ Windows plan = High performance
  ✓ GPU cool (43°C)     ✓ VRAM free            ✓ RAM headroom   ✓ AI Engine off
```

## Why

MSI Center is opaque: its settings live in an Embedded Controller behind an undocumented UI, and nothing on the Windows side documents what's actually configured. It turns out MSI Center's service mirrors its user-facing state to readable registry keys (`HKLM\SOFTWARE\WOW6432Node\MSI\MSI Center\...`) — no admin required, ~80 ms per read. This server decodes that state, explains it, and checks it against what your workload needs. It changes **nothing**: when something is misconfigured, it tells you exactly what to click in MSI Center or Windows.

## Calibration model (read this before trusting it)

Registry integers mean different things on different MSI machines. Decoded values carry a confidence label:

- `verified_live` — observed on a calibrated machine (UI action diffed against the registry)
- `community` — documented by community projects ([msi-ec](https://github.com/BeardOverflow/msi-ec), [MControlCenter](https://github.com/dmitry-s93/MControlCenter))
- `inferred` — plausible hypothesis (UI ordering, single observation)
- `unknown` — no mapping; readiness checks report **unknown, never a false failure**

Machine profiles are selected at runtime from registry signals (EC firmware signature on notebooks; platform type + board model on desktops). Currently calibrated:

- **MSI Vector A16 HX A8WHG** notebook (Ryzen 9 8940HX, RTX 5070 Ti Laptop 12GB, MSI Center 2.0.70)
- **MSI PRO B760M-VC WIFI (MS-7D37)** desktop (i5-14400F, RTX 4060, MSI Center SDK 3.2026) — desktop MSI Center uses a different registry family entirely (string scenario names under `SyncData`, per-fan state under `Setting\FANn`, Zero Frozr)

Everything else gets the generic profile at reduced confidence — still useful, honestly labeled. Calibrating your own machine takes ~10 minutes (see [docs/msi-center-knowledge.md](docs/msi-center-knowledge.md)); contributions of new machine profiles are welcome.

## MCP Tools (15)

| Category    | Tools                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telemetry   | `get_system_info`, `get_power_status`, `list_power_plans`, `get_active_power_plan`, `get_gpu_snapshot`, `get_telemetry_snapshot`, `capture_telemetry_log`, `summarize_telemetry_log`, `compare_telemetry_logs` |
| MSI insight | `get_msi_center_state`, `get_battery_health`, `explain_msi_setting`                                                                                                                                            |
| Profiles    | `list_profiles`, `dry_run_profile`, `check_profile_readiness`                                                                                                                                                  |

Profiles: `balanced_daily`, `gaming_ac`, `quiet_work`, `battery_saver`, `cooldown`, `llm_inference`, `llm_training`.

Typical agent flows:

- "Are we set up to train?" → `check_profile_readiness {"profile": "llm_training"}` → follow the `manual_fix` strings for any failed rule.
- "What does Cooler Boost actually do?" → `explain_msi_setting {"topic": "fan_modes_cooler_boost"}`.
- "Did switching scenarios help?" → `capture_telemetry_log` before/after → `compare_telemetry_logs`.

## Quick start

Requirements: Windows 11, Node.js 20+. Optional (each degrades gracefully): NVIDIA driver with `nvidia-smi` on PATH, MSI Center installed.

```powershell
git clone https://github.com/clayboicardi/msi-center-mcp.git
cd msi-center-mcp
npm install
npm run build
```

Wire into Claude Code (user scope = available in every session):

```powershell
claude mcp add --scope user msi-center -- node <absolute-path-to-repo>\dist\index.js
```

Any other MCP client: stdio transport, command `node <repo>\dist\index.js`.

## What it does NOT do

- No writes of any kind: no power plan changes, no MSI Center changes, no fan/clock/voltage changes, no registry writes (`reg.exe` is allowlisted to `query` on two fixed keys).
- No arbitrary command or PowerShell execution — every subprocess goes through an allowlisted command runner (`execFile`, argument arrays, `shell: false`, timeouts), with safety tests asserting that write-shaped arguments are rejected.
- No admin elevation (the elevated WMI/EC interface MSI Center itself uses was evaluated and rejected).
- No network access at runtime.

See [SECURITY.md](SECURITY.md) for the full threat model and the checklist any future write feature must pass.

## Performance notes

- The PowerShell CIM query costs ~3-4 s per invocation (powershell.exe spawn). Every snapshot-style tool runs it exactly once per call; `get_msi_center_state` (~80 ms) and `get_battery_health` (~2 ms) avoid it entirely.
- `capture_telemetry_log` keeps middle samples lean (nvidia-smi + OS + powercfg only) so 1-2 s sampling intervals actually hold; first and last samples are full so battery drain is measurable. Keep `durationSeconds` under your MCP client's tool timeout (30-60 s is plenty).

## Configuration

Zero-config by default. Environment overrides:

| Variable                                  | Default          | Meaning                              |
| ----------------------------------------- | ---------------- | ------------------------------------ |
| `MSI_CENTER_MCP_LOGS_DIR`                 | `<package>/logs` | Telemetry log directory              |
| `MSI_CENTER_MCP_COMMAND_TIMEOUT_MS`       | `10000`          | Subprocess timeout                   |
| `MSI_CENTER_MCP_MAX_LOG_DURATION_SECONDS` | `600`            | Capture duration ceiling             |
| `MSI_CENTER_MCP_ALLOW_EXTERNAL_LOG_PATHS` | `false`          | Allow log reads outside the logs dir |

## Development

```powershell
npm test          # 76 tests, fake providers — no MSI hardware needed
npm run lint
npm run typecheck
node scripts/smoke-real.mjs   # manual real-hardware smoke check (read-only)
```

Project docs: [docs/msi-center-knowledge.md](docs/msi-center-knowledge.md) (what the settings do + calibration guide), [AGENTS.md](AGENTS.md) (rules for AI agents working on this repo), [SECURITY.md](SECURITY.md). The repo's origin story — v0.1 scaffolded by OpenAI Codex, then reviewed, fixed, extended, and calibrated by Claude Code — is preserved in [docs/claude-code-handoff.md](docs/claude-code-handoff.md) (historical).

## License

[MIT](LICENSE)
