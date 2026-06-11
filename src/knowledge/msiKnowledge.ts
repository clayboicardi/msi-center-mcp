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
      "Each scenario programs the Embedded Controller (EC) with a shift mode. The Linux msi-ec driver names these eco/comfort/sport/turbo; MSI Center surfaces them as Super Battery, Silent/Balanced, and Extreme Performance. The EC then enforces CPU package power limits, GPU TGP / Dynamic Boost headroom, and the fan curve. MSIAPService persists the selection to HKLM\\SOFTWARE\\WOW6432Node\\MSI\\MSI Center\\Component\\Base Module\\User Scenario\\Mode.",
    values: [
      {
        value: "extreme_performance",
        meaning:
          "Maximum CPU/GPU power limits and aggressive fans; full GPU Dynamic Boost headroom. AC power strongly expected."
      },
      { value: "balanced", meaning: "Default daily mode; moderate power limits, auto fan." },
      {
        value: "silent",
        meaning: "Caps power limits and fan speed for low noise; sustained clocks drop noticeably."
      },
      {
        value: "super_battery",
        meaning: "Eco shift mode; heavily capped CPU/GPU for battery runtime."
      },
      {
        value: "ai_smart_auto",
        meaning:
          "MSI AI Engine picks a scenario automatically based on detected activity. Switching is opaque; avoid for benchmarking or sustained ML runs."
      }
    ],
    tradeoffs:
      "Extreme Performance buys sustained clocks at the cost of noise and heat dumped into the chassis/desk. Silent can cut sustained GPU throughput 20-40% on long runs. AI/Smart Auto can silently downshift mid-run, which looks like mysterious throughput loss in training logs.",
    interactions: [
      "Independent of the Windows power plan — both layers apply; set both deliberately.",
      "Cooler Boost overrides the scenario fan curve while enabled.",
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
      { workload: "quiet_work", advice: "Silent; accept reduced sustained clocks." },
      { workload: "battery", advice: "Super Battery and avoid GPU workloads entirely." }
    ],
    sources: [
      "github.com/BeardOverflow/msi-ec (EC shift-mode register semantics)",
      "github.com/dmitry-s93/MControlCenter (user-mode to EC shift-mode mapping)",
      "Live registry observation on this machine (Base Module\\User Scenario)"
    ],
    confidence: "community"
  },
  {
    id: "fan_modes_cooler_boost",
    title: "Fan modes and Cooler Boost",
    ui_path: "MSI Center > Features > User Scenario > fan icon / Cooler Boost",
    what_it_does:
      "Controls the CPU and GPU fan curves: Auto (EC-managed), Silent (capped), Advanced (custom 6-point curve per fan), and Cooler Boost (both fans to maximum immediately).",
    how_it_works:
      "The EC holds two 6-point curves (CPU fan and GPU fan) mapping temperature thresholds to duty cycle. The registry mirrors them as 12 semicolon-joined integers (6 CPU + 6 GPU) in Base Module\\Scenario: Default_Temp (thresholds in C), Default_Fan and User_Fan (duty %). Values above 100 act as full-speed sentinels. Cooler Boost is a separate EC toggle that pins both fans at maximum (~60+ dBA) regardless of curve.",
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
      { workload: "quiet_work", advice: "Silent fan mode within the Silent scenario." }
    ],
    sources: [
      "Live registry observation (Scenario\\Default_Temp/Default_Fan/User_Fan)",
      "github.com/dmitry-s93/MControlCenter (fan mode vocabulary)"
    ],
    confidence: "community"
  },
  {
    id: "gpu_switch_mshybrid_discrete",
    title: "GPU mode: MSHybrid vs Discrete",
    ui_path: "MSI Center > Features > User Scenario > GPU switch (reboot required)",
    what_it_does:
      "Chooses whether the internal display is driven through the AMD iGPU with the RTX as a render offload device (MSHybrid / Optimus), or wired directly to the RTX 5070 Ti (Discrete).",
    how_it_works:
      "MSHybrid routes the dGPU's output through the iGPU framebuffer, letting the dGPU power-gate to near 0W when idle. Discrete mode connects the panel mux straight to the dGPU, eliminating the copy hop (slightly lower display latency, required for some G-Sync paths) but keeping the dGPU always powered. Stored at GeneralSetting\\GPU_Switch; changing it requires a reboot.",
    values: [
      {
        value: "mshybrid",
        meaning: "iGPU drives the panel; dGPU powers up on demand. Best battery life."
      },
      {
        value: "discrete",
        meaning: "dGPU drives the panel directly. Best display latency; worst idle battery."
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
      "Off (0) on this machine as observed."
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
