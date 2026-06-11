import type { ProfileDefinition } from "./profiles.js";

// Well-known Windows power plan GUIDs (stable across locales, unlike names).
const BALANCED_PLAN_GUID = "381b4222-f694-41f0-9685-ff5bb260df2e";
const HIGH_PERFORMANCE_PLAN_GUID = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

const SCENARIO_FIX =
  "MSI Center > Features > User Scenario: select the target scenario manually.";
const PLAN_FIX_HIGH =
  "Windows: powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c (High performance), or Settings > Power.";
const PLAN_FIX_BALANCED =
  "Windows: powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e (Balanced), or Settings > Power.";

export const DEFAULT_PROFILES: ProfileDefinition[] = [
  {
    name: "balanced_daily",
    description: "General daily-use profile for AC or battery use.",
    intended_future_actions: [
      "Windows power plan: Balanced.",
      "MSI Center mode: Balanced, manual only.",
      "GPU mode: MSHybrid, manual/reboot only.",
      "Fan policy: MSI auto, manual only."
    ],
    readiness_rules: [
      {
        id: "balanced-scenario",
        severity: "recommended",
        field: "msi.user_scenario.decoded",
        expect: { equals: "balanced" },
        description: "MSI User Scenario should be Balanced for daily use.",
        manual_fix: SCENARIO_FIX
      },
      {
        id: "balanced-plan",
        severity: "recommended",
        field: "active_plan.guid",
        expect: { equals: BALANCED_PLAN_GUID },
        description: "Windows power plan should be Balanced.",
        manual_fix: PLAN_FIX_BALANCED
      }
    ]
  },
  {
    name: "gaming_ac",
    description: "Gaming-oriented profile that should only be considered while on AC power.",
    intended_future_actions: [
      "Require AC power.",
      "Windows power plan: High Performance or equivalent if present.",
      "MSI Center mode: Extreme Performance, manual only.",
      "GPU mode: Discrete, manual/reboot only.",
      "Fan policy: aggressive/Cooler Boost, manual only."
    ],
    readiness_rules: [
      {
        id: "gaming-ac-power",
        severity: "required",
        field: "power.ac_power",
        expect: { equals: true },
        description: "AC power is required for gaming performance.",
        manual_fix: "Plug in the AC adapter."
      },
      {
        id: "gaming-scenario",
        severity: "recommended",
        field: "msi.user_scenario.decoded",
        expect: { equals: "extreme_performance" },
        description: "MSI User Scenario should be Extreme Performance.",
        manual_fix: SCENARIO_FIX
      },
      {
        id: "gaming-plan",
        severity: "recommended",
        field: "active_plan.guid",
        expect: { equals: HIGH_PERFORMANCE_PLAN_GUID },
        description: "Windows power plan should be High performance.",
        manual_fix: PLAN_FIX_HIGH
      },
      {
        id: "gaming-gpu-present",
        severity: "required",
        field: "gpu.available",
        expect: { equals: true },
        description: "NVIDIA GPU telemetry must be available.",
        manual_fix: "Check that nvidia-smi works and the NVIDIA driver is installed."
      }
    ]
  },
  {
    name: "quiet_work",
    description: "Lower-noise work profile for light productivity.",
    intended_future_actions: [
      "Windows power plan: Balanced or Power Saver.",
      "MSI Center mode: Silent, manual only.",
      "GPU mode: MSHybrid, manual/reboot only."
    ],
    readiness_rules: [
      {
        id: "quiet-scenario",
        severity: "recommended",
        field: "msi.user_scenario.decoded",
        expect: { oneOf: ["silent", "balanced"] },
        description: "MSI User Scenario should be Silent (or Balanced) for low noise.",
        manual_fix: SCENARIO_FIX
      }
    ]
  },
  {
    name: "battery_saver",
    description: "Battery-focused profile for unplugged use.",
    intended_future_actions: [
      "Prefer unplugged/battery use.",
      "Windows power plan: Power Saver if available.",
      "MSI Center mode: Super Battery, manual only.",
      "GPU mode: MSHybrid/integrated if available, manual/reboot only.",
      "Refresh rate reduction may be suggested manually, not applied."
    ],
    readiness_rules: [
      {
        id: "battery-scenario",
        severity: "recommended",
        field: "msi.user_scenario.decoded",
        expect: { equals: "super_battery" },
        description: "MSI User Scenario should be Super Battery when maximizing runtime.",
        manual_fix: SCENARIO_FIX
      },
      {
        id: "battery-plan",
        severity: "recommended",
        field: "active_plan.guid",
        expect: { equals: BALANCED_PLAN_GUID },
        description:
          "Windows power plan should be Balanced (this machine has no Power saver plan installed).",
        manual_fix: PLAN_FIX_BALANCED
      }
    ]
  },
  {
    name: "cooldown",
    description: "Manual cooldown guidance based on current thermal indicators.",
    intended_future_actions: [
      "Temporarily increase fan cooling manually in MSI Center.",
      "Avoid launching writes.",
      "Suggest closing heavy processes if detected."
    ],
    readiness_rules: [
      {
        id: "cooldown-gpu-temp",
        severity: "recommended",
        field: "gpu.temperature_gpu_c",
        expect: { max: 75 },
        description: "GPU should be at or below 75C before starting new heavy work.",
        manual_fix:
          "Enable Cooler Boost in MSI Center, pause GPU workloads, and wait a few minutes."
      }
    ]
  },
  {
    name: "llm_inference",
    description:
      "Run local LLM inference (Ollama, llama.cpp): VRAM headroom and a responsive performance envelope.",
    intended_future_actions: [
      "MSI Center mode: Balanced or Extreme Performance, manual only.",
      "Verify VRAM headroom before loading a model (12GB total; <=10GB model files are comfortable).",
      "Keep AI Engine off so the scenario cannot downshift mid-session."
    ],
    readiness_rules: [
      {
        id: "llm-inf-gpu-present",
        severity: "required",
        field: "gpu.available",
        expect: { equals: true },
        description: "NVIDIA GPU telemetry must be available for GPU inference.",
        manual_fix: "Check that nvidia-smi works and the NVIDIA driver is installed."
      },
      {
        id: "llm-inf-scenario",
        severity: "recommended",
        field: "msi.user_scenario.decoded",
        expect: { oneOf: ["balanced", "extreme_performance"] },
        description: "MSI User Scenario should be Balanced or Extreme Performance.",
        manual_fix: SCENARIO_FIX
      },
      {
        id: "llm-inf-vram-headroom",
        severity: "recommended",
        field: "gpu.memory_used_mb",
        expect: { max: 2000 },
        description:
          "VRAM should be mostly free before loading a model (another model may still be resident).",
        manual_fix: "Unload resident models (e.g. `ollama stop <model>`) or close GPU apps."
      },
      {
        id: "llm-inf-ai-engine-off",
        severity: "recommended",
        field: "msi.ai_engine_enabled.decoded",
        expect: { equals: false },
        description: "MSI AI Engine should be off so performance is deterministic.",
        manual_fix: "MSI Center > Features > AI Engine: disable."
      }
    ]
  },
  {
    name: "llm_training",
    description:
      "Fine-tune / train local models: sustained full-TGP GPU load for hours; thermals and RAM headroom matter.",
    intended_future_actions: [
      "Require AC power.",
      "MSI Center mode: Extreme Performance, manual only.",
      "Windows power plan: High performance.",
      "Cooler Boost optional for multi-hour runs.",
      "Close browsers and heavy apps to protect the 16GB RAM pool."
    ],
    readiness_rules: [
      {
        id: "llm-train-ac-power",
        severity: "required",
        field: "power.ac_power",
        expect: { equals: true },
        description: "AC power is required for sustained training load.",
        manual_fix: "Plug in the AC adapter."
      },
      {
        id: "llm-train-gpu-present",
        severity: "required",
        field: "gpu.available",
        expect: { equals: true },
        description: "NVIDIA GPU telemetry must be available.",
        manual_fix: "Check that nvidia-smi works and the NVIDIA driver is installed."
      },
      {
        id: "llm-train-scenario",
        severity: "recommended",
        field: "msi.user_scenario.decoded",
        expect: { equals: "extreme_performance" },
        description: "MSI User Scenario should be Extreme Performance for sustained clocks.",
        manual_fix: SCENARIO_FIX
      },
      {
        id: "llm-train-plan",
        severity: "recommended",
        field: "active_plan.guid",
        expect: { equals: HIGH_PERFORMANCE_PLAN_GUID },
        description: "Windows power plan should be High performance.",
        manual_fix: PLAN_FIX_HIGH
      },
      {
        id: "llm-train-thermal-headroom",
        severity: "recommended",
        field: "gpu.temperature_gpu_c",
        expect: { max: 60 },
        description: "GPU should start cool (<=60C) so the run begins with thermal headroom.",
        manual_fix: "Let the machine idle or run Cooler Boost for a few minutes before starting."
      },
      {
        id: "llm-train-vram-free",
        severity: "recommended",
        field: "gpu.memory_used_mb",
        expect: { max: 1500 },
        description: "VRAM should be free before training (unload inference models first).",
        manual_fix: "Unload resident models (e.g. `ollama stop <model>`) or close GPU apps."
      },
      {
        id: "llm-train-ram-headroom",
        severity: "recommended",
        field: "os.memory_used_bytes",
        expect: { max: 10_000_000_000 },
        description: "System RAM use should be under ~10GB before training on this 16GB machine.",
        manual_fix: "Close browsers and heavy apps before starting the run."
      },
      {
        id: "llm-train-ai-engine-off",
        severity: "recommended",
        field: "msi.ai_engine_enabled.decoded",
        expect: { equals: false },
        description: "MSI AI Engine must not downshift the scenario mid-run.",
        manual_fix: "MSI Center > Features > AI Engine: disable."
      }
    ]
  }
];
