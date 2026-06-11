import type { MappingConfidence } from "./msiRegistryMap.js";

// Curated, machine-specific knowledge for the MSI Vector A16 HX A8WHG
// (Ryzen 9 8940HX, RTX 5070 Ti Laptop 12GB, 16GB DDR5, 240Hz QHD+).
// Served through the explain_msi_setting tool so an MCP client can reason
// about what each setting does before recommending manual changes.

export interface KnowledgeEntry {
  id: string;
  title: string;
  ui_path: string | null;
  what_it_does: string;
  how_it_works: string;
  values?: Array<{ value: string; meaning: string }>;
  tradeoffs: string;
  interactions: string[];
  recommendations: Array<{ workload: string; advice: string }>;
  sources: string[];
  confidence: MappingConfidence;
}

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  {
    id: "user_scenario",
    title: "User Scenario (performance mode)",
    ui_path: "MSI Center > Features > User Scenario",
    what_it_does:
      "Selects the laptop's overall performance envelope: CPU/GPU power limits, fan policy, and boost behavior. This is the single most impactful MSI Center setting for sustained workloads.",
    how_it_works:
      "Each scenario programs the Embedded Controller (EC) with a shift mode that enforces CPU package power limits, GPU TGP / Dynamic Boost headroom, and the fan curve. MSIAPService persists the selection to HKLM\\SOFTWARE\\WOW6432Node\\MSI\\MSI Center\\Component\\Base Module\\User Scenario\\Mode. This build exposes exactly three scenarios (verified live 2026-06-11): Extreme Performance (Mode=1), Balanced (Mode=2), ECO-Silent (Mode=4). Each scenario card has a gear icon opening Advanced Settings: a GPU tab (Core/VRAM clock offset sliders) and a Fan Speed tab (Auto / Cooler Boost / Advanced curve).",
    values: [
      {
        value: "extreme_performance",
        meaning:
          "Mode=1. Maximum CPU/GPU power limits; full GPU Dynamic Boost headroom. AC power strongly expected."
      },
      {
        value: "balanced",
        meaning: "Mode=2. Default daily mode; moderate power limits."
      },
      {
        value: "eco_silent",
        meaning:
          "Mode=4. Efficiency/quiet scenario; caps power limits for noise and battery. Side effect (observed live): automatically enables NVIDIA WhisperMode while active and clears it on leaving."
      },
      {
        value: "ai_smart_auto",
        meaning:
          "Separate MSI AI Engine card on the User Scenario page (sets User Scenario\\Intelligent=1, not a Mode value). Picks behavior automatically; avoid for benchmarking or sustained ML runs because it can downshift opaquely."
      }
    ],
    tradeoffs:
      "Extreme Performance buys sustained clocks at the cost of noise and heat dumped into the chassis/desk. ECO-Silent can cut sustained GPU throughput substantially on long runs. AI/Smart Auto can silently downshift mid-run, which looks like mysterious throughput loss in training logs.",
    interactions: [
      "Independent of the Windows power plan — both layers apply; set both deliberately.",
      "Cooler Boost overrides the scenario fan curve while enabled.",
      "ECO-Silent auto-enables NVIDIA WhisperMode (verified live).",
      "gaming_ac/llm_training readiness rules expect Extreme Performance on AC."
    ],
    recommendations: [
      {
        workload: "llm_training",
        advice: "Extreme Performance, AC plugged, Cooler Boost optional for multi-hour runs."
      },
      {
        workload: "llm_inference",
        advice:
          "Extreme Performance or Balanced; Balanced is fine for short interactive sessions and much quieter."
      },
      { workload: "quiet_work", advice: "ECO-Silent; accept reduced sustained clocks." },
      { workload: "battery", advice: "ECO-Silent and avoid GPU workloads entirely." }
    ],
    sources: [
      "Live click-through calibration on this machine 2026-06-11 (Mode=1/2/4 verified)",
      "github.com/BeardOverflow/msi-ec (EC shift-mode register semantics)",
      "github.com/dmitry-s93/MControlCenter (user-mode to EC shift-mode mapping)"
    ],
    confidence: "verified_live"
  },
  {
    id: "fan_modes_cooler_boost",
    title: "Fan modes and Cooler Boost",
    ui_path: "MSI Center > Features > User Scenario > gear icon on the scenario card > Fan Speed",
    what_it_does:
      "Controls the CPU and GPU fan policy per scenario. This build offers exactly three modes: Auto (EC-managed curve), Cooler Boost (both fans to maximum immediately), and Advanced (custom 6-point curve per fan).",
    how_it_works:
      "The EC holds two 6-point curves (Fan 1 = CPU, Fan 2 = GPU) mapping temperature thresholds to duty cycle. The registry mirrors them as 12 semicolon-joined integers (6 CPU + 6 GPU) in Base Module\\Scenario: Default_Temp (thresholds in C), Default_Fan (the Auto curve) and User_Fan (the Advanced curve, shown point-by-point in the UI — including values above 100, which act as full-speed sentinels). The selected mode lands in GeneralSetting\\Fan (2 = Advanced, verified live).",
    tradeoffs:
      "Aggressive curves lower temperatures (more boost headroom, less thermal aging) at the cost of noise. Cooler Boost is effective for sustained full-TGP runs but unpleasant to sit next to; custom Advanced curves are the middle ground.",
    interactions: [
      "Fan mode is stored per User Scenario; switching scenarios switches curves.",
      "Cooler Boost overrides everything while active.",
      "GPU temperature ceiling on this class of laptop GPU is ~87C throttle; sustained 75-83C under load is normal."
    ],
    recommendations: [
      {
        workload: "llm_training",
        advice:
          "Auto curve under Extreme Performance is adequate; enable Cooler Boost for multi-hour saturated runs if noise is acceptable, or set an Advanced curve ~10% above Auto."
      },
      { workload: "llm_inference", advice: "Auto. Inference bursts rarely heat-soak the chassis." },
      {
        workload: "quiet_work",
        advice: "Use the ECO-Silent scenario; there is no separate silent fan mode on this build."
      }
    ],
    sources: [
      "Live UI observation 2026-06-11 (Advanced curve matches Scenario\\User_Fan exactly; Fan=2=Advanced verified)",
      "github.com/dmitry-s93/MControlCenter (fan mode vocabulary)"
    ],
    confidence: "verified_live"
  },
  {
    id: "gpu_switch_mshybrid_discrete",
    title: "GPU mode: Discrete vs MSHybrid vs Integrated",
    ui_path: "MSI Center > Features > User Scenario > GPU Switch bar (reboot required)",
    what_it_does:
      "Three-way switch (Performance ↔ Battery Life) choosing how the internal display is driven: straight from the RTX 5070 Ti (Discrete), through the AMD iGPU with the RTX as render offload (MSHybrid / Optimus), or iGPU-only with the RTX disabled (Integrated).",
    how_it_works:
      "MSHybrid routes the dGPU's output through the iGPU framebuffer, letting the dGPU power-gate to near 0W when idle. Discrete connects the panel mux straight to the dGPU (slightly lower display latency, always powered). Integrated turns the dGPU off entirely — CUDA disappears until you switch back. Stored at GeneralSetting\\GPU_Switch (0=MSHybrid verified live); changing requires a reboot.",
    values: [
      {
        value: "mshybrid",
        meaning:
          "iGPU drives the panel; dGPU powers up on demand. Best balance — full CUDA with good battery."
      },
      {
        value: "discrete",
        meaning: "dGPU drives the panel directly. Best display latency; worst idle battery."
      },
      {
        value: "integrated",
        meaning: "dGPU fully off. Maximum battery; NO CUDA — never use for LLM work."
      }
    ],
    tradeoffs:
      "CUDA/compute workloads (LLM inference, training) are NOT meaningfully affected by this switch — compute runs on the dGPU either way. Discrete mode mainly helps competitive gaming display latency. MSHybrid saves 10-20W at idle.",
    interactions: [
      "Reboot required; never suggest mid-task.",
      "In MSHybrid, the dGPU can fully sleep — first CUDA call after idle has a short wake latency.",
      "VRAM is unaffected by the switch; the RTX keeps its full 12GB either way."
    ],
    recommendations: [
      {
        workload: "llm_training",
        advice: "Leave as-is. The switch does not change CUDA throughput; do not waste a reboot."
      },
      {
        workload: "llm_inference",
        advice: "Leave as-is (MSHybrid is fine; compute is unaffected)."
      },
      {
        workload: "gaming",
        advice: "Discrete for lowest display latency on the internal panel; MSHybrid otherwise."
      },
      { workload: "battery", advice: "MSHybrid, always." }
    ],
    sources: ["MSI MSHybrid/Discrete documentation and panel-mux behavior (community consensus)"],
    confidence: "community"
  },
  {
    id: "battery_master",
    title: "Battery Master (charge threshold)",
    ui_path: "MSI Center > Features > Battery Master (or General Settings > Battery)",
    what_it_does:
      "Caps the maximum battery charge level to slow lithium-ion aging on a laptop that lives on AC power.",
    how_it_works:
      "The EC stops charging at the configured threshold. MSI's tiers: Best for Mobility (~100%), Balanced (~70-80%), Best for Battery (~50-60%). Stored at GeneralSetting\\BatteryMode. The AI_Battery service separately logs capacity history to C:\\ProgramData\\MSI\\AI_Battery\\*_log.csv (DesignedCapacity vs FullChargedCapacity = wear).",
    values: [
      {
        value: "best_for_mobility_charge_to_100",
        meaning: "Charge to full; maximum runtime, fastest aging."
      },
      {
        value: "balanced_charge_to_80",
        meaning: "Stop near 80%; good compromise for mostly-plugged use."
      },
      {
        value: "best_for_battery_charge_to_60",
        meaning: "Stop near 60%; best longevity for desk-bound machines."
      }
    ],
    tradeoffs:
      "Charge caps trade runtime for battery longevity. A machine that trains models plugged in for hours benefits from a cap; flip to 100% the night before travel.",
    interactions: [
      "Does not affect performance at all — purely a charging policy.",
      "get_battery_health reads the AI_Battery log to report actual wear."
    ],
    recommendations: [
      {
        workload: "llm_training",
        advice: "Any tier; Balanced/Best for Battery preferred since the machine is on AC anyway."
      },
      { workload: "travel", advice: "Best for Mobility the night before; switch back after." }
    ],
    sources: [
      "MSI Battery Master documentation tiers (community consensus)",
      "Live AI_Battery log observation"
    ],
    confidence: "community"
  },
  {
    id: "whisper_mode",
    title: "NVIDIA WhisperMode",
    ui_path: "MSI Center > Features > User Scenario (WhisperMode toggle, when surfaced)",
    what_it_does:
      "NVIDIA's acoustic-target frame limiter: caps game frame rates so the GPU draws less power and fans stay quiet.",
    how_it_works:
      "Driver-level FPS cap plus efficiency-biased clocking, negotiated between the NVIDIA driver and the EC acoustic target. Mirrored at GeneralSetting\\WhisperMode/WhisperModeEnable.",
    tradeoffs:
      "Only relevant to real-time rendering. It does nothing useful for compute workloads and would only mask GPU throughput if a future driver applied limits broadly — keep it off on this machine.",
    interactions: [
      "Gaming-only feature; orthogonal to CUDA compute.",
      "The ECO-Silent scenario auto-enables WhisperMode while active and clears it on leaving (verified live 2026-06-11) — seeing WhisperMode=1 usually just means the machine is in ECO-Silent."
    ],
    recommendations: [
      { workload: "llm_training", advice: "Off." },
      { workload: "llm_inference", advice: "Off." },
      {
        workload: "quiet_gaming",
        advice: "On, if fan noise during light games matters more than FPS."
      }
    ],
    sources: ["NVIDIA WhisperMode documentation (community consensus)"],
    confidence: "community"
  },
  {
    id: "windows_power_plan_interplay",
    title: "Windows power plans vs MSI scenarios",
    ui_path: "Windows Settings > System > Power; powercfg",
    what_it_does:
      "Windows power plans (Balanced / High performance) and the Win11 power-mode slider govern OS-level CPU frequency scaling and core parking — a separate layer from MSI's EC-level scenario.",
    how_it_works:
      "Both layers apply simultaneously: the EC sets hardware power/thermal limits (MSI scenario), while Windows decides scheduling and processor power management within those limits. A High performance plan with a Silent scenario still throttles at the EC cap; an Extreme Performance scenario with an aggressive Windows power saver still parks cores.",
    tradeoffs:
      "High performance keeps CPU clocks pinned (snappier, hotter idle); Balanced is fine for most GPU-bound work since the CPU side rarely bottlenecks single-stream inference.",
    interactions: [
      "This machine currently exposes only Balanced and High performance plans (no Power saver plan installed).",
      "list_power_plans / get_active_power_plan report this layer; the MSI scenario comes from get_msi_center_state.",
      "llm_training readiness expects High performance; llm_inference accepts either."
    ],
    recommendations: [
      { workload: "llm_training", advice: "High performance plan + Extreme Performance scenario." },
      {
        workload: "llm_inference",
        advice: "Either plan; High performance shaves CPU ramp latency on token streaming."
      },
      { workload: "battery", advice: "Balanced plan + Super Battery scenario." }
    ],
    sources: [
      "powercfg observation on this machine",
      "Windows processor power management documentation"
    ],
    confidence: "verified_live"
  },
  {
    id: "refresh_rate_and_power",
    title: "Display refresh rate and power",
    ui_path: "Windows Settings > Display > Advanced; MSI Center may suggest reductions",
    what_it_does: "The 240Hz QHD+ panel can run at lower refresh rates to save power on battery.",
    how_it_works:
      "Panel self-refresh power scales with refresh rate; 240Hz to 60Hz saves several watts. MSI Center mirrors panel limits at GeneralSetting\\MaxDisplayFrequency/MinDisplayFrequency (240/60 observed).",
    tradeoffs: "Smoothness vs battery. Irrelevant while plugged in.",
    interactions: ["Super Battery scenarios may suggest (not force) a reduction."],
    recommendations: [
      { workload: "battery", advice: "Drop to 60Hz manually when unplugged for long sessions." },
      { workload: "llm_training", advice: "Irrelevant on AC; leave at 240Hz." }
    ],
    sources: ["Live registry observation (MaxDisplayFrequency=240, MinDisplayFrequency=60)"],
    confidence: "verified_live"
  },
  {
    id: "llm_workloads_on_this_machine",
    title: "Running and training local LLMs on this machine",
    ui_path: null,
    what_it_does:
      "Machine-specific guidance for LLM work on the Vector A16 HX: RTX 5070 Ti Laptop 12GB VRAM, 16GB DDR5 system RAM (VRAM-rich relative to RAM), Ryzen 9 8940HX 16C/32T.",
    how_it_works:
      "Inference throughput is VRAM-bandwidth-bound: models that fit entirely in 12GB VRAM run fast; anything that spills to system RAM via Ollama/llama.cpp offload collapses in speed AND pressures the small 16GB RAM pool. Practical ceiling: model files <=14GB thrash; <=10GB is comfortable (qwen3.5:9b, gemma4:12b class). Training/fine-tuning (LoRA) saturates the GPU at full TGP for hours — a sustained-thermals problem, not a burst problem: the 5070 Ti Laptop draws ~100-140W under load and the chassis must hold ~75-83C without hitting the ~87C throttle ceiling.",
    tradeoffs:
      "Quantization (Q4/Q5) trades small quality losses for fitting larger models in 12GB. Offloading layers to CPU trades massive speed loss for capacity — on a 16GB-RAM machine it also risks OOM with a browser open. Sustained training on Silent scenario silently halves throughput.",
    interactions: [
      "Before a run: check_profile_readiness with llm_inference or llm_training.",
      "During a run: capture_telemetry_log to verify clocks/temps hold; falling clocks_current_graphics_mhz with temperature_gpu_c near 87 means thermal throttling — raise fans or lower power.",
      "memory_used_mb from get_gpu_snapshot shows VRAM pressure; os.memory_used_bytes shows the 16GB RAM pool.",
      "Ollama keeps models resident; unload (ollama stop) before switching to a training job."
    ],
    recommendations: [
      {
        workload: "llm_inference",
        advice:
          "Models <=10GB file size; Balanced or Extreme Performance scenario; either Windows plan; verify VRAM headroom before loading a second model."
      },
      {
        workload: "llm_training",
        advice:
          "AC required; Extreme Performance + High performance plan; close browsers (RAM); Cooler Boost for multi-hour runs; verify with a 60s telemetry capture that clocks hold after 10 minutes."
      },
      { workload: "embeddings", advice: "nomic-embed-text is tiny; any scenario works." }
    ],
    sources: [
      "Clay's CLAUDE.md hardware notes (model ceiling observations on this machine)",
      "nvidia-smi observation (12227MB VRAM total, driver 610.47)"
    ],
    confidence: "verified_live"
  },
  {
    id: "telemetry_interpretation",
    title: "Interpreting this server's telemetry",
    ui_path: null,
    what_it_does:
      "How to read get_gpu_snapshot / capture_telemetry_log outputs into actionable conclusions.",
    how_it_works:
      "temperature_gpu_c: ~40-50 idle, 70-83 sustained load is healthy, ~87 is the throttle ceiling. power_draw_w: ~20W idle (MSHybrid, dGPU awake), ~100-140W saturated. pstate: P0 is max performance; P8 deep idle. clocks_current_graphics_mhz falling while temperature sits at ceiling = thermal throttling; falling while temperature is low = power limit or idle. utilization_gpu_percent near 100 with low power draw usually means memory-bandwidth-bound (typical for LLM token generation). memory_used_mb vs memory_total_mb (12227) is VRAM pressure.",
    tradeoffs:
      "Single snapshots lie: idle/boost transitions take seconds. Use capture_telemetry_log (30-60s) for any sustained-performance claim, and compare_telemetry_logs only across runs with comparable workloads and room temperature.",
    interactions: [
      "CIM-backed fields cost ~4s per query; capture middle samples intentionally omit them.",
      "cpu_load_percent is null on the first sample (needs a delta)."
    ],
    recommendations: [
      {
        workload: "any",
        advice:
          "Baseline-capture before changing a setting, capture again after, then compare_telemetry_logs — never eyeball two single snapshots."
      }
    ],
    sources: [
      "Live observation on this machine; NVIDIA laptop GPU thermal envelope (community consensus)"
    ],
    confidence: "community"
  }
];

export const KNOWLEDGE_TOPIC_IDS = KNOWLEDGE_ENTRIES.map((entry) => entry.id);

export function getKnowledgeEntry(id: string): KnowledgeEntry | undefined {
  return KNOWLEDGE_ENTRIES.find((entry) => entry.id === id);
}

export function listKnowledgeTopics(): Array<{ id: string; title: string }> {
  return KNOWLEDGE_ENTRIES.map((entry) => ({ id: entry.id, title: entry.title }));
}
