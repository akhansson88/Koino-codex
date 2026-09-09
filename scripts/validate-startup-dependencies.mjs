import assert from "node:assert/strict";
import path from "node:path";

import { build } from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
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
