const fs = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const bibleDatabase = path.join(__dirname, "assets", "bible", "koino-bible-v2.db");
if (!fs.existsSync(bibleDatabase)) {
  throw new Error(
    "Missing assets/bible/koino-bible-v2.db. Run `npm run bible:build` explicitly before starting Metro.",
  );
}

const config = getDefaultConfig(__dirname);
// Keep the model and tokenizer JSON as file assets; importing tokenizer JSON as
// JavaScript would parse its 250k-token vocabulary during application startup.
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, "onnx", "tokenizer"])];
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  /[\\/]assets[\\/]bible[\\/]search[\\/]\.cache[\\/]/,
  /[\\/]scripts[\\/]hybrid-search[\\/]\.deps[\\/]/,
];

module.exports = config;
