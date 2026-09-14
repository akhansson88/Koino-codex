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

module.exports = config;
