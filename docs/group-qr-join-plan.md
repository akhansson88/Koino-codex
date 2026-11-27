# Group joining by QR code

Plan for letting someone join a KOINO community by scanning that community's QR code: a member shows the code, a non-member scans it, and the result is either a join request (private community) or immediate membership (open community).

Status: planned 26 November 2026. Updated 27 November 2026: the QR now
encodes `https://koinolabs.com/join/?code=…`; the HTTPS landing page, iOS
Universal Links and Android App Links are live. See `join/README.md` and
section 11 of the two-phone plan. The app-scheme fallback still exists for
builds that predate app links.

---

## 1. Product decisions

**Two join policies per community**

| Policy | Swedish UI | Behaviour when a non-member scans |
| --- | --- | --- |
| `approval` (default) | *Endast efter godkännande* | A join request is created and the host/leaders see it under Member requests, exactly like today's invite-code flow. |
| `open` | *Alla med QR-koden* | The person becomes a member at once, with no host action. |

- Every existing community keeps `approval`; the field being absent means `approval`.
- For a private community the host also chooses **who approves**: only the host (default) or the host together with the community's **gruppledare** (the existing group-leader role). All UI copy and docs use *gruppledare*, never "administratör". A gruppledare can then see and act on pending requests, but can never change the policy itself.
- Only the community host can change the policy or the approver setting. Any member can show the QR.
- The QR encodes only the invite code, never the group id, name or member data: `koino://join?code=ABC123`. The server resolves the code, so the payload stays small and a screenshot leaks no more than the code already visible in the community.
- Scanning never joins silently. The scanner first shows a small preview (name, member count, policy) with one clear button: **Gå med** (open) or **Begär medlemskap** (approval). This prevents accidental joins from a stray code while still making an open group a single tap.
- A person who was rejected by the host cannot bypass the rejection by scanning again. A person who left or was removed can scan again, but their join goes back to the host as a request instead of auto-joining — removing someone must never be undoable by an old QR.
- Open communities stay capped at 200 members (the existing community ceiling).

**Where the QR lives**

- Room details → Invite card: a new **Visa QR-kod** action next to Share/Code.
- A dedicated invite screen with a large QR, the code, policy badge, copy and share.
- The scanner is reachable from: the invite screen, the "Join or create" sheet, onboarding's join step, and a deep link.

---

## 2. Data model

`Group` gains two optional fields:

```ts
joinPolicy?: "approval" | "open"; // absent = "approval"
joinApprovers?: "owner" | "owner_and_leaders"; // absent = "owner"; only used when joinPolicy is "approval"
```

Stored twice, written only by the server callable:

- `encryptedData/groups/<groupId>/joinPolicy` and `joinApprovers` — read by members, shown in the app.
- `e2eeGroups/<groupId>/joinPolicy` and `joinApprovers` — read by the join and approval callables and by rules-side tooling.

`e2eeGroups/<groupId>` also keeps `memberCount` derivable from `members`; no denormalised counter is added.

---

## 3. Backend contract (`functions/src/account.ts`)

### `createGroup`
Accept `records.group.joinPolicy` and `records.group.joinApprovers` when present. Validate both enums, default to `approval` / `owner`, and write them to both locations.

### `setJoinPolicy` (new operation)
```
{ operation: "setJoinPolicy", data: { groupId, joinPolicy, joinApprovers } }
```
- Requires a verified email and `e2eeGroups/<groupId>.ownerId === uid`.
- Validates `joinPolicy ∈ {approval, open}` and `joinApprovers ∈ {owner, owner_and_leaders}`.
- Updates `e2eeGroups/<groupId>/joinPolicy`, `e2eeGroups/<groupId>/joinApprovers`, the same two fields under `encryptedData/groups/<groupId>`, and `updatedAt` in one update.
- `joinApprovers` is stored even while the community is open, so switching back to approval keeps the host's choice.
- Idempotent: returns `{}` when unchanged.

