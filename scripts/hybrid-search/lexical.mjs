import SwedishStemmer from "./vendor/swedish-stemmer.mjs";

const swedishStemmer = new SwedishStemmer();

/** Shared by the offline builder and query engine; never remove å, ä or ö. */
export function normalizeSwedishForSearch(value) {
  const tokens = String(value).normalize("NFKC").toLocaleLowerCase("sv").match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((token) => swedishStemmer.stemWord(token)).join(" ");
}
