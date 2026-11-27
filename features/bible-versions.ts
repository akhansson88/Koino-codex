export const bibleVersions = [
  { id: "kjv", label: "KJV", translation: "KJV", databaseId: 1, hasSearchIndex: true, hasAudio: false },
  { id: "reformationsbibeln2026", label: "Reformationsbibeln 2026", translation: "Reformationsbibeln 2026", databaseId: 2, hasSearchIndex: true, hasAudio: true },
  { id: "sfb15", label: "Svenska Folkbibeln 2015", translation: "SFB15", databaseId: 3, hasSearchIndex: false, hasAudio: false },
  { id: "nkjv", label: "NKJV", translation: "NKJV", databaseId: 4, hasSearchIndex: false, hasAudio: false },
] as const;

export type BibleVersionId = (typeof bibleVersions)[number]["id"];

const defaultBibleVersionId: BibleVersionId = "kjv";

export function isBibleVersionId(value: unknown): value is BibleVersionId {
  return typeof value === "string" && bibleVersions.some((version) => version.id === value);
}

export function bibleVersionFor(versionId?: BibleVersionId) {
  return bibleVersions.find((version) => version.id === versionId) ?? bibleVersions.find((version) => version.id === defaultBibleVersionId) ?? bibleVersions[0];
}
