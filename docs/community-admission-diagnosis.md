# Community admission diagnosis (Step 1B.2)

## Current closeout status (2026-10-30)

The developers have since confirmed working encrypted Community membership/access across physical iOS and Android devices, owner moderation, and approved membership persistence after a controlled emulator restart. The isolated admission and moderation acceptance suites also passed; see [the acceptance report](community-moderation-acceptance.md).

Earlier missing-invitation snapshots, not-found errors and pending-approval steps below are historical observations, not established current admission blockers. The original generic client error was never conclusively traced to a particular client exception; no speculative fix or security bypass is claimed. No new retry, debugger session, emulator restart or mobile build is required by this document.

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

helpers.authMessage retains Functions error messages, but communitySystemError recognizes only the older literal 'No community exists for that invite code.' The actual callable can return:

- functions/not-found: 'No encrypted community uses that invite code.'
- functions/not-found: 'No community uses that invite code.'
- functions/permission-denied: 'Unlock this device before continuing.'
- functions/invalid-argument: 'Invalid encrypted request.'
- functions/unavailable: 'Community maintenance is in progress. Try again shortly.'

Most become the same generic UI copy. The first two errors were reproduced with deliberately nonexistent codes; the permission error was reproduced for an authenticated user without an authorized encryption identity. The new post-restart phone logs establish the first not-found error as the captured failure. Do not infer mistyped input, a missing dependency or a needed permission change from the generic UI message.

Initial local phone-session reads showed two initialized accounts with active devices, one persisted community and one pending join request. That establishes at least one successful request, not that the reported failures are resolved. The owner reported no request visible in their UI; confirm selected community, owner account and runtime error rather than granting membership through an Admin path. Only routing/profile/encryption-state shapes and counts were printed; no private journal was read or decrypted.

## Isolated regression

```powershell
pwsh -NoProfile -File scripts/test-community-admission.ps1 -CheckOnly
pwsh -NoProfile -File scripts/test-community-admission.ps1
```

This creates unique ignored .codex/koino-admission-validation/<run> data/source/log/temp/proof/export folders. It uses loopback Auth19099, Database19001, Functions15001, Hub14400, Logging14500, Eventarc14999 and Tasks14998. The active phone backend on9099/9001/5001 is not reset or used by the test. Each CLI process also has its own temporary hub locator and empty credential/config directories.

Actual Auth SDK tokens, HTTP Functions, signed requests, real session/profile/database-adapter code, generated security rules and libsodium encryption are exercised. Only native sodium/storage and absent image-resolution boundaries are replaced for Node. Native device behavior is therefore still a limitation.

PASS: A and B each create their own community, submit reciprocal normalized invites, remain unauthorized before owner approval, reject wrong fingerprints/nonowner approval, receive real encrypted membership/key grants, decrypt historical/new shared posts and preserve private journal isolation. A third authenticated user without an encryption identity is denied. After real emulator shutdown/export/start/import, both users sign in, unlock persisted device grants and decrypt both memberships/histories again.

The launcher compiles Functions directly into its private run tree. It does not rewrite the generated Functions tree watched by the phone session. Early validation attempts found/fixed Windows duplicate executable lookup and unsupported absolute Functions source paths; one completed export's final rename was blocked by Windows file locking. The launcher now has path-checked completed-export recovery; complete successful runs subsequently exported/imported normally.

## Historical: Emulator-only diagnostics for existing phone binaries

The procedure below records the earlier diagnostic activation. It was subsequently completed; it is not a current instruction to restart the running phone backend or repeat admission attempts. Private addresses are deliberately collected at the prompt rather than published.

withEmulatorAdmissionDiagnostics logs resolveInvite/requestJoin start/success/failure, error code and only allowlisted fixed error messages. It excludes IDs, invitation values, names, request payloads, tokens and key material, preserves results, rethrows the same error, and logs nothing in production or for unrelated operations. Functions unit tests verify this boundary.

The two compiled modules were copied to the generated local phone Functions source with backups under the ignored isolated test run. No Auth/Database service or data was restarted/reset. However Firebase CLI15.34.1's watcher ignores dot-directory paths, including this source under .codex. An unauthenticated diagnostic probe was rejected before any database read/write and confirmed the hot reload had not activated logging. Therefore a graceful phone launcher restart is required to activate it; no new EAS binary is required.

1. In the existing phone launcher terminal press Ctrl+C once; wait for Export complete. If export fails, preserve the output and stop rather than launching fresh data.
2. Restart from the repository:

