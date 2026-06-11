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
