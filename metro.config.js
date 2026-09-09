const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { getDefaultConfig } = require("expo/metro-config");

const generatedBibleData = path.join(__dirname, "features", ".generated", "kjv-verses.ts");
if (!fs.existsSync(generatedBibleData)) {
  execFileSync(
    process.execPath,
    [path.join(__dirname, "scripts", "generate-bible-data.mjs")],
    { cwd: __dirname, stdio: "inherit" },
  );
}

const config = getDefaultConfig(__dirname);

module.exports = config;