### `resolveInvite` (new operation)
```
{ operation: "resolveInvite", data: { code } }
→ { groupId, name, joinPolicy, joinApprovers, memberCount, alreadyMember, requestStatus? }
```
- Requires auth (not necessarily a verified email — the join itself still requires it).
- Normalises the code (trim, upper case), rejects unknown codes with `not-found`.
- Returns only what the preview card needs. No member identities, no invite list.
- `requestStatus` is the caller's own `pending | approved | rejected | closed` status where one exists.
- If the community was deleted, return `not-found`.

### `joinGroup` (extended)
After resolving the invite, in this order:

1. Already a member → `{ status: "approved", joined: true }` (idempotent, clears any stale request).
2. Previously rejected → `{ status: "rejected" }` (unchanged).
3. `joinPolicy === "open"` **and** no `e2eeDepartures/<groupId>/<uid>` entry **and** member count `< 200`:
   - Add `e2eeGroups/<groupId>/members/<uid>` = `{ id, userId, role: "member", joinedAt }`.
   - Write the membership mirrors `encryptedData/groupMembers/<groupId>/<uid>` and `encryptedData/userGroups/<uid>/<groupId>` (same record shape as `approveJoin`).
   - Clear `e2eeJoinRequests/<groupId>/<uid>`, clear `e2eeDepartures/<groupId>/<uid>`, set the caller's status `approved`.
   - Return `{ groupId, status: "approved", joined: true }`.
4. Otherwise create/refresh the pending request as today and return `{ status: "pending" }`.

Everything runs in one `db().ref().update()` after a fresh read of the group, so a policy flip or member removal cannot race a join into an inconsistent state. The existing `joinGroup` action limit (3/day, 10/week) stays; a rate-limited scan shows "Too many attempts, try again later".

The client's `JoinRequestReceipt` gains `joined?: boolean` so the scanner can distinguish "you are in" from "you were already approved".

### Request handling permissions
Replace the owner-only `requireGroup(groupId, uid, true)` in `listGroupRequests`, `approveJoin` and `rejectJoin` with one rule:

- The host always may.
- A member with role `leader` may **only** when `e2eeGroups/<groupId>.joinApprovers === "owner_and_leaders"`.
- Everyone else is denied.

`removeGroupLeader` takes effect immediately for this permission because it rewrites the member's role. Policy changes stay host-only. The applicant's own `listJoinRequests` is unchanged.

### Rules (`firebase.rules.json`)
- Add explicit `joinPolicy` and `joinApprovers` children under `encryptedData/groups/$groupId` with enum validation, so even a host writing the group record directly can never store another value.
- `e2eeGroups` stays client-read-only; `e2eeJoinRequests` and `e2eeJoinRequestStatuses` stay server-only. Update the `e2eeJoinRequests/$groupId` read rule so a leader can read requests when `joinApprovers` allows it; the callable remains the write path.
- No new readable collections: `resolveInvite` is the only way to resolve a code without being a member.

---

## 4. Frontend

### Dependencies
- `react-native-qrcode-svg` (pure JS, uses the already-installed `react-native-svg`) for rendering the QR. Safe for an EAS Update.
- `expo-camera` (native) for the in-app scanner, with camera permission copy in `app.config.js`. This one needs a native build.

### New routes
- `app/group-invite.tsx` — the "show the QR" screen. Large QR, community name/avatar, member count, code, policy badge (*Öppen – skanna för att gå med direkt* / *Privat – skannern skickar en förfrågan*), **Kopiera kod**, **Dela**, **Skanna en kod**. Owners also get **Ändra** opening the policy sheet.
- `app/join-scan.tsx` — camera scanner. Permission explainer, `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`, torch, a debounced single read, and a manual-code fallback always visible.
- `app/join.tsx` — deep-link landing for `koino://join?code=…` and `https://koinolabs.com/join/…` (App Link in a later phase). If signed out, it waits for sign-in and then continues; if onboarding is incomplete, it finishes onboarding first.

All three routes share one join-preview component so the flow is identical whatever opened it.

### Policy sheet
- **Vem kan gå med?** with the two policies.
- When *Endast efter godkännande* is chosen, a second choice appears: **Vem godkänner?** — *Bara jag (gruppägaren)* or *Jag och gruppledarna*. The second option explains that leaders see requests under Members and can approve or decline them, while only the host can change this setting.
- Choosing *Alla med QR-koden* keeps the approver choice stored but dimmed, with a one-line note that it applies again if the community becomes private.

