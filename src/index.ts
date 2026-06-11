#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createConfig } from "./core/config.js";
import { createLogger } from "./core/logger.js";
import { createDefaultProviders } from "./adapters/sensorProvider.js";
import { createMsiCenterMcpServer } from "./mcp/server.js";

export async function startServer(): Promise<void> {
  const config = createConfig();
  const { server } = createMsiCenterMcpServer({
    providers: createDefaultProviders(),
    config
  });

  await server.connect(new StdioServerTransport());
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  startServer().catch(async (error: unknown) => {
    const config = createConfig();
    const logger = createLogger(config);
    const message = error instanceof Error ? error.message : String(error);
    await logger.error(`Fatal server error: ${message}`);
    process.exitCode = 1;
  });
}
