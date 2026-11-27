#!/usr/bin/env node
/**
 * Normalise KOINO posts, reactions and journal kinds.
 *
 * Dry run by default:
 *   node scripts/migrate-posts-likes.mjs --project koino-dev
 * Apply after checking the backup and report:
 *   node scripts/migrate-posts-likes.mjs --project koino-dev --apply
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or an authenticated gcloud user.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
const backupDir = resolve(option("--backup-dir", "backups"));

if (!projectId || !databaseURL) {
  console.error("Pass --project and --database-url (or set GOOGLE_CLOUD_PROJECT).");
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault(), projectId, databaseURL }, `migrate-posts-likes-${Date.now()}`);
const db = getDatabase(app);

const normalizePostKind = (kind) => (kind === "prayer_request" ? "prayer_request" : "post");
const normalizeJournalKind = (kind) => (kind === "prayer_request" || kind === "prayer_moment" ? "prayer_request" : "post");

function children(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

function recordId(key, value) {
  return value?.id ?? key;
}

async function main() {
  const [postsSnapshot, reactionsSnapshot, journalsSnapshot, privateCheckInsSnapshot] = await Promise.all([
    db.ref("encryptedData/posts").get(),
    db.ref("encryptedData/postReactions").get(),
    db.ref("encryptedData/journalEntries").get(),
    db.ref("encryptedData/privateCheckIns").get(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    projectId,
    posts: postsSnapshot.val() ?? {},
    postReactions: reactionsSnapshot.val() ?? {},
    journalEntries: journalsSnapshot.val() ?? {},
    privateCheckIns: privateCheckInsSnapshot.val() ?? {},
  };
  const backupPath = resolve(backupDir, `posts-likes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  const updates = {};
  const report = { postsChanged: 0, reactionsMerged: 0, reactionsRewritten: 0, journalChanged: 0, linksAdded: 0 };

  for (const [groupId, groupPosts] of children(backup.posts)) {
    for (const [postKey, post] of children(groupPosts)) {
      const id = recordId(postKey, post);
      const kind = normalizePostKind(post?.kind);
      if (post?.kind !== kind || post?.id !== id) {
        updates[`encryptedData/posts/${groupId}/${postKey}/kind`] = kind;
        if (post?.id !== id) updates[`encryptedData/posts/${groupId}/${postKey}/id`] = id;
        report.postsChanged += 1;
      }
    }
  }

  for (const [groupId, groupReactions] of children(backup.postReactions)) {
    const byTarget = new Map();
    for (const [reactionKey, reaction] of children(groupReactions)) {
      if (!reaction || typeof reaction !== "object") continue;
      const targetKey = `${reaction.userId}|${reaction.targetType}|${reaction.targetId}`;
      byTarget.set(targetKey, [...(byTarget.get(targetKey) ?? []), { key: reactionKey, reaction }]);
    }
    for (const entries of byTarget.values()) {
      entries.sort((left, right) => Date.parse(left.reaction.createdAt ?? 0) - Date.parse(right.reaction.createdAt ?? 0));
      const [oldest, ...duplicates] = entries;
      const canonicalId = `${oldest.reaction.userId}_${oldest.reaction.targetType}_${oldest.reaction.targetId}_like`;
      updates[`encryptedData/postReactions/${groupId}/${canonicalId}`] = {
        ...oldest.reaction,
        id: canonicalId,
        kind: "like",
      };
      if (oldest.key !== canonicalId) updates[`encryptedData/postReactions/${groupId}/${oldest.key}`] = null;
      if (oldest.key !== canonicalId || oldest.reaction.kind !== "like") report.reactionsRewritten += 1;
      for (const duplicate of duplicates) {
        if (duplicate.key === canonicalId) continue;
        updates[`encryptedData/postReactions/${groupId}/${duplicate.key}`] = null;
        report.reactionsMerged += 1;
      }
    }
  }

  const privateCheckInsByUser = new Map();
  for (const [uid, checkIns] of children(backup.privateCheckIns)) {
    privateCheckInsByUser.set(uid, Object.values(checkIns ?? {}).filter(Boolean));
  }

  for (const [uid, entries] of children(backup.journalEntries)) {
    const checkIns = privateCheckInsByUser.get(uid) ?? [];
    for (const [entryKey, entry] of children(entries)) {
      if (!entry || typeof entry !== "object") continue;
      let changed = false;
      const entryKind = entry.entryKind === undefined ? undefined : normalizeJournalKind(entry.entryKind);
      if (entryKind && entry.entryKind !== entryKind) {
        updates[`encryptedData/journalEntries/${uid}/${entryKey}/entryKind`] = entryKind;
        changed = true;
      }
      if (entryKind === undefined) {
        updates[`encryptedData/journalEntries/${uid}/${entryKey}/entryKind`] = "post";
        changed = true;
      }
      if (entry.source === "private_check_in" && !entry.linkedCheckInId) {
        const match = checkIns.find((checkIn) => checkIn.createdAt === entry.createdAt && checkIn.userId === uid);
        if (match?.id) {
          updates[`encryptedData/journalEntries/${uid}/${entryKey}/linkedCheckInId`] = match.id;
          report.linksAdded += 1;
          changed = true;
        }
      }
      if (changed) report.journalChanged += 1;
    }
  }

  const keys = Object.keys(updates);
  console.log(`${apply ? "Applying" : "Dry run"} against ${projectId}`);
  console.log(`Backup: ${backupPath}`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Writes: ${keys.length}`);

  if (!apply || keys.length === 0) return;

  for (let index = 0; index < keys.length; index += 400) {
    const batch = Object.fromEntries(keys.slice(index, index + 400).map((key) => [key, updates[key]]));
    await db.ref().update(batch);
    console.log(`Applied ${Math.min(index + 400, keys.length)} of ${keys.length}`);
  }
  console.log("Migration complete.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
