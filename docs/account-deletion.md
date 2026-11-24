# Account deletion

KOINO members can permanently delete their account and all their data from
**Identity → Account → Delete account**. The flow is server-authoritative and
irreversible.

## What the member sees

1. A summary of what is deleted and what is retained (anonymised completed
   payments for seven years under Swedish bookkeeping law; backups for at most
   30 days).
2. Every community they own must be transferred to another member or deleted
   before they can continue.
3. They re-enter their password. The server also requires an ID token whose
   `auth_time` is no more than five minutes old.
4. They type `RADERA MITT KONTO` or `DELETE MY ACCOUNT`.
5. The app calls `koinoDeleteAccount`, then clears all local app data and
   returns to the start screen.

## Server

- `functions/src/account-deletion/manifest.ts` classifies every top-level
  Realtime Database collection. A new collection without a classification
  fails `npm run validate:account-deletion`.
- `functions/src/account-deletion/service.ts` performs the deletion in
  idempotent steps and records a job in `accountDeletionJobs/<uid>`.
- `functions/src/account-deletion/index.ts` exposes:
  - `koinoDeleteAccount` (`preflight`, `delete`, `status`)
  - `koinoAccountDeletionSweep` (every 10 minutes)
  - `koinoDeletionRetentionPurge` (daily at 03:30 Europe/Stockholm)
- Firebase Auth is deleted last, after profile, private data, community
  content, memberships, notifications and push tokens.
- A salted hash of the uid is kept in `accountDeletionLedger/<hash>` so a
  restored backup can be cleaned without keeping an identifiable list.

## Data rules

- `accountDeletionJobs` and `accountDeletionLedger` are server-only
  (`.read: false`, `.write: false`).
- Completed jobs are purged after 90 days.
- If Firestore has never been provisioned, the payment step treats the missing
  database as zero payment records and continues.
- `supportPayments` rows that never succeeded are deleted. Succeeded rows keep
  amount, currency, status, provider IDs and timestamps, but `userId` is
  removed and `anonymizedAt` is set.

## Adding a future feature

When adding a collection that stores user data:

1. Add it to `firebase.rules.json` (normally through
   `state/encryption/schema.ts` and `npm run encryption:rules`).
2. Add it to `DELETION_MANIFEST` with the right kind.
3. Add a seed and an assertion in
   `scripts/validate-account-deletion-emulator.mjs`.
4. Run `npm run validate:account-deletion` and
   `npm run validate:account-deletion-emulator`.

The emulator test covers private data, group content and cascades, another
member's untouched data, owned-community blocking, Auth removal and
idempotency.

## Commands

```powershell
npm run validate:account-deletion
npm run validate:account-deletion-emulator
npm run typecheck
npm --prefix functions test
```

The emulator uses isolated ports 19001/19099 so it does not collide with other
KOINO test runs.

## Deployment

Deploying functions requires temporarily removing the `createSupportPayment`
export from `functions/src/index.ts` when the `STRIPE_SECRET_KEY` secret is not
configured, then restoring it. Deploy the three account-deletion functions and
the database rules:

```powershell
npx firebase-tools deploy --only functions:koinoDeleteAccount,functions:koinoAccountDeletionSweep,functions:koinoDeletionRetentionPurge --project koino-codex
npx firebase-tools deploy --only database --project koino-codex
```

Production verification on 24 November 2026: preflight and delete were called
with a disposable production account; the callable returned `completed` and the
account could no longer sign in. Android 1.0.0 (versionCode 30) with the flow was
submitted to the Play internal testing track.
