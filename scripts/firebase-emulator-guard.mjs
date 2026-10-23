import assert from "node:assert/strict";

// Every destructive emulator suite must fail closed outside an explicitly
// selected demo project and loopback-only Auth/RTDB emulator endpoints.
assert.equal(process.env.GCLOUD_PROJECT, "demo-koino", "Use emulators:exec --project demo-koino");
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, "127.0.0.1:9001", "RTDB emulator must be local");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099", "Auth emulator must be local");
const config = JSON.parse(process.env.FIREBASE_CONFIG ?? "{}");
assert.equal(config.projectId, "demo-koino", "Admin SDK configuration must use the demo project");
assert.ok(/^https:\/\/demo-koino(?:-default-rtdb)?\.firebaseio\.com\/?$/.test(config.databaseURL), "Unexpected Admin SDK namespace");
const transport = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), `Emulator test blocked external request to ${url.hostname}`);
  return transport(input, options);
};
