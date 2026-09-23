import bibleTopicIndexData from "@/assets/bible/topics-index.json";
import { searchBibleText, type BibleVersionId } from "@/features/bible-kjv";
import type { TranslationFunction } from "@/ui/localization";
import {
  type SuggestedTopic,
  type BibleTopicIndexItem,
  type BibleTopicReference,
  type BibleTopicVoteValue,
} from "@/features/bible-reader/types";

export const suggestedTopics: SuggestedTopic[] = [
  { apiTopic: "Anxiety", icon: "cloud-rain", subtitleKey: "bible.topic.anxiety.subtitle", titleKey: "bible.topic.anxiety.title", tone: "peach" },
  { apiTopic: "Hope", icon: "sunrise", subtitleKey: "bible.topic.hope.subtitle", titleKey: "bible.topic.hope.title", tone: "green" },
  { apiTopic: "Forgiveness", icon: "heart", subtitleKey: "bible.topic.forgiveness.subtitle", titleKey: "bible.topic.forgiveness.title", tone: "rose" },
  { apiTopic: "Identity", icon: "user", subtitleKey: "bible.topic.identity.subtitle", titleKey: "bible.topic.identity.title", tone: "peach" },
  { apiTopic: "Loneliness", icon: "users", subtitleKey: "bible.topic.loneliness.subtitle", titleKey: "bible.topic.loneliness.title", tone: "green" },
  { apiTopic: "Purpose", icon: "compass", subtitleKey: "bible.topic.purpose.subtitle", titleKey: "bible.topic.purpose.title", tone: "rose" },
  { apiTopic: "Prayer", icon: "message-circle", subtitleKey: "bible.topic.prayer.subtitle", titleKey: "bible.topic.prayer.title", tone: "peach" },
];

export const bibleTopicAlphabet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

let bibleTopicIndexPromise: Promise<BibleTopicIndexItem[]> | undefined;

export function bibleTopicKey(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function bibleTopicVoteKey(topic: string, voteId: string) {
  return `${bibleTopicKey(topic)}:${voteId}`;
}

function bibleTopicSourceUrl(topic: string) {
  return `https://www.openbible.info/topics/${encodeURIComponent(bibleTopicKey(topic))}`;
}

function decodeBibleTopicHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseBibleTopicReferences(html: string): BibleTopicReference[] {
  const references: BibleTopicReference[] = [];
  const seen = new Set<string>();
  const headingPattern = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const referencePattern = /<a\b[^>]*class="[^"]*\bbibleref\b[^"]*"[^>]*>([^<]+)<\/a>/i;

  for (const headingMatch of html.matchAll(headingPattern)) {
    const heading = headingMatch[1];
    const referenceMatch = heading.match(referencePattern);
    if (!referenceMatch) continue;

    const reference = decodeBibleTopicHtml(referenceMatch[1]);
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    const voteId = heading.match(/\bid=["']vote_u_([0-9]+(?:-[0-9]+)?)["']/i)?.[1];
    const voteText = decodeBibleTopicHtml(heading.replace(/<[^>]+>/g, " "));
    const votes = Number(voteText.match(/([\d,]+)\s+helpful\s+votes?/i)?.[1].replace(/,/g, "")) || 0;
    references.push({ reference, votes, ...(voteId ? { voteId } : {}) });
  }

  return references.sort((left, right) => right.votes - left.votes || left.reference.localeCompare(right.reference));
}

export async function fetchBibleTopicIndex() {
  if (!bibleTopicIndexPromise) {
    bibleTopicIndexPromise = Promise.resolve(bibleTopicIndexData.topics as BibleTopicIndexItem[]);
  }
  return bibleTopicIndexPromise;
}

export async function fetchBibleTopic(topic: string) {
  const sourceUrl = bibleTopicSourceUrl(topic);
  const response = await fetch(sourceUrl, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new Error(`Topic request failed with ${response.status}`);
  const references = parseBibleTopicReferences((await response.text()).slice(0, 400_000));
  if (references.length === 0) throw new Error("The topic response did not include Bible references.");
  return {
    count: references.length,
    references,
    source: "openbible" as const,
    sourceUrl,
    topic,
  };
}

export async function searchBibleTopicText(topic: string, bibleVersionId: BibleVersionId): Promise<BibleTopicReference[]> {
  const directResults = await searchBibleText(topic, bibleVersionId, 20);
  if (directResults.length > 0) return directResults.map((item) => ({ reference: item.reference, votes: 0 }));

  const stopWords = new Set(["about", "after", "also", "and", "are", "att", "den", "det", "for", "från", "för", "how", "hur", "med", "och", "som", "that", "the", "this", "till", "using", "vad", "what", "with"]);
  const tokens = topic
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 6);
  if (tokens.length === 0) return [];

  const tokenResults = await Promise.all(tokens.map((token) => searchBibleText(token, bibleVersionId, 6)));
  const seen = new Set<string>();
  return tokenResults
    .flat()
    .filter((item) => {
      if (seen.has(item.reference)) return false;
      seen.add(item.reference);
      return true;
    })
    .slice(0, 20)
    .map((item) => ({ reference: item.reference, votes: 0 }));
}

export async function submitBibleTopicVote(topic: string, voteId: string, value: BibleTopicVoteValue) {
  const slug = bibleTopicKey(topic);
  const sourceUrl = bibleTopicSourceUrl(topic);
  const topicResponse = await fetch(sourceUrl, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!topicResponse.ok) throw new Error(`Topic validation failed with ${topicResponse.status}`);
  const topicHtml = (await topicResponse.text()).slice(0, 400_000);
  const databaseCode = topicHtml.match(/\bid=["']db["'][^>]*\bvalue=["']([^"']+)["']/i)?.[1] || "dy";
  const voteButtonId = `vote_${value === 1 ? "u" : "d"}_${voteId}`;
  const response = await fetch(`https://www.openbible.info/topics/tools/vote?w=${encodeURIComponent(slug)}`, {
    body: new URLSearchParams({ db: databaseCode, id: voteButtonId, word: slug }).toString(),
    headers: { Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Vote request failed with ${response.status}`);
}

function topicTitle(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function localizedTopicTitle(value: string, t: TranslationFunction) {
  const suggestedTopic = suggestedTopics.find((topic) => topic.apiTopic.toLowerCase() === value.trim().toLowerCase());
  return suggestedTopic ? t(suggestedTopic.titleKey) : topicTitle(value);
}
