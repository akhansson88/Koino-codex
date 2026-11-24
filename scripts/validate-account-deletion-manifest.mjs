import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { DELETION_MANIFEST } = require("./lib/account-deletion/manifest.js");

const rules = JSON.parse(readFileSync("firebase.rules.json", "utf8")).rules;
const ruleKeys = Object.keys(rules).filter((key) => !key.startsWith("."));
const bundle = buildSync({ entryPoints: ["state/encryption/schema.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { policies } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const policyKeys = Object.keys(policies);

for (const key of ruleKeys) {
  assert.ok(DELETION_MANIFEST[key], `Ny kollektion "${key}" saknar raderingsklassificering. Lägg till den i DELETION_MANIFEST och i seed-testet.`);
}
for (const key of policyKeys) {
  assert.ok(DELETION_MANIFEST[key], `Kollektionen "${key}" i state/encryption/schema.ts saknar raderingsklassificering.`);
}
for (const [key, rule] of Object.entries(DELETION_MANIFEST)) {
  assert.ok(["user", "groupAuthored", "membership", "recipient", "moderation", "retained", "global"].includes(rule.kind), `Ogiltig raderingsklass för "${key}".`);
}
for (const key of Object.keys(DELETION_MANIFEST)) {
  assert.ok(ruleKeys.includes(key) || policyKeys.includes(key) || key === "accountDeletionJobs" || key === "accountDeletionLedger" || key === "pendingExpoPushReceipts", `Manifestposten "${key}" finns inte i reglerna.`);
}

console.log(`Account deletion manifest covers ${ruleKeys.length} rule collections and ${policyKeys.length} schema collections.`);
