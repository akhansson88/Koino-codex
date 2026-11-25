import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  bundle: true,
  entryPoints: ["features/bible-reader/copy-format.ts"],
  format: "esm",
  platform: "node",
  write: false,
});
const { formatBibleCopyText } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

const verse = (startVerse, text, endVerse = startVerse) => ({ endVerse, startVerse, text });

assert.equal(
  formatBibleCopyText({
    verses: [verse(4, "Gläd er alltid i Herren.")],
    reference: "Philippians 4:4",
    translation: "Reformationsbibeln 2026",
    language: "sv",
  }),
  "\"Gläd er alltid i Herren.\"\nFilipperbrevet 4:4 (SRB26)",
  "a single verse is quoted, with the localized reference last",
);

assert.equal(
  formatBibleCopyText({
    verses: [
      verse(4, "Gläd er alltid i Herren."),
      verse(5, "Låt er fördragsamhet bli känd av alla människor."),
    ],
    reference: "Philippians 4:4-5",
    translation: "SRB26",
    language: "sv",
  }),
  "\"4 Gläd er alltid i Herren.\n5 Låt er fördragsamhet bli känd av alla människor.\"\n\nFilipperbrevet 4:4–5 (SRB26)",
  "a passage is quoted as one block, with verse numbers, one reference and an en dash",
);

assert.equal(
  formatBibleCopyText({
    verses: [verse(4, "Gläd er alltid i Herren."), verse(6, "Var inte bekymrade för något.")],
    reference: "Philippians 4:4, 4:6",
    translation: "SRB26",
    language: "sv",
  }),
  "\"4 Gläd er alltid i Herren.\n6 Var inte bekymrade för något.\"\n\nFilipperbrevet 4:4, 4:6 (SRB26)",
  "non-contiguous verses keep their own numbers inside one quotation",
);

assert.equal(
  formatBibleCopyText({
    verses: [verse(4, "Rejoice in the Lord always.")],
    reference: "Philippians 4:4",
    translation: "SRB26",
    language: "en",
  }),
  "\"Rejoice in the Lord always.\"\nPhilippians 4:4 (SRB26)",
  "English book names stay English and the quotation is identical",
);

assert.equal(
  formatBibleCopyText({
    verses: [verse(3, "Gläd er alltid i Herren.", 4)],
    reference: "Philippians 4:3-4",
    translation: "SRB26",
    language: "sv",
  }),
  "\"Gläd er alltid i Herren.\"\nFilipperbrevet 4:3–4 (SRB26)",
  "a saved passage stays one quoted paragraph with one reference",
);

assert.equal(
  formatBibleCopyText({
    verses: [verse(4, "  Gläd er alltid i Herren.  ")],
    reference: "Philippians 4:4",
    language: "sv",
  }),
  "\"Gläd er alltid i Herren.\"\nFilipperbrevet 4:4",
  "a missing translation omits the parentheses and text is trimmed",
);

assert.equal(
  formatBibleCopyText({
    verses: [verse(4, "   "), verse(5, "")],
    reference: "Philippians 4:4-5",
    translation: "SRB26",
    language: "sv",
  }),
  "",
  "empty verses do not produce clipboard text",
);

console.log("Bible copy validation passed.");
