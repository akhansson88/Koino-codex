# Community admission diagnosis (Step 1B.2)

## Current closeout status (2026-10-30)

The developers have since confirmed working encrypted Community membership/access across physical iOS and Android devices, owner moderation, and approved membership persistence after a controlled emulator restart. The isolated admission and moderation acceptance suites also passed; see [the acceptance report](community-moderation-acceptance.md).

Earlier missing-invitation snapshots, not-found errors and pending-approval records below are historical observations, not established current admission blockers. The original generic client error was never conclusively traced to a particular client exception; no speculative fix or security bypass is claimed. No new retry, debugger session, emulator restart or mobile build is required by this document.

## Historical status at the end of the admission investigation

At that stage, Android retries passed both resolveInvite and requestJoin, and an owner-visible pending request existed. Trusted fingerprint verification and owner approval were the next steps; these preceded the later successful membership testing. One earlier Android-owned invitation remained absent from that diagnostic snapshot. No invitation, signature, identity, membership, security-rule or encryption checks were weakened.

## Verified flow

1. RoomSwitcher calls store joinGroup -> profile-operations.joinGroupByInvite.
2. The client trims and uppercases the code, then ensureProfile reads/decrypts and updates the current user's encrypted profile.
3. session.groupJoinRequest requires the signed-in user's unlocked device/account. Its signed resolveInvite callable looks up encryptedData/inviteCodes and returns the owner's public encryption identity.
4. The requester seals their name to that owner and sends signed requestJoin. The server checks authenticated UID, active signed device, bounded request timestamp/replay ID, authoritative account identity and invite lookup.
5. This creates a pending e2eeJoinRequests entry; it does not grant membership or disclose a group key.
6. The owner selects their own community, opens Encryption & Devices, compares the requester's identity fingerprint through a trusted channel and approves it. The signed groupChange atomically stores authority/grants and encrypted groupMembers/userGroups records. Only then can the member decrypt/write shared content.

The demo Functions entry exports encryptedAccount and allows setup, backup, createGroup, resolveInvite, requestJoin and groupChange. No admission dependency was excluded. External storage, payments and push remain disabled. New app-created codes are uppercase six-character routing keys. Existing lookup has no automatic expiration timestamp; a code must exist and point to an existing authority. Invalid/missing codes are rejected. Do not add an expiration or bypass as a speculative fix.

## Historical: Errors hidden by the existing UI

At the time, helpers.authMessage retained Functions error messages, but communitySystemError recognized only the older literal 'No community exists for that invite code.' The callable could return these errors.

- functions/not-found: 'No encrypted community uses that invite code.'
- functions/not-found: 'No community uses that invite code.'
- functions/permission-denied: 'Unlock this device before continuing.'
- functions/invalid-argument: 'Invalid encrypted request.'
- functions/unavailable: 'Community maintenance is in progress. Try again shortly.'

Most became the same generic UI copy. The first two errors were reproduced with deliberately nonexistent codes; the permission error was reproduced for an authenticated user without an authorized encryption identity. The post-restart phone logs established the first not-found error as the captured failure. The generic UI message alone did not establish mistyped input, a missing dependency or a needed permission change.

Initial local phone-session reads showed two initialized accounts with active devices, one persisted community and one pending join request. That established at least one successful request. The owner initially reported seeing no request in their UI. Only routing/profile/encryption-state shapes and counts were printed; no private journal was read or decrypted.

## Isolated regression

```powershell
pwsh -NoProfile -File scripts/test-community-admission.ps1 -CheckOnly
pwsh -NoProfile -File scripts/test-community-admission.ps1
```

Each run writes its data, Functions source, logs, temporary files, proofs and exports to a unique ignored `.codex/koino-admission-validation/<run>/` directory. It uses loopback Auth (19099), Database (19001), Functions (15001), Hub (14400), Logging (14500), Eventarc (14999) and Tasks (14998). Each CLI process has a private temporary hub locator and empty credential and configuration directories.

