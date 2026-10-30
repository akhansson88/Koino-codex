# KOINO Step 1B.2 automated moderation acceptance

Validated 2026-10-29. The strengthened real HTTP suite passed 13 initial scenario groups and 5 groups after a real emulator shutdown/export/import. The three existing encryption/moderation emulator regressions also passed in isolation. No production implementation, Firebase rules, active phone-session data, mobile build, deployment or Git checkpoint was changed by this task.

## Coverage and results

H = actual emulator Auth tokens, signed Functions HTTP callables, RTDB SDK/security rules, production crypto with Node libsodium, and real notification triggers. L = real RTDB/rules with in-process handler.run calls and synthetic callable auth contexts; some ETag/failure races are deliberately injected. M = mocked transport/UI or pure unit tests. P = physical-device results supplied by the developers.

| Requirement | Result | Evidence |
| --- | --- | --- |
| Owner removes reflection, prayer request and praise | PASS | H; post/prayer also P |
| Owner removes member's shared check-in | PASS | H, including authorized decryption before removal |
| Matching private journal survives shared check-in removal | PASS | H: same-ID linked journal plus full ciphertext equality and author decryption before/after import |
| Private journals/check-ins remain inaccessible to owner/outsider | PASS | H: read, delete and forged-write denials; private data unchanged |
| Daily claim retained; no replacement daily check-in | PASS | H: moderated claim/day marker, shared/private duplicate denial, claim delete/reset denial |
| Member/outsider/anonymous/forged signer cannot moderate | PASS | H; member attempts another author's content, initialized outsider owns a different group |
| Owner cannot bypass audit through direct delete/edit | PASS | H + L actual database rules; author controls retained |
| Individual comment removal keeps same prayer and sibling | PASS | H + P; sibling ciphertext and notification survive import |
| Prayer/check-in/post cascades remove associated references | PASS | H: replies, reply tombstones, reactions, follows and trigger-created notification cleanup |
| Offline stale post/check-in/reply/reaction replay denied | PASS | H: real SDK goOffline/goOnline queues and client-listener rollback; repeated after import |
| Tombstones prevent same-ID and multipath resurrection | PASS | H before/after import; clients cannot alter tombstones or audit |
| Signed retry and semantic retry produce one stable audit | PASS | H; metadata allowlist checked |
| Concurrent replies cannot escape parent removal | PASS | H: eight live writes committed before removal and all cleaned; deterministic ETag conflict separately L/M |
| Failed atomic commit, ownership race, lost acknowledgement | PASS | L/M fault injection, not claimed as real HTTP failure injection |
| Author self-delete and authorized atomic child deletion | PASS | H; no moderation audit created for ordinary author deletion |
| Encryption, membership grants and Auth survive import | PASS | H; approved admission/session lifecycle additionally A/P below |
| Prayer Dwell, unrelated group and identities unchanged | PASS | H: ciphertext/authority equality and private-key/plaintext exclusion checks |
| Owner-only menu, confirmation, EN/SV privacy/download notice | PASS | M React component tests; post/prayer/reply actions also P |

A = the separate admission regression uses actual app session/profile/database-adapter code with native sodium/storage/image boundaries replaced for Node. Its fresh default-mode rerun PASSed reciprocal admission, invalid/unauthorized requests, owner fingerprint approval, encrypted membership/content and private journals after real shutdown/export/import and session unlock.

## Isolated environment

Only demo-koino is used. Every run creates a unique ignored .codex/koino-admission-validation/<UTC timestamp-GUID>/ directory with private Functions compilation, configuration, CLI credentials/config directories, temporary hub locator, proof and exports. The launcher uses cached Java21 and Firebase CLI15.34.1. Node24.15.0 is the available runtime; the package declares Node22, so deployed Node22 execution is not claimed by this run.

All services bind to 127.0.0.1: Auth19099, RTDB19001, Functions15001, Hub14400, Logging14500, Eventarc14999 and Tasks14998. Legacy mode starts only Auth/Database. Ports9099/9001/5001 and .codex/koino-emulator-device/ are not read, reset, stopped or reused by the acceptance suites. Busy ports or inherited non-demo/mixed endpoints fail preflight.

The real HTTP suite initializes only the isolated test policy through an emulator fixture write. Synthetic users, encrypted authority/membership grants and content are otherwise created through real Auth/callables/client writes. Fixture-owner REST reads verify hidden ciphertext and metadata; they do not grant client access. No private spiritual data or real credentials are used. Synthetic restart keys/passwords stay in ignored proof files and must not be copied into a build archive or shared as diagnostic output.

The older tests previously reset their selected root and hard-coded phone ports. They now consume validated endpoints and the isolated run's compiled Functions. Legacy production migration branches run with the demo-operation selector unset, while exact demo config, loopback endpoints and fetch/TCP restrictions remain active. No production service is called. Use the commands below; do not directly invoke a destructive legacy script against phone emulator environment variables.

## Repeatable Windows commands

