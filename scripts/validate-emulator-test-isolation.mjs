import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

// No emulator is started or contacted. Both transport boundaries are replaced
// before importing the real destructive-suite guard in fresh Node processes.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = path.join(repository, ".codex", "koino-admission-validation");
const fixture = path.join(base, `guard-${randomUUID()}`);
const compiled = path.join(fixture, "functions", "lib");
mkdirSync(compiled, { recursive: true });
writeFileSync(path.join(compiled, "encryption.js"), "throw Error('This guard fixture must never execute');\n");
const guard = pathToFileURL(path.join(repository, "scripts", "firebase-emulator-guard.mjs")).href;
const config = { projectId: "demo-koino", databaseURL: "https://demo-koino-default-rtdb.firebaseio.com" };
const child = `
import assert from 'node:assert/strict';
import {Socket} from 'node:net';
let fetchCalls=0, socketCalls=0, socketArgs;
globalThis.fetch=async (_url,options)=>{fetchCalls++;assert.equal(options.redirect,'error');return new Response('fixture');};
Socket.prototype.connect=function(...args){socketCalls++;socketArgs=args;return this;};
const {emulatorEndpoints:e,compiledFunctionsDirectory}=await import(${JSON.stringify(guard)});
if(process.env.PROBE_TRANSPORTS==='1'){
  await fetch(e.authURL);await fetch('http://127.0.0.1:'+e.databasePort+'/.json');await fetch('http://127.0.0.1:'+e.functionsPort+'/demo-koino/europe-west1/encryptedAccount');
  assert.equal(fetchCalls,3);
  for(const url of ['https://example.invalid/', 'http://example.invalid:'+e.databasePort+'/', 'http://127.0.0.1:80/', 'http://user:pass@127.0.0.1:'+e.databasePort+'/']) assert.throws(()=>fetch(url));
  const wrong=e.databasePort===19001?9001:19001;assert.throws(()=>fetch('http://127.0.0.1:'+wrong+'/'));
  const socket=new Socket();socket.connect({host:'localhost',port:e.databasePort});assert.equal(socketCalls,1);assert.equal(socketArgs[0].host,'127.0.0.1');
  socket.connect(e.authPort,'127.0.0.1');socket.connect(e.functionsPort,'127.0.0.2');assert.equal(socketCalls,3);
  for(const target of [{host:'example.invalid',port:e.databasePort},{host:'100.100.67.44',port:e.databasePort},{host:'127.0.0.1',port:wrong},{path:'unsafe-pipe'}]) assert.throws(()=>socket.connect(target));
  assert.equal(socketCalls,3);assert.equal(fetchCalls,3);socket.destroy();
}
process.exit(0);
`;
const normal = { GCLOUD_PROJECT: "demo-koino", FIREBASE_CONFIG: JSON.stringify(config), FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9001", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
const isolated = { ...normal, KOINO_ADMISSION_TEST_MODE: "1", KOINO_ADMISSION_TEST_RUN_DIR: fixture, FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:19001", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19099" };
const cases = [
  ["original fixed endpoints and transports", { ...normal, PROBE_TRANSPORTS: "1" }, true],
  ["isolated fixed endpoints and transports", { ...isolated, PROBE_TRANSPORTS: "1" }, true],
  ["alternate ports require selector", { ...normal, FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:19001", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19099" }, false],
  ["production project denied", { ...isolated, GCLOUD_PROJECT: "production-project" }, false],
  ["production Firebase config denied", { ...isolated, FIREBASE_CONFIG: JSON.stringify({ ...config, projectId: "production-project" }) }, false],
  ["production database URL denied", { ...isolated, FIREBASE_CONFIG: JSON.stringify({ ...config, databaseURL: "https://production-project-default-rtdb.firebaseio.com" }) }, false],
  ["external database host denied", { ...isolated, FIREBASE_DATABASE_EMULATOR_HOST: "example.invalid:19001" }, false],
  ["external Auth host denied", { ...isolated, FIREBASE_AUTH_EMULATOR_HOST: "example.invalid:19099" }, false],
  ["mixed phone database port denied", { ...isolated, FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9001" }, false],
  ["mixed phone Auth port denied", { ...isolated, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }, false],
  ["arbitrary port denied", { ...isolated, FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:19002" }, false],
  ["invalid selector denied", { ...isolated, KOINO_ADMISSION_TEST_MODE: "true" }, false],
  ["outside run directory denied", { ...isolated, KOINO_ADMISSION_TEST_RUN_DIR: repository }, false],
];
try {
  for (const [label, values, expected] of cases) {
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) if (/^(KOINO_|GOOGLE_|GCLOUD_|GCP_|FIREBASE_|NODE_OPTIONS)|SUPABASE|STRIPE/.test(key)) delete environment[key];
    Object.assign(environment, values);
    const result = spawnSync(process.execPath, ["--input-type=module", "-"], { input: child, env: environment, cwd: repository, encoding: "utf8", timeout: 20000, windowsHide: true });
    assert.equal(!result.error && result.status === 0, expected, `Emulator guard regression failed: ${label}`);
  }
  console.log(`Destructive emulator isolation guard: ${cases.length}/${cases.length} PASS; fixed endpoints, production/mixed-port rejection, fetch and TCP guards; no real network.`);
} finally {
  // Remove only this test's fresh, fully resolved workspace fixture.
  const target = realpathSync(fixture), allowed = realpathSync(base), relative = path.relative(allowed, target);
  assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  rmSync(target, { recursive: true, force: true });
}
