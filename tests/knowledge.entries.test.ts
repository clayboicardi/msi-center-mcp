import { describe, expect, test } from "vitest";

import {
  KNOWLEDGE_ENTRIES,
  KNOWLEDGE_TOPIC_IDS,
  getKnowledgeEntry,
  listKnowledgeTopics
} from "../src/knowledge/msiKnowledge.js";

describe("MSI knowledge base", () => {
  test("topic ids are unique and lookups resolve", () => {
    expect(new Set(KNOWLEDGE_TOPIC_IDS).size).toBe(KNOWLEDGE_TOPIC_IDS.length);

    for (const id of KNOWLEDGE_TOPIC_IDS) {
      expect(getKnowledgeEntry(id)?.id).toBe(id);
    }

    expect(getKnowledgeEntry("nonexistent")).toBeUndefined();
  });

  test("every entry has substantive content and sources", () => {
    for (const entry of KNOWLEDGE_ENTRIES) {
      expect(entry.what_it_does.length, entry.id).toBeGreaterThan(40);
      expect(entry.how_it_works.length, entry.id).toBeGreaterThan(40);
      expect(entry.tradeoffs.length, entry.id).toBeGreaterThan(20);
      expect(entry.recommendations.length, entry.id).toBeGreaterThan(0);
      expect(entry.sources.length, entry.id).toBeGreaterThan(0);
    }
  });

  test("core topics exist", () => {
    for (const id of [
      "user_scenario",
      "fan_modes_cooler_boost",
      "gpu_switch_mshybrid_discrete",
      "battery_master",
      "llm_workloads_on_this_machine",
      "telemetry_interpretation"
    ]) {
      expect(KNOWLEDGE_TOPIC_IDS).toContain(id);
    }

    expect(listKnowledgeTopics().length).toBe(KNOWLEDGE_ENTRIES.length);
  });
});
