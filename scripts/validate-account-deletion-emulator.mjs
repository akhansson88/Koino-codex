import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");

const projectId = "demo-koino";
const databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
assert.equal(process.env.GCLOUD_PROJECT, projectId, "Use emulators:exec --project demo-koino");
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, "127.0.0.1:19001", "RTDB emulator must run on 127.0.0.1:19001");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099", "Auth emulator must run on 127.0.0.1:19099");
const admin = initializeApp({ projectId, databaseURL });
const { runAccountDeletion, ownedCommunities } = await import(new URL("../functions/lib/account-deletion/service.js", import.meta.url).href);
const auth = getAuth(admin);
const db = getDatabase(admin);

async function createUser(name) {
  const user = await auth.createUser({ email: `${name}@account-deletion.test`, password: "test-password-123" });
  return user.uid;
}

const A = await createUser("delete-me");
const B = await createUser("keep-me");
const C = await createUser("other-member");
const D = await createUser("owner-block");

const signatureA = "signer-a", signatureD = "signer-d";

try {
  await db.ref().set({
    e2eePolicy: { encryptedGroupsOnly: false },
    profiles: {
      [A]: { id: A, name: "Delete Me", email: `${A}@example.test` },
      [B]: { id: B, name: "Keep Me", email: `${B}@example.test` },
      [D]: { id: D, name: "Owner Block", email: `${D}@example.test` },
    },
    encryptedData: {
      profiles: {
        [A]: { id: A, name: "Delete Me", email: `${A}@example.test` },
        [B]: { id: B, name: "Keep Me", email: `${B}@example.test` },
      },
      groups: {
        shared: { id: "shared", name: "Shared room", ownerId: B, inviteCode: "INVITE1" },
        other: { id: "other", name: "Other room", ownerId: B, inviteCode: "INVITE2" },
        ownedD: { id: "ownedD", name: "D's room", ownerId: D, inviteCode: "INVITE3" },
      },
      groupMembers: {
        shared: {
          [A]: { id: `membership_${A}_shared`, userId: A, groupId: "shared", role: "member", userName: "Delete Me" },
          [B]: { id: `membership_${B}_shared`, userId: B, groupId: "shared", role: "owner", userName: "Keep Me" },
        },
        other: {
          [B]: { id: `membership_${B}_other`, userId: B, groupId: "other", role: "owner", userName: "Keep Me" },
          [C]: { id: `membership_${C}_other`, userId: C, groupId: "other", role: "member", userName: "Other" },
        },
      },
      userGroups: {
        [A]: { shared: { id: `membership_${A}_shared`, userId: A, groupId: "shared", role: "member", userName: "Delete Me" } },
        [B]: { shared: { id: `membership_${B}_shared`, userId: B, groupId: "shared", role: "owner", userName: "Keep Me" } },
      },
      journalEntries: {
        [A]: { entryA: { id: "entryA", userId: A, body: "Private journal A" } },
        [B]: { entryB: { id: "entryB", userId: B, body: "Private journal B" } },
      },
      privateCheckIns: { [A]: { checkA: { id: "checkA", userId: A, body: "Private check-in A" } } },
      prayerSessions: { [A]: { sessionA: { id: "sessionA", userId: A } } },
      savedVerses: { [A]: { verseA: { id: "verseA", userId: A } } },
      bibleHighlights: { [A]: { highlightA: { id: "highlightA", userId: A } } },
      biblePlans: { [A]: { planA: { id: "planA", userId: A } } },
      pushTokens: {
        [A]: { tokenA: { token: "ExponentPushToken[A]", platform: "android" } },
        [B]: { tokenB: { token: "ExponentPushToken[B]", platform: "android" } },
      },
      notificationPreferences: { [A]: { pushEnabled: true }, [B]: { pushEnabled: true } },
      checkInDailyClaims: { [A]: { shared: { "2026-11-24": { dayKey: "2026-11-24", checkInId: "checkA" } } } },
      userDiscussionFollows: {
        [A]: { shared: { postA: { id: "postA", userId: A, targetType: "post", targetId: "postA" } } },
        [B]: { shared: { postA: { id: "postA", userId: B, targetType: "post", targetId: "postA" } } },
      },
      groupBiblePlanParticipantIds: { [A]: { announcementA: "participantA" } },
      supportIntents: { [A]: { intentA: { id: "intentA", userId: A, amount: 10 } } },
      activityNotifications: {
        [A]: { ownA: { id: "ownA", userId: A, recipientUserId: A, groupId: "shared", targetType: "post", targetId: "postB" } },
        [B]: {
          notifPostA: { id: "notifPostA", actorUserId: A, recipientUserId: B, groupId: "shared", targetType: "post", targetId: "postA", replyId: "replyChild" },
          notifPostB: { id: "notifPostB", actorUserId: B, recipientUserId: B, groupId: "shared", targetType: "post", targetId: "postB", replyId: "" },
        },
      },
      prayerNotifications: {
        [A]: { ownPrayerA: { id: "ownPrayerA", userId: A, recipientUserId: A, groupId: "shared" } },
        [B]: { keepPrayerB: { id: "keepPrayerB", userId: B, recipientUserId: B, groupId: "shared" } },
      },
      pushDeliveryDiagnostics: { [A]: { diagA: { stage: "ticket" } } },
      posts: {
        shared: {
          postA: { id: "postA", userId: A, groupId: "shared", body: "Post A" },
          postB: { id: "postB", userId: B, groupId: "shared", body: "Post B" },
        },
        other: { postC: { id: "postC", userId: C, groupId: "other", body: "Post C" } },
      },
      checkIns: {
        shared: {
          sharedCheckA: { id: "sharedCheckA", userId: A, groupId: "shared", dayKey: "2026-11-24", visibility: "group" },
          sharedCheckB: { id: "sharedCheckB", userId: B, groupId: "shared", dayKey: "2026-11-24", visibility: "group" },
        },
      },
      replies: {
        shared: {
          replyA: { id: "replyA", userId: A, groupId: "shared", targetType: "post", targetId: "postB", body: "Reply A" },
          replyChild: { id: "replyChild", userId: B, groupId: "shared", targetType: "post", targetId: "postA", body: "Reply to A" },
          replyB: { id: "replyB", userId: B, groupId: "shared", targetType: "post", targetId: "postB", body: "Reply B" },
        },
      },
      prayerReactions: {
        shared: {
          prayA: { id: "prayA", userId: A, groupId: "shared", targetType: "post", targetId: "postB" },
          prayChild: { id: "prayChild", userId: B, groupId: "shared", targetType: "reply", targetId: "replyChild" },
        },
      },
      postReactions: {
        shared: {
          reactionA: { id: "reactionA", userId: A, groupId: "shared", targetType: "post", targetId: "postB", kind: "heart" },
          reactionB: { id: "reactionB", userId: B, groupId: "shared", targetType: "post", targetId: "postB", kind: "pray" },
        },
      },
      discussionFollowers: {
        shared: { post: { postA: { [A]: { id: A, userId: A, targetType: "post", targetId: "postA" } } } },
      },
      moderationActions: {
        shared: { post: { postA: { actorUserId: B, authorUserId: A, targetType: "post", targetId: "postA", action: "remove" } } },
      },
      groupBiblePlanAnnouncements: {
        shared: { announcementA: { id: "announcementA", userId: A, groupId: "shared", title: "Plan A" } },
      },
      groupEvents: {
        shared: {
          eventA: { id: "eventA", userId: A, groupId: "shared", title: "Event A", startAt: "2026-12-01T18:00:00.000Z" },
          eventB: { id: "eventB", userId: B, groupId: "shared", title: "Event B", startAt: "2026-12-02T18:00:00.000Z" },
        },
      },
      eventRsvps: {
        shared: {
          eventA: {
            [A]: { id: A, userId: A, groupId: "shared", eventId: "eventA", status: "going" },
            [B]: { id: B, userId: B, groupId: "shared", eventId: "eventA", status: "maybe" },
          },
          eventB: {
            [A]: { id: A, userId: A, groupId: "shared", eventId: "eventB", status: "going" },
            [B]: { id: B, userId: B, groupId: "shared", eventId: "eventB", status: "going" },
          },
        },
      },
      groupBiblePlanParticipation: {
        shared: { announcementA: { participantA: { id: "participantA", userId: A, announcementId: "announcementA" } } },
      },
      fasts: {
        [A]: {
          fastA: {
            id: "fastA", userId: A, startDate: "2026-11-23", durationDays: 7,
            timeZone: "Europe/Stockholm", startAt: "2026-11-22T23:00:00.000Z", endAt: "2026-11-29T23:00:00.000Z",
            status: "active", alertEnabled: true, createdAt: "2026-11-23T00:00:00.000Z", updatedAt: "2026-11-23T00:00:00.000Z",
          },
        },
        [B]: { fastB: { id: "fastB", userId: B, startDate: "2026-11-24", durationDays: 1, status: "active" } },
      },
      legacyUserArchives: { [A]: { legacyA: { sourceCollection: "journalEntries" } } },
      legacyGroupArchives: { shared: { legacyA: { userId: A, sourceCollection: "posts" } } },
    },
    // Legacy root records are still closed by rules but must be removed too.
    journalEntries: { [A]: { legacyRootA: { id: "legacyRootA", userId: A, body: "Legacy root A" } } },
    moderatedCheckInDays: { [A]: { shared: { "2026-11-24": true } } },
    legacyUndecryptable: { [A]: { blob: { value: "ciphertext" } } },
    e2eeAccounts: {
      [A]: { id: A, signingPublicKey: signatureA, devices: { phone: { active: true, signingPublicKey: signatureA } } },
      [D]: { id: D, signingPublicKey: signatureD, devices: { phone: { active: true, signingPublicKey: signatureD } } },
    },
    e2eeSigners: { [signatureA]: { uid: A, active: true }, [signatureD]: { uid: D, active: true } },
    e2eeEscrow: { [A]: { key: "escrow" } },
    e2eeGroups: {
      shared: { id: "shared", ownerId: B, members: { [A]: { id: A, role: "member" }, [B]: { id: B, role: "owner" } } },
      other: { id: "other", ownerId: B, members: { [B]: { id: B, role: "owner" }, [C]: { id: C, role: "member" } } },
      ownedD: { id: "ownedD", ownerId: D, members: { [D]: { id: D, role: "owner" } } },
    },
    e2eeJoinRequests: { shared: { [A]: { userId: A, name: "Delete Me" } } },
    e2eeJoinRequestStatuses: { [A]: { shared: { status: "approved" } } },
    e2eeDepartures: { shared: { [A]: true } },
    presence: { shared: { [A]: { sessions: { deviceA: { state: "online", at: 1 } } } } },
    pendingExpoPushReceipts: { ticketA: { recipientUserId: A, tokenId: "tokenA" }, ticketB: { recipientUserId: B, tokenId: "tokenB" } },
    eventReminderDeliveries: { shared: { eventA: { [A]: { "60": true } } } },
  });

  // D owns a community: deletion must stop before removing anything.
  const owned = await ownedCommunities(D);
  assert.deepEqual(owned.map((item) => item.id), ["ownedD"]);
  await assert.rejects(runAccountDeletion(D), (error) => error.code === "failed-precondition" && error.message === "OWNED_COMMUNITIES");
  assert.equal((await db.ref(`profiles/${D}`).get()).exists(), true, "Blocked deletion must not remove profile data");

  await runAccountDeletion(A);

  const gone = [
    `profiles/${A}`,
    `encryptedData/profiles/${A}`,
    `encryptedData/journalEntries/${A}`,
    `journalEntries/${A}`,
    `encryptedData/fasts/${A}`,
    `encryptedData/privateCheckIns/${A}`,
    `encryptedData/prayerSessions/${A}`,
    `encryptedData/savedVerses/${A}`,
    `encryptedData/bibleHighlights/${A}`,
    `encryptedData/biblePlans/${A}`,
    `encryptedData/pushTokens/${A}`,
    `encryptedData/notificationPreferences/${A}`,
    `encryptedData/checkInDailyClaims/${A}`,
    `encryptedData/userDiscussionFollows/${A}`,
    `encryptedData/groupBiblePlanParticipantIds/${A}`,
    `encryptedData/supportIntents/${A}`,
    `encryptedData/activityNotifications/${A}`,
    `encryptedData/prayerNotifications/${A}`,
    `encryptedData/pushDeliveryDiagnostics/${A}`,
    `encryptedData/groupMembers/shared/${A}`,
    `encryptedData/userGroups/${A}`,
    `e2eeGroups/shared/members/${A}`,
    `e2eeJoinRequests/shared/${A}`,
    `e2eeJoinRequestStatuses/${A}`,
    `e2eeDepartures/shared/${A}`,
    `presence/shared/${A}`,
    `e2eeAccounts/${A}`,
    `e2eeSigners/${signatureA}`,
    `e2eeEscrow/${A}`,
    `legacyUndecryptable/${A}`,
    `moderatedCheckInDays/${A}`,
    `encryptedData/posts/shared/postA`,
    `encryptedData/checkIns/shared/sharedCheckA`,
    `encryptedData/replies/shared/replyA`,
    `encryptedData/replies/shared/replyChild`,
    `encryptedData/prayerReactions/shared/prayA`,
    `encryptedData/prayerReactions/shared/prayChild`,
    `encryptedData/postReactions/shared/reactionA`,
    `encryptedData/discussionFollowers/shared/post/postA`,
    `encryptedData/userDiscussionFollows/${B}/shared/postA`,
    `encryptedData/activityNotifications/${B}/notifPostA`,
    `encryptedData/moderationActions/shared/post/postA`,
    `encryptedData/groupBiblePlanAnnouncements/shared/announcementA`,
    `encryptedData/groupBiblePlanParticipation/shared/announcementA`,
    `encryptedData/groupEvents/shared/eventA`,
    `encryptedData/eventRsvps/shared/eventA`,
    `encryptedData/eventRsvps/shared/eventB/${A}`,
    `eventReminderDeliveries/shared/eventA`,
    `encryptedData/legacyUserArchives/${A}`,
    `encryptedData/legacyGroupArchives/shared/legacyA`,
    `pendingExpoPushReceipts/ticketA`,
  ];
  for (const path of gone) assert.equal((await db.ref(path).get()).exists(), false, `${path} should be deleted`);

  const kept = [
    `profiles/${B}`,
    `encryptedData/journalEntries/${B}`,
    `encryptedData/fasts/${B}`,
    `encryptedData/pushTokens/${B}`,
    `encryptedData/posts/shared/postB`,
    `encryptedData/checkIns/shared/sharedCheckB`,
    `encryptedData/replies/shared/replyB`,
    `encryptedData/postReactions/shared/reactionB`,
    `encryptedData/activityNotifications/${B}/notifPostB`,
    `encryptedData/prayerNotifications/${B}/keepPrayerB`,
    `encryptedData/posts/other/postC`,
    `encryptedData/groupEvents/shared/eventB`,
    `encryptedData/eventRsvps/shared/eventB/${B}`,
    `encryptedData/groups/shared`,
    `e2eeGroups/shared`,
    `e2eeAccounts/${D}`,
    `e2eeSigners/${signatureD}`,
    `pendingExpoPushReceipts/ticketB`,
  ];
  for (const path of kept) assert.equal((await db.ref(path).get()).exists(), true, `${path} should be kept`);

  await assert.rejects(auth.getUser(A), (error) => error.code === "auth/user-not-found");
  assert.equal((await db.ref(`accountDeletionJobs/${A}/status`).get()).val(), "completed");
  const ledger = (await db.ref("accountDeletionLedger").get()).val();
  assert.equal(Object.keys(ledger ?? {}).length, 1, "One deletion receipt should exist");

  // Idempotent: a second run must not throw or create a second job receipt.
  await runAccountDeletion(A);
  assert.equal(Object.keys((await db.ref("accountDeletionLedger").get()).val() ?? {}).length, 1);

  console.log("Account deletion emulator passed: full user cleanup, cascades, preserved other members, owner block, idempotency, Auth removal.");
} finally {
  await deleteApp(admin);
}
process.exit(0);
