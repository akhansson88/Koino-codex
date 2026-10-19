import { kjvBooks, normalizeBiblePosition, type BiblePosition } from "@/features/bible-canon";
import type { BibleVersionId } from "@/features/bible-versions";

export type BibleHistory = { entries: BiblePosition[]; index: number };
const limit = 10;

export function sameBiblePosition(a: BiblePosition, b: BiblePosition) {
  return a.book === b.book && a.chapter === b.chapter && a.verse === b.verse;
}

export function initialBibleHistory(position: BiblePosition): BibleHistory {
  return { entries: [position], index: 0 };
}

export function readBibleHistory(value: unknown, fallback: BiblePosition, versionId: BibleVersionId = "kjv"): BibleHistory {
  if (!value || typeof value !== "object") return initialBibleHistory(fallback);
  const candidate = value as Partial<BibleHistory>;
  if (!Array.isArray(candidate.entries) || candidate.entries.length < 1 || candidate.entries.length > limit ||
      !Number.isInteger(candidate.index) || (candidate.index as number) < 0 || (candidate.index as number) >= candidate.entries.length) {
    return initialBibleHistory(fallback);
  }
  const entries: BiblePosition[] = [];
  for (const item of candidate.entries) {
    if (!item || typeof item !== "object" || typeof item.book !== "string" ||
        !kjvBooks.some((book) => book.name === item.book) || !Number.isInteger(item.chapter) || !Number.isInteger(item.verse)) {
      return initialBibleHistory(fallback);
    }
    const normalized = normalizeBiblePosition(item, versionId);
    if (!sameBiblePosition(item, normalized) || (entries.length && sameBiblePosition(entries[entries.length - 1], normalized))) {
      return initialBibleHistory(fallback);
    }
    entries.push(normalized);
  }
  return { entries, index: candidate.index as number };
}

export function updateBibleHistoryPosition(history: BibleHistory, position: BiblePosition): BibleHistory {
  if (sameBiblePosition(history.entries[history.index], position)) return history;
  const entries = [...history.entries];
  entries[history.index] = position;
  return { entries, index: history.index };
}

export function visitBiblePosition(history: BibleHistory, position: BiblePosition): BibleHistory {
  if (sameBiblePosition(history.entries[history.index], position)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), position].slice(-limit);
  return { entries, index: entries.length - 1 };
}

export function moveBibleHistory(history: BibleHistory, direction: -1 | 1): BibleHistory {
  const index = history.index + direction;
  return index < 0 || index >= history.entries.length ? history : { ...history, index };
}
