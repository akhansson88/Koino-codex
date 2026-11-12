#!/usr/bin/env node
/** Build the tiny query-domain classifier used before semantic retrieval. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as runtime from "onnxruntime-node";
import { createTextEncoder, E5_DIMENSIONS, E5_MODEL_REVISION } from "../../features/bible-search/embedding-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ASSETS = path.join(ROOT, "assets/bible/search");
const source = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/query-prototypes-source.json"), "utf8"));
const positive = [...new Set(source.positive)];
const negative = [...new Set(source.negative.filter((text) => !positive.includes(text)))];
if (!positive.length || !negative.length) throw new Error("Both prototype classes must be non-empty");

const encoder = await createTextEncoder({
  runtime,
  modelPath: path.join(ASSETS, "multilingual-e5-small-int8.onnx"),
  tokenizerJson: JSON.parse(readFileSync(path.join(ASSETS, "multilingual-e5-small.tokenizer"), "utf8")),
  tokenizerConfig: JSON.parse(readFileSync(path.join(ASSETS, "multilingual-e5-small-config.tokenizer"), "utf8")),
});

function quantize(vector) {
  let maximum = 0;
  for (const value of vector) maximum = Math.max(maximum, Math.abs(value));
  const scale = maximum > 0 ? maximum / 127 : 1;
  return { scale: Number(scale.toFixed(8)), q: Array.from(vector, (value) => Math.max(-127, Math.min(127, Math.round(value / scale)))) };
}

function dot(query, prototype) {
  let value = 0;
  for (let index = 0; index < E5_DIMENSIONS; index += 1) value += query[index] * prototype.q[index] * prototype.scale;
  return value;
}

function topMean(values, count) {
  return values.slice().sort((a, b) => b - a).slice(0, count).reduce((sum, value) => sum + value, 0) / Math.min(count, values.length);
}

try {
  const texts = [...positive, ...negative];
  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += 32) {
    const batch = texts.slice(offset, offset + 32);
    vectors.push(...await encoder.embedBatch(batch, "query"));
    console.log(`Embedded ${Math.min(offset + batch.length, texts.length)}/${texts.length}`);
  }
  const quantized = vectors.map(quantize);
  const positives = quantized.slice(0, positive.length);
  const negatives = quantized.slice(positive.length);
  const scores = texts.map((text, index) => {
    const isPositive = index < positive.length;
    const own = isPositive ? positives : negatives;
    const other = isPositive ? negatives : positives;
    const ownScores = own.filter((_, otherIndex) => otherIndex !== (isPositive ? index : index - positive.length)).map((item) => dot(vectors[index], item));
    const otherScores = other.map((item) => dot(vectors[index], item));
    return { text, label: isPositive ? "positive" : "negative", score: topMean(ownScores, 5) - topMean(otherScores, 5) };
  });

  let best;
  for (let threshold = 0; threshold <= 0.12; threshold += 0.0025) {
    const falseNegatives = scores.filter((item) => item.label === "positive" && item.score < threshold).length;
    const falsePositives = scores.filter((item) => item.label === "negative" && item.score >= threshold).length;
    const candidate = { threshold: Number(threshold.toFixed(4)), falseNegatives, falsePositives };
    if (!best || falsePositives < best.falsePositives ||
      (falsePositives === best.falsePositives && falseNegatives < best.falseNegatives)) best = candidate;
  }
  const chosen = best ?? { threshold: 0.02, falseNegatives: -1, falsePositives: -1 };
  const asset = {
    schemaVersion: 1,
    modelRevision: E5_MODEL_REVISION,
    dimensions: E5_DIMENSIONS,
    threshold: chosen.threshold,
    positive: positives,
    negative: negatives,
  };
  writeFileSync(path.join(ASSETS, "query-prototypes.json"), `${JSON.stringify(asset)}\n`);
  writeFileSync(path.join(ROOT, "scripts/hybrid-search/query-prototypes-report.json"), `${JSON.stringify({
    source: "scripts/hybrid-search/query-prototypes-source.json",
    counts: { positive: positive.length, negative: negative.length },
    chosen,
    scoreRange: {
      positive: { min: Math.min(...scores.filter((item) => item.label === "positive").map((item) => item.score)), max: Math.max(...scores.filter((item) => item.label === "positive").map((item) => item.score)) },
      negative: { min: Math.min(...scores.filter((item) => item.label === "negative").map((item) => item.score)), max: Math.max(...scores.filter((item) => item.label === "negative").map((item) => item.score)) },
    },
    scores,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ counts: asset.positive.length + asset.negative.length, chosen,
    positiveRange: [Math.min(...scores.filter((item) => item.label === "positive").map((item) => item.score)), Math.max(...scores.filter((item) => item.label === "positive").map((item) => item.score))],
    negativeRange: [Math.min(...scores.filter((item) => item.label === "negative").map((item) => item.score)), Math.max(...scores.filter((item) => item.label === "negative").map((item) => item.score))] }, null, 2));
} finally {
  await encoder.dispose();
}
