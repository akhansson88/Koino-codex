#!/usr/bin/env node
/**
 * Gate the fine-tuned export before it can replace the production model.
 * Retrieval parity is the release criterion; cosine parity is a diagnostic.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = path.join(ROOT, "scripts/hybrid-search/.cache/finetune");
const read = (name) => JSON.parse(readFileSync(path.join(CACHE, name), "utf8"));
const exportManifest = read("export-manifest.json");
const evaluation = read("onnx-eval.json");
const production = read("onnx-eval-production.json");
const proxyProduction = read("proxy-production.json").summary;
const proxyCandidate = read("proxy-candidate.json").summary;
const round = (value) => Math.round(value * 1e6) / 1e6;
const metric = (value) => ["recall@1", "recall@5", "recall@10", "mrr"].reduce((result, key) => {
  result[key] = round(value[key]);
  return result;
}, {});
const delta = (left, right, key) => round(left[key] - right[key]);
const proxyMetric = (value) => ({
  recallAt10: round(value.recallAt10),
  recallAt20: round(value.recallAt20),
  mrr: round(value.mrr),
});
const checks = {
  "onnx fp32 matches PyTorch retrieval": ["recall@1", "recall@5", "recall@10", "mrr"].every(
    (key) => Math.abs(evaluation.onnx_fp32[key] - evaluation.torch[key]) < 1e-4,
  ),
  "int8 Recall@10 is within 2 points of fp32": delta(evaluation.onnx_int8, evaluation.onnx_fp32, "recall@10") >= -0.02,
  "int8 MRR is within 0.005 of fp32": delta(evaluation.onnx_int8, evaluation.onnx_fp32, "mrr") >= -0.005,
  "proxy Recall@10 improves over production": proxyCandidate.recallAt10 > proxyProduction.recallAt10,
  "proxy Recall@20 improves over production": proxyCandidate.recallAt20 > proxyProduction.recallAt20,
  "proxy MRR improves over production": proxyCandidate.mrr > proxyProduction.mrr,
  "proxy MRR improves for both languages": ["en", "sv"].every(
    (language) => proxyCandidate.byLanguage[language].mrr > proxyProduction.byLanguage[language].mrr,
  ),
  "mean int8-vs-fp32 cosine >= 0.98": exportManifest.mean_int8_vs_fp32 >= 0.98,
  "minimum int8-vs-fp32 cosine >= 0.95": exportManifest.minimum_int8_vs_fp32 >= 0.95,
};
const passed = Object.values(checks).every(Boolean);
const report = {
  passed,
  checks,
  model: exportManifest.int8,
  quantization: exportManifest.quantization,
  parity: {
    meanInt8VsFp32: exportManifest.mean_int8_vs_fp32,
    minimumInt8VsFp32: exportManifest.minimum_int8_vs_fp32,
    minimumOnnxFp32VsTorch: exportManifest.minimum_onnx_fp32_vs_torch,
  },
  syntheticHeldOut: {
    queries: evaluation.queries,
    passages: evaluation.passages,
    productionInt8: metric(production.onnx_int8),
    fineTunedFp32: metric(evaluation.onnx_fp32),
    fineTunedInt8: metric(evaluation.onnx_int8),
  },
  realProxy: {
    pool: proxyCandidate.pool,
    production: proxyMetric(proxyProduction),
    candidate: proxyMetric(proxyCandidate),
    byLanguage: Object.fromEntries(["en", "sv"].map((language) => [language, {
      production: proxyMetric(proxyProduction.byLanguage[language]),
      candidate: proxyMetric(proxyCandidate.byLanguage[language]),
    }])),
  },
};
writeFileSync(path.join(CACHE, "model-acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
