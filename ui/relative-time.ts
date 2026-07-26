import { translateMessage, type AppLanguage } from "@/ui/localization";

const formatters: Record<AppLanguage, { date: Intl.DateTimeFormat; time: Intl.DateTimeFormat }> = {
  en: {
    date: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }),
    time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }),
  },
  sv: {
    date: new Intl.DateTimeFormat("sv-SE", { month: "short", day: "numeric" }),
    time: new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }),
  },
};

function localStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDifference(from: Date, to: Date) {
  return Math.round((localStartOfDay(to) - localStartOfDay(from)) / 86400000);
}

export function formatRelativeTime(value: string, currentDate?: Date): string;
export function formatRelativeTime(value: string, language?: AppLanguage, currentDate?: Date): string;
export function formatRelativeTime(value: string, languageOrCurrentDate: AppLanguage | Date = "en", suppliedCurrentDate?: Date) {
  const language = languageOrCurrentDate instanceof Date ? "en" : languageOrCurrentDate;
  const currentDate = languageOrCurrentDate instanceof Date ? languageOrCurrentDate : suppliedCurrentDate ?? new Date();
  const { date: dateFormatter, time: timeFormatter } = formatters[language];
  const date = new Date(value);
  const created = date.getTime();
  if (Number.isNaN(created)) return "";

  const dayDiff = dayDifference(date, currentDate);
  if (dayDiff === 0) {
    const seconds = Math.max(0, Math.floor((currentDate.getTime() - created) / 1000));
    if (seconds < 60) return translateMessage(language, "shared.relativeTime.justNow");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return translateMessage(language, "shared.relativeTime.minutesAgo", { minutes });
    return translateMessage(language, "shared.relativeTime.todayAt", { time: timeFormatter.format(date) });
  }

  if (dayDiff === 1) {
    return translateMessage(language, "shared.relativeTime.yesterdayAt", { time: timeFormatter.format(date) });
  }
  return dateFormatter.format(date);
}
