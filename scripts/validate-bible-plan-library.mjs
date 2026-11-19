import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  stdin: {
    contents: `
      export { biblePlanTemplates, planTemplateDays, planTemplateRanges, matchesPlanSearch } from "./features/bible-plan-library";
      export { kjvBooks, verseCountForChapter } from "./features/bible-canon";
    `,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;
const {
  biblePlanTemplates,
  planTemplateDays,
  planTemplateRanges,
  matchesPlanSearch,
  kjvBooks,
  verseCountForChapter,
} = await import(url);

const books = new Map(kjvBooks.map((book) => [book.name, book]));
const coverDir = path.join(root, "assets", "bible-plans");
assert.equal(biblePlanTemplates.length, 20, "The starter library should ship with 20 plans");
assert.ok(new Set(biblePlanTemplates.map((plan) => plan.id)).size === biblePlanTemplates.length, "Plan ids must be unique");
assert.ok(new Set(biblePlanTemplates.map((plan) => plan.coverKey)).size === biblePlanTemplates.length, "Cover keys must be unique");

function assertPosition(position, label) {
  const book = books.get(position.book);
  assert.ok(book, `${label}: unknown book ${position.book}`);
  assert.ok(book.chapters.includes(position.chapter), `${label}: ${position.book} ${position.chapter} is not a chapter`);
  const count = verseCountForChapter(position.book, position.chapter);
  assert.ok(position.verse >= 1 && position.verse <= count, `${label}: ${position.book} ${position.chapter}:${position.verse} is outside 1-${count}`);
}

for (const template of biblePlanTemplates) {
  const label = template.id;
  assert.ok(template.title.en && template.title.sv, `${label}: bilingual title`);
  assert.ok(template.description.en && template.description.sv, `${label}: bilingual description`);
  assert.ok(template.tags.length > 0, `${label}: searchable tags`);
  assert.ok([".jpg", ".png"].some((extension) => fs.existsSync(path.join(coverDir, `${template.coverKey}${extension}`))), `${label}: missing cover ${template.coverKey}`);
  assert.ok(template.minutesPerDay > 0, `${label}: reading estimate`);

  const days = planTemplateDays(template);
  assert.equal(days.length, template.dayCount, `${label}: day count`);
  assert.equal(days.filter((day) => day.ranges.length === 0).length, 0, `${label}: no empty days`);
  days.forEach((day, index) => {
    assert.equal(day.dayNumber, index + 1, `${label}: sequential day numbers`);
    day.ranges.forEach((range, rangeIndex) => {
      assertPosition(range.start, `${label} day ${day.dayNumber} range ${rangeIndex} start`);
      assertPosition(range.end, `${label} day ${day.dayNumber} range ${rangeIndex} end`);
      assert.ok(range.displayReference.length > 3, `${label}: readable range`);
    });
  });

  const ranges = planTemplateRanges(template);
  assert.ok(ranges.length > 0, `${label}: stored ranges`);
  assert.ok(planTemplateRanges(template).length === ranges.length, `${label}: ranges are stable`);

  const again = planTemplateDays(template);
  assert.notEqual(again, days, `${label}: cached days are copied`);
  assert.notEqual(again[0], days[0], `${label}: cached day objects are copied`);
  assert.notEqual(again[0].ranges[0], days[0].ranges[0], `${label}: cached ranges are copied`);

  assert.equal(matchesPlanSearch(template, template.title.en), true, `${label}: English search`);
  assert.equal(matchesPlanSearch(template, template.title.sv), true, `${label}: Swedish search`);
  assert.equal(matchesPlanSearch(template, "zzzz-not-a-plan"), false, `${label}: search excludes nonsense`);
}

const wholeBible = biblePlanTemplates.find((plan) => plan.id === "whole-bible-1-year");
assert.ok(wholeBible, "Whole Bible plan exists");
const wholeBibleDays = planTemplateDays(wholeBible);
const verseCounts = wholeBibleDays.map((day) => day.ranges.reduce((total, range) => {
  const from = range.start;
  const to = range.end;
  if (from.book === to.book && from.chapter === to.chapter) return total + (to.verse - from.verse + 1);
  let count = 0;
  let book = books.get(from.book);
  let chapter = from.chapter;
  let verse = from.verse;
  while (book) {
    const last = verseCountForChapter(book.name, chapter);
    if (book.name === to.book && chapter === to.chapter) {
      count += to.verse - verse + 1;
      break;
    }
    count += last - verse + 1;
    const chapterIndex = book.chapters.indexOf(chapter);
    if (chapterIndex < book.chapters.length - 1) {
      chapter = book.chapters[chapterIndex + 1];
      verse = 1;
      continue;
    }
    const bookIndex = kjvBooks.findIndex((item) => item.name === book.name);
    if (bookIndex < 0 || bookIndex >= kjvBooks.length - 1) break;
    book = kjvBooks[bookIndex + 1];
    chapter = book.chapters[0];
    verse = 1;
  }
  return total + count;
}, 0));
const max = Math.max(...verseCounts);
const min = Math.min(...verseCounts);
assert.ok(max / min < 2.5, `Whole Bible day loads should be balanced (min ${min}, max ${max})`);
assert.ok(verseCounts.reduce((sum, count) => sum + count, 0) > 30000, "Whole Bible plan should cover every verse");
console.log(`Bible plan library checks passed: ${biblePlanTemplates.length} plans, balanced daily loads (${min}-${max} verses/day), bilingual metadata, covers and search.`);
