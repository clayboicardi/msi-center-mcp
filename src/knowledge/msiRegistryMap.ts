// Shared decode vocabulary for MSI Center registry values. The actual
// integer-to-meaning tables live in per-machine profiles
// (src/knowledge/machines/*) selected at runtime by machineProfiles.ts.
//
// Every mapping carries a confidence level so MCP clients never over-trust
// an uncalibrated guess:
//   verified_live — observed on the running machine (UI action diffed
//                   against the registry, or screenshot + simultaneous read)
//   community     — documented by community projects (msi-ec, MControlCenter)
//   inferred      — plausible hypothesis (UI ordering, single observation)
//   unknown       — no mapping; readiness checks treat this as "unknown",
//                   never as a failure
//
// Calibration workflow: flip a setting in the MSI Center UI, re-read
// "get_msi_center_state", diff the raw values, then record the mapping in a
// machine profile at verified_live.

export type MappingConfidence = "verified_live" | "community" | "inferred" | "unknown";

export interface ValueMapping<T extends string = string> {
  map: Record<number, T>;
  confidence: MappingConfidence;
  // Per-raw-value confidence overrides for partially calibrated mappings.
  overrides?: Record<number, MappingConfidence>;
  note: string;
}

export function decodeWithMapping<T extends string>(
  raw: number | string | null | undefined,
  mapping: ValueMapping<T>
): { raw: number | string | null; decoded: T | null; confidence: MappingConfidence; note: string } {
  const rawValue = raw ?? null;
  const decoded =
    typeof rawValue === "number" && rawValue in mapping.map
      ? (mapping.map[rawValue] ?? null)
      : null;
  const confidence =
    decoded === null
      ? "unknown"
      : ((typeof rawValue === "number" ? mapping.overrides?.[rawValue] : undefined) ??
        mapping.confidence);

  return {
    raw: rawValue,
    decoded,
    confidence,
    note: mapping.note
  };
}
