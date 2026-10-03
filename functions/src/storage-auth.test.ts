import assert from "node:assert/strict";
import test from "node:test";
import { storageHeadersFor } from "./storage-auth";
test("opaque secret keys are never sent as bearer JWTs", () => {
  assert.deepEqual(storageHeadersFor(" sb_secret_synthetic_fixture "), { apikey: "sb_secret_synthetic_fixture" });
  assert.throws(() => storageHeadersFor("sb_publishable_synthetic_fixture"));
});
test("legacy bearer credentials require the expected project and backend role", () => {
  const jwt = (role: string, ref: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.synthetic_signature`;
  const key = jwt("service_role", "prumjueusdyqnwwovpen");
  assert.deepEqual(storageHeadersFor(key), { apikey: key, authorization: `Bearer ${key}` });
  assert.throws(() => storageHeadersFor(jwt("anon", "prumjueusdyqnwwovpen")));
  assert.throws(() => storageHeadersFor(jwt("service_role", "other_project")));
});
