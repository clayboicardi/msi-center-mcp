import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";

import { createFakeProviders } from "../src/adapters/fakeProviders.js";
import { defaultConfig } from "../src/core/config.js";
import { createMsiCenterMcpServer, TOOL_NAMES } from "../src/mcp/server.js";

describe("MCP server registration", () => {
  test("constructs the server and lists registered tools without hardware", () => {
    const server = createMsiCenterMcpServer({
      providers: createFakeProviders(),
      config: defaultConfig
    });

    expect(server.toolNames).toEqual(TOOL_NAMES);
    expect(server.toolNames).not.toContain("run_command");
    expect(server.toolNames).not.toContain("run_powershell");
  });

  test("lists and calls tools through the SDK in-memory transport", async () => {
    const mcp = createMsiCenterMcpServer({
      providers: createFakeProviders(),
      config: defaultConfig
    });
    const client = new Client(
      {
        name: "test-client",
        version: "0.0.0"
      },
      {
        capabilities: {}
      }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([mcp.server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);

      const result = await client.callTool({
        name: "get_system_info",
        arguments: {}
      });
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";

      expect(JSON.parse(text).model).toContain("Vector");
      expect(result.structuredContent?.model).toContain("Vector");

      const msiState = await client.callTool({
        name: "get_msi_center_state",
        arguments: {}
      });
      const msiStructured = msiState.structuredContent as {
        available: boolean;
        user_scenario: { raw: number; confidence: string };
      };
      expect(msiStructured.available).toBe(true);
      expect(msiStructured.user_scenario.raw).toBe(2);

      const readiness = await client.callTool({
        name: "check_profile_readiness",
        arguments: { profile: "llm_training" }
      });
      const readinessStructured = readiness.structuredContent as {
        profile: string;
        ready: boolean;
        results: unknown[];
      };
      expect(readinessStructured.profile).toBe("llm_training");
      expect(readinessStructured.ready).toBe(true);
      expect(readinessStructured.results.length).toBeGreaterThan(3);

      const knowledge = await client.callTool({
        name: "explain_msi_setting",
        arguments: { topic: "user_scenario" }
      });
      const knowledgeStructured = knowledge.structuredContent as {
        entry: { id: string } | null;
      };
      expect(knowledgeStructured.entry?.id).toBe("user_scenario");
    } finally {
      await client.close();
      await mcp.server.close();
    }
  });

  test("entrypoint contains no direct stdout startup writes", () => {
    const entrypoint = readFileSync("src/index.ts", "utf8");

    expect(entrypoint).not.toContain("console.log");
    expect(entrypoint).not.toContain("process.stdout");
  });
});
