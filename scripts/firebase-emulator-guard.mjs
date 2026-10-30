import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";
import { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Legacy destructive suites retain their fixed original endpoints. Alternate
// acceptance ports require the isolated launcher's explicit marker and private
// run directory; arbitrary endpoints are never accepted.
assert.equal(process.env.GCLOUD_PROJECT, "demo-koino", "Use emulators:exec --project demo-koino");
const isolated = process.env.KOINO_ADMISSION_TEST_MODE === "1";
if (process.env.KOINO_ADMISSION_TEST_MODE) assert.ok(isolated, "Invalid isolated test selector");
export const emulatorEndpoints = Object.freeze({
  host: "127.0.0.1",
  databasePort: isolated ? 19001 : 9001,
  authPort: isolated ? 19099 : 9099,
  functionsPort: isolated ? 15001 : 5001,
  authURL: `http://127.0.0.1:${isolated ? 19099 : 9099}`,
});
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, `127.0.0.1:${emulatorEndpoints.databasePort}`, "RTDB emulator must match the selected local test environment");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, `127.0.0.1:${emulatorEndpoints.authPort}`, "Auth emulator must match the selected local test environment");
const config = JSON.parse(process.env.FIREBASE_CONFIG ?? "{}");
assert.equal(config.projectId, "demo-koino", "Admin SDK configuration must use the demo project");
assert.ok(/^https:\/\/demo-koino(?:-default-rtdb)?\.firebaseio\.com\/?$/.test(config.databaseURL), "Unexpected Admin SDK namespace");
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let compiled = path.join(repository, "functions", "lib");
if (isolated) {
  assert.equal(config.databaseURL?.replace(/\/$/, ""), "https://demo-koino-default-rtdb.firebaseio.com");
  const base = realpathSync(path.join(repository, ".codex", "koino-admission-validation"));
  const supplied = process.env.KOINO_ADMISSION_TEST_RUN_DIR;
  assert.ok(supplied && path.isAbsolute(supplied), "Expected the launcher's isolated run directory");
  const run = realpathSync(supplied), relative = path.relative(base, run);
  assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "Isolated run must stay within the ignored acceptance tree");
  compiled = realpathSync(path.join(run, "functions", "lib"));
  const relativeCompiled = path.relative(run, compiled);
  assert.ok(relativeCompiled && relativeCompiled !== ".." && !relativeCompiled.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeCompiled), "Compiled test Functions must stay in the isolated run");
  assert.ok(existsSync(path.join(compiled, "encryption.js")), "The isolated Functions build is missing");
}
export const compiledFunctionsDirectory = compiled;

const hosts = new Set(["127.0.0.1", "127.0.0.2", "localhost", "::1", "[::1]"]);
const ports = new Set([emulatorEndpoints.authPort, emulatorEndpoints.databasePort, emulatorEndpoints.functionsPort]);
const transport = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.ok(url.protocol === "http:" && hosts.has(url.hostname) && ports.has(Number(url.port)) && !url.username && !url.password, "Emulator test blocked an unapproved network destination");
  return transport(input, { ...options, redirect: "error" });
};
// fetch alone does not cover Firebase's Node WebSocket or gRPC/TCP transports.
// Keep the legacy in-process handler tests fail-closed even when they exercise
// production migration branches with KOINO_EMULATOR_TEST_MODE unset.
const connect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const connection = Array.isArray(args[0]) ? args[0] : args;
  const options = connection[0];
  const host = value => {
    assert.ok(hosts.has(value ?? "localhost"), "Emulator test blocked an external socket");
    return value === undefined || value === "localhost" ? "127.0.0.1" : value === "[::1]" ? "::1" : value;
  };
  if (options && typeof options === "object") {
    assert.ok(options.path === undefined && ports.has(Number(options.port)), "Emulator test blocked an unapproved socket port");
    connection[0] = { ...options, host: host(options.host) };
  } else {
    assert.ok(ports.has(Number(options)), "Emulator test blocked an unapproved socket port");
    if (typeof connection[1] === "string") connection[1] = host(connection[1]);
    else connection.splice(1, 0, "127.0.0.1");
  }
  return Reflect.apply(connect, this, args);
};
