import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { build } from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const metroConfig = readFileSync(path.join(projectRoot, "metro.config.js"), "utf8");
const powershellLauncher = readFileSync(path.join(projectRoot, "script", "build_and_run.ps1"), "utf8");
const shellLauncher = readFileSync(path.join(projectRoot, "script", "build_and_run.sh"), "utf8");

assert.equal(packageJson.scripts.start, "expo start", "npm start must preserve Metro's cache and use the normal LAN transport");
assert.equal(packageJson.scripts["start:tunnel"], "expo start --tunnel", "tunnel mode must not implicitly clear Metro's cache");
assert.equal(packageJson.scripts["start:clear"], "expo start --clear", "cache clearing should remain an explicit command");
for (const lifecycleScript of ["prestart", "prestart:lan", "prestart:tunnel", "prestart:clear", "preandroid", "preios"]) {
  assert.equal(packageJson.scripts[lifecycleScript], undefined, `${lifecycleScript} must not regenerate Bible data`);
}
assert.doesNotMatch(metroConfig, /child_process|execFile|generate-bible-data/, "Metro must never synchronously regenerate Bible data");
assert.match(metroConfig, /npm run bible:build/, "Metro's missing-asset error should name the explicit rebuild command");
assert.doesNotMatch(powershellLauncher, /generate-bible-data|--tunnel"\s*,\s*"--clear/, "PowerShell development starts must stay cache-preserving");
assert.doesNotMatch(shellLauncher, /generate-bible-data|start --tunnel --clear/, "Shell development starts must stay cache-preserving");

const result = await build({
  bundle: true,
  entryPoints: [path.join(projectRoot, "features", "home-screen.tsx")],
  format: "esm",
  loader: { ".db": "file" },
  logLevel: "silent",
  metafile: true,
  outdir: "out",
  packages: "external",
  platform: "neutral",
  splitting: true,
  tsconfig: path.join(projectRoot, "tsconfig.json"),
  write: false,
});

const homeOutput = Object.values(result.metafile.outputs).find((output) => output.entryPoint?.replaceAll("\\", "/").endsWith("features/home-screen.tsx"));
assert.ok(homeOutput, "Home entry output was not generated");

const forbiddenHomeInputs = Object.keys(homeOutput.inputs).filter((input) =>
  /(^|\/)features\/bible-(database|database-provider|kjv|screen|search)\.[jt]sx?$/.test(input.replaceAll("\\", "/")) ||
  /(^|\/)ui\/bible-verse-picker\.tsx$/.test(input.replaceAll("\\", "/")),
);
assert.deepEqual(
  forbiddenHomeInputs,
  [],
  "Home's eager dependency graph must not include the Bible database, reader, picker, or search engine",
);

const pickerChunk = Object.values(result.metafile.outputs).find((output) =>
  Object.keys(output.inputs).some((input) => input.replaceAll("\\", "/").endsWith("ui/bible-verse-picker.tsx")),
);
assert.ok(pickerChunk, "The Bible picker should remain available as a lazy chunk");

console.log(`Startup dependency validation passed: Home has ${Object.keys(homeOutput.inputs).length} eager modules; Bible picker/search remain lazy.`);
