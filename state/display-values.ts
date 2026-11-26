// Retired encrypted accounts can still hold a vault object where plain text
// used to be (name, community name, membership name). Rendering that shape as
// text crashes React Native, so only a real string is accepted and everything
// else is treated as missing.
export function displayableText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export type DisplayableTheme = "light" | "dark" | "system";

export function displayableTheme(value: unknown): DisplayableTheme | undefined {
  return value === "light" || value === "dark" || value === "system" ? value : undefined;
}

export function displayableDurationSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}
