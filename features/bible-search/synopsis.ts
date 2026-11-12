import type { ScriptureSearchResult } from "@/features/bible-search";

export type SearchSynopsisPoint = {
  reference: string;
  text: string;
};

export type SearchSynopsis = {
  points: SearchSynopsisPoint[];
};

const questionStart = /^(what|who|whom|whose|why|how|when|where|which|does|did|do|is|are|can|could|should|would|will|vad|vem|vilka|vilken|varför|hur|när|var|är|kan|ska|bör)\b/i;

export function looksLikeQuestion(query: string) {
  const normalized = query.trim();
  if (!normalized) return false;
  return normalized.endsWith("?") || questionStart.test(normalized);
}

function quote(text: string, limit = 240) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  const candidate = normalized.slice(0, limit);
  const sentenceEnd = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "));
  return `${(sentenceEnd > 100 ? candidate.slice(0, sentenceEnd + 1) : candidate).trim()}…`;
}

/**
 * An honest, local alternative to a generated synopsis: each point is a direct
 * quotation from one of the top-ranked passages, with its citation. It never
 * invents prose or cites a passage that is not already in the result set.
 */
export function buildSearchSynopsis(results: ScriptureSearchResult[], query: string, maxPoints = 3): SearchSynopsis | undefined {
  if (!looksLikeQuestion(query)) return undefined;
  const points: SearchSynopsisPoint[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (result.matchType === "reference") continue;
    const reference = result.verse.reference;
    if (!reference || seen.has(reference)) continue;
    const text = result.verse.text?.trim() || result.verses.map(({ text: verseText }) => verseText).join(" ");
    if (!text) continue;
    seen.add(reference);
    points.push({ reference, text: quote(text) });
    if (points.length >= maxPoints) break;
  }
  return points.length >= 2 ? { points } : undefined;
}
