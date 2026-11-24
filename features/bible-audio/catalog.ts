export const AUDIO_REPOSITORY = "akhansson88/reformationsbibeln-audio";
// The AAC catalog lists every chapter and keeps MP3 entries for chapters that
// have not been re-encoded yet. Fall back to the legacy all-MP3 catalog while
// the first AAC chapters are being published.
export const AUDIO_CATALOG_URL = `https://raw.githubusercontent.com/${AUDIO_REPOSITORY}/main/catalog-aac.json`;
export const AUDIO_LEGACY_CATALOG_URL = `https://raw.githubusercontent.com/${AUDIO_REPOSITORY}/main/catalog.json`;
export const AUDIO_TRANSLATION = "reformationsbibeln2026";

export type AudioContainer = "mp3" | "m4a";
export type AudioChapterEntry = {
  bookId: number; book: string; bookName: string; chapter: number;
  revision: string; sourceHash: string; manifestUrl: string;
  container?: AudioContainer;
};
export type AudioVerse = { verse: number; url: string; duration: number; sha256: string; textHash: string };
export type AudioChapter = Omit<AudioChapterEntry, "manifestUrl"> & {
  schemaVersion: 1; translation: string; expectedVerses: number[]; verses: AudioVerse[];
  provider?: string; model?: string; voice?: string; voiceId?: string; voiceName?: string;
};
export type AudioCatalog = { schemaVersion: 1; translation: string; chapters: Record<string, AudioChapterEntry> };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`https://github.com/${AUDIO_REPOSITORY}/releases/download/audio-`) && !value.includes("..") && !/[?#]/.test(value);
}
function validContainer(value: unknown) {
  return value === undefined || value === "mp3" || value === "m4a";
}
function entry(value: unknown): value is AudioChapterEntry {
  return object(value) && Number.isInteger(value.bookId) && Number(value.bookId) >= 1 && Number(value.bookId) <= 66
    && Number.isInteger(value.chapter) && Number(value.chapter) > 0 && Number(value.chapter) <= 150
    && typeof value.book === "string" && typeof value.bookName === "string"
    && typeof value.revision === "string" && typeof value.sourceHash === "string" && validUrl(value.manifestUrl)
    && validContainer(value.container);
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
    || (value.container ?? "mp3") !== (expected.container ?? "mp3")
    || !Array.isArray(value.verses) || !Array.isArray(value.expectedVerses) || !value.verses.length
    || value.verses.length !== value.expectedVerses.length) throw new Error("Incomplete audio chapter");
  let previous = 0;
  for (const key of ["provider", "model", "voice", "voiceId", "voiceName"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !value[key])) throw new Error("Invalid narration metadata");
  }
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
  const position = Math.max(0, seconds);
  let start = 0;
  for (let index = 0; index < verses.length; index++) {
    const end = start + verses[index].duration;
    if (position < end || index === verses.length - 1) {
      return { index, offset: Math.min(Math.max(0, position - start), Math.max(0, verses[index].duration - 0.05)) };
    }
    start = end;
  }
  return { index: 0, offset: 0 };
}

/** Preserve the duration-scaled timeline while selecting the start of its verse. */
export function snapChapterTime(verses: AudioVerse[], seconds: number) {
  const { index } = locateChapterTime(verses, seconds);
  return { verse: verses[index].verse, seconds: verses.slice(0, index).reduce((sum, verse) => sum + verse.duration, 0) };
}
