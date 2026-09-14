import type { BibleFootnote } from "@/features/bible-kjv";

export type BibleTextSegment =
  | { kind: "text"; text: string }
  | { appended: boolean; footnote: BibleFootnote; kind: "footnote"; marker: string };

export function bibleTextSegments(text: string, footnotes: BibleFootnote[]): BibleTextSegment[] {
  const segments: BibleTextSegment[] = [];
  const referencedFootnotes = new Set<BibleFootnote>();
  const markerPattern = /\*+/g;
  let textStart = 0;

  for (const match of text.matchAll(markerPattern)) {
    const markerStart = match.index ?? 0;
    if (markerStart > textStart) {
      segments.push({ kind: "text", text: text.slice(textStart, markerStart) });
    }

    const marker = match[0];
    const footnote = footnotes.find((item) => item.marker === marker) ?? (footnotes.length === 1 ? footnotes[0] : undefined);
    if (footnote) {
      referencedFootnotes.add(footnote);
      segments.push({ appended: false, footnote, kind: "footnote", marker });
    } else {
      segments.push({ kind: "text", text: marker });
    }
    textStart = markerStart + marker.length;
  }

  if (textStart < text.length) {
    segments.push({ kind: "text", text: text.slice(textStart) });
  }

  footnotes.forEach((footnote) => {
    if (referencedFootnotes.has(footnote)) return;
    segments.push({ appended: true, footnote, kind: "footnote", marker: footnote.marker });
  });

  return segments;
}
