import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compiledFunctionsDirectory, emulatorEndpoints } from "./firebase-emulator-guard.mjs";

// The shared launcher starts only private Auth/RTDB for these older suites.
// They use real rules/RTDB but call handler.run with synthetic auth contexts;
// the separate moderation acceptance suite verifies the actual HTTP callable.
assert.equal(process.env.KOINO_ADMISSION_TEST_MODE, "1");
assert.equal(process.env.KOINO_ACCEPTANCE_SUITE, "Legacy");
assert.equal(emulatorEndpoints.authPort, 19099);
assert.equal(emulatorEndpoints.databasePort, 19001);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = path.dirname(path.dirname(compiledFunctionsDirectory));
assert.equal(path.resolve(process.env.KOINO_ADMISSION_TEST_RUN_DIR), run);
for (const key of Object.keys(process.env)) {
  if (/^(GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GHA_CREDS_PATH|GOOGLE_CLOUD_QUOTA_PROJECT|FIREBASE_TOKEN|EXPO_TOKEN|EAS_ACCESS_TOKEN)$|SUPABASE|STRIPE/i.test(key)) {
    assert.ok(!process.env[key], "The legacy test environment must not contain live credentials");
  }
}
const definitions = [
  { label: "encrypted database rules", file: "validate-encryption-emulator.mjs" },
  { label: "encryption backend", file: "validate-encryption-backend.mjs", productionMigrationBranches: true },
  { label: "moderation database integration", file: "validate-community-moderation-emulator.mjs" },
];
const results = [];
let failed = false;
for (const suite of definitions) {
  const environment = { ...process.env };
  // The backend regression deliberately covers historical migration/storage
  // guards, rather than the restricted demo-only callable allowlist. The exact
  // demo project, emulator endpoints and socket/fetch denylist remain enforced.
  if (suite.productionMigrationBranches) delete environment.KOINO_EMULATOR_TEST_MODE;
  const started = Date.now();
  process.stdout.write(`Legacy integration starting: ${suite.label}.\n`);
  const result = spawnSync(process.execPath, [path.join(repository, "scripts", suite.file)], {
    cwd: repository, env: environment, encoding: "utf8", windowsHide: true,
    timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
  });
  const passed = !result.error && result.status === 0;
  // Legacy negative-case warnings include synthetic UIDs, ciphertext and paths.
  // Do not echo or save raw child output. Retain only safe status/error metadata.
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const failureCategory = passed ? null : result.error?.code === "ETIMEDOUT" ? "timeout"
    : /AssertionError/.test(combined) ? "assertion" : /permission.denied/i.test(combined) ? "authorization" : "runtime";
  const stack = combined.match(new RegExp(`${suite.file.replaceAll(".", "\\.")}:(\\d+):(\\d+)`));
  const summary = { suite: suite.label, passed, durationMs: Date.now() - started,
    exitCode: result.status, failureCategory, ...(stack ? { sourceLine: Number(stack[1]), sourceColumn: Number(stack[2]) } : {}) };
  results.push(summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (!passed) { failed = true; break; }
}
writeFileSync(path.join(run, "legacy-results.json"), `${JSON.stringify({ passed: !failed, suites: results }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
assert.equal(failed, false, "A legacy integration failed; only safe failure metadata was retained");
process.stdout.write("Legacy isolated integration PASS: real rules/RTDB, signed in-process handlers and deterministic fault injection; HTTP Auth is covered separately.\n");
