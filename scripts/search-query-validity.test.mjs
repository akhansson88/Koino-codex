import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import * as runtime from "onnxruntime-node";

const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "assets/bible/search");
const required = ["query-prototypes.json", "multilingual-e5-small-int8.onnx", "multilingual-e5-small.tokenizer", "multilingual-e5-small-config.tokenizer"];
for (const file of required) assert.ok(readFileSync(path.join(assets, file)), `${file} is required for query validity`);

const built = await build({ entryPoints: [path.join(root, "features/bible-search/query-validity.ts")], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { classifyBibleQuery } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const { createTextEncoder } = await import(pathToFileURL(path.join(root, "features/bible-search/embedding-core.mjs")).href);
const encoder = await createTextEncoder({
  runtime,
  modelPath: path.join(assets, "multilingual-e5-small-int8.onnx"),
  tokenizerJson: JSON.parse(readFileSync(path.join(assets, "multilingual-e5-small.tokenizer"), "utf8")),
  tokenizerConfig: JSON.parse(readFileSync(path.join(assets, "multilingual-e5-small-config.tokenizer"), "utf8")),
});

const valid = [
  "what does the bible say about anxiety",
  "how do I deal with grief",
  "God cares for those who are grieving",
  "money cannot satisfy the heart",
  "forgive someone who has wronged me",
  "who worshipped Jesus",
  "peace of mind",
  "anxiety", "grief", "forgiveness", "grace", "nåd", "sinnesro", "hopplöshet",
  "osjälvisk generositet", "människovärde", "medkänsla",
  "vad säger bibeln om ångest", "hur hanterar jag sorg",
  "how to pray", "how to forgive", "how to find peace", "how to overcome anxiety",
  "how to handle money", "how to be a good parent", "how to save a marriage",
  "how to get closer to God", "how to hear God", "how to share your faith",
  "who was Melchizedek", "what is the meaning of the tabernacle",
  "why does God allow suffering", "what happens after death",
  "how to be a good husband", "how to be a good wife", "how to get out of debt",
  "how to be saved", "how to overcome lust", "how to forgive myself",
  "how to comfort a grieving friend", "how to share the gospel",
  "how to study the bible", "how to fast and pray",
  "how to read the bible", "how to memorize scripture", "how to lead a small group",
  "how to serve in church", "how to give generously", "how to overcome fear",
  "how to deal with anger", "how to be a good friend", "how to hear god's voice",
  "how to know god's will", "what does the bible say about work",
  "what does the bible say about marriage", "what does the bible say about parenting",
  "hur kan jag forlata", "hur hanterar jag stress", "hur hittar jag frid",
  "vad ar nad", "vem ar jesus", "varfor lider manniskor", "hur ber jag",
  "vad sager bibeln om aktenskap",
];

const invalid = [
  "zxqwvbnm9876",
  "quantum battery warranty",
  "best pizza recipe",
  "who won the world cup",
  "how to invest in bitcoin",
  "python async tutorial",
  "weather in stockholm tomorrow",
  "how to fix a flat tire",
  "recept på glutenfri chokladkaka",
  "vem vann världscupen",
  "väder i stockholm imorgon",
  "bästa pizzan i stan",
  "how to lose weight fast",
  "how to bake a cake",
  "how to get rich",
  "how to treat a cold",
  "best movies on netflix",
  "how to repair a car engine",
  "how to play guitar",
  "stock market today",
  "how to build a website",
  "how to write a resume",
  "how to book a flight",
  "how to buy a house",
  "how to train a dog",
  "how to plan a wedding",
  "how to be more productive",
  "how to deal with a difficult boss",
  "how to make a birthday cake",
  "how to fix a washing machine",
  "how to invest in gold",
  "how to make money", "how to earn money online", "how to save money",
  "how to become rich", "how to get wealth",
  "how to run faster",
  "best coffee shops in town",
  "how to learn french",
  "how to replace a battery",
  "how to sell a car",
  "hur byter jag däck",
  "hur lagar jag en bil",
  "hur tränar jag för ett maraton",
  "hur köper jag en bostad",
  "hur investerar jag i bitcoin",
  "aktier idag",
  "bästa filmen på netflix",
  "hur spelar jag gitarr",
  "hur lär jag mig spanska",
  "hur skriver jag ett cv",
  "hur får jag jobb",
  "hur startar jag ett företag",
  "hur bokar jag en flygresa",
  "hur renoverar jag ett kök",
  "hur målar jag en vägg",
  "hur tvättar jag kläder",
  "hur odlar jag tomater",
  "hur tränar jag en hund",
  "hur installerar jag windows",
  "hur använder jag excel",
  "hur programmerar jag i javascript",
  "how to study for a math test", "how to read a financial report",
  "how to memorize a speech", "how to lead a sales team", "how to serve a tennis ball",
  "how to give a presentation", "how to find a cheap flight", "how to overcome a cold",
  "how to be a good employee", "how to share a screen", "how to hear better",
  "how to know if someone likes you", "how to bake sourdough bread",
  "how to repair a leaking faucet",
  "hur studerar jag infor ett matteprov", "hur laser jag en ekonomisk rapport",
  "hur leder jag ett saljteam", "hur serverar jag i tennis",
  "hur ger jag en presentation", "hur hittar jag en billig flygresa",
  "hur botar jag en forkylning", "hur delar jag min skarm",
  "hur bakar jag surdegsbrod", "hur lagar jag en lackande kran",
  "hur investerar jag pa borsen",
];

const queries = [...valid, ...invalid];
const slices = [];
for (let offset = 0; offset < queries.length; offset += 16) slices.push(...await encoder.embedBatch(queries.slice(offset, offset + 16), "query"));
await encoder.dispose();

const results = queries.map((query, index) => ({ query, ...classifyBibleQuery(query, slices[index]) }));
const failures = results.filter((result) => result.valid !== valid.includes(result.query));
if (process.env.DEBUG_QUERY_VALIDITY) console.log(JSON.stringify(results, null, 2));
console.log(JSON.stringify({ valid: valid.length, invalid: invalid.length, failures }, null, 2));
assert.equal(failures.length, 0, "Query validity must accept Bible questions and reject general-domain requests");
test("query validity classification", () => assert.equal(failures.length, 0));