### Join preview
Bottom sheet / card with:
- Avatar, name, "*N medlemmar*".
- Badge for the policy.
- If already a member: **Öppna gemenskapen**.
- If pending: "*Förfrågan skickad*" + explanation.
- If rejected: "*Värden har avböjt din förfrågan*".
- Otherwise one primary button: **Gå med** (open) / **Begär medlemskap** (approval), plus Cancel.
- Success switches the active community and opens the community room; pending stays on the confirmation state.

### Entry points
- `RoomHeaderCard` + `RoomSummaryCard`: **Visa QR-kod** button (all members).
- Room details owner section: **Vem kan gå med?** row with the current policy and approver (for example *Privat · Jag och gruppledarna*) opening the policy sheet.
- `CommunityJoinForm` sheet: **Skanna QR-kod** secondary button above the code field.
- `features/onboarding-journey.tsx` join step: same secondary button.
- `ui/members.tsx` (the request approval screen): load and show pending requests for the host, and for a leader when `joinApprovers === "owner_and_leaders"`. The **Medlemsförfrågningar** row in room details follows the same visibility rule. A member who is neither sees nothing.
- Invite screen shows a policy hint when the viewer is a member but not the host: *Fråga värden om du vill ändra vem som kan gå med.*

### State plumbing
- `Group.joinPolicy` and `Group.joinApprovers` in `state/types.ts`; `withDisplayableGroup` leaves them untouched.
- Store actions:
  - `setJoinPolicy: { id, joinPolicy, joinApprovers }` → `session.setGroupJoinPolicy`, optimistic-free; refresh comes from the existing group listener.
  - `resolveInvite: { code }` → cached per code for 60 s to avoid repeat calls while the camera re-reads.
  - `joinGroup` receipt carries `joined`; after `joined`, dispatch `switchGroup` and return to the community.
- `features/community/roles.ts`: add `canApproveJoinRequests(role, group)` used by `ui/members.tsx` and the room-details row.
- `state/encryption/session.ts`: `resolveCommunityInvite`, `setGroupJoinPolicy`, extended return type for `groupJoinRequest`.
- Translator keys in `ui/translations/sv.ts` and `en.ts` (sv is source of truth; en mirrors).

### Copy (sv, draft)
- `community.join.qrTitle`: "Bjud in med QR-kod"
- `community.join.qrHint`: "Låt personen skanna koden med KOINO. Är gemenskapen öppen blir de medlemmar direkt, annars skickas en förfrågan."
- `community.join.openBadge`: "Öppen – gå med direkt"
- `community.join.approvalBadge`: "Privat – förfrågan krävs"
- `community.join.scan`: "Skanna QR-kod"
- `community.join.previewOpen`: "Du blir medlem direkt."
- `community.join.previewApproval`: "Värden behöver godkänna din förfrågan."
- `community.join.joined`: "Du är med i {name}."
- `community.join.policyTitle`: "Vem kan gå med?"
- `community.join.policyOpen`: "Alla med QR-koden"
- `community.join.policyOpenHint`: "Den som skannar gruppens kod blir medlem direkt. Du kan byta tillbaka när du vill."
- `community.join.policyApproval`: "Endast efter godkännande"
- `community.join.policyApprovalHint`: "Du och dina gruppledare godkänner varje förfrågan."
- `community.join.approversTitle`: "Vem godkänner?"
- `community.join.approversOwner`: "Bara jag (gruppägaren)"
- `community.join.approversLeaders`: "Jag och gruppledarna"
- `community.join.approversLeadersHint`: "Gruppledare ser förfrågningar under Medlemmar och kan godkänna eller avvisa dem. Bara du kan ändra den här inställningen."
- `community.join.badgePrivateOwner`: "Privat – värden godkänner"
- `community.join.badgePrivateLeaders`: "Privat – värden och gruppledarna godkänner"
- `community.join.cameraPermission`: "KOINO använder kameran bara för att läsa QR-koder."
- `community.join.invalidCode`: "Koden är inte en KOINO-inbjudan."

---

## 5. Security and abuse

