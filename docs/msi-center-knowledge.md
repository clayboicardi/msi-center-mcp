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

## Calibration state (update after each calibration session)

| Raw value                    | Current mapping hypothesis                                          | Confidence                         | How to verify                                                    |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `User Scenario\Mode`         | 0=Extreme Perf, 1=Balanced, 2=Silent, 3=Super Battery, 4=Smart Auto | **inferred**                       | Flip each scenario in MSI Center, re-read `get_msi_center_state` |
| `N_Scenario\Performance`     | 0=comfort 1=eco 2=sport 3=turbo (EC shift modes)                    | community (msi-ec, MControlCenter) | Cross-check after Mode calibration                               |
| `N_Scenario\Fan`             | 0=auto 1=silent 2=advanced                                          | inferred                           | Change fan mode, diff                                            |
| `GeneralSetting\GPU_Switch`  | 0=MSHybrid 1=Discrete                                               | inferred                           | Switch GPU mode (reboot), diff                                   |
| `GeneralSetting\BatteryMode` | 0=100% 1=~80% 2=~60%                                                | community                          | Flip Battery Master tier, diff                                   |

Observed presets on this machine: `0:(comfort,auto) 1:(comfort,silent) 2,3:(sport,auto) 4:(turbo,auto) 5:(eco,auto)` — consistent with Balanced / Silent / two game-or-creator modes / Extreme Performance / Super Battery, which supports (but does not prove) the Mode hypothesis.

## The settings, in one paragraph each

**User Scenario** is the master performance envelope: it programs the EC shift mode (CPU/GPU power limits + fan policy). Extreme Performance for sustained loads, Balanced for daily, Silent caps clocks for quiet, Super Battery for runtime, Smart Auto lets MSI's AI pick (avoid for reproducible ML runs — it can downshift mid-run).

**Fan modes / Cooler Boost**: per-scenario 6-point fan curves for CPU and GPU fans; Cooler Boost pins both fans at max. Sustained 75-83°C GPU under load is normal; ~87°C is throttle.

**GPU switch (MSHybrid/Discrete)**: panel routing only — CUDA compute is unaffected. Discrete helps gaming display latency; MSHybrid saves 10-20W idle. Reboot required; never worth it for LLM work.

**Battery Master**: charge threshold (100/80/60%-class tiers). Pure longevity policy, zero performance impact. This battery currently reports full-charge capacity ≥ design capacity (effectively 0% wear).

**WhisperMode**: NVIDIA FPS-cap for quiet gaming. Irrelevant to compute; keep off.

**Windows power plans** are a separate layer (OS scheduling/frequency policy) that stacks with the MSI scenario. This machine has Balanced and High performance plans only. Set both layers deliberately: training = High performance + Extreme Performance.

## LLM work on this machine

- 12GB VRAM, 16GB RAM (VRAM-rich / RAM-poor): model files ≤10GB comfortable, ≥14GB thrash. Spilling to RAM collapses speed and risks OOM with a browser open.
- Inference: `check_profile_readiness {"profile":"llm_inference"}` — wants GPU present, VRAM mostly free, Balanced/Extreme scenario, AI Engine off.
- Training: `check_profile_readiness {"profile":"llm_training"}` — requires AC + GPU; wants Extreme Performance, High performance plan, cool start (≤60°C), free VRAM, ≤10GB RAM in use, AI Engine off.
- Verify sustained behavior with `capture_telemetry_log` (30-60s) ~10 minutes into a run: falling `clocks_current_graphics_mhz` with `temperature_gpu_c` near 87 = thermal throttle (raise fans); near-100% utilization at low power draw = memory-bandwidth-bound (normal for token generation).
