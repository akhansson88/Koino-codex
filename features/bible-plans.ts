import {
  bibleChapterVerses,
  kjvBooks,
  normalizeBiblePosition,
  type BiblePosition,
} from "@/features/bible-kjv";
import type { BiblePlan, BiblePlanDay, BiblePlanRange, BiblePlanStatus } from "@/state/types";
import { scheduledPlanDate, todayPlanDay } from "@/state/bible-plan-schedule";

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

function firstVerse(book: string, chapter: number) {
  return bibleChapterVerses(book, chapter, "kjv")[0]?.verse ?? 1;
}

function lastVerse(book: string, chapter: number) {
  const verses = bibleChapterVerses(book, chapter, "kjv");
  return verses[verses.length - 1]?.verse ?? 1;
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
    const startVerse = chapterKey(cursor) === chapterKey(range.start) ? range.start.verse : firstVerse(cursor.book, cursor.chapter);
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
  const chapterRanges = ranges.flatMap(expandPlanRangeToChapterRanges);
  const days = Array.from({ length: safeDayCount }, (_, index): BiblePlanDay => ({ dayNumber: index + 1, ranges: [] }));
  if (chapterRanges.length === 0) return days;

  chapterRanges.forEach((range, index) => {
    const dayIndex = Math.min(safeDayCount - 1, Math.floor((index * safeDayCount) / chapterRanges.length));
    days[dayIndex].ranges.push(range);
  });

  return days;
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

export function completedDayNumbers(days: BiblePlanDay[]) {
  return days.reduce<Record<string, true>>((result, day) => {
    if (day.completedAt) result[String(day.dayNumber)] = true;
    return result;
  }, {});
}