- **Invite code is the credential.** The QR must therefore be treated like today's code: no additional data in it, no logging of codes in analytics, no codes in push payloads.
- **Open is explicit.** The host flips it with a warning; flipping back to approval closes the door immediately for future scans. Existing members stay.
- **Rejection is sticky.** `e2eeJoinRequestStatuses.status === "rejected"` keeps blocking both open and approval joins.
- **Removal beats the QR.** A departed or removed user never auto-joins; a fresh request goes to the host. This stops an old screenshot from re-adding someone the host removed.
- **Member ceiling.** Open joins stop at 200 members; the join returns `failed-precondition` with a plain message.
- **Approver authority is narrow.** A leader can only list, approve or reject requests while the host has granted it and the community is private. Removing the leader role takes the permission away at once; changing the policy back to host-only does too.
- **Rate limit.** Reuse `signup-guard`'s `joinGroup` limits. Scanning the same code repeatedly is a no-op because step 1 returns `approved` without a new write.
- **Preview is minimal.** `resolveInvite` reveals name, member count and policy to a signed-in holder of the code; nothing else.
- **No client-written membership.** All membership writes stay in the callable; `e2eeGroups` and request collections remain client-read-only.

---

## 6. Tests and acceptance

Unit (`functions`, node:test):
- Policy validation, defaulting and owner-only `setJoinPolicy`.
- `joinGroup`: open + never departed → member; open + departed → pending; approval → pending; rejected → rejected; already member → approved without duplicate writes; 200-member ceiling; unknown code.
- `resolveInvite`: known/unknown/deleted code, caller's own request status only.
- Approvers: host always allowed; a leader allowed only with `owner_and_leaders`; a plain member never; a leader cannot call `setJoinPolicy`; removing the leader role revokes approval access.

Emulator script `scripts/validate-join-qr-emulator.mjs` (pattern: `validate-community-leaders-emulator.mjs`):
- Two accounts, emulator auth + database.
- Host creates a community, sets `open`; guest scans/joins; assert `e2eeGroups` membership, both membership mirrors and content read access.
- Host flips to `approval`; second guest gets `pending`, cannot read content, host sees the request and approves.
- Host sets `owner_and_leaders`; a group leader sees and approves a third guest; a plain member is denied; the host switches back to `owner` and the leader is denied again.
- Rejected guest is refused after a second scan.
- Removed guest re-scans an open community and lands in `pending`, not auto-joined.
- Unauthenticated/unknown-code paths fail cleanly.

