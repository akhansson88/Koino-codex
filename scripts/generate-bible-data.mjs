import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderPath = path.join(projectRoot, "scripts", "build-bible-database.py");
const databasePath = path.join(projectRoot, "assets", "bible", "koino-bible-v2.db");
const fingerprintPath = path.join(projectRoot, "assets", "bible", "koino-bible-v2.sha256");
const sourcePaths = [
  builderPath,
  path.join(projectRoot, "assets", "bible", "kjv-verses-1769.json"),
  path.join(projectRoot, "assets", "bible", "reformationsbibeln.json"),
  path.join(projectRoot, "assets", "bible", "cross-references", "cross_references.json"),
];

async function sourceFingerprint() {
  const hash = createHash("sha256");
  for (const sourcePath of sourcePaths) {
    hash.update(await readFile(sourcePath));
  }
  return hash.digest("hex");
}

async function databaseIsCurrent(fingerprint) {
  try {
    await access(databasePath);
    return (await readFile(fingerprintPath, "utf8")).trim() === fingerprint;
  } catch {
    return false;
  }
}

function runBuilder(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [builderPath], { cwd: projectRoot, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))));
  });
}

async function buildDatabase() {
  const commands = process.env.PYTHON ? [process.env.PYTHON] : process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  let lastError;
  for (const command of commands) {
    try {
      await runBuilder(command);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw lastError ?? new Error("Python 3 is required to rebuild the Bible database");
}

const fingerprint = await sourceFingerprint();
if (await databaseIsCurrent(fingerprint)) {
  console.log("Bible SQLite database is up to date.");
} else {
  await buildDatabase();
  await writeFile(fingerprintPath, `${fingerprint}\n`, "utf8");
}
await import("./generate-bible-verse-counts.mjs");