```powershell
$PcIp = Read-Host 'PC Tailscale IPv4 address'
$PhoneA = Read-Host 'iPhone Tailscale IPv4 address'
$PhoneB = Read-Host 'Android Tailscale IPv4 address'
.\scripts\start-emulator-devices.ps1 `
  -Network Tailscale `
  -ListenAddress $PcIp `
  -DeviceAddress @($PhoneA, $PhoneB)
```

3. Retry one join on iPhone, then Android, using the exact displayed code. Keep the existing accounts and exports; do not reinstall/clear data or create unauthorized membership records.
4. Inspect only the 'KOINO emulator admission' records in the launcher/root firebase-debug.log. A failed resolveInvite distinguishes lookup/preflight; a failed requestJoin distinguishes request authorization. If resolveInvite succeeds without requestJoin starting, investigate native sealing/client state. If neither starts, inspect encrypted profile preparation and client-side error output.
5. If both succeed but the UI still reports failure/no request, confirm the owner selected the target community and investigate UI subscription/visibility. Do not mistake a pending request for granted membership.

## Historical: Local validation

- Isolated real Auth+RTDB+Functions reciprocal admission and restart/import: PASS, before and after diagnostic wrapper.
- Functions TypeScript and unit tests:30/30 PASS.
- App TypeScript, script syntax and git diff --check: PASS.
- No app build, Firebase deployment, paid service, commit or push.

At that stage, the remaining diagnostic question was the physical failure's actual operation/code/message. Later successful admission and membership testing supersedes this as a closeout gate; the original client exception remains unproven. A speculative client rebuild was not justified.

## Historical: Captured physical retries after the diagnostic restart

The current firebase-debug.log confirms normal Auth/RTDB import, the europe-west1-encryptedAccount endpoint, and three Auth VALID callable executions. Its six admission markers are three resolveInvite start/failure pairs, each with code not-found and the safe message 'No encrypted community uses that invite code.' No requestJoin marker follows. The compiled generated source contains the diagnostic wrapper and the runtime records prove it executed.

Therefore the failure is inside the server's exact invitation-index lookup, after authentication, active-device signature/replay preflight and client profile preparation. It occurs before the client seals its name or asks for membership. All captured attempts have the same immediate failure; the logs do not label devices, so do not assign individual timestamps to iPhone versus Android without another signal.

Read-only routing consistency checks on the current demo-koino-default-rtdb namespace found one encrypted community, one authority and one invitation index entry. The persisted group's six-character uppercase code exactly matches that entry and points to the same authority/owner. There is no legacy invitation entry. No missing index for that stored community was established, so repairing or bypassing the index would be speculative and unsafe. The expected second persisted community was absent from this snapshot.

The passing automated test creates two communities and joins using each newly read stored code. The phone flow diverges at resolveInvite. The current logs deliberately do not contain attempted invitation values, and no installed APK/IPA bundle is available here for byte-level verification. The source normalization and callable protocol are unchanged by the earlier UI correction; both runtime calls reached the correct isolated backend. Stale display/input, selection or another data mismatch remain possibilities, not proven causes.

### Next read-only check; no rebuild or restart

Historical lookup procedure, retained for reproducibility and its mocked regression test. It is not a new request to inspect or modify the active session. The literal Bearer owner below is the local emulator administrative marker, not a production credential; the endpoint is restricted to the local demo namespace.

On each phone select the intended owner's Community and copy its currently displayed invitation code. On the Windows host run this in Windows PowerShell5.1 or PowerShell7. Input is masked and only FOUND/ABSENT/FORMAT_INVALID/INVALID_RESPONSE/READ_FAILED is printed. JSON is parsed explicitly; the lookup never treats a literal string as an invitation record. This reads routing metadata only and does not submit join requests or grant access.

```powershell
$ProgressPreference = 'SilentlyContinue'
foreach ($ownerDevice in @('iPhone', 'Android')) {
  $secureCode = Read-Host -Prompt "$ownerDevice-owned Community code" -AsSecureString
  $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCode)
  try {
    $code = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer).Trim().ToUpperInvariant()
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
    $secureCode.Dispose()
  }
  $entry = $null
  $result = 'FORMAT_INVALID'
  if ($code -cmatch '^[A-Z0-9]{6}$') {
    try {
      $uri = 'http://127.0.0.1:9001/encryptedData/inviteCodes/' + $code + '.json?ns=demo-koino-default-rtdb'
      $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $uri -Headers @{ Authorization = 'Bearer owner' } -TimeoutSec 5 -ErrorAction Stop
      $body = $response.Content.Trim()
      $entry = ConvertFrom-Json -InputObject $body -ErrorAction Stop
      $result = if (($body -ceq 'null') -and ($null -eq $entry)) {
        'ABSENT'
      } elseif ($body.StartsWith('{') -and
                ($entry -is [System.Management.Automation.PSCustomObject]) -and
                ($null -ne $entry.PSObject.Properties['groupId']) -and
                ($entry.groupId -is [string]) -and
                ($entry.groupId -cmatch '^[A-Za-z0-9_-]{1,160}$')) {
        'FOUND'
      } else {
        'INVALID_RESPONSE'
      }
    } catch { $result = 'READ_FAILED' }
  }
  [pscustomobject]@{ CommunityOwnerDevice = $ownerDevice; Result = $result }
  $code = $null
  $entry = $null
  $body = $null
  $response = $null
  $uri = $null
}
```

Share only the two result rows, never the codes. FOUND means that exact displayed code exists in this running backend; retry by pasting that same code into the other phone. ABSENT localizes the remaining problem to the displayed/selected Community versus current persisted backend state. FORMAT_INVALID means the value is not a current app-created six-character code. INVALID_RESPONSE means the endpoint did not return a valid invitation record or JSON null. READ_FAILED is a local metadata connectivity/parsing error, not a missing invitation.

No source/runtime files, running services or active data were changed during this follow-up inspection; only this diagnosis document was updated. No new mobile build is justified until this comparison locates the mismatch. A later client display/input correction would require new binaries because Updates are disabled; no such correction is confirmed yet.


## Historical: Invitation lookup discrepancy: read-only investigation, 2026-10-27

The fourth captured physical request in that diagnostic snapshot reached resolveInvite. It passed callable Auth verification and reached the exact index lookup after signed-device validation. It failed with not-found and the allowlisted message 'No encrypted community uses that invite code.' No requestJoin followed. The existing logs do not record the received code; they cannot prove that it equals either displayed code.

Read-only checks of the still-running phone backend found one invitation, one encrypted community and one authority. The invitation has the current six-character uppercase format and matches the stored community code and ID. The community owner matches the authority owner, is an authority member, and the authority is ready. There is no orphaned index in this snapshot. The reported two FOUND results cannot establish two distinct entries without comparing the two inputs; this remains unresolved, not evidence of a missing index to repair.

A temporary localhost-only Node inspector probe checked the actual cached Admin module in both warm Functions workers. Both returned demoProject=true, namespaceMatches=true for demo-koino-default-rtdb, and knownIndexEntryFound=true. The same known routing key was found by SDK and REST. This rules out a general project/namespace/path mismatch for that entry. It does not establish which code the failed physical request supplied.

Source inspection finds trim/uppercase normalization before signing; the RoomCodeCopy component copies the stored string verbatim, and the join input has no truncation. The server validates the signed data.code and uses it directly as the index key. No expiration is applied. The automated test uses each newly persisted code and succeeds; the physical divergence is at the lookup, before name sealing or membership requests. The installed binaries were not available for byte-level inspection, so their exact in-memory input must still be observed.

No admission behavior, security rule, encryption check or active database data was changed. The generic message also has a verified explanation: communitySystemError recognizes an older not-found sentence, so the actual callable sentence falls through to generic copy. Changing that copy alone would not repair admission.

### Historical comparison procedure with existing mobile builds

scripts/inspect-live-community-admission.mjs discovers only warm Functions workers belonging to the CLI listening on loopback port5001. It verifies demo-only runtime configuration, reads only local routing metadata, and sets a conditional resolver breakpoint. It returns boolean/count comparisons of the received value, displayed values and current index. It does not save payloads, codes, identifiers, tokens, keys or heap dumps. While one request is paused, the REST index is read and pure comparisons are evaluated; the worker is immediately resumed. Do not create/delete Communities concurrently with this diagnostic, because the two reads occur at slightly different times.

Open a second PowerShell7 terminal in the repository, leaving the phone emulator launcher running. Enter the two currently displayed codes into these masked prompts; do not post them in chat:

```powershell
$iphoneInvite = (Read-Host -Prompt 'iPhone-owned Community code' -MaskInput).Trim().ToUpperInvariant()
$androidInvite = (Read-Host -Prompt 'Android-owned Community code' -MaskInput).Trim().ToUpperInvariant()
try {
  @{ codes = @($iphoneInvite, $androidInvite) } | ConvertTo-Json -Compress |
    node .\scripts\inspect-live-community-admission.mjs --displayed-codes-stdin --timeout 180
} finally {
  $iphoneInvite = $null
  $androidInvite = $null
}
```

The displayed_code_probe reports only input count, distinct input count and exact index-match flags in iPhone/Android order. Wait for stage ready, then retry Join exactly once on iPhone by pasting the Android owner's current code. Leave Android idle. The captured record reports only received string length and boolean input/index/SDK consistency comparisons. Share only those JSON records. The captured matchesDisplayedCodes array uses the same iPhone/Android order. At the end cleanup must report inspectorPortsClosed=true. A timeout means no request was captured; rerun the command before another retry. No emulator restart or mobile build is needed. Do not forcibly kill the diagnostic: allow its bounded timeout or normal Ctrl+C cleanup.

The debugger binds only to127.0.0.1 and refuses occupied diagnostic ports. Cleanup removes breakpoints, resumes paused workers, restores the original debug port, closes inspectors and verifies closure. Access-denied errors from Windows process inspection require a terminal with permission to inspect the existing launcher workers; they do not justify changing firewall access. No new public or Tailscale listener is created.

The three-minute observation window during this investigation captured no new phone attempt and closed all inspectors. Subsequent repeated one-second runs also closed all inspectors and verified automatic worker discovery. The masked-input test used the same existing key twice solely to test the diagnostic; it was not a measurement of the actual two displayed phone codes. Four synthetic comparison fixtures passed for exact match, absence, normalization difference and mismatched target. The real received-value capture remains unverified until the next physical retry.

Validation rerun: app TypeScript PASS; Functions TypeScript and30/30 unit tests PASS; emulator client/outbound isolation checks PASS; full separate Auth19099/RTDB19001/Functions15001 reciprocal admission plus shutdown/export/restart/import PASS. The active phone services on9099/9001/5001 were not restarted or reset. No behavioral fix or new failure-specific admission regression is claimed while the actual received-value mismatch remains unknown.


## Historical: Confirmed diagnostic false positive: Windows PowerShell5.1

The user confirmed that the two displayed phone codes are different and the earlier two FOUND results were produced in Windows PowerShell5.1.22621.6133. A read-only live reproduction in that exact installed version found that Invoke-RestMethod returns the Firebase response null as the literal string "null". The old non-null predicate therefore returned FOUND for a deliberately absent routing key. The valid entry also returned FOUND. This explains why those two results did not prove that two distinct invitation entries existed.

The same existing/missing checks in installed PowerShell7.6.5 and7.6.9 correctly returned a null value for absence. No claim is made about an uninstalled7.6.8 version. Explicit Invoke-WebRequest.Content plus ConvertFrom-Json correctly returned actual null in5.1, and requiring a valid object/groupId rejected literal strings and malformed records. The published check above now uses that approach and a masked prompt supported by both5.1 and7.

This is a confirmed diagnostic bug, not a completed mobile admission fix. The live backend still contains one invitation, one community and one authority. The server's resolveInvite not-found is compatible with a genuinely missing submitted code. Which of the two currently displayed codes is absent, and why that phone displays it, still requires the corrected masked lookup. Do not reconstruct indexes, clear data or change membership authorization based on the old FOUND results.

The regression script scripts/validate-community-invitation-lookup.ps1 runs the actual published lookup block with mocked input/HTTP only. It covers valid records, JSON null, literal "null", missing/invalid references, arrays, invalid JSON, request failures, format rejection and a valid response followed by null. It makes no real network request and accepts no production endpoint.


The corrected published lookup regression passed28/28 checks in each installed shell: Windows PowerShell5.1.22621.6133, Codex PowerShell7.6.5 and Windows app PowerShell7.6.9. All regression HTTP calls were mocked. The separate live existing/absent probe used read-only GETs and disclosed only counts and null/type flags; it reproduced the old false FOUND result in5.1 and verified explicit parsing returns ABSENT. No phone retry, debugger, emulator restart, application change or data write was performed during this follow-up. Existing mobile builds remain usable for the corrected lookup and subsequent captured retry; the phone's actual missing/stale-code origin is not yet established.


## Historical: New Android attempt with the verified iPhone invitation: 2026-10-27

That later Functions log snapshot showed five resolveInvite start/success pairs and five requestJoin start/success pairs, with no admission failure marker, error code or sanitized error message. The earlier resolveInvite/not-found records preceded these successful attempts and must not be used to describe them. Logs alone do not label device identity; read-only replay metadata confirms all ten recent signed operations came from the initialized non-owner who has the pending request.

Read-only routing checks still find one invitation, one encrypted Community, one authority and two initialized encrypted accounts. The invitation matches the stored Community code/ID and existing authority; the owner matches, is an initialized member, and authority status is ready. One pending requester exists for this Community, is not already a member, and its public encryption identity matches its account. The sealed pending request differs from the prior export, confirming new request activity. No names or private content were decrypted. Repeated requestJoin calls overwrite the same requester slot rather than creating five pending members.

The server still validates data.code and reads /encryptedData/inviteCodes/{code} in demo-koino-default-rtdb. Successful resolveInvite and the following requestJoin establish that the current submitted code resolved; this is consistent with the corrected PowerShell FOUND result. The subsequent request also establishes that the Android path received the owner's public identity and sealed the request successfully. There is no evidence of an excluded callable, wrong namespace, permission bypass or missing native encryption dependency in these new attempts.

A successful request sends an encrypted access request; it does not grant membership or shared content keys. The passing isolated test exercises this same boundary and explicitly checks denial before trusted owner approval. It does not mount the native join sheet or reproduce its generic error display.

The exact client error remains unconfirmed. Current source returns response.data from invoke and performs no extra persistence after requestJoin in groupJoinRequest. A server success marker occurs before response delivery, so transport/response handling can still fail. Separately, RoomSwitcherSheet renders global authError; profile, membership and other subscriptions can populate that error independently of the join operation. Neither mechanism has been established as the actual cause on the installed Android binary. Do not change network guards, permissions, encryption or admission behavior on this evidence.

### Historical missing Android-owned Community, investigated separately

The phone export preceding those successful requests already contains one encrypted Community, one authority and one invitation with consistent links. Its two encrypted accounts have membership counts0 and1. Thus the most recent import did not selectively lose a second stored Community. No earlier phone export is available, and the current Functions log begins after this export, so it cannot prove whether the missing Community never persisted, disappeared earlier or remains on Android as stale display state.

Creation atomically publishes authority, Community, invitation and both membership records. The client caches keys/authority before the callable but does not optimistically add a displayable Community/invite row. Rendered groups come from membership/group subscriptions. Existing in-memory rows can remain after a group subscription error because that listener lacks an error callback, but this is an unconfirmed stale-display mechanism, not a diagnosis. Do not clear app data, reconstruct an index or recreate the Community to conceal the discrepancy.

### Historical approval procedure with existing builds

1. On iPhone select its owned Community, then open Identity & Support -> Encryption & Devices. A Community access request should be visible for the pending requester. No additional Join submission is necessary.
2. On Android open Encryption & Devices and compare its account identity fingerprint with the request on iPhone through the trusted developer channel. Never paste fingerprints, recovery codes or invitation codes into logs/chat.
3. If they match, the iPhone owner can use the existing Approve full history access action and enter the verified fingerprint. This is the normal encrypted membership/key-grant flow; it does not expose private journals.
4. Observe whether Android receives the membership and can select/read the iPhone-owned Community. Report request visibility, approval success/failure and whether the Join sheet closes; do not report sensitive values.

If the request is invisible or the generic error persists, the remaining evidence needed is client-side: whether the Join promise resolved/rejected, the safe error code/category and whether the sheet closed. At that stage, no ADB command/server was available on the diagnostic host, so Android runtime errors could not be collected here. A developer with a trusted USB/authorized ADB connection can inspect only the emulator app's process logs locally without rebuilding; do not share a full logcat dump. No new EAS binary or emulator restart is justified solely by these successful server records.

This investigation changes only this diagnosis document. No application/Functions/rules behavior or active phone data was changed; no debugger or additional phone listener was started.


The iPhone owner subsequently confirmed that the Community access request is visible in Encryption & Devices. This independently confirms owner-side delivery and rules out a missing access request as the current blocker. At that stage, the next verification was trusted fingerprint comparison and normal owner approval, followed by Android membership delivery; the later successful membership tests supersede that pending status. The generic error's specific client exception/callback remains unconfirmed; no speculative client change was made.

Fresh local validation for this follow-up: app TypeScript PASS; Functions build and30/30 unit tests PASS; emulator client/outbound isolation checks PASS; Windows PowerShell5.1 documented lookup regression28/28 PASS. The full isolated admission/restart test was not rerun for this documentation-only investigation; its previous passing result does not prove the native error display is fixed. No emulator restart, active data write, app build, deployment or Git mutation was performed.
