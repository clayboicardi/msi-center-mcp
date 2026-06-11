import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "./config.js";

export interface Logger {
  debug(message: string, context?: unknown): Promise<void>;
  warn(message: string, context?: unknown): Promise<void>;
  error(message: string, context?: unknown): Promise<void>;
}

export function createLogger(config: AppConfig): Logger {
  const logFile = path.join(path.resolve(config.logsDirectory), "server-debug.log");

  const write = async (level: string, message: string, context?: unknown): Promise<void> => {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(logFile, `${JSON.stringify(record)}\n`, "utf8");
  };

  return {
    debug: (message, context) => write("debug", message, context),
    warn: async (message, context) => {
      console.error(`[msi-center-mcp] ${message}`);
      await write("warn", message, context);
    },
    error: async (message, context) => {
      console.error(`[msi-center-mcp] ${message}`);
      await write("error", message, context);
    }
  };
}
