import type { BibleDatabaseVerseLink } from "@/features/bible-database";

export type VerseAnchor = { fraction: number; verse: number };

export type PaneLayout = {
  heights: number[];
  tops: number[];
  verses: number[];
};

export type ResolvedAnchor = {
  approximate: boolean;
  chapter: number;
  crossChapter: boolean;
  fraction: number;
  verse: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The verse under the reading line, plus how far into that verse the line is.
 * `line` is measured from the top of the scroll viewport. Offsets are in the
 * scroll view's content coordinates.
 */
export function anchorAtOffset(layout: PaneLayout, scrollY: number, line: number): VerseAnchor | undefined {
  if (layout.verses.length === 0) return undefined;
  const target = scrollY + line;
  let low = 0;
  let high = layout.verses.length - 1;
  let index = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (layout.tops[middle] <= target) {
      index = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const top = layout.tops[index];
  const height = layout.heights[index];
  const fraction = height > 0 ? clamp01((target - top) / height) : 0;
  return { fraction, verse: layout.verses[index] };
}

/** The scroll offset that puts `anchor` on the reading line. */
export function offsetForAnchor(layout: PaneLayout, anchor: VerseAnchor, line: number): number | undefined {
  if (layout.verses.length === 0) return undefined;
  let index = 0;
  if (anchor.verse <= layout.verses[0]) {
    index = 0;
  } else if (anchor.verse >= layout.verses[layout.verses.length - 1]) {
    index = layout.verses.length - 1;
  } else {
    let low = 0;
    let high = layout.verses.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (layout.verses[middle] <= anchor.verse) {
        index = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
  }
  const height = layout.heights[index];
  const top = layout.tops[index];
  return Math.max(0, top - line + clamp01(anchor.fraction) * height);
}

/**
 * Map an anchor through one chapter's alignment links.
 *
 * Links are fractional: a verse that is merged in the other translation covers
 * a fraction of that verse, so a mid-verse anchor lands at the same text, not
 * at the top of the target verse. When several links cover the anchor, the
 * narrowest one wins (the most specific correspondence).
 */
export function resolveAnchor(
  links: ReadonlyMap<number, BibleDatabaseVerseLink[]>,
  anchor: VerseAnchor,
): ResolvedAnchor | undefined {
  const rows = links.get(anchor.verse);
  if (!rows || rows.length === 0) return undefined;

  const covering = rows.filter(
    (row) => anchor.fraction >= row.sourceStart - 1e-9 && anchor.fraction <= row.sourceEnd + 1e-9,
  );
  const candidates = covering.length > 0 ? covering : rows;
  const chosen = candidates.reduce((best, row) => {
    const bestSpan = best.sourceEnd - best.sourceStart;
    const rowSpan = row.sourceEnd - row.sourceStart;
    if (rowSpan < bestSpan) return row;
    if (rowSpan > bestSpan) return best;
    return row.confidence > best.confidence ? row : best;
  });

  const sourceSpan = chosen.sourceEnd - chosen.sourceStart;
  const ratio = sourceSpan <= 1e-9 ? 0 : clamp01((anchor.fraction - chosen.sourceStart) / sourceSpan);
  const fraction = clamp01(chosen.targetStart + ratio * (chosen.targetEnd - chosen.targetStart));

  return {
    approximate: chosen.approximate || chosen.crossChapter,
    chapter: chosen.targetChapter,
    crossChapter: chosen.crossChapter,
    fraction,
    verse: chosen.targetVerse,
  };
}

/**
 * Two-hop mapping used when neither translation is the pivot:
 * source -> KJV, then KJV -> target.
 */
export function composeAnchor(
  first: ResolvedAnchor | undefined,
  resolveSecond: (chapter: number, anchor: VerseAnchor) => ResolvedAnchor | undefined,
): ResolvedAnchor | undefined {
  if (!first) return undefined;
  const second = resolveSecond(first.chapter, { fraction: first.fraction, verse: first.verse });
  if (!second) return undefined;
  return {
    ...second,
    // A cross-chapter first hop is clamped by the UI; keep it approximate so
    // the pane never claims an exact correspondence it does not have.
    approximate: first.approximate || second.approximate || first.chapter !== second.chapter,
    crossChapter: first.crossChapter || second.crossChapter || first.chapter !== second.chapter,
  };
}

/** Keep the fraction when a chapter is re-rendered with a different font size. */
export function anchorFromPosition(verse: number): VerseAnchor {
  return { fraction: 0, verse };
}
