# Encryption implementation and rollout

## Current status

This change adds client encryption, recovery and device approval, community key
management, encrypted local storage, resumable migration, backend operations,
private image storage, and database rules. The backend is deployed. The Android
debug binary builds locally and is installed alongside the existing app on the
connected Pixel 11 Pro. Native authenticated encryption, tamper rejection,
sealed key grants, SQLCipher storage and persistence across an app restart pass.
The SQLCipher database header was also checked and is encrypted. These checks
use synthetic content; signed-in migration and device recovery on real accounts,
iOS testing and independent security review remain outstanding.

The production database rules and all five encryption/notification Functions
were deployed on 2026-10-03. The user provisioned the corrected
`KOINO_SUPABASE_SERVICE_KEY` version 2 through the Firebase CLI and redeployed
`encryptedAccount` to use it. A safe format check verified the service_role claim
and expected Supabase project. The callable function uses that secret; it is
absent from the client and source repository.
Both legacy service_role JWTs and current sb_secret keys are supported, with
different authorization headers. The secret value itself was never logged.

EAS Android build version 20 with runtime `2.0.0` completed:
https://expo.dev/accounts/koinolabs-ab/projects/koino-mvp/builds/f53c9671-fa7e-4c50-8329-de553dc01a9d.
The signed APK build also completed:
https://expo.dev/accounts/koinolabs-ab/projects/koino-mvp/builds/e623dda0-1ba3-4123-9c13-1d232c25b077.
The phone's existing app used the local debug signing certificate, so the APK
was signed with that same existing key and installed as an in-place version 20
update. The original app data was preserved. Google Play internal submission
completed successfully on 2026-10-03 (version code 20):
https://expo.dev/accounts/koinolabs-ab/projects/koino-mvp/submissions/1871f301-0220-4f46-92ff-11e945ae5982.
Version 19 was canceled to include the historical collection migration described below.

The Supabase storage cutover was applied and verified: both image buckets have
`public=false`, accept encrypted JSON, and have zero client policies.

Production smoke checks passed authenticated account setup, encrypted database
round trips, access denial, plaintext rejection, request replay rejection,
migration completion and community creation/deletion. With secret version 2,
encrypted upload/download/deletion passed for both image buckets; outsider access
and public URLs were denied. Disposable test accounts and records were removed
after the successful run. Earlier Computer Use stopped because it could not
verify the current browser URL; no further UI automation was attempted.

## Existing-account migration repair (2026-10-03)

The connected phone exposed two migration permission failures that fresh-account
checks did not cover: legacy push tokens were unreadable even to the migrating
owner, and discussion follows were modeled without their group level. Rules now
allow the owner to read legacy tokens only while personal migration is copying;
the follow schema and rules use the full user/group/follow path. Community owner
migration reads also survive removal of legacy group records and membership
records, including the initial check for a not-yet-created encrypted group.
Emulator regressions cover outsider denial, closure after migration, nested Bible
reader preferences and permitted routing fields. Adapter checks, TypeScript and
the extended production smoke test passed. Temporary production data was removed.
The phone completed personal migration and opened the signed-in home screen;
another app restart unlocked successfully without a permission error. A metadata
check confirmed one completed personal migration and zero copying migrations.
The Android runtime `2.0.0` fix was published to both preview and production:
https://expo.dev/accounts/koinolabs-ab/projects/koino-mvp/updates/6e7503ee-d762-4b5b-9b9a-f978a602be9e
and https://expo.dev/accounts/koinolabs-ab/projects/koino-mvp/updates/69de6154-4ad9-43a0-b6a5-50999b908499.

## Data protection

- Personal and community content is encrypted on the device using libsodium
  XChaCha20-Poly1305. Each value has a fresh nonce. Ed25519 signatures and
  authenticated context bind values to their database path and record author.
- Names, journal text, prayers, check-in answers, Bible preferences and passages,
  reactions, plan details, and image metadata use the encrypted database adapter.
  Saved verse and highlight database keys use keyed hashes.
- Images are encrypted before upload to private Supabase buckets. Only the
  backend holds the storage service credential. Image keys are inside encrypted
  record metadata. Downloaded plaintext is held in memory. Crop outputs are
  removed from the app cache after upload completes or fails.
- Local key/value data uses SQLCipher SQLite. Its random key is kept in
  SecureStore with device-only accessibility. A build without SQLCipher fails
  closed. Android OS backup is disabled. Existing AsyncStorage values are copied
  into encrypted storage before their old entries are removed. A restored local
  database without its device-only key is discarded; sign-in and the recovery
  code are required to rebuild it. Unsynced local data cannot survive key loss.
- Push messages contain a generic activity notice. Names and previews are
  reconstructed from decrypted content on the recipient's device.

Service-readable metadata remains: account and membership IDs, ownership and
roles, timestamps, invitation codes, notification routing references, device
public keys, push tokens and delivery preferences, and payment/support routing
data. Firebase Authentication still processes login email and credentials;
payment providers still process payment records. These are not covered by
content E2EE. HTTPS remains necessary.

