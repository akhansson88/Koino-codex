import type { EventRsvp, EventRsvpStatus, GroupEvent, GroupEventKind, Id } from "@/state/types";
import type { AppLanguage, TranslationFunction } from "@/ui/localization";

// Kept local and dependency-free so the validation scripts can load this file
// on its own with esbuild.
const eventLocales: Record<AppLanguage, string> = {
  en: "en-GB",
  sv: "sv-SE",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  fi: "fi-FI",
  nb: "nb-NO",
  da: "da-DK",
  is: "is-IS",
  pt: "pt-PT",
  ms: "ms-MY",
  ar: "ar-SA",
  ja: "ja-JP",
  it: "it-IT",
  pl: "pl-PL",
};

export const eventKinds: GroupEventKind[] = ["prayer_meeting", "bible_study", "community_event", "other"];

export const eventReminderChoices = [1440, 60, 15] as const;

export const eventTitleLimit = 120;
export const eventDescriptionLimit = 2000;
export const eventLocationLimit = 180;
export const eventDurationOptions = [30, 60, 90, 120] as const;
export const eventDefaultDuration = 90;

export type EventDraft = {
  kind: GroupEventKind;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  timeZone?: string;
  location?: string;
  meetingUrl?: string;
  reminderMinutes: number[];
};

export function isGroupEventKind(value: unknown): value is GroupEventKind {
  return typeof value === "string" && eventKinds.includes(value as GroupEventKind);
}

export function isEventRsvpStatus(value: unknown): value is EventRsvpStatus {
  return value === "going" || value === "maybe" || value === "declined";
}

export function normalizeEventReminderMinutes(value: unknown): number[] {
  const allowed = new Set<number>(eventReminderChoices);
  if (!Array.isArray(value)) return [1440, 60];
  return [...new Set(value.filter((item): item is number => Number.isInteger(item) && allowed.has(item)))].sort((a, b) => b - a);
}

export function eventDraftProblem(draft: EventDraft, now = Date.now()): "title" | "time" | "duration" | "link" | "description" | null {
  const title = draft.title.trim();
  if (!title || title.length > eventTitleLimit) return "title";
  const start = Date.parse(draft.startAt);
  const end = Date.parse(draft.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start > now + 5 * 365 * 86400000) return "time";
  if (end - start < 15 * 60000 || end - start > 12 * 60 * 60000) return "duration";
  if (draft.description && draft.description.length > eventDescriptionLimit) return "description";
  if (draft.location && draft.location.trim().length > eventLocationLimit) return "title";
  if (draft.meetingUrl && !/^https?:\/\/[^\s]+$/i.test(draft.meetingUrl.trim())) return "link";
  return null;
}

export function eventTime(event: Pick<GroupEvent, "startAt" | "endAt">) {
  const start = Date.parse(event.startAt);
  const end = Date.parse(event.endAt);
  return { start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : 0 };
}

export function eventDurationMinutes(event: Pick<GroupEvent, "startAt" | "endAt">) {
  const { start, end } = eventTime(event);
  return Math.max(0, Math.round((end - start) / 60000));
}

export function eventIsPast(event: Pick<GroupEvent, "endAt">, now = Date.now()) {
  return Date.parse(event.endAt) <= now;
}

export function eventIsUpcoming(event: Pick<GroupEvent, "endAt">, now = Date.now()) {
  return Date.parse(event.endAt) > now;
}

export function sortGroupEvents(events: GroupEvent[]) {
  return [...events].sort((left, right) => eventTime(left).start - eventTime(right).start || left.title.localeCompare(right.title));
}

export function nextUpcomingEvent(events: GroupEvent[], now = Date.now(), limitDays = 14) {
  const horizon = now + limitDays * 86400000;
  return sortGroupEvents(events).find((event) => {
    const start = eventTime(event).start;
    return start >= now && start <= horizon;
  });
}

export function eventsOnDay(events: GroupEvent[], dayKey: string) {
  return sortGroupEvents(events.filter((event) => localEventDayKey(event.startAt) === dayKey));
}

export function localEventDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function eventRsvpFor(rsvps: EventRsvp[], eventId: Id, userId?: Id) {
  if (!userId) return undefined;
  return rsvps.find((rsvp) => rsvp.eventId === eventId && rsvp.userId === userId);
}

export function eventAttendees(rsvps: EventRsvp[], eventId: Id) {
  return rsvps.filter((rsvp) => rsvp.eventId === eventId);
}

export function eventRsvpCounts(rsvps: EventRsvp[], eventId: Id) {
  const counts: Record<EventRsvpStatus, number> = { going: 0, maybe: 0, declined: 0 };
  for (const rsvp of rsvps) {
    if (rsvp.eventId === eventId && isEventRsvpStatus(rsvp.status)) counts[rsvp.status] += 1;
  }
  return counts;
}

export function eventKindKey(kind: GroupEventKind) {
  return `events.kind.${kind}` as const;
}

function localeForEvent(language: AppLanguage) {
  return eventLocales[language];
}

export function formatEventDay(value: string, language: AppLanguage, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeForEvent(language), options ?? { weekday: "long", month: "long", day: "numeric" }).format(date);
}

export function formatEventDateShort(value: string, language: AppLanguage) {
  return formatEventDay(value, language, { month: "short", day: "numeric" });
}

export function formatEventTime(value: string, language: AppLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeForEvent(language), { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatEventTimeRange(event: Pick<GroupEvent, "startAt" | "endAt">, language: AppLanguage) {
  return `${formatEventTime(event.startAt, language)}–${formatEventTime(event.endAt, language)}`;
}

export function formatDuration(minutes: number, t: TranslationFunction) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return t("common.duration.hm", { hours, minutes: rest });
  if (hours) return t("common.duration.h", { hours });
  return t("common.duration.m", { minutes: rest });
}

// Google Calendar expects UTC basic format: 20261125T170000Z.
function googleCalendarStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function googleCalendarUrl(event: Pick<GroupEvent, "title" | "description" | "startAt" | "endAt" | "location" | "meetingUrl">) {
  const start = googleCalendarStamp(event.startAt);
  const end = googleCalendarStamp(event.endAt);
  if (!start || !end) return "";
  const details = [event.description?.trim(), event.meetingUrl?.trim()].filter(Boolean).join("\n\n");
  const params = [
    ["action", "TEMPLATE"],
    ["text", event.title],
    ["dates", `${start}/${end}`],
    ...(details ? [["details", details] as [string, string]] : []),
    ...(event.location?.trim() ? [["location", event.location.trim()] as [string, string]] : []),
  ];
  return `https://calendar.google.com/calendar/render?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}

export function eventShareText(
  event: Pick<GroupEvent, "title" | "description" | "startAt" | "endAt" | "location" | "meetingUrl">,
  groupName: string,
  dayLabel: string,
  timeLabel: string,
) {
  return [
    event.title,
    `${groupName} · ${dayLabel} · ${timeLabel}`,
    event.location?.trim(),
    event.meetingUrl?.trim(),
    event.description?.trim(),
  ].filter(Boolean).join("\n");
}
