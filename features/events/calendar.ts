import { localeFor } from "@/ui/localization";
import type { AppLanguage } from "@/ui/localization";
export type CalendarCell = {
  date: Date;
  dayKey: string;
  inMonth: boolean;
};

export function dayKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateFromDayKey(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return new Date();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1, 12, 0, 0, 0);
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

export function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12, 0, 0, 0);
}

// Weeks start on Monday, matching the Swedish calendar KOINO's audience expects.
export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = startOfMonth(year, month);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return { date, dayKey: dayKeyFor(date), inMonth: date.getMonth() === month };
  });
}

export function monthLabel(date: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(localeFor(language), { month: "long", year: "numeric" }).format(date);
}

export function weekdayLabels(language: AppLanguage) {
  const formatter = new Intl.DateTimeFormat(localeFor(language), { weekday: "short" });
  const monday = new Date(2024, 0, 1, 12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => formatter.format(addDays(monday, index)).replace(".", ""));
}

export function combineLocalDateAndTime(dayKey: string, time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return undefined;
  const day = dateFromDayKey(dayKey);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

export function localTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "18:00";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