## Recovery and access

Users save a random recovery code and confirm its last six characters during
setup. The code decrypts an encrypted vault backup. A login password reset cannot
recover encrypted content. Losing every authorized device and the code loses
access to the content.

An existing authorized device can approve another device after fingerprint
verification. Community owners approve membership after verifying the member's
fingerprint. New members receive the full history, as requested.

Removing a device rotates the account identity, personal content key and recovery
code. Its old recovery proof and subsequent writes are rejected. All affected
communities are paused until their owner rotates the community key and approves
the replacement identity. Departing members similarly pause new community writes
until rotation. Revocation cannot erase plaintext or old keys already held by a
device. Full-history sharing does not provide forward secrecy.

## Migration

The encryption boundary unlocks the vault before mounting the content provider.
It freezes legacy writes, copies content to `encryptedData`, reads it back and
authenticates it, then conditionally deletes the exact legacy source using its
digest. Group metadata is archived in encrypted local storage and queued remotely
so interrupted owner migrations can resume. Completion is rejected while legacy
records remain. Existing members must enroll and receive owner approval.
Migration retains the IDs of imported replies and prayer notices so delayed
database triggers cannot send historical activity again as new pushes.
Retired private/group Bible plans and progress, comment reactions, pending push
bundles and old push diagnostics are preserved as authenticated JSON archives in
`legacyUserArchives` or `legacyGroupArchives`. Archive contents include their
former nested keys so plan names and passage identifiers are encrypted too.
The deployed-data audit found no orphaned groups in these retired collections.

Unexpected legacy post/journal attachments stop migration and preserve their
source. The current composer does not create them. Inspect any such records and
add a source-specific attachment migration before releasing to an affected
account. Legacy database exports, storage copies, provider backups and historical
logs require a separate retention cleanup; migrating live records cannot remove
those copies automatically.

## Deployment order

1. Complete independent review of key distribution, recovery, revocation,
   database authorization, metadata exposure, concurrent operations and migration.
   Review the trust in the backend public-key directory and the owner-signed
   community history. There is no external key transparency service. Historical
   manifests embed prior signed manifests, so their size grows with rotations.
   Membership changes use conditional writes over the database root; validate contention
   and database size limits before a large rollout. Record ciphertext does not
   have a separate replay watermark, so authenticated historical record replay
   by a malicious service is outside the current protection.
   The backend uses the documented REST ETag/If-Match transaction mechanism with
   bounded retries. The Admin SDK's overlapping root transaction stalled during
   the live smoke test. A forced-conflict emulator check verifies that retries
   preserve unrelated concurrent writes:
   https://firebase.google.com/docs/database/rest/save-data#section-conditional-requests.
2. Test a fresh native build on Android and iOS with real devices. Exercise
   reinstall/recovery, device approval, two simultaneous devices, owner transfer,
   departure, revocation, image upload/download/deletion, offline restart and
   interrupted migration. Expo Go cannot run these native encryption dependencies.
3. Provision `KOINO_SUPABASE_SERVICE_KEY` as a Firebase Functions secret. Use the
   Supabase service role credential only in that secret, never in the client.
4. Apply `supabase-storage-rules.sql`. Inspect deployed policies on both buckets
   and remove any additional policy that allows direct client access. Check that
   former public URLs no longer return image bytes. Coordinate this step with the
   new client rollout because legacy image clients lose access.
5. Deploy the built Functions and generated `firebase.rules.json` together in a
   staging environment, then validate the native client against that environment.
   `firebase.legacy.rules.json` is generator input; do not deploy it directly.
   Use `firebase.encryption.deploy.json` for this scope; its prepared entry point
   excludes the separate payment export and does not require Stripe credentials.
6. Release the native runtime `2.0.0` binary and require the updated client for
   enrollment. This change cannot be delivered solely as an OTA update to the
   previous runtime. Existing unenrolled accounts retain their legacy rules until
   migration, so protection is not complete until all accounts and communities
   have migrated and legacy access is retired.
7. Audit migration completion and clean up retained plaintext backups according
   to the chosen retention policy. The daily `pruneEncryptedRequests` function
   removes expired replay markers. Monitor storage cleanup failures before broad
   rollout.

## Validation commands

```sh
npm run typecheck
npm run typecheck:functions
npm run test:functions
npm run encryption:rules
npm run validate:encryption
npm run validate:encryption-adapter
npm run validate:encryption-emulator
npm run validate:encryption-backend
npm run validate:startup
npm run validate:pagination
```

The emulator tests use a demo project and cover access boundaries, plaintext
rejection, author ownership, stale epochs, departure locks, revoked signers,
device approval, recovery proof, replay rejection, full-history admission, key
rotation, deletion, notification/follower migration permissions and silent
history imports. These checks do not substitute for native runtime testing
or cryptographic review. The libsodium Windows CMake path fix is applied by the
tracked `scripts/patch-libsodium.cjs` postinstall script.