Actual Auth SDK tokens, HTTP Functions, signed requests, real session/profile/database-adapter code, generated security rules and libsodium encryption are exercised. Only native sodium/storage and absent image-resolution boundaries are replaced for Node. Native device behavior is therefore still a limitation.

PASS: A and B each create their own community, submit reciprocal normalized invites, remain unauthorized before owner approval, reject wrong fingerprints/nonowner approval, receive real encrypted membership/key grants, decrypt historical/new shared posts and preserve private journal isolation. A third authenticated user without an encryption identity is denied. After real emulator shutdown/export/start/import, both users sign in, unlock persisted device grants and decrypt both memberships/histories again.

The launcher compiles Functions directly into its private run tree. Early validation attempts found/fixed Windows duplicate executable lookup and unsupported absolute Functions source paths; one completed export's final rename was blocked by Windows file locking. The launcher now has path-checked completed-export recovery; complete successful runs subsequently exported/imported normally.

## Historical diagnostics from the standalone Emulator app

withEmulatorAdmissionDiagnostics logs resolveInvite/requestJoin start/success/failure, error code and only allowlisted fixed error messages. It excludes IDs, invitation values, names, request payloads, tokens and key material, preserves results, rethrows the same error, and logs nothing in production or for unrelated operations. Functions unit tests verify this boundary.

The two compiled modules were copied to the generated local phone Functions source with backups under the ignored isolated test run. Auth and Database stayed running during the copy. However the Firebase CLI 15.34.1 watcher ignored dot-directory paths, including this source under .codex. An unauthenticated diagnostic probe was rejected before any database read/write and confirmed the hot reload had not activated logging.

## Historical: Local validation

- Isolated real Auth+RTDB+Functions reciprocal admission and restart/import: PASS, before and after diagnostic wrapper.
- Functions TypeScript and unit tests:30/30 PASS.
- App TypeScript, script syntax and git diff --check: PASS.
- No app build, Firebase deployment, paid service, commit or push.

At that stage, the remaining diagnostic question was the physical failure's actual operation/code/message. Later successful admission and membership testing superseded that closeout gate. The original client exception remains unproven. A speculative client rebuild was not justified.

## Historical: Captured physical retries after the diagnostic restart

The historical firebase-debug.log confirmed normal Auth/RTDB import, the europe-west1-encryptedAccount endpoint, and three Auth VALID callable executions. Its six admission markers comprised three resolveInvite start/failure pairs, each with code not-found and the safe message 'No encrypted community uses that invite code.' No requestJoin marker followed. The compiled generated source contained the diagnostic wrapper and the runtime records showed it executed.

The failure was inside the server's exact invitation-index lookup, after authentication, active-device signature/replay preflight and client profile preparation. It occurred before the client could seal its name or ask for membership. All captured attempts had the same immediate failure. The logs lacked device labels, so the investigation could not attribute individual timestamps to iPhone or Android.

Read-only routing consistency checks in the demo-koino-default-rtdb namespace found one encrypted community, one authority and one invitation index entry. The persisted group's six-character uppercase code exactly matched that entry and pointed to the same authority/owner. The snapshot had no legacy invitation entry. No missing index for that stored community was established, so repairing or bypassing the index would be speculative and unsafe. The expected second persisted community was absent from this snapshot.

The passing automated test creates two communities and joins using each newly read stored code. The phone flow diverged at resolveInvite. The logs omitted attempted invitation values, and installed binaries were unavailable for byte-level verification. The source normalization and callable protocol are unchanged by the earlier UI correction; both runtime calls reached the correct isolated backend. Stale display/input, selection or another data mismatch remained possible causes.

The follow-up inspection updated only this diagnosis document. A display or input correction for those binaries would have required a new build because Updates were disabled. The investigation did not establish such a correction.

## Historical: Invitation lookup discrepancy: read-only investigation, 2026-10-27

