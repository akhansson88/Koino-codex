import {
  bibleChapterVerses,
  kjvBooks,
  normalizeBiblePosition,
  type BiblePosition,
} from "@/features/bible-kjv";
import type { BiblePlan, BiblePlanDay, BiblePlanRange, BiblePlanStatus } from "@/state/types";

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

const msPerDay = 24 * 60 * 60 * 1000;

function chapterKey(position: Pick<BiblePosition, "book" | "chapter">): ChapterKey {
  return `${position.book} ${position.chapter}`;
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseLocalDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
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

export function dayKeyForPlanDay(plan: Pick<BiblePlan, "startDate">, dayNumber: number) {
  const startDate = parseLocalDateKey(plan.startDate);
  if (!startDate) return plan.startDate;
  return localDateKey(new Date(startDate.getTime() + Math.max(0, dayNumber - 1) * msPerDay));
}

export function currentPlanDay(plan: Pick<BiblePlan, "days" | "startDate">, now = new Date()): BiblePlanCurrentDay | undefined {
  if (plan.days.length === 0) return undefined;
  const startDate = parseLocalDateKey(plan.startDate);
  if (!startDate) return { day: plan.days[0], index: 0, isAfterEnd: false, isBeforeStart: false };
  const today = parseLocalDateKey(localDateKey(now)) ?? now;
  const dayIndex = Math.floor((today.getTime() - startDate.getTime()) / msPerDay);
  if (dayIndex < 0) return { day: plan.days[0], index: 0, isAfterEnd: false, isBeforeStart: true };
  if (dayIndex >= plan.days.length) {
    return { day: plan.days[plan.days.length - 1], index: plan.days.length - 1, isAfterEnd: true, isBeforeStart: false };
  }
  return { day: plan.days[dayIndex], index: dayIndex, isAfterEnd: false, isBeforeStart: false };
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

export function planMarkersForChapter(plan: BiblePlan, chapter: Pick<BiblePosition, "book" | "chapter">): BiblePlanMarker[] {
  const current = currentPlanDay(plan);
  if (!current || current.isBeforeStart || current.isAfterEnd) return [];
  const ranges = current.day.ranges.filter((range) => {
    const chapterStart = normalizeBiblePosition({ book: chapter.book, chapter: chapter.chapter, verse: firstVerse(chapter.book, chapter.chapter) });
    const chapterEnd = normalizeBiblePosition({ book: chapter.book, chapter: chapter.chapter, verse: lastVerse(chapter.book, chapter.chapter) });
    return comparePositions(range.start, chapterEnd) <= 0 && comparePositions(range.end, chapterStart) >= 0;
  });
  const markers: BiblePlanMarker[] = [];
  ranges.forEach((range) => {
    if (range.start.book === chapter.book && range.start.chapter === chapter.chapter) {
      markers.push({ kind: "start", label: `Start ${plan.title}`, planId: plan.id, verse: range.start.verse });
    }
    if (range.end.book === chapter.book && range.end.chapter === chapter.chapter) {
      markers.push({ kind: "finish", label: `Finish ${plan.title}`, planId: plan.id, verse: range.end.verse });
    }
  });
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
