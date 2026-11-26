import type { Fast } from "@/state/types";
import type { AppLanguage } from "@/ui/localization";

function localeFor(language: AppLanguage) {
  return language === "sv" ? "sv-SE" : "en-GB";
}

export function formatFastDate(value: string | Date, language: AppLanguage, options?: Intl.DateTimeFormatOptions) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeFor(language), options ?? {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatFastDateTime(value: string | Date, language: AppLanguage) {
  return formatFastDate(value, language, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFastRange(fast: Pick<Fast, "startAt" | "endAt">, language: AppLanguage) {
  const start = formatFastDate(fast.startAt, language, { day: "numeric", month: "short" });
  const end = formatFastDate(fast.endAt, language, { day: "numeric", month: "short", year: "numeric" });
  return `${start} – ${end}`;
}

export function splitFastMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  return {
    days: Math.floor(safe / 1440),
    hours: Math.floor((safe % 1440) / 60),
    minutes: safe % 60,
  };
}

export function formatFastDuration(minutes: number, language: AppLanguage) {
  const { days, hours, minutes: mins } = splitFastMinutes(minutes);
  if (language === "sv") return `${days} d ${hours} h ${mins} min`;
  return `${days}d ${hours}h ${mins}m`;
}

export function formatCountdown(minutes: number, language: AppLanguage) {
  const { days, hours, minutes: mins } = splitFastMinutes(minutes);
  if (language === "sv") {
    return days > 0 ? `${days} d ${hours} tim ${mins} min` : `${hours} tim ${mins} min`;
  }
  return days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;
}
