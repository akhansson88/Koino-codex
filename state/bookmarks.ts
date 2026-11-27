import type { BookmarkCollection, BookmarkCollectionColor, BibleRibbon, Id, SavedVerse } from "@/state/types";

export type BookmarkSort = "recent" | "canonical" | "opened";

export const bookmarkSortOptions: BookmarkSort[] = ["recent", "canonical", "opened"];

export const bookmarkCollectionColors: BookmarkCollectionColor[] = ["ember", "clay", "moss", "rose", "gold", "violet"];

const bookOrder = new Map<string, number>();

/** Folds Swedish diacritics so "troest" finds "tröst" and vice versa. */
export function normalizeBookmarkText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[åä]/gi, "a")
    .replace(/ö/gi, "o")
    .toLocaleLowerCase("sv")
    .replace(/[^\p{L}\p{N}:,\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bookmarkSearchText(verse: SavedVerse) {
  return normalizeBookmarkText([
    verse.reference,
    verse.referenceText ?? "",
    verse.text,
    verse.note ?? "",
    verse.translation ?? "",
  ].join(" "));
}

export function bookmarkMatchesQuery(verse: SavedVerse, query: string) {
  const normalized = normalizeBookmarkText(query);
  if (!normalized) return true;
  return bookmarkSearchText(verse).includes(normalized);
}

export function bookmarkCollectionName(
  collections: BookmarkCollection[],
  collectionId: Id | null | undefined,
): string | undefined {
  if (!collectionId) return undefined;
  return collections.find((collection) => collection.id === collectionId)?.name;
}

export function bookmarkCollection(
  collections: BookmarkCollection[],
  collectionId: Id | null | undefined,
) {
  if (!collectionId) return undefined;
  return collections.find((collection) => collection.id === collectionId);
}

export function bookmarkCollectionCount(verses: SavedVerse[], collectionId: Id | null) {
  return verses.filter((verse) => (collectionId ? verse.collectionId === collectionId : !verse.collectionId)).length;
}

export function sortBookmarkCollections(collections: BookmarkCollection[]) {
  return [...collections].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "sv"));
}

function canonicalBookRank(verse: SavedVerse) {
  if (!verse.book) return Number.MAX_SAFE_INTEGER;
  const key = verse.book.toLocaleLowerCase("en");
  return bookOrder.get(key) ?? Number.MAX_SAFE_INTEGER;
}

/** The canonical 66-book order used by the reader. */
export function setBookmarkBookOrder(books: readonly string[]) {
  bookOrder.clear();
  books.forEach((book, index) => bookOrder.set(book.toLocaleLowerCase("en"), index));
}

export function sortBookmarks(verses: SavedVerse[], sort: BookmarkSort) {
  const next = [...verses];
  if (sort === "canonical") {
    next.sort((left, right) =>
      canonicalBookRank(left) - canonicalBookRank(right)
      || (left.chapter ?? 0) - (right.chapter ?? 0)
      || (left.startVerse ?? 0) - (right.startVerse ?? 0)
      || left.reference.localeCompare(right.reference, "sv"));
    return next;
  }
  if (sort === "opened") {
    next.sort((left, right) =>
      Date.parse(right.lastOpenedAt ?? right.updatedAt ?? right.savedAt)
      - Date.parse(left.lastOpenedAt ?? left.updatedAt ?? left.savedAt));
    return next;
  }
  next.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  return next;
}

export function createBookmarkCollectionId(name: string, existing: BookmarkCollection[]) {
  const base = normalizeBookmarkText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "samling";
  const used = new Set(existing.map((collection) => collection.id));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function ribbonStorageId(book: string, chapter: number, verse: number) {
  const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `ribbon_${slug(book)}_${chapter}_${verse}`;
}

export function sortRibbons(ribbons: BibleRibbon[]) {
  return [...ribbons].sort((left, right) =>
    Date.parse(right.lastOpenedAt ?? right.updatedAt) - Date.parse(left.lastOpenedAt ?? left.updatedAt));
}

export function formatBookmarkMarkdown(verses: SavedVerse[], collections: BookmarkCollection[], exportedAt = new Date()) {
  const groups = new Map<string, SavedVerse[]>();
  const knownCollections = new Set(collections.map((collection) => collection.id));
  for (const verse of verses) {
    const key = verse.collectionId && knownCollections.has(verse.collectionId) ? verse.collectionId : "";
    const group = groups.get(key) ?? [];
    group.push(verse);
    groups.set(key, group);
  }
  const order = [
    ...sortBookmarkCollections(collections).map((collection) => ({ id: collection.id, name: collection.name })),
    { id: "", name: "Ogrupperade" },
  ];
  const lines = [
    "# Mina bokmärken — KOINO",
    "",
    `Exporterat ${exportedAt.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })}`,
    "",
  ];
  for (const group of order) {
    const items = groups.get(group.id);
    if (!items?.length) continue;
    lines.push(`## ${group.name}`, "");
    for (const verse of sortBookmarks(items, "canonical")) {
      lines.push(`### ${verse.reference}`, "");
      lines.push(`> ${verse.text.replace(/\n/g, "\n> ")}`, "");
      if (verse.note?.trim()) lines.push(`**Anteckning:** ${verse.note.trim()}`, "");
      const saved = new Date(verse.savedAt);
      const date = Number.isNaN(saved.getTime()) ? verse.savedAt : saved.toLocaleDateString("sv-SE");
      lines.push(`Sparad ${date}${verse.translation ? ` · ${verse.translation}` : ""}`, "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

export function csvCell(value: string | number | undefined) {
  const text = value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function formatBookmarkCsv(verses: SavedVerse[], collections: BookmarkCollection[]) {
  const rows = [
    ["reference", "book", "chapter", "startVerse", "endVerse", "translation", "text", "note", "collection", "savedAt", "lastOpenedAt"],
    ...sortBookmarks(verses, "canonical").map((verse) => [
      verse.reference,
      verse.book,
      verse.chapter,
      verse.startVerse,
      verse.endVerse,
      verse.translation,
      verse.text,
      verse.note,
      bookmarkCollectionName(collections, verse.collectionId),
      verse.savedAt,
      verse.lastOpenedAt,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
