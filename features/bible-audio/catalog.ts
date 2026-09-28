export const AUDIO_REPOSITORY = "akhansson88/reformationsbibeln-audio";
export const AUDIO_CATALOG_URL = `https://raw.githubusercontent.com/${AUDIO_REPOSITORY}/main/catalog.json`;
export const AUDIO_TRANSLATION = "reformationsbibeln2026";

export type AudioChapterEntry = {
  bookId: number; book: string; bookName: string; chapter: number;
  revision: string; sourceHash: string; manifestUrl: string;
};
export type AudioVerse = { verse: number; url: string; duration: number; sha256: string; textHash: string };
export type AudioChapter = Omit<AudioChapterEntry, "manifestUrl"> & {
  schemaVersion: 1; translation: string; expectedVerses: number[]; verses: AudioVerse[];
};
export type AudioCatalog = { schemaVersion: 1; translation: string; chapters: Record<string, AudioChapterEntry> };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`https://github.com/${AUDIO_REPOSITORY}/releases/download/audio-`) && !value.includes("..") && !/[?#]/.test(value);
}
function entry(value: unknown): value is AudioChapterEntry {
  return object(value) && Number.isInteger(value.bookId) && Number(value.bookId) >= 1 && Number(value.bookId) <= 66
    && Number.isInteger(value.chapter) && Number(value.chapter) > 0 && Number(value.chapter) <= 150
    && typeof value.book === "string" && typeof value.bookName === "string"
    && typeof value.revision === "string" && typeof value.sourceHash === "string" && validUrl(value.manifestUrl);
}
export function parseCatalog(value: unknown): AudioCatalog {
  if (!object(value) || value.schemaVersion !== 1 || value.translation !== AUDIO_TRANSLATION || !object(value.chapters)) throw new Error("Invalid audio catalog");
  for (const [key, chapter] of Object.entries(value.chapters)) {
    if (!entry(chapter) || key !== `${chapter.bookId}:${chapter.chapter}`) throw new Error("Invalid chapter entry");
  }
  return value as AudioCatalog;
}
export function parseChapter(value: unknown, expected: AudioChapterEntry): AudioChapter {
  if (!object(value) || value.schemaVersion !== 1 || value.translation !== AUDIO_TRANSLATION
    || value.bookId !== expected.bookId || value.chapter !== expected.chapter || value.book !== expected.book
    || value.revision !== expected.revision || value.sourceHash !== expected.sourceHash
    || !Array.isArray(value.verses) || !Array.isArray(value.expectedVerses) || !value.verses.length
    || value.verses.length !== value.expectedVerses.length) throw new Error("Incomplete audio chapter");
  let previous = 0;
  for (let i = 0; i < value.verses.length; i++) {
    const verse = value.verses[i];
    if (!object(verse) || !Number.isInteger(verse.verse) || Number(verse.verse) <= previous
      || verse.verse !== value.expectedVerses[i] || !validUrl(verse.url)
      || typeof verse.duration !== "number" || !Number.isFinite(verse.duration) || verse.duration <= 0
      || typeof verse.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(verse.sha256)
      || typeof verse.textHash !== "string") throw new Error("Invalid audio verse");
    previous = Number(verse.verse);
  }
  return value as AudioChapter;
}
export async function fetchAudioJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
export function locateChapterTime(verses: AudioVerse[], seconds: number) {
  let remaining = Math.max(0, seconds);
  for (let index = 0; index < verses.length; index++) {
    if (remaining < verses[index].duration || index === verses.length - 1) {
      return { index, offset: Math.min(remaining, Math.max(0, verses[index].duration - 0.05)) };
    }
    remaining -= verses[index].duration;
  }
  return { index: 0, offset: 0 };
}
