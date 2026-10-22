import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual submission case with in-memory database boundaries.
// This covers write routing and journal creation without Firebase services.
const source = readFileSync("state/koino-store.tsx", "utf8");
const ast = ts.createSourceFile("store.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submission;
const cases = new Map();
function visit(node) {
  if (ts.isCaseClause(node)) {
    const body = node.statements.map(s => s.getText(ast)).join("\n");
    cases.set(node.expression.text, body);
    if (node.expression.text === "submitCheckIn") submission = body;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(submission);
const javascript = ts.transpile(submission, { target: ts.ScriptTarget.ES2022 });
for (const visibility of ["private", "group"]) {
  const writes = [], claims = [], records = { shared: [], private: [], journal: [] };
  const context = {
    action: { visibility, reflectionText: "  A reflection  ", mood: 4, heartMood: "hopeful", readToday: true },
    firebaseUser: { uid: "reader" }, profile: { currentGroupId: "room" },
    now: () => "2026-10-21T12:00:00Z", localDayKey: () => "2026-10-21",
    pendingCheckInKeys: new Set(), checkIns: [], privateCheckIns: [],
    checkInExistsForDay: () => false, actionVerses: () => [{ reference: "John 3:16" }],
    id: prefix => prefix + "-test", database: {}, ref: (_db, path) => path,
    claimCheckInDay: async (...args) => claims.push(args),
    commitCheckInClaim: async () => {}, releaseCheckInClaim: async () => {},
    set: async (path, value) => writes.push({ [path]: value }),
    update: async (_root, values) => writes.push(values),
    setCheckIns: fn => { records.shared = fn(records.shared); },
    setPrivateCheckIns: fn => { records.private = fn(records.private); },
    setJournalEntries: fn => { records.journal = fn(records.journal); },
    olderCheckInsRef: { current: [] }, olderPrivateCheckInsRef: { current: [] }, olderJournalEntriesRef: { current: [] },
    mergeFirebaseRecords: (a, b) => [...a, ...b],
  };
  const run = new (Object.getPrototypeOf(async function() {}).constructor)(...Object.keys(context), javascript);
  await run(...Object.values(context));
  assert.equal(writes.length, 1);
  assert.equal(claims[0][3].visibility, visibility);
  assert.equal(context.pendingCheckInKeys.size, 0);
  if (visibility === "private") {
    assert.deepEqual(Object.keys(writes[0]), ["privateCheckIns/reader/checkin-test", "journalEntries/reader/journal-test"]);
    assert.equal(records.shared.length, 0);
    assert.equal(records.private[0].visibility, "private");
    assert.equal(records.journal[0].isPrivate, true);
    assert.equal(records.journal[0].source, "private_check_in");
    assert.equal(records.journal[0].heartMood, "hopeful");
    assert.equal(records.journal[0].body, "A reflection");
    assert.equal(records.journal[0].verses[0].reference, "John 3:16");
  } else {
    assert.deepEqual(Object.keys(writes[0]), ["checkIns/room/checkin-test"]);
    assert.equal(records.shared[0].visibility, "group");
    assert.equal(records.private.length, 0);
    assert.equal(records.journal.length, 0);
  }
}
console.log("Check-in persistence passed: private atomic journal/check-in write and explicit group write.");

async function runCase(name, context) {
  const javascript = ts.transpile(cases.get(name), { target: ts.ScriptTarget.ES2022 });
  const run = new (Object.getPrototypeOf(async function() {}).constructor)(...Object.keys(context), javascript);
  await run(...Object.values(context));
}
for (const sharedPostId of [undefined, "existing-post"]) {
  const original = { id: "journal", userId: "reader", body: "Original", source: "private_check_in", journalType: "heart_checkin", heartMood: "hopeful", isPrivate: !sharedPostId, sharedPostId, createdAt: "2026-10-22" };
  let entries = [original];
  const writes = [];
  const context = {
    firebaseUser: { uid: "reader" }, database: {}, ref: (_db, path) => path,
    now: () => "2026-10-22", actionVerses: () => [],
    action: { id: "journal", body: "Edited", journalType: "heart_checkin", heartMood: "hopeful", sharedPostId },
    update: async (path, value) => writes.push([path, value]),
    setJournalEntries: fn => { entries = fn(entries); }, olderJournalEntriesRef: { current: [original] },
  };
  await runCase("updateJournalEntry", context);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "journalEntries/reader/journal");
  assert.equal(writes[0][1].sharedPostId, sharedPostId ?? null);
  assert.equal(entries[0].sharedPostId, sharedPostId);
  assert.equal(entries[0].heartMood, "hopeful");
  assert.equal(entries[0].isPrivate, original.isPrivate);
}
for (const visibility of ["private", "group"]) {
  const checkIn = { id: "checkin", userId: "reader", groupId: "room", visibility, createdAt: "2026-10-22" };
  const entry = { id: "journal", userId: "reader", source: "private_check_in", createdAt: checkIn.createdAt };
  let checkIns = [checkIn], journals = [entry];
  const released = [], writes = [];
  const context = {
    firebaseUser: { uid: "reader" }, profile: { currentGroupId: "room" }, database: {}, ref: (_db, path) => path,
    action: { id: visibility === "private" ? entry.id : checkIn.id },
    journalEntries: journals, privateCheckIns: checkIns, checkIns, localDayKey: () => "2026-10-22",
    update: async (_root, values) => writes.push(values),
    setJournalEntries: fn => { journals = fn(journals); },
    setPrivateCheckIns: fn => { checkIns = fn(checkIns); }, setCheckIns: fn => { checkIns = fn(checkIns); },
    olderJournalEntriesRef: { current: journals }, olderPrivateCheckInsRef: { current: checkIns }, olderCheckInsRef: { current: checkIns },
    deleteFeedItemWithChildren: async (...args) => writes.push(args),
    releaseDeletedCheckInClaim: async (...args) => released.push(args),
  };
  await runCase(visibility === "private" ? "deleteJournalEntry" : "deleteCheckIn", context);
  assert.equal(checkIns.length, 0, "Deletion clears the Home completion record");
  assert.deepEqual(released, [["reader", "room", "2026-10-22", "checkin"]]);
  if (visibility === "private") {
    assert.equal(journals.length, 0);
    assert.deepEqual(writes[0], { "journalEntries/reader/journal": null, "privateCheckIns/reader/checkin": null });
  }
}
console.log("Saved check-in persistence passed: edits retain audience/reference/mood; deletion clears records and releases daily claims.");
