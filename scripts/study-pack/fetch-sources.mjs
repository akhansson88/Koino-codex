#!/usr/bin/env node
/** Fetch the pinned public-domain dictionary source used by the offline study pack. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "assets/bible/study/sources/easton");
const REPO = "https://raw.githubusercontent.com/neuu-org/bible-dictionary-dataset";
const COMMIT = "b8e82aa7ca847f4d97fb432cd965e398a111333c";
const LICENSE = `Easton's Bible Dictionary (Matthew George Easton, 1897) is public domain.

Structured dataset:
https://github.com/neuu-org/bible-dictionary-dataset
Commit: ${COMMIT}
License: Creative Commons Attribution 4.0 International (CC BY 4.0)
Copyright (c) 2026 NEUU
https://creativecommons.org/licenses/by/4.0/legalcode
`;
const letters = "abcdefghijklmnopqrstuvwyz".split("");
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(ROOT, "assets/bible/study/sources/LICENSE.txt"), LICENSE);

const files = [];
for (const letter of letters) {
  const url = `${REPO}/${COMMIT}/data/02_sources/easton/${letter}.json`;
  const response = await fetch(url, { headers: { "user-agent": "Koino study-pack builder" } });
  if (!response.ok) throw new Error(`${letter}.json: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(path.join(OUT, `${letter}.json`), bytes);
  files.push({ file: `${letter}.json`, sha256: hash, bytes: bytes.length });
  console.log(`${letter}.json ${bytes.length.toLocaleString()} bytes ${hash.slice(0, 12)}`);
}
writeFileSync(path.join(ROOT, "assets/bible/study/sources/sources.lock.json"), `${JSON.stringify({
  source: "neuu-org/bible-dictionary-dataset",
  commit: COMMIT,
  dictionary: "Easton's Bible Dictionary (1897)",
  license: "CC BY 4.0; source text public domain",
  files,
}, null, 2)}\n`);
console.log(`Fetched ${files.length} files.`);
