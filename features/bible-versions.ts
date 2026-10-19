export const bibleVersions = [
  { id: "kjv", label: "KJV", translation: "KJV", hasAudio: false },
  { id: "reformationsbibeln2026", label: "Reformationsbibeln 2026", translation: "Reformationsbibeln 2026", hasAudio: true },
] as const;

export type BibleVersionId = (typeof bibleVersions)[number]["id"];

const defaultBibleVersionId: BibleVersionId = "kjv";

export function isBibleVersionId(value: unknown): value is BibleVersionId {
  return typeof value === "string" && bibleVersions.some((version) => version.id === value);
}

export function bibleVersionFor(versionId?: BibleVersionId) {
  return bibleVersions.find((version) => version.id === versionId) ?? bibleVersions.find((version) => version.id === defaultBibleVersionId) ?? bibleVersions[0];
}
