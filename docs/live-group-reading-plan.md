# Live group reading — "Läser nu"

Plan for showing, in real time, where each member of a KOINO community is reading in the Bible — only when that member chooses to share it.

Status: implemented on 25 November 2026. No client build has been shipped yet.

## Implementation

| Area | File |
| --- | --- |
| Freshness model, parsing, ordering, margin markers | `state/reading-model.ts` |
| Share setting, publisher, group listener | `state/reading-share.ts` |
| Reader bubble, markers, follow, sheet wiring | `features/bible-screen.tsx`, `features/community/reading-bubble.tsx`, `features/bible-reader/chapter-text.tsx`, `features/bible-reader/tools-sheet.tsx` |
| Sheet with live/recent lists and the share control | `features/community/reading-now-sheet.tsx` |
| Community strip and Home card | `features/community/reading-now-row.tsx`, `features/settings-screen.tsx`, `features/home-screen.tsx` |
| Rules | `firebase.rules.json` → `groupReading` |
| Daily cleanup | `functions/src/reading-prune.ts` |
| Tests | `scripts/validate-reading.mjs`, `scripts/validate-reading-emulator.mjs` |

Verified with `tsc --noEmit` in both the app and `functions`, the pure-model checks, and the Realtime Database emulator: outsiders are denied read and write, a member can publish only their own record, chapter-level records cannot carry a verse, malformed scopes/verses/chapters/timestamps are rejected, server timestamps validate, opting out deletes the record, a frozen community blocks new positions but still allows opting out, and a departed member loses both read and write at once.

One deliberate simplification: margin markers only render in the row-by-row reader. In flowing-paragraph mode the recorded positions still appear in the sheet; the paragraph layout has no per-verse row to attach a marker to.

---

## 1. Product idea

One shared, calm layer over the Bible: *who in my community is reading right now, and where.*

Three promises:

1. **Live, never history.** You only ever see where someone is *at this moment*. No "last read 3 days ago", no reading streaks of others, no archive of anyone's movements.
2. **Opt-in, per community, with a scope.** Default is off. When you turn it on you pick *Kapitel* (book + chapter) or *Vers* (book + chapter + verse).
3. **Quiet by default.** No notification when someone starts reading. No feed. One pill, one sheet, small markers in the text — nothing that pulls you out of reading.

Working names: feature **Läser nu** (EN: *Reading now*), action **Följ** (EN: *Follow*), session mode **Läs tillsammans** (EN: *Read together*).

---

## 2. Why this fits the app as it is

KOINO already has the two hard parts, so this is mostly composition rather than new infrastructure:

| Existing | Used for |
| --- | --- |
| `presence/{groupId}/{uid}/sessions/{deviceId}` with server-side `onDisconnect` (`state/presence.ts`, `state/presence-model.ts`) | Tells us who is actually in the app, so a stale position can never look live. Reuse the 2 min online / 30 min inactive windows. |
| Group membership rules (`e2eeGroups/{groupId}/members/{uid}`, `e2eeDepartures`) | Read/write access to the reading record. Same rule shape as `presence`. |
| Reader position (`features/bible-reader/preferences.ts`, `position` + `history`, synced to `bibleReaderPreferences/{uid}`) | Source of truth on the device. The shared record is a projection of it, never the master. |
| Presence strip + members panel (`features/community/presence-strip.tsx`, `members-panel.tsx`) | Visual language (avatar stacks, status), and where the entry points sit. |
| `useCommunityPresence` tick model | Staleness is already handled by a 30 s clock instead of trusting writes. |

---

## 3. Data model

New sibling of `presence`, not a child of the private preferences:

```
groupReading/{groupId}/{uid} = {
  book: "Philippians",        // canonical English name, as in BiblePosition
  chapter: 4,
  verse: 13,                  // clamped to chapter length
  versionId: "reform...
  scope: "chapter" | "verse", // what this person chose to expose
  at: <serverTimestamp>,      // last publish
  platform: "ios" | "android" | "web"
}
```

- One record per member per group. Overwritten in place; no append, no log.
- `scope: "chapter"` means the client never writes `verse` (write `null`), so the verse genuinely cannot leak — not hidden in the UI only.
- Delete the record when sharing is turned off, when the member leaves the group, and from a daily prune for records older than 24 h.

Why a separate node rather than adding fields to `presence`:

- Presence sessions are per device and are removed on `onDisconnect`. Reading position should survive a reconnect, so it needs its own lifecycle.
- Reading can then have its own retention, rules and future extensions without touching the heartbeat contract.

### Rules (`firebase.rules.json`)

Mirror `presence` exactly, plus validation:

```
"groupReading": {
  "$groupId": {
    ".read": "auth != null && root.child('e2eeGroups').child($groupId).child('members').child(auth.uid).exists()
              && !root.child('e2eeDepartures').child($groupId).child(auth.uid).exists()",
    "$uid": {
      ".write": "... member ... && auth.uid == $uid && !root.child('e2eeGroupLocks').child($groupId).exists()",
      ".validate": "newData.hasChildren(['book','chapter','scope','at']) && newData.child('chapter').isNumber()
                    && newData.child('book').isString() && newData.child('scope').val().matches(/^(chapter|verse)$/)"
    }
  }
}
```

No index needed: the whole group node is read at once (same as presence), and group sizes make that cheap.

### Write policy

- Publish at most every **20 s**, plus immediately on chapter change and 1.5 s after the visible verse settles (debounce via `useVisibleVerseSelection`'s existing `onSelect`).
- Skip the write if the payload is identical to the last one sent.
- On background (`AppState !== "active"`): stop publishing. The record simply goes stale; presence already flips to `away`.
- Never publish while `scope === "off"` or the member is in a different community than the one open in the reader (`currentGroupId`).

### Freshness model (`state/reading-model.ts`)

```
live  = presence[uid] is online AND now - at <= 2 min
recent = now - at <= 30 min           // shown as "senast i Rom 8", only if they are still in the app
hidden otherwise
```

Combining `at` with presence means: app killed → present goes `offline` at once, so the position can never be mistaken for live even though the record still exists.

---

## 4. Presentation

Four surfaces, in order of how much they interrupt:

### 4.1 Reader bubble

A chat-head style bubble floats over the text: a 52 dp circle with two avatars and a live count. It takes no layout space and never reflows the chapter.

- Drag it anywhere; it snaps to the nearest side and remembers its spot per member and community, across restarts.
- Tap → a compact panel listing live readers (same chapter first), each row follows that reader, plus a link to the full sheet and sharing control.
- Minimize folds the panel back to the bubble. Close ("Dölj bubblan") removes the bubble; the reader menu's **Läser nu** row and its "Show the bubble" action bring it back.
- The panel closes by itself after 12 s and whenever the chapter changes, so it never sits in the way.
- No bubble when nobody else is live. No empty state in the reading chrome.

### 4.2 In the text — verse markers

Small markers in the right margin at the verse each live member is on, layered over the existing highlight rail:

- A 3 px dot in their avatar tone, plus a tiny initial only when ≤ 3 readers are in the chapter (avoid clutter).
- Ordered by distance to your own verse; the nearest sits closest to the text.
- Tap → floating card: avatar, name, "Filipperbrevet 4:13", and **Följ**.
- **Följ** gently scrolls *your* reader to their verse once (400 ms ease), shows a banner "Följer Sara · Avbryt" for 8 s, then stops. No continuous hijacking; a moving target does not drag your screen.
- Someone entering *your* chapter: a single light haptic, and their marker springs in. No sound, no toast.
- `Reduce motion` respected: fade instead of spring, no scroll animation.

### 4.3 Sheet — "Läser nu"

Opened from the header pill, from the community room, and from Home.

```
Läser nu                        4 i gruppen

Samma kapitel som du
  Sara     Filipperbrevet 4 · vers 13     ● Följ
  Joel     Filipperbrevet 4 · vers 2      ● Följ

Annat
  Mirjam   Romarbrevet 8 · kapitel 28      ● Följ
  Elias    Psaltaren 23 · kapitel          

────────────────────────────
Du delar: Kapitel  ›      Läs privat
```

- "Samma kapitel som du" first; within a group, ordered by verse proximity.
- Chapter scope renders as `Romarbrevet 8 · kapitel` with a thin progress bar of chapter position only when the member shared verse scope — never inferred from anything else.
- Empty state: "Ingen annan läser just nu. Du kan bjuda in till en lässtund." with **Läs tillsammans**.
- Own row is omitted; the footer states your own scope and offers the toggle.

### 4.4 Community room + Home card

- In the community room, a **Läser nu** row under the presence strip: up to 5 avatars with "Sara · Fil 4", "Joel · Fil 4", "+2". One tap opens 4.3.
- On Home, only when ≥ 2 members are live: a single quiet card ("Två läser Filipperbrevet 4 nu") that opens 4.3. Never a card when you are the only one reading.
- When a member has hidden presence, they are excluded from both, no exception.

### 4.5 (Phase 3) Läs tillsammans — a timed session

- Anyone starts a session pinned to a chapter, default 30 min, with an optional short note.
- Members see a join chip in the sheet and the community room, not a push notification (respect the existing notification preferences; a session invite is group activity, not a personal alert).
- Inside a session, the sheet becomes a live list with everyone's verse and a **Följ** per person; the starter can change the chapter for the whole session.
- Session is a client-side overlay on the same record (`sessionId` field), so no extra node and no server work. Ends by time or by the starter.

---

## 5. Privacy and safety

| Concern | Decision |
| --- | --- |
| Default | Off. Sharing is a deliberate act, per community. |
| Granularity | Chapter is the default when you opt in; verse is a second, explicit choice. |
| History | Never stored. One record, overwritten. No timestamps shown to others beyond "nu" / "senast". |
| Leaving | Record deleted on leave, on opt-out, and by a 24 h prune. |
| Presence hidden | Hidden members are never published and never shown, even if a stale record exists. |
| Blocked / departed members | Excluded by the existing `e2eeDepartures` rule and blocked-user list in the client. |
| Group size | Only live members are shown, max 5 avatars + `+N`, so a 200-person community cannot turn the reader into a scoreboard. |
| Language | Copy stays neutral: "läser", never "du ligger efter" or ranking. |

One sentence in the UI, in the sheet footer: *"Bara var du är just nu, bara för den här gruppen. Stängs av när du lämnar appen."*

---

## 6. Files and work breakdown

### Phase 1 — foundation and the sheet (≈ 1 day)

| File | Change |
| --- | --- |
| `state/reading-share.ts` (new) | `useReadingPublisher(groupId, userId, position, enabled, scope)` — throttle, debounce, AppState, `.info/connected`; delete on disable/unmount. |
| `state/reading-model.ts` (new) | `deriveGroupReading(snapshot, presence, now)`, `liveReaders`, `sameChapter`, `chapterProgress`. Unit-testable pure functions, same shape as `presence-model.ts`. |
| `state/reading-share.ts` (new) | `useGroupReading(groupId)` — one `onValue` listener + 30 s tick. |
| `features/community/reading-now-sheet.tsx` (new) | Sheet 4.3. |
| `features/community/reading-now-row.tsx` (new) | Community-room row + Home card. |
| `features/bible-reader/reading-share-setting.tsx` (new) | Off / Kapitel / Vers control, used by the sheet and by reader settings. |
| `features/bible-screen.tsx` | Wire publisher to `position` + `state.currentGroupId`; header pill. |
| `app/room-details.tsx`, `features/home-screen.tsx` | Entry points. |
| `firebase.rules.json` | `groupReading` node + validation. |
| `functions/src/index.ts` | `pruneGroupReading`, daily 04:10 Europe/Stockholm. |
| `ui/localization.ts` | `reading.*` keys, SV + EN. |

### Phase 2 — in the text (≈ 1 day)

| File | Change |
| --- | --- |
| `features/bible-reader/chapter-text.tsx` | Margin markers per verse, memoized; marker component in `reading-marker.tsx`. |
| `features/bible-reader/reading-marker.tsx` (new) | Dot/initial, press target, presence tone, reduce-motion aware. |
| `features/bible-reader/use-follow-reader.ts` (new) | One-shot scroll to a verse, banner state, cancel. |
| `features/bible-reader/header.tsx` | Pill slot. |

### Phase 3 — read together, polish (≈ 1–2 days)

Session overlay (`sessionId`, `sessionEndsAt`), join chip, chapter-steering by starter, haptics, Home card threshold, empty states, accessibility labels (`Läser nu`, `Följ Sara till Filipperbrevet 4 vers 13`).

### Phase 4 — verify and ship

Emulator + Pixel 11 Pro, two accounts in one community; then `eas build --profile store-internal` + `eas submit` to the Play internal track, same path as 1.0.0.

---

## 7. Performance budget

- 1 extra RTDB listener per open reader/community screen, one node per group (≈ 150 bytes × live members).
- ≤ 3 writes/min per reading member, payload < 150 bytes.
- No image uploads, no avatar fetches beyond what presence already does.
- Marker count capped at 5 shown + `+N`; layout work done in the existing paragraph render pass, no extra measurement per frame.

---

## 8. Acceptance tests

1. Two accounts, same community. A opens Fil 4, B opens Rom 8 → B sees A in the sheet within 2 s and vice versa; markers appear only in matching chapters.
2. A backgrounds the app → presence flips `away`; after the 2 min window the sheet shows "senast", never "nu".
3. A force-quits → gone from "Läser nu" immediately (presence `onDisconnect`), record pruned later.
4. A switches to Kapitel → verse disappears from B's sheet within one publish (≤ 20 s), and the field is absent from the database.
5. A turns sharing off → record deleted; B's list updates at once.
6. A non-member and a departed member get `PERMISSION_DENIED` on read and write.
7. Airplane mode: no phantom live readers after the stale window; no error toast in the reader.
8. Reduce motion: no spring, no auto-scroll animation.
9. Dark mode (Vigil): markers keep ≥ 3:1 contrast on the canvas.
10. 15-member group with 8 live: sheet stays readable, avatars cap at 5 + `+3`, 60 fps while scrolling the chapter.

---

## 9. Defaults chosen (change any of these and the plan adjusts)

- Off by default, per community, chapter scope first.
- No push notification for "someone started reading"; only the Läs tillsammans invite, and only as an in-app chip.
- No ranking, streaks, or "completed" state for others.
- Position expires in 24 h and is invisible the moment presence is not live.
