import { kjvBooks, type BiblePosition } from "@/features/bible-canon";
import type { BibleVersionId } from "@/features/bible-versions";

export type ReaderNavigationIntent = "chapter" | "verse";
export type ChapterStep = -1 | 1;

const chapterIndices = new Map<string, number>();
let ordinal = 0;
for (const book of kjvBooks) {
  for (const chapter of book.chapters) chapterIndices.set(`${book.name}:${chapter}`, ordinal++);
}

export function chapterIndex(position: Pick<BiblePosition, "book" | "chapter">) {
  return chapterIndices.get(`${position.book}:${position.chapter}`) ?? 0;
}

export function readerChapterKey(version: BibleVersionId, position: Pick<BiblePosition, "book" | "chapter">) {
  return `${version}:${position.book}:${position.chapter}`;
}

export function chapterGestureIntent(dx: number, dy: number) {
  "worklet";
  const x = Math.abs(dx), y = Math.abs(dy);
  if (y >= 6 && y >= x) return "vertical";
  if (x > 12 && x > y * 1.6) return "horizontal";
  return "pending";
}

export function chapterSwipeStep(dx: number, dy: number, velocityX: number, width: number): ChapterStep | 0 {
  "worklet";
  if (Math.abs(dx) <= 44 || Math.abs(dx) <= Math.abs(dy) * 1.8) return 0;
  // Gesture Handler reports points/second; PanResponder used points/millisecond.
  const flick = Math.abs(velocityX) >= 700;
  if (flick && Math.sign(velocityX) !== Math.sign(dx)) return 0;
  if (Math.abs(dx) < Math.max(86, width * 0.24) && !flick) return 0;
  return dx < 0 ? 1 : -1;
}

export function chapterDragProgress(dx: number, width: number, hasPrevious: boolean, hasNext: boolean) {
  "worklet";
  const available = dx < 0 ? hasNext : hasPrevious;
  const distance = available ? Math.min(Math.abs(dx), width) : 24 * (1 - Math.exp(-Math.abs(dx) / 100));
  return -Math.sign(dx) * distance / Math.max(1, width);
}

export type ReaderScrollRequest = {
  revision: number;
  chapterKey: string;
  target: { kind: "top" } | { kind: "verse"; verse: number };
};

/** Layout callbacks may arrive after a second navigation, even within the same chapter. */
export class ReaderScrollIntent {
  revision = 0;
  pending: ReaderScrollRequest | undefined;

  request(chapterKey: string, target: ReaderScrollRequest["target"]) {
    return this.pending = { revision: ++this.revision, chapterKey, target };
  }

  isCurrent(request: ReaderScrollRequest, chapterKey: string) {
    return this.pending === request && request.revision === this.revision && request.chapterKey === chapterKey;
  }

  complete(request: ReaderScrollRequest) {
    if (this.pending === request) this.pending = undefined;
  }

  cancel() {
    this.revision++;
    this.pending = undefined;
  }
}
