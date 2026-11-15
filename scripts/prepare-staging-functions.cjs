const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const deploy = require("../firebase.staging.deploy.json");

if (process.env.GCLOUD_PROJECT !== "koino-staging") {
  throw new Error("This configuration requires --project koino-staging.");
}
if (["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT"].some(name =>
  process.env[name] !== undefined && process.env[name] !== process.env.GCLOUD_PROJECT)) {
  throw new Error("Staging deploy refuses conflicting project environment variables.");
}
for (const name of [
  "FIREBASE_REALTIME_URL", "FIREBASE_RTDB_MANAGEMENT_URL", "FIREBASE_RTDB_METADATA_URL",
  "FIREBASE_DATABASE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FUNCTIONS_EMULATOR",
  "KOINO_EMULATOR_TEST_MODE", "FIREBASE_CONFIG", "FIREBASE_RUNTIMECONFIG_URL", "FIREBASE_API_URL",
  "FIREBASE_FUNCTIONS_URL", "FIREBASE_FUNCTIONS_V2_URL", "CLOUD_RUN_URL",
  "CLOUD_RUN_API_URL", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN",
  "KOINO_SUPABASE_SERVICE_KEY", "STRIPE_SECRET_KEY",
]) {
  if (process.env[name]) throw new Error(`Staging deploy requires a clean shell without ${name}.`);
}
if (process.argv.length === 3 && process.argv[2] === "--check-target") return;
if (process.argv.length !== 2) throw new Error("Unexpected staging preparation argument.");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "functions");
const destination = path.join(root, ".codex", "koino-staging-functions");
if (path.resolve(root, deploy.functions[0].source) !== destination) {
  throw new Error("Unexpected staging build directory in Firebase configuration.");
}
const entry = "staging-functions-entry.cjs";
const compiledModules = [
  "community-moderation.js", "emulator-safety.js", "encryption.js",
  "firebase-admin.js", "production-external-services.js", "storage-auth.js",
];

// Copy exactly the callable's local dependency tree and package metadata.
// Reject stale files or symlinks instead of packaging them or deleting local data.
fs.mkdirSync(path.dirname(destination), { recursive: true });
const actualDirectory = path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination));
if (path.relative(fs.realpathSync(root), actualDirectory) !== path.relative(root, destination)) {
  throw new Error("Staging build directory must be inside this checkout.");
}
fs.mkdirSync(destination, { recursive: true });
const modules = path.join(source, "node_modules");
const allowedFiles = new Set(["package.json", "package-lock.json", entry, ...compiledModules]);
const dependencyLink = path.join(destination, "node_modules");
if (fs.lstatSync(destination).isSymbolicLink() ||
    fs.readdirSync(destination, { withFileTypes: true }).some(file =>
      file.name === "node_modules"
        ? !file.isSymbolicLink() || fs.realpathSync(dependencyLink) !== fs.realpathSync(modules)
        : !file.isFile() || !allowedFiles.has(file.name))) {
  throw new Error("Staging build directory contains unexpected files or links.");
}

const compiler = path.join(source, "node_modules", "typescript", "bin", "tsc");
execFileSync(process.execPath, [
  compiler, "--project", path.join(source, "tsconfig.staging.json"), "--outDir", destination,
], { stdio: "inherit" });
const output = fs.readdirSync(destination);
if (compiledModules.some(name => !output.includes(name)) ||
    output.some(name => name !== "node_modules" && !allowedFiles.has(name))) {
  throw new Error("Staging build did not emit the reviewed callable module set.");
}
fs.copyFileSync(path.join(__dirname, entry), path.join(destination, entry));
fs.copyFileSync(path.join(source, "package-lock.json"), path.join(destination, "package-lock.json"));
const packageJson = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
packageJson.main = entry;
delete packageJson.scripts;
fs.writeFileSync(path.join(destination, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");
if (!fs.existsSync(dependencyLink)) {
  fs.symlinkSync(modules, dependencyLink, process.platform === "win32" ? "junction" : "dir");
}
console.log("Prepared the staging encryptedAccount package.");
