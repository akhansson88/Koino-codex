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

## Deploy (koino-staging)

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
