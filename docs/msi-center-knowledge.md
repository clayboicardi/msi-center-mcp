# MSI Center Knowledge — Vector A16 HX A8WHG

Human-readable companion to the `explain_msi_setting` tool (canonical entries: `src/knowledge/msiKnowledge.ts`; registry decode tables: `src/knowledge/msiRegistryMap.ts`). Machine: Ryzen 9 8940HX (16C/32T), RTX 5070 Ti Laptop 12GB, 16GB DDR5, 240Hz QHD+, Windows 11 Home, MSI Center 2.0.70 (UWP), EC `15MMIMS1`.

## Where MSI Center state lives

MSI Center's MSIAPService persists user-facing settings to:

```
HKLM\SOFTWARE\WOW6432Node\MSI\MSI Center\Component\Base Module\
  User Scenario\Mode        ← current scenario (int)
  User Scenario\Intelligent ← AI Engine on/off
  0_Scenario..5_Scenario    ← per-scenario {Performance, Fan} preset pairs
  Scenario\Default_Temp / Default_Fan / User_Fan ← fan curves (6 CPU + 6 GPU points)
  Scenario\ECversion        ← EC firmware version
  GeneralSetting\GPU_Switch ← MSHybrid/Discrete
  GeneralSetting\BatteryMode← Battery Master charge tier
  GeneralSetting\WhisperMode
```

Reads cost ~80ms and need no elevation. The WMI `root/WMI` MSI_ACPI interface (what MSI Center itself uses for EC access) requires admin and is **not** used by this server.

Battery capacity history: `C:\ProgramData\MSI\AI_Battery\*_log.csv` (DesignedCapacity vs FullChargedCapacity = wear).

## Calibration state (live calibration completed 2026-06-11)

Calibrated by Clay clicking through the UI while a registry watcher recorded each write (screenshots + watch log in session history).

| Raw value                    | Mapping                                             | Confidence                                     | Notes                                                                                       |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `User Scenario\Mode`         | **1=Extreme Performance, 2=Balanced, 4=ECO-Silent** | **verified_live**                              | This build has exactly these 3 scenarios; 0/3 unobserved (likely AI/Silent slots elsewhere) |
| `GeneralSetting\Fan`         | 0=auto, 1=cooler_boost, 2=advanced                  | 2 verified_live; 0/1 inferred from UI order    | UI offers Auto / Cooler Boost / Advanced per scenario                                       |
| `GeneralSetting\GPU_Switch`  | 0=MSHybrid, 1=Discrete, 2=Integrated                | 0 verified_live; others inferred               | 3-way bar on the User Scenario page; verifying 1/2 needs reboots — skipped                  |
| `GeneralSetting\BatteryMode` | 0=100% 1=~80% 2=~60%                                | community                                      | Flip Battery Master tier to verify (optional)                                               |
| `N_Scenario\Performance/Fan` | EC shift vocab (0=comfort 1=eco 2=sport 3=turbo)    | community; **row↔scenario mapping UNVERIFIED** | Verified Mode ints (1/2/4) don't line up with row indices — treat rows as informational     |

Side effect verified live: **selecting ECO-Silent auto-enables `WhisperMode=1`** and it clears on leaving — `WhisperMode=1` usually just means "machine is in ECO-Silent".

### Calibrating a new machine

Mappings live in per-machine profiles (`src/knowledge/machines/`), selected at runtime by EC firmware prefix (`Scenario\ECversion`) — unrecognized machines run the generic profile at reduced confidence. To calibrate yours: (1) run `get_msi_center_state` and note your EC version and raw values; (2) click through each User Scenario in MSI Center while re-reading the state (or watch `HKLM\...\Base Module\User Scenario\Mode` directly) and record which integer each scenario writes; (3) copy `vectorA16Hx.ts` to a new profile file with your EC prefix in the matcher and your verified map; (4) register it in `machineProfiles.ts` and add a decode test. Same procedure for fan modes, GPU switch (needs reboots), and Battery Master tiers.

## The settings, in one paragraph each

**User Scenario** is the master performance envelope: it programs the EC shift mode (CPU/GPU power limits + fan policy). This build has three: **Extreme Performance** (Mode=1) for sustained loads, **Balanced** (Mode=2) for daily, **ECO-Silent** (Mode=4) for quiet/battery (also auto-enables WhisperMode). The separate **MSI AI Engine** card (sets `Intelligent=1`) lets MSI pick automatically — avoid for reproducible ML runs since it can downshift mid-run. Each scenario's gear icon opens Advanced Settings: GPU clock offsets (Core/VRAM, currently 0/0) and Fan Speed.

**Fan modes / Cooler Boost**: per-scenario via the gear icon: Auto (EC curve), Cooler Boost (max fans), Advanced (custom 6-point curve per fan — the UI points are literally the registry `User_Fan` string, including the 150% full-speed sentinel). Sustained 75-83°C GPU under load is normal; ~87°C is throttle.

**GPU switch (Discrete/MSHybrid/Integrated)**: panel routing only — CUDA compute is unaffected by Discrete vs MSHybrid. Integrated turns the dGPU off entirely (no CUDA — never for LLM work). Discrete helps gaming display latency; MSHybrid saves 10-20W idle. Reboot required.

**Battery Master**: charge threshold (100/80/60%-class tiers). Pure longevity policy, zero performance impact. This battery currently reports full-charge capacity ≥ design capacity (effectively 0% wear).

**WhisperMode**: NVIDIA FPS-cap for quiet gaming. Irrelevant to compute; keep off.

**Windows power plans** are a separate layer (OS scheduling/frequency policy) that stacks with the MSI scenario. This machine has Balanced and High performance plans only. Set both layers deliberately: training = High performance + Extreme Performance.

## LLM work on this machine

- 12GB VRAM, 16GB RAM (VRAM-rich / RAM-poor): model files ≤10GB comfortable, ≥14GB thrash. Spilling to RAM collapses speed and risks OOM with a browser open.
- Inference: `check_profile_readiness {"profile":"llm_inference"}` — wants GPU present, VRAM mostly free, Balanced/Extreme scenario, AI Engine off.
- Training: `check_profile_readiness {"profile":"llm_training"}` — requires AC + GPU; wants Extreme Performance, High performance plan, cool start (≤60°C), free VRAM, ≤10GB RAM in use, AI Engine off.
- Verify sustained behavior with `capture_telemetry_log` (30-60s) ~10 minutes into a run: falling `clocks_current_graphics_mhz` with `temperature_gpu_c` near 87 = thermal throttle (raise fans); near-100% utilization at low power draw = memory-bandwidth-bound (normal for token generation).
