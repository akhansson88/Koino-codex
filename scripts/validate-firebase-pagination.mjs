import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../state/koino-store.tsx", import.meta.url), "utf8");
const pagination = readFileSync(new URL("../state/firebase-pagination.ts", import.meta.url), "utf8");
const rules = JSON.parse(readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8"));
const { firebaseRecords, mergeFirebaseRecords } = await import("../state/firebase-pagination.ts");

const subscribedRefs = [
  "journalRef",
  "privateCheckInsRef",
  "prayerNotificationsRef",
  "checkInsRef",
  "postsRef",
  "repliesRef",
  "reactionsRef",
  "postReactionsRef",
];

for (const reference of subscribedRefs) {
  assert.match(
    store,
    new RegExp(`onValue\\(recentFirebaseQuery\\(${reference}\\)`),
    `${reference} must keep only the recent Firebase page subscribed`,
  );
  assert.doesNotMatch(
    store,
    new RegExp(`onValue\\(${reference}\\s*,`),
    `${reference} still has an unbounded subscription`,
  );
}

assert.match(pagination, /FIREBASE_PAGE_SIZE = 50/);
assert.match(pagination, /endBefore\(oldestRecord\.createdAt, oldestRecord\.id\)/);
assert.match(pagination, /limitToLast\(FIREBASE_PAGE_SIZE\)/);

const indexedCollections = [
  ["checkIns", "$groupId"],
  ["privateCheckIns", "$uid"],
  ["posts", "$groupId"],
  ["replies", "$groupId"],
  ["prayerReactions", "$groupId"],
  ["postReactions", "$groupId"],
  ["prayerNotifications", "$uid"],
  ["journalEntries", "$uid"],
];

for (const [collection, scope] of indexedCollections) {
  assert.ok(
    rules.rules[collection][scope][".indexOn"].includes("createdAt"),
    `${collection}/${scope} must index the pagination cursor`,
  );
}

const older = [{ id: "older", createdAt: "2026-01-01T00:00:00Z", body: "old" }];
const recent = firebaseRecords({
  b: { id: "b", createdAt: "2026-01-02T00:00:00Z", body: "original" },
  a: { id: "a", createdAt: "2026-01-02T00:00:00Z", body: "same timestamp" },
});
assert.deepEqual(recent.map((item) => item.id), ["b", "a"], "equal timestamps need stable ID ordering");
assert.deepEqual(mergeFirebaseRecords(older, recent, [{ ...recent[0], body: "updated" }]).map((item) => item.id),
  ["b", "a", "older"], "pages must merge by record identity without duplicates");
assert.equal(mergeFirebaseRecords(older, recent, [{ ...recent[0], body: "updated" }])[0].body, "updated");
assert.deepEqual(mergeFirebaseRecords(older, recent.filter((item) => item.id !== "b")).map((item) => item.id),
  ["a", "older"], "removed records must disappear from the current live page");

console.log("Firebase pagination validation passed: eight streams are bounded to 50 records with indexed older-page cursors.");
