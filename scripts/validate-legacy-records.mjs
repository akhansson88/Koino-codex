import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(process.cwd(), "node_modules", "koino-legacy-records-"));
try {
  const valuesOutfile = path.join(directory, "display-values.cjs");
  await build({ entryPoints: ["state/display-values.ts"], bundle: true, platform: "node", format: "cjs", outfile: valuesOutfile });
  const contentOutfile = path.join(directory, "content-values.cjs");
  await build({ entryPoints: ["state/content-values.ts"], bundle: true, platform: "node", format: "cjs", outfile: contentOutfile });
  const require = createRequire(import.meta.url);
  const { displayableText } = require(valuesOutfile);
  const { isPlaintextJournalEntry, isPlaintextCheckIn, isPlaintextPost, isPlaintextReply } = require(contentOutfile);

  const ciphertext = { ciphertext: "abc", v: 1, nonce: "n", keyId: "k", signer: "s", signature: "x" };
  assert.equal(displayableText(ciphertext), undefined, "ciphertext objects are never names");
  assert.equal(displayableText("  Alex  "), "Alex");
  assert.equal(displayableText(""), undefined);

  const legacyJournal = {
    id: "journal_1",
    userId: "u1",
    body: ciphertext,
    createdAt: "2026-05-13T18:13:37.639Z",
    updatedAt: "2026-05-13T18:13:37.639Z",
  };
  assert.equal(isPlaintextJournalEntry(legacyJournal), false);
  assert.equal(isPlaintextJournalEntry({ ...legacyJournal, body: "A real entry", source: "manual" }), true);

  const checkIn = { id: "c1", userId: "u1", reflectionText: "text", mood: 4, createdAt: "2026-11-26T06:00:00.000Z" };
  assert.equal(isPlaintextCheckIn(checkIn), true);
  assert.equal(isPlaintextCheckIn({ ...checkIn, reflectionText: ciphertext }), false);

  const post = { id: "p1", userId: "u1", body: "text", kind: "reflection", createdAt: "2026-11-26T06:00:00.000Z" };
  assert.equal(isPlaintextPost(post), true);
  assert.equal(isPlaintextPost({ ...post, body: ciphertext }), false);
  assert.equal(isPlaintextPost({ ...post, title: ciphertext }), false);

  const reply = { id: "r1", userId: "u1", body: "text", createdAt: "2026-11-26T06:00:00.000Z" };
  assert.equal(isPlaintextReply(reply), true);
  assert.equal(isPlaintextReply({ ...reply, body: ciphertext }), false);

  console.log("Legacy records passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
