const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const deploy = require("../firebase.staging.deploy.json");

const root = path.resolve(__dirname, "..");
const projectId = "koino-staging";
const databaseURL = "https://koino-staging-default-rtdb.europe-west1.firebasedatabase.app";
const production = require("../state/store/firebase-production.json");
const env = { GCLOUD_PROJECT: projectId, FIREBASE_CONFIG: JSON.stringify({ projectId, databaseURL }) };
const entry = path.join(__dirname, "staging-functions-entry.cjs");
const entrySource = fs.readFileSync(entry, "utf8");
const prepareSource = fs.readFileSync(path.join(__dirname, "prepare-staging-functions.cjs"), "utf8");

test("staging predeploy refuses missing or wrong targets and URL overrides before building", () => {
  const dependencies = new Set(["node:fs", "node:path", "node:child_process", "../firebase.staging.deploy.json"]);
  function checkTarget(environment, ...args) {
    vm.runInNewContext("(function () {" + prepareSource + "\n})()", {
      process: { env: environment, argv: ["node", "script", ...args] },
      require(name) {
        assert.ok(dependencies.has(name));
        return name === "../firebase.staging.deploy.json" ? deploy : {};
      },
    });
  }
  assert.throws(() => checkTarget({}, "--check-target"), /--project koino-staging/);
  assert.throws(() => checkTarget({ GCLOUD_PROJECT: production.projectId }), /--project koino-staging/);
  assert.throws(() => checkTarget({ GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: production.projectId }), /conflicting project/);
  assert.throws(() => checkTarget({ GCLOUD_PROJECT: projectId, FIREBASE_REALTIME_URL: production.databaseURL }), /FIREBASE_REALTIME_URL/);
  assert.doesNotThrow(() => checkTarget({ GCLOUD_PROJECT: projectId }, "--check-target"));
});

test("staging entry rejects wrong or mixed config before loading Admin or Functions", () => {
  for (const environment of [
    {},
    { ...env, GCLOUD_PROJECT: production.projectId },
    { ...env, GOOGLE_CLOUD_PROJECT: production.projectId },
    { ...env, GCP_PROJECT: production.projectId },
    { ...env, FIREBASE_CONFIG: "config-from-disk.json" },
    { ...env, FIREBASE_CONFIG: JSON.stringify({ projectId, databaseURL: production.databaseURL }) },
    { ...env, FIREBASE_CONFIG: JSON.stringify({ projectId: production.projectId, databaseURL }) },
    { ...env, FIREBASE_CONFIG: JSON.stringify({ projectId }) },
    { ...env, FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9001" },
    { ...env, GOOGLE_APPLICATION_CREDENTIALS: "credential-file.json" },
    { ...env, KOINO_SUPABASE_SERVICE_KEY: "dummy-value" },
    { ...env, STRIPE_SECRET_KEY: "dummy-value" },
  ]) {
    assert.throws(() => vm.runInNewContext(entrySource, {
      process: { env: environment },
      require() { assert.fail("must refuse before loading Admin or the callable"); },
    }), /KOINO staging Functions/);
  }
});

test("staging entry refuses any pre-initialized Admin app before loading the callable", () => {
  for (const name of ["[DEFAULT]", "other"]) {
    assert.throws(() => vm.runInNewContext(entrySource, {
      process: { env },
      require(moduleName) {
        assert.equal(moduleName, "firebase-admin/app");
        return { getApps: () => [{ name, options: production }] };
      },
    }), /require a fresh Firebase Admin SDK/);
  }
});

test("the built package pins the real Admin SDK and binds only the staging recovery secret", () => {
  const directory = path.resolve(root, deploy.functions[0].source);
  const packagedRequire = createRequire(path.join(directory, "package.json"));
  assert.deepEqual(fs.readdirSync(directory).sort(), [
    "community-moderation.js", "emulator-safety.js", "encryption.js", "firebase-admin.js",
    "node_modules", "package-lock.json", "package.json", "production-external-services.js",
    "staging-functions-entry.cjs", "storage-auth.js",
  ]);
  assert.equal(deploy.functions[0].runtime, "nodejs22");
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const path = require("node:path");
    const directory = process.argv[1];
    const req = require("node:module").createRequire(path.join(directory, "package.json"));
    const sdkLibrary = path.dirname(path.dirname(req.resolve("firebase-functions/v2")));
    const { loadStack } = require(path.join(sdkLibrary, "runtime/loader.js"));
    const unexpectedNetwork = () => { throw new Error("unexpected network access during local Functions verification"); };
    global.fetch = unexpectedNetwork;
    for (const transport of [require("node:http"), require("node:https"), require("node:net")]) {
      for (const method of ["request", "get", "connect", "createConnection"]) {
        if (transport[method]) transport[method] = unexpectedNetwork;
      }
    }
    (async () => {
      const manifest = await loadStack(directory);
      assert.deepEqual(Object.keys(manifest.endpoints), ["encryptedAccount"]);
      assert.deepEqual(manifest.requiredAPIs, []);
      const fn = manifest.endpoints.encryptedAccount;
      assert.equal(fn.platform, "gcfv2");
      assert.deepEqual(fn.region, ["europe-west1"]);
      assert.ok(fn.callableTrigger);
      assert.equal(fn.scheduleTrigger, undefined);
      assert.equal(fn.eventTrigger, undefined);
      assert.deepEqual(fn.secretEnvironmentVariables ?? [], [{ key: "KOINO_RECOVERY_SEED" }]);
      assert.equal(fn.serviceAccountEmail, "koino-dev-runtime@koino-staging.iam.gserviceaccount.com");
      assert.equal(fn.minInstances, 0);
      assert.equal(fn.maxInstances, 2);
      const { getApp, getApps } = req("firebase-admin/app");
      assert.equal(getApps().length, 1);
      assert.equal(getApp(), req("./firebase-admin.js").adminApp);
      assert.equal(getApp().options.projectId, "koino-staging");
      assert.equal(getApp().options.databaseURL, "${databaseURL}");
      const sdk = require(path.join(sdkLibrary, "common/app.js"));
      assert.equal(sdk.getApp(), getApp());
      const { encryptedAccount } = req(directory);
      await assert.rejects(encryptedAccount.run({ data: {} }), { code: "unauthenticated" });
      await assert.rejects(encryptedAccount.run({
        auth: { uid: "synthetic-tester" },
        data: { operation: "imageUpload", requestId: "local-test", timestamp: Date.now(), data: {} },
      }), { code: "failed-precondition" });
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `, directory], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(packagedRequire("./package.json").engines.node, "22");
});
