export type BibleVerseSelection = {
  end?: number;
  start?: number;
};

export function nextBibleVerseSelection(
  { end, start }: BibleVerseSelection,
  verse: number,
): BibleVerseSelection {
  if (start === undefined || (end !== undefined && start !== end)) {
    return { end: verse, start: verse };
  }
  if (verse === start) return {};
  return { end: Math.max(start, verse), start: Math.min(start, verse) };
}
