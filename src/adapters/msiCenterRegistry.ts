import { MSI_REG_KEYS } from "../core/commandRunner.js";
import type { CommandRunner } from "../core/commandRunner.js";
import { defaultConfig } from "../core/config.js";
import { mergeWarnings } from "../core/result.js";

export type RegistryValues = Record<string, string | number>;

export interface ParsedRegistryKeys {
  keys: Record<string, RegistryValues>;
  warnings: string[];
}

export interface MsiCenterRawState {
  available: boolean;
  keys: Record<string, RegistryValues>;
  warnings: string[];
}

export interface MsiCenterProvider {
  getMsiCenterRaw(): Promise<MsiCenterRawState>;
}

// reg.exe's message when a queried key does not exist (en-US text; on a
// localized OS the worst case is warning noise, never a false failure).
// Notebook and desktop MSI Center use different key families, so each
// machine is expected to be missing the other family's keys.
const MISSING_KEY_PATTERN = /unable to find the specified registry key/i;

const KEY_LINE = /^HKEY_[A-Z_]+\\/;
const VALUE_LINE = /^ {4}(.+?) {4}(REG_[A-Z_]+) {4}(.*)$/;
const VALUE_LINE_NO_DATA = /^ {4}(.+?) {4}(REG_[A-Z_]+)\s*$/;

function parseRegistryData(type: string, raw: string): string | number {
  if (type === "REG_DWORD" || type === "REG_QWORD") {
    const parsed = Number(raw.trim());
    return Number.isFinite(parsed) ? parsed : raw.trim();
  }

  return raw;
}

export function parseRegQueryOutput(stdout: string): ParsedRegistryKeys {
  const keys: Record<string, RegistryValues> = {};
  const warnings: string[] = [];
  let currentKey: string | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    if (KEY_LINE.test(line)) {
      currentKey = line;
      keys[currentKey] ??= {};
      continue;
    }

    const match = VALUE_LINE.exec(rawLine) ?? VALUE_LINE_NO_DATA.exec(rawLine);
    if (match && currentKey) {
      const name = match[1] ?? "";
      const type = match[2] ?? "";
      const data = match[3] ?? "";
      const target = (keys[currentKey] ??= {});
      target[name] = parseRegistryData(type, data);
      continue;
    }

    warnings.push(`Unrecognized reg query output line: ${line.slice(0, 80)}`);
  }

  if (Object.keys(keys).length === 0) {
    warnings.push("No registry keys could be parsed from reg query output.");
  }

  return { keys, warnings };
}

export function createMsiCenterRegistryProvider(
  runner: CommandRunner,
  timeoutMs = defaultConfig.commandTimeoutMs
): MsiCenterProvider {
  return {
    async getMsiCenterRaw(): Promise<MsiCenterRawState> {
      const results = await Promise.all(
        MSI_REG_KEYS.map((key) => runner.run("reg-msi", "reg.exe", ["query", key, "/s"], timeoutMs))
      );

      const keys: Record<string, RegistryValues> = {};
      const warningSets: string[][] = [];
      let anyOk = false;

      for (const result of results) {
        if (!result.ok) {
          if (!MISSING_KEY_PATTERN.test(result.stderr)) {
            warningSets.push(result.warnings.length > 0 ? result.warnings : ["reg query failed."]);
          }
          continue;
        }

        anyOk = true;
        const parsed = parseRegQueryOutput(result.stdout);
        Object.assign(keys, parsed.keys);
        warningSets.push(parsed.warnings, result.warnings);
      }

      if (!anyOk) {
        return {
          available: false,
          keys: {},
          warnings: mergeWarnings(["MSI Center registry state is unavailable."], ...warningSets)
        };
      }

      return {
        available: true,
        keys,
        warnings: mergeWarnings(...warningSets)
      };
    }
  };
}
