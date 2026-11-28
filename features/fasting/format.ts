import type { Fast } from "@/state/types";
import { localeFor, type AppLanguage, type TranslationFunction } from "@/ui/localization";

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

export function formatDurationParts(days: number, hours: number, minutes: number, t: TranslationFunction) {
  if (days && hours && minutes) return t("common.duration.dhm", { days, hours, minutes });
  if (days && hours) return t("common.duration.dh", { days, hours });
  if (days && minutes) return t("common.duration.dm", { days, minutes });
  if (days) return t("common.duration.d", { days });
  if (hours && minutes) return t("common.duration.hm", { hours, minutes });
  if (hours) return t("common.duration.h", { hours });
  return t("common.duration.m", { minutes });
}

export function formatFastDuration(minutes: number, t: TranslationFunction) {
  const parts = splitFastMinutes(minutes);
  return formatDurationParts(parts.days, parts.hours, parts.minutes, t);
}

export function formatCountdown(minutes: number, t: TranslationFunction) {
  const parts = splitFastMinutes(minutes);
  return formatDurationParts(parts.days, parts.hours, parts.minutes, t);
}
