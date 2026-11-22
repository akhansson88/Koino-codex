# Plaintext accounts and rules-based communities

Status: code complete on branch `feat/plaintext-content`; staging deploy is
blocked by IAM (see "Deploy" below).

## What changed

- `state/encryption/database.ts` is now a plain adapter. Logical paths map to
  `encryptedData/<path>`, `encodeAt`/`decodeAt` are identity, saved verse and
  highlight IDs are the real local IDs, and no envelopes or opaque IDs remain.
- `state/encryption/session.ts` has no vault. `session()` returns the signed-in
  account, and community operations call the new `koinoAccount` function.
- `ui/encryption.tsx` is an auth/progress boundary only. The old encryption and
  device screens are gone; `ui/members.tsx` (route `/members`) lets a community
  host approve or decline join requests.
- `state/encryption/vault-migration.ts` performs the one-time conversion: it
  reads the device vault, decrypts every readable personal and community
  record, rewrites it as plaintext in place, moves personal records it cannot
  read to `legacyUndecryptable/<uid>/...`, records the skipped list, calls the
  server to delete the retired account keys and escrow, and then deletes the
  vault, device identity and draft keys.
- `functions/src/account.ts` (`koinoAccount`) owns community authority:
  create, join request, approve/reject, leave, remove member, transfer
  ownership, delete, and moderation removal. Membership source of truth stays
  `e2eeGroups/<groupId>/members/<uid>`; rules read it directly.
- `scripts/generate-encryption-rules.mjs` now generates plaintext rules:
  owners read/write their own records, members read/write their own community's
  records, non-members are denied, and `e2eeDepartures` revokes access at once.
- `state/supabase-storage.ts` stores images with their record as data URLs, so
  they survive reinstall without a vault or storage credential. Dev builds keep
  image upload disabled as before.

Passwords and login are untouched: Firebase Auth still stores salted hashes.

## Verification

- `npm run typecheck` passes.
- `npm --prefix functions run build` passes.
- `scripts/validate-plaintext-rules.mjs` passes against the Database/Auth
  emulator. It covers: own-record isolation across two accounts, community
  member read/write, denial for outsiders, author spoofing, owner-only group
  metadata, membership index reads, invite visibility, and access revocation
  through `e2eeDepartures`.

Run it with a Java 21+ runtime:

```powershell
npx firebase-tools emulators:exec --config firebase.emulator-test.json --only auth,database --project demo-koino "node scripts/validate-plaintext-rules.mjs"
```

## Deploy (koino-codex production, 2026-11-22)

The staging project (`koino-staging`) has no owner and rejects both rules and
functions deploys for `ak.hansson88@gmail.com` (Viewer + Firebase Authentication
Admin only). The owner approved deploying straight to production instead.

```powershell
npx firebase-tools deploy --only functions --project koino-codex
npx firebase-tools deploy --only database --project koino-codex
```

Results:

- `koinoAccount` created; existing functions updated.
- Legacy `encryptedAccount` and `pruneEncryptedRequests` deleted from the
  project and removed from `functions/src/index.ts`.
- New plaintext rules released on `koino-codex-default-rtdb`.
- `createSupportPayment` was left out of this deploy (it needs
  `STRIPE_SECRET_KEY`, which this project does not have yet).

Acceptance run on the Pixel_10 emulator against production:

- New account `ak.hansson88+plain@gmail.com` created through the app, no key or
  recovery screen.
- Journal entry written and stored as plaintext:
  `encryptedData/journalEntries/AWeGwM2WNSVimul0v1R9ceDPSgi1/...` contains
  `"title":"Plaintext test"` and `"userId":"AWeGwM2WNSVimul0v1R9ceDPSgi1"`.
- App uninstalled, reinstalled, signed in again: the entry is visible.
- The old production app build on the emulator was uninstalled to free space;
  old builds generally stop working once the rules are live, so the new build
  must ship before testers update.

Existing encrypted accounts migrate on the device that still holds their vault
when it first runs the new build. Devices without the vault cannot read the old
records; those records stay untouched rather than being deleted.

## Deploy (koino-staging) — blocked

```powershell
npx firebase-tools deploy --config firebase.staging.deploy.json --project koino-staging --only database,functions
```

Results on 2026-11-22, signed in as ak.hansson88@gmail.com:

- Functions: `Missing permissions required for functions deploy. You must have
  permission iam.serviceAccounts.ActAs on service account
  koino-staging@appspot.gserviceaccount.com.`
- Database: the rules endpoint returned HTTP 401 `{"error":"Permission denied"}`;
  the CLI reports `Unexpected error while deploying database rules.`

The project IAM page shows this account is `Viewer (legacy)`, `Project Billing
Manager` and `Firebase Authentication Admin` on KOINO Staging. A project owner
must grant, for koino-staging only:

- `Firebase Realtime Database Admin` (roles/firebasedatabase.admin), and
- `Service Account User` (roles/iam.serviceAccountUser).

Then re-run the command above. Production was not touched.
