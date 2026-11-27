#!/usr/bin/env node
/**
 * Restore posts, reactions and journal kinds from a migration backup.
 *
 *   node scripts/restore-posts-likes.mjs --project koino-dev --backup backups/posts-likes-....json --apply
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { applicationDefault, initializeApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase } = requireFromFunctions("firebase-admin/database");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const apply = args.includes("--apply");
const projectId = option("--project", process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT);
const databaseURL = option("--database-url", projectId ? `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app` : undefined);
const backupPath = option("--backup");
if (!projectId || !databaseURL || !backupPath) {
  console.error("Pass --project, --database-url and --backup.");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(resolve(backupPath), "utf8"));
const app = initializeApp({ credential: applicationDefault(), projectId, databaseURL }, `restore-posts-likes-${Date.now()}`);
const db = getDatabase(app);

async function main() {
  console.log(`${apply ? "Restoring" : "Dry run for"} ${backupPath} into ${projectId}`);
  console.log(`Exported: ${backup.exportedAt}`);
  for (const collection of ["posts", "postReactions", "journalEntries"]) {
    const count = Object.keys(backup[collection] ?? {}).length;
    console.log(`${collection}: ${count} groups/users`);
  }
  if (!apply) return;
  await db.ref("encryptedData/posts").set(backup.posts ?? {});
  await db.ref("encryptedData/postReactions").set(backup.postReactions ?? {});
  await db.ref("encryptedData/journalEntries").set(backup.journalEntries ?? {});
  console.log("Restore complete.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
