#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  languageFiles,
  mapWithConcurrency,
  placeholders,
  projectRoot,
  readDictionary,
  readJson,
  readReviewed,
  sourceHash,
  stateFile,
  translateTexts,
  translationsDir,
  writeDictionary,
} from "./lib.mjs";

const args = process.argv.slice(2);
const check = args.includes("--check");
const force = args.includes("--force");
const verbose = args.includes("--verbose");
const languageArg = args.find((arg) => arg.startsWith("--lang="));
const requested = languageArg
  ? languageArg.slice("--lang=".length).split(",").map((value) => value.trim()).filter(Boolean)
  : Object.keys(languageFiles).filter((language) => language !== "en");

for (const language of requested) {
  if (!languageFiles[language] || language === "en") {
    console.error(`Unknown language "${language}". Use one of: ${Object.keys(languageFiles).join(", ")}.`);
    process.exit(2);
  }
}

const registryPath = path.join(translationsDir, "languages.ts");
const registrySource = ts.createSourceFile(registryPath, fs.readFileSync(registryPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let registered = [];
function findLanguages(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "appLanguages" && node.initializer) {
    let initializer = node.initializer;
    while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)) initializer = initializer.expression;
    if (ts.isArrayLiteralExpression(initializer)) {
      registered = initializer.elements.filter(ts.isStringLiteral).map((element) => element.text);
    }
  }
  ts.forEachChild(node, findLanguages);
}
findLanguages(registrySource);
const fileLanguages = Object.keys(languageFiles);
const registryDiff = [
  ...registered.filter((language) => !fileLanguages.includes(language)).map((language) => `${language} is in languages.ts but has no dictionary entry`),
  ...fileLanguages.filter((language) => !registered.includes(language)).map((language) => `${language} has a dictionary entry but is not in languages.ts`),
];
if (registryDiff.length) {
  console.error(`Language registry mismatch:\n- ${registryDiff.join("\n- ")}`);
  process.exit(2);
}

const localizationSource = fs.readFileSync(path.join(projectRoot, "ui", "localization.ts"), "utf8");
const missingLoader = registered.filter((language) => language !== "en" && !localizationSource.includes(`case "${language}":`));
if (missingLoader.length) {
  console.error(`ui/localization.ts has no dictionary entry for: ${missingLoader.join(", ")}.`);
  process.exit(2);
}

const english = readDictionary(path.join(translationsDir, "en.ts"));
if (!english) {
  console.error("Could not read ui/translations/en.ts.");
  process.exit(2);
}
const englishEntries = [...english.entries()];
const state = readJson(stateFile, { version: 1, languages: {} });
state.languages ??= {};

const started = Date.now();

function log(message) {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[${seconds}s] ${message}`);
}

let errors = 0;
let warnings = 0;

for (const language of requested) {
  const { file } = languageFiles[language];
  const existing = readDictionary(path.join(translationsDir, file)) ?? new Map();
  const reviewed = readReviewed(language);
  const previousState = state.languages[language] ?? {};
  const nextState = {};
  const output = [];
  const pending = [];
  let preserved = 0;
  let overridden = 0;
  let removed = 0;

  for (const [key, source] of englishEntries) {
    const hash = sourceHash(source);
    nextState[key] = hash;

    if (typeof reviewed[key] === "string") {
      output.push([key, reviewed[key]]);
      overridden += 1;
      continue;
    }

    const current = existing.get(key);
    if (current !== undefined && !force && (previousState[key] === hash || previousState[key] === undefined)) {
      output.push([key, current]);
      preserved += 1;
      continue;
    }

    pending.push([key, source, hash]);
  }

  for (const key of existing.keys()) {
    if (!english.has(key)) removed += 1;
  }

  if (check) {
    const missing = pending.filter(([key]) => !existing.has(key)).length;
    const stale = pending.length - missing;
    if (missing || stale || removed) {
      errors += 1;
      console.error(`${language}: ${missing} missing, ${stale} stale, ${removed} removed key(s). Run npm run i18n:sync.`);
    } else {
      log(`${language}: up to date (${output.length} keys${overridden ? `, ${overridden} reviewed` : ""})`);
    }
    state.languages[language] = nextState;
    continue;
  }

  if (pending.length) {
    log(`${language}: translating ${pending.length} key(s)`);
    let done = 0;
    const batches = [];
    for (let index = 0; index < pending.length; index += 40) batches.push(pending.slice(index, index + 40));
    const translated = (await mapWithConcurrency(batches, 3, async (batch) => {
      const values = await translateTexts(batch.map(([, source]) => source), language);
      const rows = [];
      batch.forEach(([key, source], index) => {
        let value = values[index];
        const expected = placeholders(source);
        const actual = placeholders(value);
        if (!value?.trim() || JSON.stringify(expected) !== JSON.stringify(actual)) {
          warnings += 1;
          if (verbose) console.warn(`${language}: ${key} placeholder mismatch ${JSON.stringify(actual)} != ${JSON.stringify(expected)}; using English.`);
          value = source;
        }
        rows.push([key, value]);
      });
      done += batch.length;
      log(`${language}: ${done}/${pending.length}`);
      return rows;
    })).flat();
    for (const entry of translated) output.push(entry);
  }

  const order = new Map(englishEntries.map(([key], index) => [key, index]));
  output.sort((a, b) => order.get(a[0]) - order.get(b[0]));
  writeDictionary(language, output);
  state.languages[language] = nextState;
  log(`${language}: wrote ${output.length} keys (${preserved} kept, ${pending.length} translated, ${overridden} reviewed, ${removed} removed)`);
}

if (!check) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state)}\n`, "utf8");
}

if (check && errors) {
  console.error(`i18n check failed with ${errors} language(s) out of date.`);
  process.exit(1);
}
if (errors && !check) {
  console.error(`i18n sync finished with ${errors} fallback(s).`);
  process.exit(0);
}
log(`done in ${projectRoot}`);
