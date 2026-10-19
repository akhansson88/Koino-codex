// Build the small offline credits asset from tracked attribution/license files.
// This intentionally does not inspect models, tokenizers, embeddings or databases.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = [];
function read(relative) {
  const text = readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n").trim();
  sources.push({ file: relative, text });
  return text;
}
const notices = read("assets/bible/search/THIRD_PARTY_NOTICES.md");
const modelLicense = read("scripts/native/licenses/e5-LICENSE.txt");
const snowballLicense = read("scripts/hybrid-search/vendor/LICENSE.txt");
const vecLicense = read("scripts/native/sqlite-vec/LICENSE-MIT");
const ortLicense = read("scripts/native/licenses/onnxruntime-LICENSE.txt");
const tokenizerLicense = read("scripts/native/licenses/tokenizers-LICENSE.txt");
const ortThirdPartyNotices = read("scripts/native/licenses/onnxruntime-ThirdPartyNotices.txt");
const sections = notices.split(/^## /m).map((part, index) => {
  const newline = part.indexOf("\n");
  const title = part.slice(0, newline).replace(/^# /, "").trim();
  let body = part.slice(newline + 1).trim().replace(/`([^`]+)`/g, "$1");
  if (title === "Multilingual E5-small") body = `${body.split(/^MIT License$/m)[0].trim()}\n\n${modelLicense}`;
  if (title === "Swedish Snowball stemmer") body += `\n\n${snowballLicense}`;
  return { id: `source-${index}`, title, body };
});
sections.push(
  { id: "sqlite-vec", title: "sqlite-vec", body: `Source: https://github.com/asg017/sqlite-vec/tree/v0.1.7-alpha.2\nDistributed under the MIT license. Koino builds the unmodified source for Android with 16 KB page alignment.\n\n${vecLicense}` },
  { id: "onnxruntime", title: "ONNX Runtime", body: `Source: https://github.com/microsoft/onnxruntime/tree/v1.24.3\n\n${ortLicense}` },
  { id: "tokenizers", title: "Hugging Face Tokenizers.js", body: `Source: https://github.com/huggingface/tokenizers.js/tree/v0.2.0\nPackage: @huggingface/tokenizers 0.2.0\n\n${tokenizerLicense}` },
  { id: "onnxruntime-notices", title: "ONNX Runtime — third-party notices", body: ortThirdPartyNotices },
);
const asset = `${JSON.stringify({ schemaVersion: 1, sourceFingerprint: createHash("sha256").update(JSON.stringify(sources)).digest("hex"), sections }, null, 2)}\n`;
const output = path.join(root, "assets/bible/search/search-credits.json");
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8").replace(/\r\n/g, "\n") !== asset) throw new Error("Search credits are stale; run node scripts/generate-search-credits.mjs");
  console.log("Bundled search attribution and licenses match their tracked sources.");
} else {
  writeFileSync(output, asset);
  console.log(`Generated offline search credits (${Buffer.byteLength(asset).toLocaleString()} bytes).`);
}
