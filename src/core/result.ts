export function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].filter((value): value is string => Boolean(value)))];
}

export function mergeWarnings(...warningSets: Array<readonly string[] | undefined>): string[] {
  return uniqueStrings(warningSets.flatMap((warnings) => warnings ?? []));
}

export function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A") {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
