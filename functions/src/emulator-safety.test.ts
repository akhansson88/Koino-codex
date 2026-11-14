import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Socket } from "node:net";
import { createServer } from "node:http";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import type { Database } from "firebase-admin/database";
import { assertEmulatorOperationAllowed, assertExternalStorageAllowed, emulatorTestConfiguration, guardedEmulatorFetch, installEmulatorNetworkGuards, loopbackSocketArguments, requireEmulatorTestConfiguration, withEmulatorAdmissionDiagnostics } from "./emulator-safety";
import { buildPrayerPushMessage } from "./notification-messages";
import { processExpoReceipts, sendExpoPush } from "./push-delivery";
import { productionExternalServicesEnabled } from "./production-external-services";

const isolated = {
  KOINO_EMULATOR_TEST_MODE: "1", FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "demo-koino", GOOGLE_CLOUD_PROJECT: "demo-koino",
  FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-koino", databaseURL: "https://demo-koino-default-rtdb.firebaseio.com" }),
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9001",
};
const credentialNames = ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "KOINO_SUPABASE_SERVICE_KEY", "STRIPE_SECRET_KEY", "GCP_PROJECT"];
async function withIsolatedEnvironment(action: () => Promise<void> | void) {
  const keys = [...Object.keys(isolated), ...credentialNames];
  const before = Object.fromEntries(keys.map(name => [name, process.env[name]]));
  try {
    for (const key of credentialNames) delete process.env[key];
    Object.assign(process.env, isolated);
    await action();
  } finally {
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
}

test("emulator test mode is explicit and fails closed for project, endpoint and credential mistakes", () => {
  assert.equal(emulatorTestConfiguration({}), undefined);
  assert.equal(emulatorTestConfiguration({ FUNCTIONS_EMULATOR: "true" }), undefined);
  assert.equal(emulatorTestConfiguration(isolated)?.databaseURL, "https://demo-koino-default-rtdb.firebaseio.com");
  assert.throws(() => requireEmulatorTestConfiguration({}), /explicit test mode/);
  const discovered = { ...isolated, GOOGLE_CLOUD_PROJECT: undefined, FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-koino", databaseURL: "http://127.0.0.1:9001/?ns=demo-koino-default-rtdb" }) };
  assert.equal(emulatorTestConfiguration(discovered)?.databaseURL, "https://demo-koino-default-rtdb.firebaseio.com");
  for (const patch of [
    { KOINO_EMULATOR_TEST_MODE: "0" }, { FUNCTIONS_EMULATOR: "false" }, { GCLOUD_PROJECT: "koino-codex" },
    { GOOGLE_CLOUD_PROJECT: "koino-codex" }, { GCP_PROJECT: "koino-codex" }, { FIREBASE_CONFIG: "malformed" },
    { FIREBASE_CONFIG: JSON.stringify({ projectId: "koino-codex", databaseURL: "https://demo-koino-default-rtdb.firebaseio.com" }) },
    { FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-koino", databaseURL: "https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app" }) },
    { FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-koino", databaseURL: "http://127.0.0.1:9001/?ns=koino-codex-default-rtdb" }) },
    { FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-koino", databaseURL: "https://127.0.0.1:9001/?ns=demo-koino-default-rtdb" }) },
    { FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-koino", databaseURL: "http://127.0.0.1:9001/?ns=demo-koino" }) },
    { FIREBASE_AUTH_EMULATOR_HOST: "0.0.0.0:9099" }, { FIREBASE_DATABASE_EMULATOR_HOST: "10.0.2.2:9001" },
    { FIREBASE_DATABASE_EMULATOR_HOST: "http://127.0.0.1:9001" }, { FIREBASE_AUTH_EMULATOR_HOST: "localhost" },
    ...credentialNames.slice(0, 4).map(name => ({ [name]: "must-not-be-used" })),
  ]) assert.throws(() => emulatorTestConfiguration({ ...isolated, ...patch }), /Unsafe KOINO emulator/);
});

test("fetch guard permits loopback only and rejects redirects before transport", async () => {
  const calls: RequestInit[] = [];
  const guarded = guardedEmulatorFetch(async (_url, init) => { calls.push(init ?? {}); return new Response("local"); });
  for (const url of ["http://127.0.0.1:9001/.json", "http://localhost:9099/", "http://[::1]:9001/"]) await guarded(url, { redirect: "follow" });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(init => init.redirect === "error"));
  for (const url of ["https://example.test/", "http://example.test/", "http://127.0.0.1.example.test/", "http://user@localhost:9001/", "https://localhost:9001/"]) await assert.rejects(guarded(url), /external network/);
  assert.equal(calls.length, 3);
});

test("socket guard covers core transports and canonicalizes localhost without DNS", () => {
  assert.deepEqual(loopbackSocketArguments([{ host: "localhost", port: 9001 }]), [{ host: "127.0.0.1", port: 9001 }]);
  assert.deepEqual(loopbackSocketArguments([9001, "::1"]), [9001, "::1"]);
  assert.deepEqual(loopbackSocketArguments([9001]), [9001, "127.0.0.1"]);
  const normalized = [{ host: "localhost", port: 9001 }];
  const marker = Symbol("normalized"); Object.defineProperty(normalized, marker, { value: true });
  assert.equal((loopbackSocketArguments([normalized])[0] as typeof normalized)[0].host, "127.0.0.1");
  assert.equal((normalized as unknown as Record<symbol, unknown>)[marker], true);
  for (const args of [[{ host: "example.test", port: 443 }], [443, "169.254.169.254"], [{ host: "0.0.0.0", port: 9001 }], [{ path: "pipe" }], ["pipe"]]) assert.throws(() => loopbackSocketArguments(args), /emulator test mode/);
});

test("installed transport guards and emulator operation checks restore their environment", async () => {
  await withIsolatedEnvironment(async () => {
    const previousFetch = globalThis.fetch, previousConnect = Socket.prototype.connect;
    const restore = installEmulatorNetworkGuards();
    const socket = new Socket();
    const server = createServer((_request, response) => response.end("local-only"));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/`)).text(), "local-only");
      await assert.rejects(fetch("https://example.test/"), /external network/);
      assert.throws(() => socket.connect(443, "example.test"), /external sockets/);
      for (const operation of ["setup", "recover", "requestDevice", "approveDevice", "backup", "revokeDevice", "createGroup", "resolveInvite", "requestJoin", "listJoinRequests", "rejectJoin", "groupChange", "beginMigration", "readLegacyArchive", "deleteLegacyBatch", "finishMigration", "leaveGroup", "deleteGroup", "removeCommunityContent"]) assert.doesNotThrow(() => assertEmulatorOperationAllowed(operation));
      for (const operation of ["imageUpload", "imageDownload", "imageDelete", "legacyImage", "futureOperation"]) assert.throws(() => assertEmulatorOperationAllowed(operation), error => (error as { code?: string }).code === "failed-precondition" && /disabled in emulator test mode/.test(String(error)));
      assert.throws(assertExternalStorageAllowed, /disabled in emulator test mode/);
    } finally { socket.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); restore(); }
    assert.equal(globalThis.fetch, previousFetch); assert.equal(Socket.prototype.connect, previousConnect);
  });
});

test("emulator push and receipt delivery do nothing before database or external fetch", async () => {
  await withIsolatedEnvironment(async () => {
    const database = { ref() { throw new Error("Must not read tokens, diagnostics or receipts."); } } as unknown as Database;
    const unexpectedFetch: typeof fetch = async () => { throw new Error("Must not contact Expo."); };
    assert.deepEqual(await sendExpoPush(database, "member", "prayer:test", buildPrayerPushMessage("", "test"), unexpectedFetch), { accepted: 0, devices: 0 });
    assert.deepEqual(await processExpoReceipts(database, unexpectedFetch), { processed: 0 });
  });
});

const production = {
  projectId: "koino-codex",
  databaseURL: "https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app",
};
const staging = {
  projectId: "koino-staging-fixture",
  databaseURL: "https://koino-staging-fixture-default-rtdb.europe-west1.firebasedatabase.app",
};
const cloud = { GCLOUD_PROJECT: production.projectId, FIREBASE_CONFIG: JSON.stringify(production) };
const externalServiceEnvKeys = [
  "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "GCP_PROJECT", "FIREBASE_CONFIG",
  "KOINO_EMULATOR_TEST_MODE", "FUNCTIONS_EMULATOR", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_DATABASE_EMULATOR_HOST",
];

test("external Functions services require matching production Firebase and platform identity", () => {
  assert.equal(productionExternalServicesEnabled(production, cloud), true);
  assert.equal(productionExternalServicesEnabled({ ...production, databaseURL: production.databaseURL + "/" }, {
    ...cloud, GOOGLE_CLOUD_PROJECT: production.projectId, GCP_PROJECT: production.projectId,
  }), true);
  for (const [options, env] of [
    [undefined, cloud],
    [production, {}],
    [staging, { GCLOUD_PROJECT: staging.projectId }],
    [staging, cloud],
    [production, { GCLOUD_PROJECT: staging.projectId }],
    [{ ...production, databaseURL: staging.databaseURL }, cloud],
    [{ ...production, databaseURL: production.databaseURL + "?ns=" + staging.projectId }, cloud],
    [production, { ...cloud, GOOGLE_CLOUD_PROJECT: staging.projectId }],
    [production, { ...cloud, GCP_PROJECT: staging.projectId }],
    [production, { ...cloud, FUNCTIONS_EMULATOR: "true" }],
    [production, { ...cloud, FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9001" }],
    [production, { ...cloud, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }],
  ] as const) assert.equal(productionExternalServicesEnabled(options, env), false);
  assert.equal(productionExternalServicesEnabled(production, isolated), false);
});

test("push and receipt delivery skip every token/database and transport call outside production", async () => {
  const before = Object.fromEntries(externalServiceEnvKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of externalServiceEnvKeys) delete process.env[key];
    const unexpectedFetch: typeof fetch = async () => { throw new Error("Must not contact Expo."); };
    for (const [options, projectId] of [
      [staging, staging.projectId],
      [production, staging.projectId],
      [staging, production.projectId],
      [production, undefined],
      [undefined, production.projectId],
    ] as const) {
      if (projectId === undefined) delete process.env.GCLOUD_PROJECT;
      else process.env.GCLOUD_PROJECT = projectId;
      const database = {
        app: { options },
        ref() { throw new Error("Must not read tokens, diagnostics or receipts."); },
      } as unknown as Database;
      assert.deepEqual(await sendExpoPush(database, "member", "prayer:test", buildPrayerPushMessage("", "test"), unexpectedFetch), { accepted: 0, devices: 0 });
      assert.deepEqual(await processExpoReceipts(database, unexpectedFetch), { processed: 0 });
    }
  } finally {
    for (const key of externalServiceEnvKeys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
});

test("production push and receipt delivery still reach the mocked Expo transport", async () => {
  const before = Object.fromEntries(externalServiceEnvKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of externalServiceEnvKeys) delete process.env[key];
    Object.assign(process.env, cloud);
    const receipts = new Map<string, unknown>();
    const database = {
      app: { options: production },
      ref(path: string) {
        if (path === "encryptedData/pushTokens/member") {
          return { get: async () => ({ val: () => ({ phone: { token: "fixture-token" } }) }) };
        }
        if (path === "pendingExpoPushReceipts") {
          return { limitToFirst: () => ({ get: async () => ({ val: () => Object.fromEntries(receipts) }) }) };
        }
        assert.equal(path, "pendingExpoPushReceipts/fixture-ticket");
        return {
          set: async (value: unknown) => { receipts.set("fixture-ticket", value); },
          remove: async () => { receipts.delete("fixture-ticket"); },
        };
      },
    } as unknown as Database;
    const calls: string[] = [];
    const mockedFetch: typeof fetch = async (url, request) => {
      const destination = String(url);
      calls.push(destination);
      const body = JSON.parse(String(request?.body));
      if (destination.endsWith("/send")) {
        assert.equal(body[0].to, "fixture-token");
        return Response.json({ data: [{ status: "ok", id: "fixture-ticket" }] });
      }
      assert.deepEqual(body, { ids: ["fixture-ticket"] });
      return Response.json({ data: { "fixture-ticket": { status: "ok" } } });
    };
    assert.deepEqual(await sendExpoPush(database, "member", "prayer:test", buildPrayerPushMessage("", "test"), mockedFetch), { accepted: 1, devices: 1 });
    assert.equal(receipts.size, 1);
    assert.deepEqual(await processExpoReceipts(database, mockedFetch), { processed: 1 });
    assert.equal(receipts.size, 0);
    assert.deepEqual(calls, [
      "https://exp.host/--/api/v2/push/send",
      "https://exp.host/--/api/v2/push/getReceipts",
    ]);
  } finally {
    for (const key of externalServiceEnvKeys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
});

test("staging image callables fail before database or storage transport and bind no production secret", () => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [...externalServiceEnvKeys, ...credentialNames]) delete env[key];
  const entry = require.resolve("./encryption");
  const database = require.resolve("firebase-admin/database");
  const source = `
    const assert = require("node:assert/strict");
    require(${JSON.stringify(database)}).getDatabase = () => { throw new Error("Must not contact Firebase."); };
    globalThis.fetch = async () => { throw new Error("Must not contact Supabase."); };
    const { encryptedAccount } = require(${JSON.stringify(entry)});
    const secrets = encryptedAccount.__endpoint.secretEnvironmentVariables ?? [];
    if (process.argv[1] === "production") {
      assert.deepEqual(secrets.map(secret => secret.key), ["KOINO_SUPABASE_SERVICE_KEY"]);
    } else {
      assert.deepEqual(secrets, []);
      (async () => {
        for (const operation of ["imageUpload", "imageDownload", "imageDelete", "legacyImage"]) {
          await assert.rejects(
            encryptedAccount.run({ auth: { uid: "tester" }, data: { operation, requestId: "fixture", timestamp: Date.now() } }),
            error => error.code === "failed-precondition" && /External image storage is disabled/.test(error.message),
          );
        }
      })().catch(error => { console.error(error); process.exitCode = 1; });
    }
  `;
  for (const [options, projectId] of [[staging, staging.projectId], [production, staging.projectId], [production, production.projectId]] as const) {
    execFileSync(process.execPath, ["-e", source, projectId === production.projectId ? "production" : "blocked"], {
      env: { ...env, FIREBASE_CONFIG: JSON.stringify(options), GCLOUD_PROJECT: projectId },
      stdio: "pipe",
    });
  }
});

test("prepared emulator entry has no payments, schedules, storage secret or ADC requirement", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, ...isolated };
  for (const key of credentialNames) delete env[key];
  const entry = require.resolve("./emulator-index");
  const source = `const exported = require(${JSON.stringify(entry)}); const admin = require(${JSON.stringify(require.resolve("./firebase-admin"))}).adminApp; process.stdout.write(JSON.stringify({keys:Object.keys(exported).sort(),secrets:exported.encryptedAccount.__endpoint.secretEnvironmentVariables ?? [],project:admin.options.projectId,database:admin.options.databaseURL}));`;
  const output = JSON.parse(execFileSync(process.execPath, ["-e", source], { env, encoding: "utf8" }));
  assert.deepEqual(output.keys.sort(), ["createCommentNotification", "encryptedAccount", "sendPrayerNotification"]);
  assert.deepEqual(output.secrets, []);
  assert.equal(output.project, "demo-koino"); assert.equal(output.database, "https://demo-koino-default-rtdb.firebaseio.com");
  delete env.GOOGLE_CLOUD_PROJECT;
  env.FIREBASE_CONFIG = JSON.stringify({ projectId: "demo-koino", databaseURL: "http://127.0.0.1:9001/?ns=demo-koino-default-rtdb" });
  assert.deepEqual(JSON.parse(execFileSync(process.execPath, ["-e", source], { env, encoding: "utf8" })), output);
  delete env.KOINO_EMULATOR_TEST_MODE;
  assert.throws(() => execFileSync(process.execPath, ["-e", `require(${JSON.stringify(entry)})`], { env, stdio: "pipe" }), /Command failed/);
});

test("admission diagnostics preserve results and exceptions and disclose only allowlisted emulator metadata", async () => {
  const beforeInfo = console.info, beforeWarn = console.warn;
  const entries: unknown[][] = [];
  console.info = (...values: unknown[]) => { entries.push(values); };
  console.warn = (...values: unknown[]) => { entries.push(values); };
  const beforeMode = process.env.KOINO_EMULATOR_TEST_MODE;
  try {
    delete process.env.KOINO_EMULATOR_TEST_MODE;
    const result = { accepted: true };
    assert.equal(await withEmulatorAdmissionDiagnostics("resolveInvite", async () => result), result);
    assert.deepEqual(entries, [], "Production must not emit emulator diagnostics");
    await withIsolatedEnvironment(async () => {
      assert.equal(await withEmulatorAdmissionDiagnostics("requestJoin", async () => result), result);
      assert.deepEqual(entries.map(values => values[1]), [{ operation: "requestJoin", stage: "start" }, { operation: "requestJoin", stage: "success" }]);
      entries.length = 0;
      const rejected = new HttpsError("not-found", "No encrypted community uses that invite code.");
      await assert.rejects(withEmulatorAdmissionDiagnostics("resolveInvite", async () => { throw rejected; }), error => error === rejected);
      assert.deepEqual(entries[1][1], { operation: "resolveInvite", stage: "failure", code: "not-found", message: rejected.message });
      entries.length = 0;
      for (const unexpected of [new Error("private payload: secret account name"), new HttpsError("invalid-argument", "private payload: secret invite value")]) {
        await assert.rejects(withEmulatorAdmissionDiagnostics("requestJoin", async () => { throw unexpected; }), error => error === unexpected);
        assert.ok(!JSON.stringify(entries).includes("private payload"));
        assert.ok(!JSON.stringify(entries).includes("secret"));
        entries.length = 0;
      }
      assert.equal(await withEmulatorAdmissionDiagnostics("imageDownload", async () => result), result);
      assert.deepEqual(entries, [], "Unrelated operations must not be logged");
    });
  } finally {
    console.info = beforeInfo; console.warn = beforeWarn;
    if (beforeMode === undefined) delete process.env.KOINO_EMULATOR_TEST_MODE; else process.env.KOINO_EMULATOR_TEST_MODE = beforeMode;
  }
});
