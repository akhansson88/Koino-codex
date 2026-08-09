import { copyFile, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const clientRoot = path.join(distRoot, "client");
const serverRoot = path.join(distRoot, "server");
const functionsRoot = path.join(serverRoot, "functions");
const hostingRoot = path.join(distRoot, ".openai");

// Sites exposes static files from dist/client through the Worker's ASSETS
// binding. Expo exports into dist directly, so move that output into the
// expected client directory before packaging the Worker.
await rm(clientRoot, { recursive: true, force: true });
await mkdir(clientRoot, { recursive: true });
for (const entry of await readdir(distRoot)) {
  if (entry === "client" || entry === "server" || entry === ".openai") continue;
  await rename(path.join(distRoot, entry), path.join(clientRoot, entry));
}

await mkdir(functionsRoot, { recursive: true });
await mkdir(hostingRoot, { recursive: true });
await copyFile(path.join(projectRoot, "sites", "worker-entry.mjs"), path.join(serverRoot, "index.js"));
await copyFile(path.join(projectRoot, "netlify", "functions", "bible-topic.mjs"), path.join(functionsRoot, "bible-topic.mjs"));
await copyFile(path.join(projectRoot, "netlify", "functions", "link-preview.mjs"), path.join(functionsRoot, "link-preview.mjs"));
await copyFile(path.join(projectRoot, ".openai", "hosting.json"), path.join(hostingRoot, "hosting.json"));
await writeFile(path.join(serverRoot, "package.json"), '{"type":"module"}\n', "utf8");
