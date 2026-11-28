import type { PresenceInfo, PresenceStatus } from "@/state/presence-model";
import { localeFor, type TranslationFunction } from "@/ui/localization";
import type { AppLanguage } from "@/ui/translations/types";
import { colors } from "@/ui/theme";

export function presenceStatusColor(status: PresenceStatus) {
  if (status === "online") return colors.moss;
  if (status === "inactive") return colors.gold;
  if (status === "hidden") return "transparent";
  return colors.line;
}

export function presenceDotColor(status: PresenceStatus) {
  if (status === "online") return colors.moss;
  if (status === "inactive") return colors.gold;
  return colors.line;
}

function formatTime(timestamp: number, language: AppLanguage) {
  return new Date(timestamp).toLocaleTimeString(localeFor(language), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(timestamp: number, language: AppLanguage) {
  return new Date(timestamp).toLocaleDateString(localeFor(language), {
    day: "numeric",
    month: "short",
  });
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function presenceMoment(
  lastSeen: number | undefined,
  now: number,
  t: TranslationFunction,
  language: AppLanguage,
) {
  if (!lastSeen) return "";
  const elapsed = Math.max(0, now - lastSeen);
  if (elapsed < 60_000) return t("presence.moment.now");
  if (elapsed < 3_600_000) {
    return t("presence.moment.minutes", { count: Math.max(1, Math.round(elapsed / 60_000)) });
  }
  if (elapsed < 6 * 3_600_000) {
    return t("presence.moment.hours", { count: Math.max(1, Math.round(elapsed / 3_600_000)) });
  }
  const days = Math.round((startOfDay(now) - startOfDay(lastSeen)) / 86_400_000);
  if (days <= 1) return t("presence.moment.yesterday", { time: formatTime(lastSeen, language) });
  if (days < 7) return t("presence.moment.days", { count: days });
  return t("presence.moment.date", { date: formatDate(lastSeen, language) });
}

export function presenceStatusText(
  info: PresenceInfo | undefined,
  now: number,
  t: TranslationFunction,
  language: AppLanguage,
) {
  const status = info?.status ?? "offline";
  if (status === "online") return t("presence.status.online");
  if (status === "hidden") return t("presence.status.hidden");
  if (!info?.lastSeen) return t("presence.status.never");
  const moment = presenceMoment(info.lastSeen, now, t, language);
  return status === "inactive"
    ? t("presence.active", { when: moment })
    : t("presence.lastSeen", { when: moment });
}

export function presenceAccessibilityLabel(
  name: string,
  info: PresenceInfo | undefined,
  now: number,
  t: TranslationFunction,
  language: AppLanguage,
) {
  return `${name}. ${presenceStatusText(info, now, t, language)}`;
}
