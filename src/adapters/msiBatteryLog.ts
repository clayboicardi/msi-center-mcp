import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_AI_BATTERY_DIRECTORY = "C:\\ProgramData\\MSI\\AI_Battery";

export interface BatteryHealth {
  available: boolean;
  designed_capacity_mwh: number | null;
  full_charge_capacity_mwh: number | null;
  wear_percent: number | null;
  latest: {
    time: string;
    ac_power: boolean | "unknown";
    charge_percent: number | null;
  } | null;
  sample_count: number;
  log_path: string | null;
  warnings: string[];
}

export interface BatteryHealthProvider {
  getBatteryHealth(): Promise<BatteryHealth>;
}

interface BatteryRow {
  time: string;
  timeMs: number;
  designed: number;
  fullCharged: number;
  ac: boolean | "unknown";
  lifePercent: number | null;
}

const unavailable = (warnings: string[]): BatteryHealth => ({
  available: false,
  designed_capacity_mwh: null,
  full_charge_capacity_mwh: null,
  wear_percent: null,
  latest: null,
  sample_count: 0,
  log_path: null,
  warnings
});

function parseRow(line: string): BatteryRow | null {
  const parts = line.split(",").map((part) => part.trim());
  if (parts.length < 5) {
    return null;
  }

  const [time, designedText, fullText, acText, lifeText] = parts;
  const timeMs = Date.parse(time ?? "");
  const designed = Number(designedText);
  const fullCharged = Number(fullText);
  if (!time || !Number.isFinite(timeMs) || !Number.isFinite(designed) || !Number.isFinite(fullCharged)) {
    return null;
  }

  const life = Number(lifeText);
  return {
    time,
    timeMs,
    designed,
    fullCharged,
    ac: acText === "AC" ? true : acText === "DC" ? false : "unknown",
    lifePercent: Number.isFinite(life) ? life : null
  };
}

async function newestLogFile(directory: string): Promise<string | null> {
  const entries = await readdir(directory);
  const candidates = entries.filter((entry) => entry.toLowerCase().endsWith("_log.csv"));

  let newest: { file: string; mtimeMs: number } | null = null;
  for (const candidate of candidates) {
    const fullPath = path.join(directory, candidate);
    const stats = await stat(fullPath);
    if (!newest || stats.mtimeMs > newest.mtimeMs) {
      newest = { file: fullPath, mtimeMs: stats.mtimeMs };
    }
  }

  return newest?.file ?? null;
}

export function createMsiBatteryLogProvider(
  directory = DEFAULT_AI_BATTERY_DIRECTORY
): BatteryHealthProvider {
  return {
    async getBatteryHealth(): Promise<BatteryHealth> {
      let logPath: string | null;
      try {
        logPath = await newestLogFile(directory);
      } catch {
        return unavailable([`MSI AI_Battery directory is not readable: ${directory}`]);
      }

      if (!logPath) {
        return unavailable([`No *_log.csv battery log found in ${directory}.`]);
      }

      let contents: string;
      try {
        contents = await readFile(logPath, "utf8");
      } catch {
        return unavailable([`Battery log could not be read: ${logPath}`]);
      }

      const warnings: string[] = [];
      const rows = contents
        .split(/\r?\n/)
        .slice(1) // header: LogTime,DesignedCapacity,FullChargedCapacity,AC/DC,LifePercent
        .filter((line) => line.trim())
        .map(parseRow)
        .filter((row): row is BatteryRow => row !== null);

      if (rows.length === 0) {
        return unavailable([`Battery log contained no parseable rows: ${logPath}`]);
      }

      const latest = rows.reduce((a, b) => (b.timeMs > a.timeMs ? b : a));
      let wearPercent: number | null = null;
      if (latest.designed > 0) {
        const rawWear = ((latest.designed - latest.fullCharged) / latest.designed) * 100;
        if (rawWear < 0) {
          warnings.push(
            "Battery reports full-charge capacity above its design capacity; treating wear as 0%."
          );
          wearPercent = 0;
        } else {
          wearPercent = Math.round(rawWear * 10) / 10;
        }
      }

      return {
        available: true,
        designed_capacity_mwh: latest.designed,
        full_charge_capacity_mwh: latest.fullCharged,
        wear_percent: wearPercent,
        latest: {
          time: latest.time,
          ac_power: latest.ac,
          charge_percent: latest.lifePercent
        },
        sample_count: rows.length,
        log_path: logPath,
        warnings
      };
    }
  };
}