The fourth captured physical request in that diagnostic snapshot reached resolveInvite. It passed callable Auth verification and reached the exact index lookup after signed-device validation. It failed with not-found and the allowlisted message 'No encrypted community uses that invite code.' No requestJoin followed. The logs did not record the received code, so they could not establish whether it matched either displayed code.

Read-only checks of the still-running phone backend found one invitation, one encrypted community and one authority. The invitation had the six-character uppercase format and matched the stored community code and ID. The Community owner matched the authority owner and was an authority member. The authority was ready and the snapshot showed no orphaned index. The reported two FOUND results did not establish two distinct entries.

A temporary localhost-only Node inspector probe checked the actual cached Admin module in both warm Functions workers. Both returned demoProject=true, namespaceMatches=true for demo-koino-default-rtdb, and knownIndexEntryFound=true. The same known routing key was found by SDK and REST. This ruled out a general project/namespace/path mismatch for that entry. It did not establish which code the failed physical request supplied.

Source inspection found trim/uppercase normalization before signing. The RoomCodeCopy component copied the stored string verbatim, and the join input did not truncate it. The server validates the signed data.code and uses it directly as the index key. No expiration is applied. The automated test uses each newly persisted code and succeeds; the physical divergence is at the lookup, before name sealing or membership requests. The installed binaries were unavailable for byte-level inspection, so the exact in-memory input remained unverified.

No admission behavior, security rule, encryption check or active database data was changed. The investigation also verified why the UI showed a generic message. communitySystemError recognized an older not-found sentence, so the actual callable sentence fell through to generic copy. Changing that copy alone would not repair admission.

The three-minute observation window during this investigation captured no new phone attempt and closed all inspectors. Subsequent repeated one-second runs also closed all inspectors and verified automatic worker discovery. The masked-input test used the same existing key twice solely to test the diagnostic; it was not a measurement of the actual two displayed phone codes. Four synthetic comparison fixtures passed for exact match, absence, normalization difference and mismatched target. The failed request's received value remained unverified.

Validation rerun: app TypeScript PASS; Functions TypeScript and30/30 unit tests PASS; emulator client/outbound isolation checks PASS; full separate Auth19099/RTDB19001/Functions15001 reciprocal admission plus shutdown/export/restart/import PASS. The active phone services stayed running with their existing data. The actual received-value mismatch remained unknown.

## Historical: Confirmed diagnostic false positive: Windows PowerShell5.1

The user confirmed that the two displayed phone codes were different and the earlier two FOUND results were produced in Windows PowerShell5.1.22621.6133. A read-only live reproduction in that exact installed version found that Invoke-RestMethod returned the Firebase response null as the literal string "null". The old non-null predicate therefore returned FOUND for a deliberately absent routing key. The valid entry also returned FOUND. This explains why those two results did not prove that two distinct invitation entries existed.

The same existing/missing checks in installed PowerShell7.6.5 and7.6.9 correctly returned a null value for absence. No claim is made about an uninstalled7.6.8 version. Explicit Invoke-WebRequest.Content plus ConvertFrom-Json correctly returned actual null in5.1, and requiring a valid object/groupId rejected literal strings and malformed records.

That confirmed a diagnostic bug. The backend snapshot still contained one invitation, one community and one authority. The server's resolveInvite not-found is compatible with a genuinely missing submitted code. Which of the displayed codes was absent, and why that phone displayed it, remained unverified.

The retained regression fixture runs the lookup with mocked input/HTTP only. It covers valid records, JSON null, literal "null", missing/invalid references, arrays, invalid JSON, request failures, format rejection and a valid response followed by null. [Invitation lookup regression](../scripts/validate-community-invitation-lookup.ps1)

