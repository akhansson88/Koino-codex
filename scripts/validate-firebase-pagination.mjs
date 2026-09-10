import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../state/koino-store.tsx", import.meta.url), "utf8");
const pagination = readFileSync(new URL("../state/firebase-pagination.ts", import.meta.url), "utf8");
const rules = JSON.parse(readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8"));

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
  assert.deepEqual(
    rules.rules[collection][scope][".indexOn"],
    ["createdAt"],
    `${collection}/${scope} must index the pagination cursor`,
  );
}

console.log("Firebase pagination validation passed: eight streams are bounded to 50 records with indexed older-page cursors.");
