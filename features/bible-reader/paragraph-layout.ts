import { bibleTextSegments } from "@/features/bible-footnotes";
import type { BibleChapterSubtitle, BibleChapterVerse } from "@/features/bible-kjv";
import type { BiblePlanMarker } from "@/features/bible-plans";

export function groupParagraphVerses(
  verses: BibleChapterVerse[], subtitles: BibleChapterSubtitle[], markers: BiblePlanMarker[],
) {
  const starts = new Set([
    ...subtitles.map(item => item.beforeVerse),
    ...markers.filter(item => item.kind === "start").map(item => item.verse),
  ]);
  const finishes = new Set(markers.filter(item => item.kind === "finish").map(item => item.verse));
  const paragraphs: BibleChapterVerse[][] = [];
  for (const verse of verses) {
    const current = paragraphs[paragraphs.length - 1];
    if (!current || starts.has(verse.verse) || finishes.has(current[current.length - 1].verse)) {
      paragraphs.push([verse]);
    } else {
      current.push(verse);
    }
  }
  return paragraphs;
}

export function paragraphProjection(verses: BibleChapterVerse[], showNumbers: boolean) {
  let text = "";
  const ranges = verses.map((item, index) => {
    if (index > 0) text += " ";
    const start = text.length;
    // Native text layout reports an inline View as one object-replacement
    // character, not as the digits rendered inside that view.
    if (showNumbers) text += "\uFFFC";
    const contentStart = text.length;
    text += bibleTextSegments(item.text, item.footnotes).map(segment => segment.kind === "text"
      ? segment.text : `${segment.appended ? " " : ""}${segment.marker}`).join("");
    return { verse: item.verse, start, contentStart, end: text.length };
  });
  return { text, ranges };
}

export type VerseLineBounds = { verse: number; y: number; height: number };
type TextLine = { text: string; y: number; height: number };

/** Split only at an actual native line break. Whitespace at the join becomes
 * the visual line break, avoiding a leading space or blank line in the tail. */
export function paragraphOpeningSplit(projection: ReturnType<typeof paragraphProjection>, lines: readonly TextLine[], chapterHeight: number) {
  const openingLines = lines.filter((line, index) => index === 0 || line.y < chapterHeight);
  const characters = openingLines.reduce((total, line) => total + line.text.replace(/\s/g, "").length, 0);
  if (!characters) return { openingEnd: projection.text.length, continuationStart: projection.text.length };
  let count = 0, cursor = 0;
  for (const character of projection.text) {
    if (count >= characters) break;
    cursor += character.length;
    if (!/\s/.test(character)) count += character.length;
  }
  const openingEnd = cursor;
  while (cursor < projection.text.length && /\s/.test(projection.text[cursor])) cursor++;
  return { openingEnd, continuationStart: cursor };
}

export function paragraphProjectionSlice(projection: ReturnType<typeof paragraphProjection>, start: number, end: number) {
  return {
    text: projection.text.slice(start, end),
    ranges: projection.ranges.filter(range => range.start < end && range.end > start).map(range => ({
      verse: range.verse,
      start: Math.max(start, range.start) - start,
      contentStart: Math.max(start, Math.min(end, range.contentStart)) - start,
      end: Math.min(end, range.end) - start,
    })),
  };
}

/** Keep numbers and footnote markers in the same source coordinate system as
 * native line measurements, including a verse split between the two blocks. */
export function paragraphFragments(projection: ReturnType<typeof paragraphProjection>, start: number, end: number) {
  return projection.ranges.flatMap((range, index) => {
    const beforeStart = Math.max(start, index === 0 ? 0 : projection.ranges[index - 1].end);
    const beforeEnd = Math.min(end, range.start);
    const before = beforeEnd > beforeStart ? projection.text.slice(beforeStart, beforeEnd) : "";
    const showNumber = range.contentStart > range.start && start <= range.start && end > range.start;
    const textStart = Math.max(0, start - range.contentStart);
    const textEnd = Math.max(0, Math.min(end, range.end) - range.contentStart);
    return before || showNumber || textEnd > textStart ? [{ verse: range.verse, before, showNumber, textStart, textEnd }] : [];
  });
}

export function mergeParagraphVerseBounds(chunks: readonly VerseLineBounds[][]): VerseLineBounds[] {
  const result = new Map<number, VerseLineBounds>();
  for (const chunk of chunks) for (const bound of chunk) {
    const previous = result.get(bound.verse);
    if (!previous) result.set(bound.verse, { ...bound });
    else {
      const bottom = Math.max(previous.y + previous.height, bound.y + bound.height);
      previous.y = Math.min(previous.y, bound.y);
      previous.height = bottom - previous.y;
    }
  }
  return [...result.values()];
}

/** Native platforms differ in whether wrapped whitespace is included in lines.
 * Match non-whitespace character ranges so those differences don't shift verses. */
export function paragraphVerseBounds(projection: ReturnType<typeof paragraphProjection>, lines: readonly TextLine[]): VerseLineBounds[] {
  const compactLength = (value: string) => value.replace(/\s/g, "").length;
  const ranges = projection.ranges.map(range => ({
    verse: range.verse,
    start: compactLength(projection.text.slice(0, range.start)),
    end: compactLength(projection.text.slice(0, range.end)),
  }));
  let cursor = 0;
  const measuredLines = lines.map(line => {
    const start = cursor;
    cursor += compactLength(line.text);
    return { ...line, start, end: cursor };
  });
  return ranges.flatMap(range => {
    const overlapping = measuredLines.filter(line => line.start < range.end && line.end > range.start);
    if (!overlapping.length) return [];
    const y = overlapping[0].y;
    const last = overlapping[overlapping.length - 1];
    return [{ verse: range.verse, y, height: last.y + last.height - y }];
  });
}