The corrected lookup regression passed28/28 checks in each installed shell: Windows PowerShell5.1.22621.6133, Codex PowerShell7.6.5 and Windows app PowerShell7.6.9. All regression HTTP calls were mocked. The separate live existing/absent probe used read-only GETs and disclosed only counts and null/type flags; it reproduced the old false FOUND result in5.1 and verified explicit parsing returns ABSENT. No phone retry, debugger, emulator restart, application change or data write was performed during this follow-up. The phone’s actual missing/stale-code origin remained unverified.

## Historical: New Android attempt with the verified iPhone invitation: 2026-10-27

That later Functions log snapshot showed five resolveInvite start/success pairs and five requestJoin start/success pairs, with no admission failure marker, error code or sanitized error message. The earlier resolveInvite/not-found records preceded these successful attempts. Logs alone do not label device identity; read-only replay metadata confirmed all ten recent signed operations came from the initialized non-owner with the pending request.

Read-only routing checks still found one invitation, one encrypted Community, one authority and two initialized encrypted accounts. The invitation matched the stored Community code/ID and existing authority. The owner matched, was an initialized member, and the authority was ready. The Community had one pending requester outside the membership whose public encryption identity matched its account. The sealed pending request differs from the prior export, confirming new request activity. No names or private content were decrypted. Repeated requestJoin calls overwrite the same requester slot rather than creating five pending members.

The server validated data.code and read /encryptedData/inviteCodes/{code} in demo-koino-default-rtdb. Successful resolveInvite and the following requestJoin established that the submitted code resolved. This was consistent with the corrected PowerShell FOUND result. The subsequent request also established that the Android path received the owner's public identity and sealed the request successfully. There is no evidence of an excluded callable, wrong namespace, permission bypass or missing native encryption dependency in these new attempts.

A successful request sends an encrypted access request; it does not grant membership or shared content keys. The passing isolated test exercises this same boundary and explicitly checks denial before trusted owner approval. It does not mount the native join sheet or reproduce its generic error display.

The exact client error remains unconfirmed. Source at the time returned response.data from invoke and performed no extra persistence after requestJoin in groupJoinRequest. A server success marker occurs before response delivery, so transport/response handling can still fail. Separately, RoomSwitcherSheet renders global authError. Profile, membership and other subscriptions can populate that error independently of the join operation. Neither mechanism has been established as the actual cause on the installed Android binary.

### Historical missing Android-owned Community, investigated separately

The phone export preceding those successful requests already contained one encrypted Community, one authority and one invitation with consistent links. Its two encrypted accounts had membership counts of zero and one. Thus the most recent import did not selectively lose a second stored Community. No earlier phone export was available, and the Functions log began after this export, so it could not establish whether the missing Community never persisted, disappeared earlier or remained on Android as stale display state.

Creation atomically publishes authority, Community, invitation and both membership records. The client caches keys/authority before the callable but does not optimistically add a displayable Community/invite row. Rendered groups come from membership/group subscriptions. Existing in-memory rows can remain after a group subscription error because that listener lacks an error callback, but this is an unconfirmed stale-display mechanism, not a diagnosis.

The outstanding client-side evidence was whether the Join promise resolved or rejected, the safe error code or category and whether the sheet closed. At that stage, no ADB command/server was available on the diagnostic host, so Android runtime errors could not be collected here.

This follow-up changed only this diagnosis document. Application, Functions and rules behavior and the active phone data stayed the same.

The iPhone owner subsequently confirmed that the Community access request was visible in Encryption & Devices. This independently confirmed owner-side delivery. At that stage, the next verification was trusted fingerprint comparison and normal owner approval, followed by Android membership delivery. The later successful membership tests superseded that pending status. The generic error's specific client exception/callback remains unconfirmed; no speculative client change was made.

Fresh local validation for this follow-up: app TypeScript PASS; Functions build and30/30 unit tests PASS; emulator client/outbound isolation checks PASS; Windows PowerShell5.1 documented lookup regression28/28 PASS. The full isolated admission/restart test was not rerun for this documentation-only investigation; its previous passing result does not prove the native error display is fixed. No emulator restart, active data write, app build, deployment or Git mutation was performed.
