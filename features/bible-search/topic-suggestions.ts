type TopicSuggestionAsset = {
  schemaVersion: number;
  buildFingerprint: string;
  topics: string[];
};

const asset = require("../../assets/bible/search/topic-suggestions.json") as TopicSuggestionAsset;
if (asset.schemaVersion !== 1 || !Array.isArray(asset.topics)) {
  throw new Error("The bundled topic suggestions are invalid.");
}

const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("sv");

// The source topic file contains a few modern edge labels that the search
// validity gate intentionally rejects. Do not offer those as completions.
const hiddenTopicNames = new Set([
  "pizza", "weather", "the weather", "tire", "car", "bitcoin", "netflix",
  "movie", "recipe", "cake", "coffee", "guitar", "computer", "phone",
  "job", "resume", "stock", "mortgage", "football", "basketball",
].map(fold));

const indexed = asset.topics
  .filter((name) => !hiddenTopicNames.has(fold(name)))
  .map((name) => ({ name, folded: fold(name) }));

/**
 * Local topic completion. The index is the same curated topic set used by
 * ranking, so selecting a suggestion is a real search rather than a web query.
 */
export function suggestTopics(query: string, limit = 5) {
  const folded = fold(query.trim());
  if (folded.length < 2) return [];
  const matches: { name: string; score: number }[] = [];
  for (const topic of indexed) {
    if (topic.folded === folded) continue;
    const index = topic.folded.indexOf(folded);
    if (index < 0) continue;
    const score = index === 0 ? 0 : topic.folded[index - 1] === " " ? 1 : 2;
    matches.push({ name: topic.name, score });
  }
  matches.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return matches.slice(0, Math.max(0, Math.min(10, Math.floor(limit)))).map(({ name }) => name);
}