App checks:
- `npm run typecheck`, `npm run typecheck:functions`, `npm test --prefix functions`.
- `scripts/validate-join-qr.mjs`: payload parse/format tests (bare code, koino:// URL, https URL, malformed).
- Emulator walkthrough on Pixel_10: show QR on one account, scan with the other, both policies, pending state, owner approval, deep link from the system camera.
- Hardware check on the Pixel 11 Pro before release.

Acceptance:
1. A member opens Room details → Invite → QR, and a non-member scans it; for an open community they are in the room in under five seconds without the host touching anything.
2. For a private community the same scan leaves a request the host can approve, and the applicant sees "Förfrågan skickad".
3. With *Jag och gruppledarna* selected, a group leader sees the same request under Medlemsförfrågningar, can approve it, and the applicant becomes a member; a plain member cannot see or decide it.
4. A removed member scanning an open QR does not get back in automatically.
5. Switching policy or approver updates the badge and the next scan/approval immediately.
6. The QR works in poor light (torch) and the manual code path still works if the camera is denied.

---

## 7. Rollout

1. Deploy functions + rules to `koino-dev`; run the emulator suite and the Device walkthrough.
2. Deploy to `koino-codex` (production).
3. Publish the JS-only part (policy, QR display, deep link, manual code) to the production EAS Update branch. This works with the current binaries because it adds no native module.
4. After the EAS build credits reset on 1 December 2026, build `expo-camera` into the next native version:
   - Add `expo-camera` and its config plugin.
   - Bump `runtimeVersion` to `2.2.0` (a new native module must not receive the old runtime's updates).
   - EAS `store-internal` → Play internal track, verify on the Pixel 11 Pro.
   - Confirm the scanner appears only in builds that contain the module; older binaries keep the code/manual path.

---

## 8. File map

| Area | File |
| --- | --- |
| Group type | `state/types.ts` |
| Store actions and join receipt | `state/store/types.ts`, `state/koino-store.tsx`, `state/community-join-requests.ts` |
| Callable wrappers | `state/encryption/session.ts` |
| Backend | `functions/src/account.ts`, `functions/src/index.ts` (no new export needed) |
| Rules | `firebase.rules.json` (groups `joinPolicy`) |
| Invite screen | `app/group-invite.tsx`, `features/community/join-qr.tsx` |
| Scanner | `app/join-scan.tsx`, `features/community/join-scanner.tsx` |
| Deep link | `app/join.tsx`, `app/_layout.tsx` |
| Preview + sheet | `features/community/join-preview.tsx` |
| Entry points | `features/identity/room-cards.tsx`, `features/identity/room-details-screen.tsx`, `features/community/join-form.tsx`, `features/onboarding-journey.tsx`, `features/settings-screen.tsx` |
| Policy UI | `features/identity/join-policy-sheet.tsx` |
| Request approvals | `ui/members.tsx`, `features/identity/room-details-screen.tsx`, `features/community/roles.ts` |
| Copy | `ui/translations/sv.ts`, `ui/translations/en.ts` |
| Tests | `functions/src/join-policy.test.ts`, `scripts/validate-join-qr.mjs`, `scripts/validate-join-qr-emulator.mjs` |

---

## 9. Out of scope for this version

- Rotating the invite code / expiring QR codes (the host can close open joining by switching to approval).
- Universal links (`https://koinolabs.com/join/...`) — the app scheme is enough for the in-app scanner and the system camera; App Links/Universal Links can follow once the domain association files are hosted.
- QR codes for individual invites with an expiry or a named recipient.
- Showing a member list or statistics before joining.

---

## 10. Implementation status (26 November 2026)

Branch `feat/group-qr-join` from `main` (8ab7f96).

| Commit | What |
| --- | --- |
| `45e3ec4` | feat(community): join by QR with approval and open policies — backend, rules, UI, tests, scripts |
| `6911ca5` | fix(join): probe the camera natively and keep the policy preview fresh |
| `94b2537` | docs(join): record the QR join implementation, test evidence and deploy status |
| `201370b` | feat(community): let the host share join approval with group leaders |
| `a7f24b4` | chore(copy): call the role gruppledare and the screen Medlemsförfrågningar |

### What is built

Backend (`functions/src/account.ts`, `functions/src/group-join.ts`):
- `createGroup` accepts `joinPolicy` and `joinApprovers`, defaults `approval` / `owner`, writes both to `e2eeGroups/<gid>` and `encryptedData/groups/<gid>`.
- `setJoinPolicy` (host only, verified email, both enums validated, idempotent) accepts a partial change and keeps `joinApprovers` stored while the community is open.
- `resolveInvite` returns only `groupId`, `name`, `joinPolicy`, `joinApprovers`, `memberCount`, `alreadyMember`, optional `requestStatus`.
- `joinGroup`: already a member → `approved` + `joined: true`; rejected stays rejected; open + never departed + under 200 → member with both mirrors in one atomic update; departed, removed, approval, and full communities fall through (`GROUP_FULL` is a `failed-precondition`, not a silent pending request).
- `listGroupRequests`, `approveJoin`, `rejectJoin`: the host always; a `leader` only while `joinApprovers === "owner_and_leaders"` (role from `communityRole()`); everyone else `permission-denied`. Removing the leader role or switching back to `owner` revokes it at once.
- `firebase.rules.json`: `joinPolicy` and `joinApprovers` enum validation on both group nodes; `e2eeJoinRequests/$groupId` readable by the host, and by a leader only when `joinApprovers` allows it. Writes stay callable-only.

Frontend:
- `Group.joinPolicy` / `Group.joinApprovers`, `CommunityInvitePreview`, `JoinRequestReceipt.joined`.
- Store actions `resolveInvite` (cached 3 s) and `setJoinPolicy` (both fields).
- `app/group-invite.tsx` (QR, code, share, policy badge, host policy sheet), `app/join-scan.tsx` (camera + manual code), `app/join.tsx` (deep link, resumes after sign-in/onboarding).
- Policy sheet: **Vem kan gå med?** plus **Vem godkänner?** with *Bara jag (gruppägaren)* / *Jag och gruppledarna*, dimmed with a stored-choice note while the community is open.
- `features/community/roles.ts`: `canApproveJoinRequests(role, group)` gates the **Medlemsförfrågningar** row in room details and `ui/members.tsx`; a plain member sees neither.
- Badges: *Öppen – gå med direkt*, *Privat – värden godkänner*, *Privat – värden och gruppledarna godkänner*; the preview explains who approves.
- Swedish and English copy in `ui/translations/sv.ts` / `en.ts`.
- `react-native-qrcode-svg` (JS) and `expo-camera` (native, config plugin). The camera JS is loaded only after `requireOptionalNativeModule("ExpoCamera")` confirms the binary has it, so runtime 2.1.0 shows the manual-code fallback and never evaluates the module.

### Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run typecheck:functions` | pass |
| `npm --prefix functions test` | pass, 64 tests (includes `group-join.test.ts` approver cases) |
| `node scripts/validate-join-qr.mjs` | pass (payload formats + the `canApproveJoinRequests` gate) |
| `npm run validate:join-qr-emulator` | pass (defaults, owner-only policy, open join + mirrors + content read, pending + no read, approve, sticky rejection, removed fallback, leader approves when granted, plain member denied for callable and rules, leader cannot set policy, revoke on switch, 200 ceiling, unknown/deleted code, unauth, client write denials) |
| `koino-dev` functions + rules | deployed twice; callable verified over HTTPS (resolveInvite/join/policy with approvers) |
| `koino-codex` functions + rules | deployed twice; endpoint answers 401 unauthenticated |
| Terminology | verified: no user-facing string uses *administratör*; the role is *gruppledare*, the option *Jag och gruppledarna*, and the request screen *Medlemsförfrågningar* |
| EAS Update production | published twice; latest runtime 2.1.0, group `4b7e9fef-8a12-4e76-9436-a0e864fd54d0` |

Device walkthrough (KOINO Dev, runtime 2.1.0, Android), from the first round:
1. Open community: badge *Open – join instantly*, **Join** → member, app opens the community room (`alreadyMember: true`, `memberCount: 2`).
2. Private community: badge *Private – request needed*, **Request membership** → *Request sent*; the host's request list shows the caller; after approval the same link shows *You are in …*.
3. Removed member scanning an open code → *Request sent*, no membership, host receives a new request.
4. Policy switched on the host → the next scan shows the new badge and button without an app restart.
5. Unknown code → *That code is not a KOINO invite.*; with the camera module absent the scanner shows the manual fallback and the code path still works.

The leader-approval walkthrough (criterion 3) was not run on a device: the only camera-less dev binary is arm64, the Pixel_10 AVD is x86_64, and the connected Pixel 11 Pro came into active use by the person during this round. The leader path is proven at the callable and rules level by the emulator suite, and the UI gate by `canApproveJoinRequests` tests and typecheck.

### Deviations from the plan

- Preview cache is 3 s instead of 60 s (acceptance 4 needs the badge to change on the next scan).
- An open community at the 200-member ceiling returns `failed-precondition` `GROUP_FULL` instead of creating a request nobody can approve.
- `joined: true` means "this call made you able to enter" for both fresh joins and existing members, matching the store's "dispatch switchGroup after joined" rule.
- `koino-dev` had no `SMTP_PASSWORD` secret, so the deploy was unblocked with a random placeholder. Dev password-reset mail stays non-functional until the real SMTP password is set there; production was untouched.

### Remaining for the 1 December native build

- Expo build credits reset 1 December 2026 ~20:26 Sweden time.
- Build `expo-camera` into the next native version, bump `runtimeVersion` to `2.2.0`, `store-internal` → Play internal, verify the scanner, torch and denied-permission paths on the Pixel 11 Pro.
- After that build is live, the production update for 2.1.0 keeps the manual path; no further JS change is needed.