From the repository in a clean PowerShell7 terminal, run emulator commands sequentially:

```powershell
pwsh -NoProfile -File scripts/test-community-admission.ps1 -Suite Moderation -CheckOnly
pwsh -NoProfile -File scripts/test-community-admission.ps1 -Suite Moderation
pwsh -NoProfile -File scripts/test-community-admission.ps1 -Suite Legacy
pwsh -NoProfile -File scripts/test-community-admission.ps1
node scripts/validate-emulator-test-isolation.mjs
npm.cmd run typecheck
npm.cmd run test:functions
npm.cmd run validate:community-moderation
node scripts/validate-encryption.mjs
node scripts/validate-encryption-adapter.mjs
node scripts/validate-encryption-migration.mjs
node scripts/validate-check-in-persistence.mjs
node scripts/validate-emulator-client.mjs
git diff --check
```

Do not substitute the older default-port npm emulator commands while running the phone session. The new launcher owns and shuts down only its own alternate-port processes; Ctrl+C is not needed after a normal completed run.

Additional validation performed: 13/13 network-free guard cases, 5/5 negative launcher preflight cases, app and Functions TypeScript, 30/30 Functions unit tests, mocked signed-backend/UI tests, crypto/adapter/migration/check-in regressions, emulator client isolation, script syntax, and rules-generator parity. Generator parity wrote only an ignored temporary output and did not rewrite repository rules.

Each completed run retained evidence only under its ignored local `.codex/koino-admission-validation/<RUN_ID>/` directory. Moderation proof/export and Legacy metadata-only results belong to their separate runs; `<RUN_ID>` is a placeholder, not a published session identifier. An earlier complete moderation run also passed before the extra check-in-specific offline assertions were added. Do not commit or share private proof manifests or exports.

## Files changed for this acceptance task

- scripts/validate-community-moderation-acceptance.mjs (new): real HTTP scenario matrix and restart verification.
- scripts/validate-moderation-legacy.mjs (new): isolated sequential legacy suite runner with safe summaries.
- scripts/validate-emulator-test-isolation.mjs (new): fixed-port/project/transport regression cases without network access.
- scripts/test-community-admission.ps1: adds Moderation/Legacy suite selection and stricter inherited-endpoint preflight; default Admission mode retained.
- scripts/firebase-emulator-guard.mjs: explicit alternate endpoints, path-checked compiled Functions and fetch/TCP restrictions.
- scripts/validate-community-moderation-emulator.mjs: uses validated endpoints/isolated compiled backend.
- scripts/validate-encryption-emulator.mjs: uses validated endpoints.
- scripts/validate-encryption-backend.mjs: uses validated endpoints/isolated compiled backend.
- scripts/encryption-test-helpers.mjs: resolves production crypto source independently of the caller's working directory.
- docs/community-moderation-acceptance.md (new): acceptance evidence, commands and limits.

## Remaining limits and closeout

No production moderation defect was established. Confirmed test-infrastructure issues were hard-coded legacy ports and a crypto helper that depended on repository cwd; the corrections are test-only.

Root-wide REST ETag transactions still read/serialize/upload the database root. Tests verify consistency, not capacity: contention/bandwidth grows with total database size and should be assessed before expanding deployment. The server handles ciphertext and never receives the private/group decryption keys. Moderation removes shared server records; it cannot erase copies already downloaded or retained offline. Live race outcomes do not prove a CAS conflict occurred; deterministic failure/conflict/lost-response coverage is explicitly L/M.

H does not mount React Native UI, use SQLCipher/OS key stores, run on physical airplane-mode/background lifecycle, or certify deployed Node22/Firebase configuration. The actual crypto primitive and backend authorization are real; synthetic wire fixtures and restored fixture keys are not a native-vault test. Physical encrypted access/membership persistence and post/prayer/comment moderation already passed according to the developers.

No additional coordinated two-device authorization/persistence matrix is necessary. A short shared-check-in UI smoke remains useful: owner removal is shown correctly, the author can still see the private journal, and Home still shows that today's check-in is completed. This can be checked asynchronously on the existing builds and is not a reason to buy another EAS build. Product UI behaviour is separate from the completed backend security matrix.

Recommendation: GO for a Git checkpoint and Step1B.2 automated moderation closeout. All named suites passed; no unresolved backend acceptance failure remains. This is not a production deployment approval; no commit, push, merge, deploy, paid service or mobile build was performed.


Final default admission proof/export remained under its own ignored `.codex/koino-admission-validation/<RUN_ID>/` directory. Every emulator invocation exited0 and shut down its own processes. The final legacy result was3/3 suites PASS; strengthened HTTP moderation was13/13 initial groups plus5/5 restart groups PASS. App TypeScript, Functions TypeScript,30/30 Functions unit tests, all listed local regression commands,13/13 transport/project isolation cases,5/5 negative launcher preflights, rules parity, syntax and whitespace checks passed. No mobile build is required for these test-only changes.
