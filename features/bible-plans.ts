import {
  kjvBooks,
  normalizeBiblePosition,
  verseCountForChapter,
  type BiblePosition,
} from "@/features/bible-canon";
import type { BiblePlan, BiblePlanDay, BiblePlanRange, BiblePlanStatus } from "@/state/types";
import { addPlanDays, nextUnreadPlanDay, scheduledPlanDate, todayPlanDay } from "@/state/bible-plan-schedule";
import type { AppLanguage } from "@/ui/localization";

// Kept local and dependency-free so the validation script can load this file
// on its own with esbuild.
const planLocales: Record<AppLanguage, string> = {
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

type ChapterKey = `${string} ${number}`;

export type BiblePlanMarkerKind = "start" | "finish";

export type BiblePlanMarker = {
  kind: BiblePlanMarkerKind;
  label: string;
  planId: string;
  verse: number;
};

export type BiblePlanCurrentDay = {
  day: BiblePlanDay;
  index: number;
  isBeforeStart: boolean;
  isAfterEnd: boolean;
};

function chapterKey(position: Pick<BiblePosition, "book" | "chapter">): ChapterKey {
  return `${position.book} ${position.chapter}`;
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function comparePositions(first: BiblePosition, second: BiblePosition) {
  const firstBook = kjvBooks.findIndex((book) => book.name === first.book);
  const secondBook = kjvBooks.findIndex((book) => book.name === second.book);
  if (firstBook !== secondBook) return firstBook - secondBook;
  if (first.chapter !== second.chapter) return first.chapter - second.chapter;
  return first.verse - second.verse;
}

function lastVerse(book: string, chapter: number) {
  return verseCountForChapter(book, chapter) || 1;
}

function nextChapterPosition(position: Pick<BiblePosition, "book" | "chapter">) {
  const bookIndex = kjvBooks.findIndex((book) => book.name === position.book);
  if (bookIndex < 0) return undefined;
  const book = kjvBooks[bookIndex];
  const chapterIndex = book.chapters.indexOf(position.chapter);
  if (chapterIndex < 0) return undefined;
  if (chapterIndex < book.chapters.length - 1) {
    return normalizeBiblePosition({ book: book.name, chapter: book.chapters[chapterIndex + 1], verse: 1 });
  }
  const nextBook = kjvBooks[bookIndex + 1];
  if (!nextBook) return undefined;
  return normalizeBiblePosition({ book: nextBook.name, chapter: nextBook.chapters[0], verse: 1 });
}

function normalizeRangeEndpoints(start: BiblePosition, end: BiblePosition) {
  const normalizedStart = normalizeBiblePosition(start);
  const normalizedEnd = normalizeBiblePosition(end);
  return comparePositions(normalizedStart, normalizedEnd) <= 0
    ? { start: normalizedStart, end: normalizedEnd }
    : { start: normalizedEnd, end: normalizedStart };
}

export function readablePlanRange(start: BiblePosition, end: BiblePosition) {
  if (start.book === end.book && start.chapter === end.chapter) {
    return `${start.book} ${start.chapter}:${start.verse}${start.verse === end.verse ? "" : `-${end.verse}`}`;
  }
  if (start.book === end.book) {
    return `${start.book} ${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
  }
  return `${start.book} ${start.chapter}:${start.verse}-${end.book} ${end.chapter}:${end.verse}`;
}

export function makeBiblePlanRange(id: string, start: BiblePosition, end: BiblePosition): BiblePlanRange {
  const endpoints = normalizeRangeEndpoints(start, end);
  return {
    id,
    displayReference: readablePlanRange(endpoints.start, endpoints.end),
    start: endpoints.start,
    end: endpoints.end,
  };
}

export function expandPlanRangeToChapterRanges(range: BiblePlanRange): BiblePlanRange[] {
  const chapters: BiblePlanRange[] = [];
  let cursor = normalizeBiblePosition({ ...range.start, verse: 1 });

  while (comparePositions(cursor, range.end) <= 0) {
    const startVerse = chapterKey(cursor) === chapterKey(range.start) ? range.start.verse : 1;
    const endVerse = chapterKey(cursor) === chapterKey(range.end) ? range.end.verse : lastVerse(cursor.book, cursor.chapter);
    const start = normalizeBiblePosition({ book: cursor.book, chapter: cursor.chapter, verse: startVerse });
    const end = normalizeBiblePosition({ book: cursor.book, chapter: cursor.chapter, verse: endVerse });
    chapters.push({
      id: `${range.id}_${chapters.length + 1}`,
      displayReference: readablePlanRange(start, end),
      start,
      end,
    });

    const next = nextChapterPosition(cursor);
    if (!next || chapterKey(next) === chapterKey(cursor)) break;
    cursor = next;
  }

  return chapters;
}

export function buildBiblePlanDays(ranges: BiblePlanRange[], dayCount: number): BiblePlanDay[] {
  const safeDayCount = Math.max(1, Math.floor(dayCount));
  const days = Array.from({ length: safeDayCount }, (_, index): BiblePlanDay => ({ dayNumber: index + 1, ranges: [] }));
  const verses = planRangeVerses(ranges);
  if (verses.length === 0) return days;

  // Distribute by verse count rather than chapter count so a day with Psalm 119
  // is not treated like a day with four short chapters.
  const buckets = Array.from({ length: safeDayCount }, () => [] as PlanVerse[]);
  verses.forEach((verse, index) => {
    const dayIndex = Math.min(safeDayCount - 1, Math.floor((index * safeDayCount) / verses.length));
    buckets[dayIndex].push(verse);
  });

  buckets.forEach((bucket, index) => {
    days[index].ranges = rangesForPlanDay(bucket, index + 1);
  });
  return days;
}

type PlanVerse = { book: string; chapter: number; verse: number };

function planRangeVerses(ranges: BiblePlanRange[]): PlanVerse[] {
  const seen = new Set<string>();
  const verses: PlanVerse[] = [];
  ranges.forEach((range) => {
    expandPlanRangeToChapterRanges(range).forEach((chapterRange) => {
      for (let verse = chapterRange.start.verse; verse <= chapterRange.end.verse; verse += 1) {
        const key = `${chapterRange.start.book} ${chapterRange.start.chapter}:${verse}`;
        if (seen.has(key)) continue;
        seen.add(key);
        verses.push({ book: chapterRange.start.book, chapter: chapterRange.start.chapter, verse });
      }
    });
  });
  return verses;
}

function rangesForPlanDay(verses: PlanVerse[], dayNumber: number): BiblePlanRange[] {
  const ranges: BiblePlanRange[] = [];
  let start: PlanVerse | undefined;
  let previous: PlanVerse | undefined;

  const flush = () => {
    if (!start || !previous) return;
    ranges.push(makeBiblePlanRange(`day_${dayNumber}_range_${ranges.length + 1}`, start, previous));
  };

  verses.forEach((verse) => {
    if (!start || !previous) {
      start = verse;
      previous = verse;
      return;
    }
    const continuesChapter = verse.book === previous.book && verse.chapter === previous.chapter;
    if (continuesChapter && verse.verse === previous.verse + 1) {
      previous = verse;
      return;
    }
    flush();
    start = verse;
    previous = verse;
  });
  flush();
  return ranges;
}

export function verseCountInPlanRange(range: BiblePlanRange) {
  return expandPlanRangeToChapterRanges(range).reduce(
    (total, part) => total + Math.max(0, part.end.verse - part.start.verse + 1),
    0,
  );
}

export function planDayVerseCount(day?: BiblePlanDay) {
  return day?.ranges.reduce((total, range) => total + verseCountInPlanRange(range), 0) ?? 0;
}

export function planDayMinutes(day?: BiblePlanDay) {
  const verses = planDayVerseCount(day);
  if (!verses) return 0;
  return Math.max(1, Math.round(verses / 8));
}

export function formatPlanDate(value: string, language: AppLanguage, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(planLocales[language], options ?? { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export type BiblePlanPace = {
  behind: number;
  today?: BiblePlanDay;
  next?: BiblePlanDay;
  todayCompleted: boolean;
  notStarted: boolean;
};

export function planPace(
  plan: Pick<BiblePlan, "days" | "startDate" | "pausedAt" | "status">,
  date: string,
): BiblePlanPace {
  const today = todayPlanDay(plan, date);
  const next = nextUnreadPlanDay(plan);
  const behind = plan.pausedAt || plan.status === "completed"
    ? 0
    : plan.days.filter((day) => day.ranges.length > 0 && !day.completedAt && scheduledPlanDate(plan, day.dayNumber) < date).length;
  const notStarted = plan.days.length > 0 && plan.days.every((day) => scheduledPlanDate(plan, day.dayNumber) > date);
  return { behind, today, next, todayCompleted: Boolean(today?.completedAt), notStarted };
}

export type PlanWeekStatus = "done" | "today" | "upcoming" | "missed" | "empty";
export type PlanWeekDay = { date: string; day?: BiblePlanDay; status: PlanWeekStatus };

export function planWeek(
  plan: Pick<BiblePlan, "days" | "startDate" | "pausedAt">,
  date: string,
): PlanWeekDay[] {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return [];
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  const monday = addPlanDays(date, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = addPlanDays(monday, index);
    const day = plan.days.find((item) => scheduledPlanDate(plan, item.dayNumber) === dateKey);
    const status: PlanWeekStatus = !day || day.ranges.length === 0
      ? "empty"
      : day.completedAt
        ? "done"
        : dateKey === date
          ? "today"
          : dateKey < date
            ? "missed"
            : "upcoming";
    return { date: dateKey, day, status };
  });
}

export function todayDateKey() {
  return localDateKey(new Date());
}

export function dayKeyForPlanDay(plan: Pick<BiblePlan, "startDate"> & Partial<Pick<BiblePlan, "days">>, dayNumber: number) {
  return scheduledPlanDate(plan, dayNumber);
}

export function currentPlanDay(plan: Pick<BiblePlan, "days" | "startDate" | "pausedAt">, now = new Date()): BiblePlanCurrentDay | undefined {
  const today = todayPlanDay(plan, localDateKey(now));
  const index = plan.days.findIndex((day) => day === today);
  return index < 0 ? undefined : { day: plan.days[index], index, isAfterEnd: false, isBeforeStart: false };
}

export function planCompletionStatus(days: BiblePlanDay[]): BiblePlanStatus {
  if (days.length > 0 && days.every((day) => Boolean(day.completedAt))) return "completed";
  if (days.some((day) => Boolean(day.completedAt))) return "active";
  return "saved";
}

export function completionPercent(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export function biblePlanDayRegionLabel(day?: BiblePlanDay) {
  if (!day?.ranges.length) return "";
  if (day.ranges.length === 1) return day.ranges[0].displayReference;
  const firstRange = day.ranges[0];
  const lastRange = day.ranges[day.ranges.length - 1];
  return readablePlanRange(firstRange.start, lastRange.end);
}

export function planMarkersForChapter(plan: BiblePlan, chapter: Pick<BiblePosition, "book" | "chapter">, selectedDay?: BiblePlanDay): BiblePlanMarker[] {
  const current = selectedDay ? { day: selectedDay, isBeforeStart: false, isAfterEnd: false } : currentPlanDay(plan);
  if (!current || current.isBeforeStart || current.isAfterEnd) return [];
  const firstRange = current.day.ranges[0];
  const lastRange = current.day.ranges[current.day.ranges.length - 1];
  if (!firstRange || !lastRange) return [];
  const markers: BiblePlanMarker[] = [];
  if (firstRange.start.book === chapter.book && firstRange.start.chapter === chapter.chapter) {
    markers.push({ kind: "start", label: "Start here", planId: plan.id, verse: firstRange.start.verse });
  }
  if (lastRange.end.book === chapter.book && lastRange.end.chapter === chapter.chapter) {
    markers.push({ kind: "finish", label: "Finish here", planId: plan.id, verse: lastRange.end.verse });
  }
  return markers;
}

export function firstPositionForPlanDay(day?: BiblePlanDay) {
  return day?.ranges[0]?.start;
}

export function highlightedBiblePlan(ownedPlans: BiblePlan[], date: string): { plan: BiblePlan; day?: BiblePlanDay } | undefined {
  const activePlans = ownedPlans.filter((plan) => plan.status !== "completed");
  let catchUp: { plan: BiblePlan; day: BiblePlanDay } | undefined;

  // The store supplies most recently updated plans first.
  for (const plan of activePlans) {
    if (plan.pausedAt) continue;
    const next = nextUnreadPlanDay(plan);
    if (!next) continue;
    const today = todayPlanDay(plan, date);
    if (today && !today.completedAt && firstPositionForPlanDay(today)) return { plan, day: today };
    if (!catchUp && firstPositionForPlanDay(next)) catchUp = { plan, day: next };
  }

  if (catchUp) return catchUp;
  const plan = activePlans.find((item) => !item.pausedAt) ?? activePlans[0];
  return plan ? { plan } : undefined;
}

export function biblePlanReadingRoute(planId: string, dayNumber: number) {
  return { pathname: "/(tabs)/bible" as const, params: { planId, planDay: String(dayNumber), planJump: String(Date.now()) } };
}

export function completedDayNumbers(days: BiblePlanDay[]) {
  return days.reduce<Record<string, true>>((result, day) => {
    if (day.completedAt) result[String(day.dayNumber)] = true;
    return result;
  }, {});
}
