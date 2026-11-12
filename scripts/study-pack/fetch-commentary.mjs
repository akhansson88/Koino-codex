#!/usr/bin/env node
/** Fetch and pin the compact Matthew Henry commentary snapshot. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES = path.join(ROOT, "assets/bible/study/sources");
const BASE = "https://bible.helloao.org/api/c/matthew-henry";
const COMMENTARY = "matthew-henry";

function flatten(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (value.content) return flatten(value.content);
  }
  return "";
}

async function getJson(url, attempts = 4) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { "user-agent": "Koino study-pack builder" } });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (caught) {
      error = caught;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw error;
}

const available = await getJson("https://bible.helloao.org/api/available_commentaries.json");
const commentary = available.commentaries.find((item) => item.id === COMMENTARY);
if (!commentary) throw new Error("Matthew Henry commentary is not available");
if (!/publicdomain\/mark\/1\.0/i.test(commentary.licenseUrl ?? "")) throw new Error("Commentary license is not the expected Public Domain Mark");
const books = await getJson(`${BASE}/books.json`);
const entries = [];
let chapters = 0;
const queue = [];
for (const book of books.books) {
  if (!book.firstChapterNumber || !book.lastChapterNumber) continue;
  for (let chapter = book.firstChapterNumber; chapter <= book.lastChapterNumber; chapter += 1) {
    queue.push({ book, chapter });
  }
}
let cursor = 0;
async function worker() {
  while (cursor < queue.length) {
    const item = queue[cursor++];
    let chapter;
    try {
      chapter = await getJson(`${BASE}/${item.book.id}/${item.chapter}.json`);
    } catch (error) {
      if (/^404 /.test(error.message)) {
        console.warn(`Skipping missing chapter ${item.book.id} ${item.chapter}`);
        continue;
      }
      throw error;
    }
    const verses = (chapter.chapter?.content ?? [])
      .filter((entry) => entry?.type === "verse" && typeof entry.number === "number")
      .sort((a, b) => a.number - b.number);
    for (let index = 0; index < verses.length; index += 1) {
      const verse = verses[index];
      const next = verses[index + 1]?.number;
      const start = verse.number;
      const end = next && next > start ? next - 1 : Math.max(start, chapter.numberOfVerses ?? start);
      const text = flatten(verse.content).replace(/\s+/g, " ").trim();
      if (!text) continue;
      entries.push({
        book: item.book.commonName || item.book.name,
        chapter: item.chapter,
        startVerse: start,
        endVerse: end,
        reference: `${item.book.commonName || item.book.name} ${item.chapter}:${start}${end > start ? `-${end}` : ""}`,
        text,
      });
    }
    const introduction = flatten(chapter.chapter?.introduction).replace(/\s+/g, " ").trim();
    if (introduction) {
      entries.push({
        book: item.book.commonName || item.book.name,
        chapter: item.chapter,
        startVerse: 1,
        endVerse: chapter.numberOfVerses ?? 1,
        reference: `${item.book.commonName || item.book.name} ${item.chapter}`,
        text: introduction,
      });
    }
    chapters += 1;
    if (chapters % 100 === 0) console.log(`Fetched ${chapters}/${queue.length} chapters, ${entries.length} comments`);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
entries.sort((a, b) => a.book.localeCompare(b.book) || a.chapter - b.chapter || a.startVerse - b.startVerse);
const snapshotDate = new Date().toISOString().slice(0, 10);
const payload = {
  source: {
    commentary: COMMENTARY,
    name: commentary.englishName,
    website: commentary.website,
    licenseUrl: commentary.licenseUrl,
    sourceSha256: commentary.sha256,
    api: "https://bible.helloao.org/api/c/matthew-henry",
    snapshotDate,
  },
  chapters,
  entries,
};
const serialized = `${JSON.stringify(payload)}\n`;
const sourceHash = createHash("sha256").update(serialized).digest("hex");
writeFileSync(path.join(SOURCES, "matthew-henry.json"), serialized);
writeFileSync(path.join(SOURCES, "matthew-henry.lock.json"), `${JSON.stringify({
  source: payload.source,
  chapters,
  entries: entries.length,
  sha256: sourceHash,
}, null, 2)}\n`);
console.log(JSON.stringify({ chapters, entries: entries.length, sourceHash, bytes: Buffer.byteLength(serialized) }, null, 2));
