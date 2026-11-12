#!/usr/bin/env node
/** Install the exported fine-tuned int8 model and update pinned runtime metadata. */
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.resolve(process.argv[2] ?? path.join(ROOT, "scripts/hybrid-search/.cache/finetune/multilingual-e5-small-int8.onnx"));
const revision = process.argv[3] ?? "koino-e5-small-bible-2026-11";
const target = path.join(ROOT, "assets/bible/search/multilingual-e5-small-int8.onnx");
copyFileSync(source, target);
const bytes = statSync(target).size;
const sha256 = createHash("sha256").update(readFileSync(target)).digest("hex");
const md5 = createHash("md5").update(readFileSync(target)).digest("hex");

function replace(file, pattern, replacement) {
  const absolute = path.join(ROOT, file);
  const text = readFileSync(absolute, "utf8");
  if (!pattern.test(text)) throw new Error(`Pattern not found in ${file}`);
  writeFileSync(absolute, text.replace(pattern, replacement));
}
replace("features/bible-search/embedding-core.mjs", /export const E5_MODEL_REVISION = "[^"]+";/, `export const E5_MODEL_REVISION = "${revision}";`);
replace("features/bible-search/semantic-runtime.ts", /model: \{ file: "multilingual-e5-small-int8\.onnx", bytes: \d+, sha256: "[^"]+" \}/, `model: { file: "multilingual-e5-small-int8.onnx", bytes: ${bytes}, sha256: "${sha256}" }`);
const lockPath = path.join(ROOT, "scripts/hybrid-search/sources.lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const model = lock.sources.find((entry) => entry.path === "assets/bible/search/multilingual-e5-small-int8.onnx");
if (!model) throw new Error("Model source lock entry is missing");
lock.modelRevision = revision;
model.sha256 = sha256;
model.bytes = bytes;
model.localOnly = true;
model.fineTuned = true;
model.training = "scripts/finetune";
model.license = "MIT; fine-tuned from intfloat/multilingual-e5-small";
const previous = model.upstream ?? {};
const convertedUrl = previous.convertedUrl ?? previous.url ?? model.url;
const convertedRevision = /\/resolve\/([^/]+)\//.exec(convertedUrl ?? "")?.[1];
model.upstream = {
  baseModel: "intfloat/multilingual-e5-small",
  baseRevision: lock.upstreamModelRevision,
  convertedRepository: "Xenova/multilingual-e5-small",
  convertedRevision: convertedRevision ?? previous.convertedRevision,
  convertedUrl,
};
delete model.url;
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
writeFileSync(path.join(ROOT, "scripts/hybrid-search/.cache/finetune/installed-model.json"), `${JSON.stringify({ revision, bytes, sha256, md5, source }, null, 2)}\n`);
console.log(JSON.stringify({ revision, bytes, sha256, md5, target }, null, 2));
