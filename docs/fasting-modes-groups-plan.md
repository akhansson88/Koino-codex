# Fasting modes, group fasting and teaching cards — implementation plan

Status: implemented in the working tree on 27 November 2026, verified in the Android emulator (Pixel_10) against KOINO Dev. Production database rules are deployed; the JavaScript is not published to the production update channel yet.

What is in the build:

| Area | Files |
| --- | --- |
| Mode catalogue, schedules and plan maths | `state/fasting-modes.ts`, `state/fasting-plan.ts`, `state/types.ts` |
| Group projection and selectors | `state/group-fasting.ts`, `state/koino-store.tsx`, `state/store/types.ts` |
| Fasting screen, mode sheet, setup sheet, tips, card | `features/fasting/fasting-screen.tsx`, `fast-mode-sheet.tsx`, `fasting-setup-sheet.tsx`, `fasting-tips.tsx`, `fasting-card.tsx`, `fasting-style.ts` |
| Group fasting screen and card | `features/fasting/group-fasting-screen.tsx`, `group-fast-card.tsx`, `app/group-fasting.tsx` |
| Home and Community entries | `features/home-screen.tsx`, `features/settings-screen.tsx` |
| Reminders | `features/fasting/reminders.ts`, `reminder-runtime.tsx` |
| Rules | `state/encryption/schema.ts`, `scripts/generate-encryption-rules.mjs`, `firebase.rules.json` |
| Tests | `scripts/validate-fasting-time.mjs`, `scripts/validate-fasting-modes.mjs`, `scripts/validate-fasting-groups-emulator.mjs` |

Verified: typecheck; fasting time and mode tests; group-fast Realtime Database rules in the emulator; existing database and event rules; app build installed on Pixel_10; water fast created (shared and private), edited and ended; 16:8, Daniel and monk dashboards rendered from live records; a second community member saw the planned fast and joined it; the host saw “1 joined”; making the fast private removed it from the community while keeping the host’s record and the member’s personal copy. The production rule set was deployed to `koino-codex`; the app was not installed or tested on Alex’s phone.

Goal: turn KOINO's single private "N-day fast from midnight" into a biblical
fasting space with real modes, a private/group switch, group fasts that others
can join before they begin, and calm teaching cards that explain what fasting
is and how to do it safely.

---

## 1. What exists today (verified in the repo)

| Area | Current state |
| --- | --- |
| Data | `fasts/{uid}/{id}` — owner-only read/write rules; one record per fast |
| Model | `startDate` (YYYY-MM-DD), `durationDays` (1–365), midnight start, midnight end, `status: active \| ended`, `alertEnabled` |
| Screens | `app/fasting.tsx` → `features/fasting/fasting-screen.tsx`; entry card in Me (`features/journal-screen.tsx`) |
| Setup | `fasting-setup-sheet.tsx`: date stepper, duration stepper, alert switch |
| Timer | `state/fasting.ts`: phase, remaining, elapsed, percent, day number, open/latest/history |
| Alerts | `features/fasting/reminders.ts` + Android native `FastingAlarm` module: one exact alarm at the fast's end, full-screen completion screen |
| Copy | `ui/translations/en.ts` and `sv.ts`, all keys under `fasting.*` and `me.fasting.*` |
| Tests | `scripts/validate-fasting-time.mjs` (TZ Europe/Stockholm, DST, phases) |
| Group patterns to reuse | Events (`groupEvents`, `eventRsvps`, home card, settings row), live reading (group subscription, rules, prune function) |

Two consequences:

1. Every existing fast is a **continuous full fast**, presented as private
   ("Only you").
2. The Android alarm schedules exactly **one end time**. Recurring modes need a
   different notification strategy (section 8).

---

## 2. Product principles

1. **Biblical definition first.** Fasting in Scripture is voluntarily
   abstaining from food for a set time, for God. Water may be taken or withheld
   (Esther 4:16). Giving up sugar, coffee or social media can be a good
   discipline, but on its own it is **not** biblical fasting.
2. **Not a diet.** Intermittent routines are framed as prayer rhythms, not
   weight-loss plans. No calories, no weight, no BMI, no "burn".
3. **Quiet, not competitive.** No streaks, leaderboards, rankings or badges.
   "Do not look gloomy like the hypocrites" (Matthew 6:16–18). Group fasting is
   encouragement, not comparison.
4. **Private by default.** A fast is visible to the group only after an explicit
   switch. The shared record carries the schedule and nothing else — no notes,
   no health data, no history.
5. **Safety over ambition.** Dry fasting and long fasts are capped, warned and
   require an explicit acknowledgement. Breaking a fast is always one tap away.

---

## 3. Mode catalogue

All modes use the same `Fast` record and the same dashboard shell; they differ
in schedule, food rule and copy. Seven cards on the fasting screen; the
intermittent card opens a sub-picker.

| # | Mode key | English | Swedish | Schedule | Default | Full abstention? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `water` | Water fast | Vattenfasta | Continuous, water only | 24 h | Yes (food) |
| 2 | `dry` | Dry fast | Torrfasta | Continuous, no food or water | 12 h, hard cap 24 h | Yes (food + water) |
| 3 | `until_1800` | Break at 18:00 | Bryt fastan kl. 18:00 | Daily window, e.g. 00:00–18:00 | 1 day, up to 21 | Yes (food), water allowed |
| 4 | `if_16_8` | 16:8 prayer rhythm | 16:8 böneresa | Daily: 16 h fast / 8 h eating | 21 days | Yes (food), water allowed |
| 5 | `if_18_6` | 18:6 prayer rhythm | 18:6 böneresa | Daily: 18 h / 6 h | 21 days | Yes |
| 6 | `if_20_4` | 20:4 prayer rhythm | 20:4 böneresa | Daily: 20 h / 4 h | 14 days | Yes, advanced |
| 7 | `if_5_2` | 5:2 prayer rhythm | 5:2 böneresa | Two chosen weekdays, 24 h each | 4 weeks | Yes, water allowed |
| 8 | `if_24_weekly` | 24 hours, once a week | 24 timmar i veckan | One chosen weekday, 24 h | 4 weeks | Yes |
| 9 | `monk` | Monk fast (36 h) | Munkfasta (36 h) | One chosen weekday, 36 h | Mon 20:00 → Wed 08:00, 4 weeks | Yes, water allowed |
| 10 | `daniel` | Daniel fast (21 days) | Daniels fasta (21 dagar) | Continuous partial fast | 21 days (10-day option) | **No** — partial |
| 11 | `custom` | Custom fast | Egen fasta | Continuous, existing behaviour | 1 day | Yes, water allowed |

### 3.1 Mode details and copy direction

**Water fast.** "No food; water only. The simplest form of biblical fasting."
Suggested rhythm: one prayer slot at each mealtime you skip. Verse: Matthew
6:16–18. Beginner duration 12–24 h; ceiling 72 h.

**Dry fast.** "No food and no water. This is an absolute fast, like Esther's
three days (Esther 4:16). It is short by nature and needs care." Default 12 h,
hard cap 24 h, never multi-day in the app. Requires a safety acknowledgement.
Copy explicitly says: not for beginners, not in heat, not with strenuous work,
break with small sips.

**Break at 18:00.** "Fast through the day — from midnight, or from 20:00 the
night before — and break the fast with a simple meal at 18:00. Let hunger become
a prompt to pray." Water allowed. Choose 1–21 days; each day follows the same
window. Two start options: "From midnight" (00:00–18:00) and "From the night
before" (20:00–18:00, a 22-hour fast). This is the mode the user described:
daytime hunger cues turn into prayer.

**16:8, 18:6, 20:4.** "Not a diet. A daily rhythm that makes room for prayer,
Scripture and quiet before God." Default eating windows: 16:8 → 12:00–20:00;
18:6 → 13:00–19:00; 20:4 → 16:00–20:00. All adjustable. Suggested rhythm: the
fasting hours carry one longer prayer/Bible slot; the eating window is ordinary
life, not a feast.

**5:2.** "Two days a week set aside for prayer and fasting; the other five are
normal." Pick two weekdays (recommend non-consecutive). Each fast is 24 h from
18:00 on the chosen day to 18:00 the next day, water allowed, with an option for
just "until 18:00" if 24 h is too much. Plan length 2–6 weeks.

**24 hours, once a week.** A single 24-hour water fast on a chosen weekday, e.g.
Monday 18:00 → Tuesday 18:00. Simpler than 5:2 for a first weekly rhythm.

**Monk fast (36 h).** "A weekly 36-hour water fast in the monastic tradition:
after an evening meal, through a full day, breaking with a light breakfast."
Default Monday 20:00 → Wednesday 08:00, configurable weekday and start time.
Advanced; 4 weeks default. Water only; no dry version.

**Daniel fast (21 days).** "A partial fast: you still eat, but simply — fruit,
vegetables, legumes, whole grains, nuts and seeds, plant oils, herbs, water. No
meat, fish, eggs, dairy, added sugar or sweeteners, leavened bread, refined
flour, processed or deep-fried food, coffee, tea, soft drinks or alcohol." Based
on Daniel 1:12 (10-day test) and Daniel 10:2–3 (three weeks). Not total
abstention; do not show a food countdown. Show "Day X of 21" and today's plate.
A 10-day option is offered. The Daniel card is tagged "Partial fast" so nobody
confuses it with a water fast.

**Custom fast.** The current date + N days behaviour, kept for compatibility,
now with an optional start time and the same safety ceilings as water (72 h
recommended). Existing records keep working unchanged.

### 3.2 What counts as fasting (teaching card)

A dedicated card, visually distinct (paper background, Scripture mark), appears
on the fasting screen and at the top of the mode picker:

> **What counts as fasting?**
> In the Bible, fasting is abstaining from food for a set time, for a spiritual
> purpose and before God. Water may be taken (most fasts) or withheld (an
> absolute fast, like Esther 4:16). Giving up sugar, coffee or social media can
> be a good discipline — but on its own it is not fasting. KOINO calls something
> a fast only when food is actually given up.
>
> *"When you fast, do not look gloomy… your Father who sees in secret will
> reward you."* — Matthew 6:16–18

This is a teaching card, not a scold. Tone: gracious, clear, no judgement of
people who do sugar or media fasts.

### 3.3 Helpful tips deck (required content)

Five expandable cards on the fasting screen, plus mode-specific tips inside each
mode sheet. Exactly these five lead:

1. **Start gradually** — Begin with skipping one meal, or a daytime fast until
   18:00, before trying multi-day fasts.
2. **Prioritize prayer and Scripture** — Replace the time you would spend eating
   or scrolling with prayer, Bible reading, or quiet reflection in the presence
   of God.
3. **Check medical safety** — Talk with a doctor before fasting if you have
   diabetes, take regular medication, are pregnant or breastfeeding, are under
   18, or have a history of eating disorders. In those cases, choose an
   intermittent rhythm or Daniel's fast rather than a long water or dry fast.
4. **Break longer fasts gently** — Break with light, easily digestible food.
   Do not celebrate the end of a fast with a heavy feast.
5. **Real fasting means abstaining from food** — Sugar, coffee or social media
   alone is not fasting, even when it is beneficial. See the teaching card.

Additional collapsed "More wisdom" rows: drink water (unless dry); stop if
dizzy, faint or confused; no hard training on long fast days; keep it secret;
fast to make room for God, not to earn His love; rest and sleep.

Mode-specific safety copy:

- **Dry:** max 24 h, no exercise, not in heat, break with small sips, stop at
  any sign of confusion or fainting.
- **Water >48 h:** medical advice recommended; electrolytes; no driving if weak.
- **Monk / 24 h / 5:2:** only if you have fasted 16–18 h comfortably before.
- **Daniel:** it is a partial fast; eat enough (legumes, nuts, grains) and do not
  use it as a crash diet. Check with a doctor if pregnant, diabetic, on regular
  medication, under 18 or with an eating-disorder history.
- **Everyone:** fasting is not a treatment for illness and does not earn
  salvation.

---

## 4. Data model

Keep `fasts/{uid}/{id}` as the single source of truth for a person's fast.
Add a projection under the group only while the fast is shared.

### 4.1 Types (`state/types.ts`)

```ts
export type FastMode =
  | "water" | "dry" | "until_1800"
  | "if_16_8" | "if_18_6" | "if_20_4" | "if_5_2" | "if_24_weekly"
  | "monk" | "daniel" | "custom";

export type FastSchedule =
  | { kind: "continuous" }                                   // water, dry, custom
  | { kind: "daily"; fastStart: string; fastEnd: string }    // "HH:mm", local
  | { kind: "weekly"; weekdays: number[]; startTime: string; durationHours: number }
  | { kind: "partial"; ruleSet: "daniel" };

export type FastVisibility = "private" | "group";

export type Fast = {
  // existing fields unchanged
  id: Id;
  userId: Id;
  startDate: string;
  durationDays: number;
  timeZone: string;
  startAt: string;              // overall plan start (first window)
  endAt: string;                // overall plan end (last window end)
  status: "active" | "ended";
  alertEnabled: boolean;
  endedAt?: string;
  acknowledgedAt?: string;
  createdAt: string;
  updatedAt: string;

  // new
  mode: FastMode;               // missing => "custom" for legacy records
  schedule: FastSchedule;       // missing => { kind: "continuous" }
  visibility: FastVisibility;   // missing => "private"
  groupId?: Id;
  sharedAt?: string;
  sourceGroupFastId?: Id;       // set when this fast was created by joining
  sourceUserId?: Id;            // who planned the group fast
  safetyAcceptedAt?: string;    // dry fast and water >48 h
};

export type GroupFastParticipant = {
  userId: Id;
  joinedAt: string;
  personalFastId: Id;
};

export type GroupFast = {
  id: Id;
  groupId: Id;
  userId: Id;                   // host
  mode: FastMode;
  schedule: FastSchedule;
  startAt: string;
  endAt: string;
  durationDays: number;
  joinCutoffMs: number;         // == Date.parse(startAt), numeric for rules
  participants: Record<Id, GroupFastParticipant>;
  createdAt: string;
  updatedAt: string;
};
```

Legacy records are normalised on load:

```ts
const mode = isFastMode(record.mode) ? record.mode : "custom";
const schedule = isFastSchedule(record.schedule) ? record.schedule : { kind: "continuous" };
const visibility = record.visibility === "group" ? "group" : "private";
```

No database migration and no break for old clients.

### 4.2 A plan is not always one continuous fast

`startAt`/`endAt` are the **plan boundaries** (first window start → last window
end). The current window is computed, never stored:

- `daily`: window N starts on `startDate + N days` at `fastStart`, ends at
  `fastEnd` (crossing midnight when `fastStart > fastEnd`). DST-safe: build each
  window from local calendar parts, not by adding 86 400 000 ms.
- `weekly`: find the next chosen weekday at `startTime`; window runs
  `durationHours`; repeat for the plan length.
- `partial` (Daniel): one continuous plan, but the UI reports day number and
  food rule instead of a fasting countdown.
- `continuous`: exactly today's behaviour.

New pure helpers in `state/fasting-plan.ts`:

```ts
fastPlanPhase(fast, now): FastPhase
currentFastWindow(fast, now): { start: number; end: number; phase: "before" | "fasting" | "eating" | "after" } | undefined
nextFastWindow(fast, now): { start: number; end: number } | undefined
fastPlanDayNumber(fast, now): number
fastPlanProgressPercent(fast, now): number
canJoinGroupFast(groupFast, now): boolean
```

Keep the existing functions for continuous fasts and delegate `fastPhase`,
`fastRemainingMinutes`, `fastProgressPercent` to the plan helpers so the card,
dashboard and reminders share one truth.

### 4.3 Group projection

```
groupFasts/{groupId}/{fastId} = {
  id, groupId, userId, mode, schedule, startAt, endAt, durationDays,
  joinCutoffMs, createdAt, updatedAt,
  participants: {
    {uid}: { userId, joinedAt, personalFastId }
  }
}
```

Why nested participants rather than a separate collection:

- removing the group fast (host makes it private, ends it, or the group owner
  deletes it) removes every participant record with it — no orphans, no cleanup
  function;
- one subscription per active group gives the whole card in one snapshot;
- participant payload is tiny (three fields).

The projection is written with `update()` on named fields, never `set()` of the
whole node, so a host edit cannot overwrite `participants`.

Only mode/schedule/identity are copied. **Never** copy `alertEnabled`,
`acknowledgedAt`, `endedAt`, notes or anything personal.

### 4.4 Privacy toggle — exact behaviour

| Action | Owner's fast | Group node | Joined members |
| --- | --- | --- | --- |
| Create, private (default) | `visibility: "private"` | none | — |
| Toggle "Share with {group}" | `visibility: "group"`, `groupId`, `sharedAt` | created | — |
| Toggle "Share" on an already-started fast | shared, view-only | created, `joinCutoffMs` already passed | Cannot join; they only see it |
| Toggle back to private | `visibility: "private"` | deleted (participants included) | Their own personal fasts continue; no group card |
| Edit while shared, 0 joined | schedule updates | projection updated | — |
| Edit while shared, ≥1 joined | schedule is locked | unchanged | — |
| End fast (host) | `status: "ended"` | deleted | Their own fasts continue |
| End fast (participant) | their own ends | their participant record removed | — |

Rules for joining:

- join button visible only while `now < joinCutoffMs`; after start the card says
  "Already started" and shows the participant list;
- a member with an open fast gets a confirm: "End your current fast and join
  this one?" — on confirm, end theirs then join;
- joining copies the schedule into a new personal fast with
  `sourceGroupFastId` / `sourceUserId`, then writes the participant record;
- leaving before start deletes the participant record and the linked personal
  fast if it has not started; after start the action becomes "End my fast";
- if the host makes it private, a joined member's personal fast continues but
  the card shows "This fast is no longer shared" if they open the group screen.

**Schedule lock:** once the first person joins, the host can still make the fast
private or end it, but cannot change its times. This avoids silently moving
someone else's fast. The UI says so before the first join.

### 4.5 Rules (`firebase.rules.json`)

Add a `groupFasts` sibling, read by group members, written by the host and by
each participant for their own child:

```
"groupFasts": {
  "$groupId": {
    ".read": "auth != null && root.child('e2eeGroups').child($groupId)
      .child('members').child(auth.uid).exists()
      && !root.child('e2eeDepartures').child($groupId).child(auth.uid).exists()",
    ".indexOn": ["startAt", "createdAt"],
    "$fastId": {
      ".write": "auth != null
        && root.child('e2eeGroups').child($groupId).child('members').child(auth.uid).exists()
        && !root.child('e2eeDepartures').child($groupId).child(auth.uid).exists()
        && !root.child('e2eeGroupLocks').child($groupId).exists()
        && (
          (newData.exists() && newData.child('userId').val() == auth.uid
            && newData.child('groupId').val() == $groupId
            && root.child('fasts').child(auth.uid).child($fastId).exists())
          || (!newData.exists()
            && (data.child('userId').val() == auth.uid
              || root.child('e2eeGroups').child($groupId).child('ownerId').val() == auth.uid))
        )",
      "id":        { ".validate": "newData.isString()" },
      "groupId":   { ".validate": "newData.val() == $groupId" },
      "userId":    { ".validate": "newData.isString()" },
      "mode":      { ".validate": "newData.isString()" },
      "startAt":   { ".validate": "newData.isString()" },
      "endAt":     { ".validate": "newData.isString()" },
      "joinCutoffMs": { ".validate": "newData.isNumber()" },
      "participants": {
        "$uid": {
          ".write": "auth != null && auth.uid == $uid
            && root.child('e2eeGroups').child($groupId).child('members').child(auth.uid).exists()
            && !root.child('e2eeDepartures').child($groupId).child(auth.uid).exists()
            && !root.child('e2eeGroupLocks').child($groupId).exists()
            && (now < data.parent().parent().child('joinCutoffMs').val()
                || !newData.exists())",
          ".validate": "newData.hasChildren(['userId','joinedAt','personalFastId'])
            && newData.child('userId').val() == $uid"
        }
      },
      "$field": { ".validate": "newData.val() == null || newData.isString()
        || newData.isNumber() || newData.isBoolean() || newData.hasChildren()" }
    }
  }
}
```

The exact expression will be generated through the existing rules generator and
tested in the emulator; the shape above is the contract, not the final file.
Key invariants to test:

- a member can create a group fast only for themselves and only with a matching
  private fast record;
- a member can join only under their own uid and only before `joinCutoffMs`;
- a participant can leave before the start, not after;
- a non-member cannot read or write any of it;
- a departed member loses access immediately;
- the group owner can delete any group fast in their group (moderation);
- private `fasts` stay unreadable to everyone else.

No Cloud Function is required for correctness. Optional push notifications for
"X joined your fast" reuse `activityNotifications` (section 8).

---

## 5. Store and actions

In `state/koino-store.tsx`:

- subscribe `groupFasts/{activeGroupId}` in the same community block as
  `groupEvents`; add `groupFasts`, `groupFastsReady`, reset on group switch and
  sign-out;
- participants are already inside the snapshot, so no second listener;
- resolve names/avatars from existing `users` / `memberships`; never store
  display names in the group fast.

New actions (`state/store/types.ts` + reducer in `koino-store.tsx`):

| Action | Purpose |
| --- | --- |
| `startFast` (extended) | mode, schedule, visibility, groupId, safetyAcceptedAt |
| `updateFast` (extended) | same fields; refuses schedule changes if shared and participants > 0 |
| `setFastVisibility` | private ↔ group; writes/deletes the projection |
| `joinGroupFast` | validates cutoff/conflict, creates personal fast + participant record atomically (multi-path update) |
| `leaveGroupFast` | before start: removes participant + unstarted personal fast |
| `endFast` (extended) | removes own participant record and, if host, the projection |
| `acknowledgeFast` | unchanged |

Use a single `update(ref(database), { ... })` for join/leave so a half-join
cannot happen. Guard all actions with the existing `sessionGeneration` check and
the `throwOnError` list (add the new actions so the UI can show errors).

Selectors:

- `groupFastsForDisplay(groupFasts, now)` → now/upcoming/past;
- `joinedGroupFast(groupFasts, userId)`;
- `groupFastParticipantIds(groupFast)`;
- `nextGroupFast(groupFasts, now)` for the Home and Community cards.

---

## 6. Screens and flow

### 6.1 Fasting screen (`features/fasting/fasting-screen.tsx`)

**No active plan — "Choose your fast"**

1. Header and a one-line intro ("A private practice between you and God").
2. **Teaching card** — "What counts as fasting?" (section 3.2), collapsible.
3. **Mode rail** — horizontally snapping cards, 7 visible:
   - Water (moss / droplet)
   - Break at 18:00 (warm / sunset)
   - Intermittent (reflection / clock; opens sub-sheet with 16:8, 18:6, 20:4,
     5:2, 24 h weekly)
   - Monk 36 h (lavender / moon)
   - Daniel 21 days (moss / seed; "Partial fast" tag)
   - Dry (danger tint / sun; "Advanced" tag)
   - Custom (neutral / sliders)
   Each card: icon tile, name, one-line purpose, duration badge, chevron.
   Tapping opens the mode sheet, not the setup form directly.
4. **Mode sheet** (`fast-mode-sheet.tsx`): what it is; "A rhythm of prayer"
   (suggested slots); "Before you start" (safety); Scripture; primary button
   "Choose this fast". For dry: warning block + acknowledgement checkbox before
   the button enables.
5. **Tips deck** — the five cards, one expanded at a time (section 3.3), plus
   "More wisdom" collapsed rows.
6. **Last fast / history** — unchanged, with mode label added.

**Active plan — dashboard**

Shared shell: plan title (mode name), day X of N, status pill
("Fasting now" / "Eating window open" / "Starts Monday 20:00" / "Complete"),
progress, schedule card, alerts card, edit/end.

- `continuous`: existing countdown and progress, plus mode name.
- `daily`: countdown to the next boundary ("Fast ends in 2 h 14 min" /
  "Eating window closes in 3 h 40 min"), a 7-dot week strip with today marked,
  and a small "Prayer focus" line for the current window.
- `weekly`: "Next fast: Monday 18:00 — in 2 d 4 h" when between windows;
  during a window, countdown and progress; week strip shows chosen days.
- `daniel`: "Day 8 of 21" with day progress; **no food countdown**; "Today's
  plate" card; a full "Daniel food guide" expandable card with the eat/avoid
  lists from section 3.1; prayer focus; "Plan ends 18 December".
- All: **sharing card** — lock icon + "Only you" or people icon + "Shared with
  {group} · {n} joined", participant avatar stack, switch. Host sees "Manage
  shared fast"; joined member sees "Joined {host}'s fast" and a leave/end action.
- Completion screen: mode-aware copy; for Daniel "21 days complete" with a
  gentle note; for dry/water a "break gently" reminder.

### 6.2 Setup sheet (`fasting-setup-sheet.tsx`)

One sheet, sections driven by mode:

| Section | Continuous | Daily | Weekly | Daniel |
| --- | --- | --- | --- | --- |
| Start date | ✓ | ✓ | ✓ | ✓ |
| Start time | ✓ (default 00:00; "now" option) | — | ✓ | — |
| Length | hours 12/24/48/72 or N days | 1/7/14/21 days | 2/4/6 weeks | 10/21 days |
| Window | — | eating window start/end, presets | weekdays + start time | — |
| Food rule | — | — | — | read-only summary card |
| Alerts | ✓ | ✓ (window boundaries) | ✓ (start/end) | ✓ (daily focus) |
| Share with group | ✓ (off) | ✓ (off) | ✓ (off) | ✓ (off) |

Validation lives in `state/fasting-plan.ts` (pure, testable): start not more
than 1 year away, length caps per mode, eating window ≥ 4 h, at least one
weekday, dry ≤ 24 h, water ≤ 72 h, Daniel 10/21.

### 6.3 Group surfaces

**Community page** (`features/settings-screen.tsx`, next to the Events row):
a "Fasting together" row with icon `activity`/`users`, subtitle "Next: 24-hour
water fast · 3 joined" or "Plan a fast with your community", chevron to
`/group-fasting`.

**Group fasting screen** (`app/group-fasting.tsx` →
`features/fasting/group-fasting-screen.tsx`):

- header "Fasting together" + community name;
- "Now" section (active window) and "Upcoming" section, sorted by start;
- `GroupFastCard`: mode icon/tint, mode name, host avatar + first name,
  schedule ("Mon 20:00 → Wed 08:00"), duration, participant avatar stack + "n
  joined", status ("Join before it starts" / "In progress" / "Joined"), primary
  Join/Joined button;
- "Plan a fast" button opens the setup sheet with "Share with this group" on;
- empty state: "No one is fasting together yet. Plan one and invite your
  community." + create button;
- detail sheet: full mode description, safety note, schedule, host, participants
  (tap a member → existing profile), join/leave, host menu ("Make private",
  "End fast"); group owner menu ("Remove from group" for moderation).

**Home** (`features/home-screen.tsx`): a "Fasting together" card above/below
"Coming up" when the active group has an upcoming or active fast:
"24-hour water fast · Mon 18:00 · 4 joined" with a Join button. Hidden when
none. Never shows a member's private fast.

**Me fasting card** (`features/fasting/fasting-card.tsx`): add mode name; replace
the unconditional "Only you" lock with "Only you" or "Shared with {group}" and,
for a joined fast, "Joined {host}".

**Routes:** `app/group-fasting.tsx` and the existing `app/fasting.tsx`; no tab
changes. Deep-link data `{ koinoGroupFast: true, groupId, fastId }` so a push
opens the group fast detail.

### 6.4 Design language

- Use the existing cream/terracotta/moss/rose/lavender palette; no gradients,
  no glass, no purple. Mode tints come from `softTints`/`colors` tokens.
- Cards 16–20 px radius, 1 px `colors.line` border, icon tile 44–48 px,
  Montserrat headings, body text at existing scale.
- One accent per mode; the mode rail is calm, not a game.
- Expandable tips use `LayoutAnimation` (already used in the app) and a rotating
  chevron; one open at a time.
- Dynamic type: at `fontScale >= 1.3`, countdown units stack (already done) and
  mode cards grow vertically; no fixed-height text.
- Dark mode: tint tokens already have dark variants; check contrast of warning
  cards.
- Accessibility: mode cards expose `accessibilityRole="button"`, label "Water
  fast, 24 hours, choose"; countdown has an accessible text alternative;
  switches are labelled; join buttons say "Join {mode} planned by {name}".

### 6.5 AI illustrations via Duck.ai

The mode cards, the group empty state and the teaching cards can use custom
illustrations generated at **duck.ai** (DuckDuckGo's AI chat). They are
decorative, not doctrinal: the words stay native text, never baked into an
image.

- **Art direction:** warm, hand-painted paper-and-gouache look, cream and
  terracotta base with moss green and muted gold accents, soft daylight, no
  text, no faces, no photorealistic medical imagery, no glowing or "magic"
  effects. One quiet motif per mode:
  - water — a clay water jar and a clear glass;
  - break at 18:00 — a low sun over a simple set table;
  - intermittent — an open Bible beside a small clock;
  - monk — a stone cloister and a bowl of bread at dawn;
  - Daniel — wheat, figs, lentils and a wooden bowl;
  - dry — a desert stone and an empty cup (handled gently, not alarming);
  - custom — a blank journal and a pencil.
- **Sizes:** generate at 1024×1024 or 1200×900, export at 2x, crop in the app to
  the card aspect ratio, compress to WebP/JPEG (target < 120 KB each). No
  transparency needed; the card tint sits behind the image.
- **Prompts and provenance:** keep the prompt for each image and the chosen
  output in `docs/fasting-art-prompts.md`, the same way the Bible-plan covers
  were recorded, so the set can be regenerated or restyled later. Save final
  assets under `assets/fasting/` with mode-based names
  (`water.webp`, `until-1800.webp`, ...).
- **Licensing:** check Duck.ai's current terms for the model used before
  shipping; prefer images generated for the project rather than third-party
  artwork. Decorative use only, with the native icon tile as fallback.
- **Fallback:** if an image is missing or fails to load, the existing icon tile
  and tint render alone; no layout shift and no empty box.

---

## 7. Copy and translations

Add keys under a new `fasting.mode.*`, `fasting.tips.*`, `fasting.group.*`,
`fasting.safety.*`, `fasting.daniel.*` namespace in both `ui/translations/en.ts`
and `sv.ts`. Roughly 120 new keys. Rules:

- English and Swedish written as native copy, not word-for-word translation.
- Swedish terms: fasta, vattenfasta, torrfasta, dagsfasta, böneresa,
  munkfasta, Daniels fasta, gemensam fasta, dela med [grupp], gå med, lämna,
  bryt fastan kl. 18:00.
- Scripture quotations: use the app's existing Bible translation policy; short
  references may be plain text. Do not invent a translation; use a public-domain
  or licensed text already used by KOINO.
- No diet language ("calories", "weight loss", "metabolism", "burn fat",
  "detox"). Use "prayer", "Scripture", "quiet", "hunger as a prompt".
- Safety copy reviewed for plain language and medical caution.

---

## 8. Reminders and notifications

### 8.1 Local reminders

`features/fasting/reminders.ts` currently schedules one end alarm. Extend:

- `continuous`: keep the native exact alarm for the end (water, dry, monk,
  custom) + optional "start" local notification.
- `daily` (16:8, 18:6, 20:4, 18:00): schedule two local notifications per day
  for the next 7 days (window opens / window closes) using
  `SchedulableTriggerInputTypes.DAILY` with `hour`/`minute`, or DATE triggers for
  the rolling 7 days so the plan's end is respected. Refresh on app foreground
  (`syncFastReminders` already runs there). Do **not** use the full-screen
  native alarm for every boundary — too intrusive.
- `weekly` (5:2, 24 h, monk): schedule the next 4–6 windows as DATE triggers;
  refresh on foreground. Optional weekly repeating trigger when the plan is
  open-ended.
- `daniel`: one morning "Today's focus" and one evening "Day X complete"
  notification, if enabled; no meal alarm.
- iOS pending limit (64): rolling 7 days × 2 = 14, well under. Cancel all on
  edit/end/sign-out.
- DST: reuse the local-calendar window builder; never add fixed milliseconds.

### 8.2 Group push (optional Phase 4)

Reuse `activityNotifications` + `functions/src/push-delivery.ts`:

- "Anna joined your fast" to the host when a participant record appears;
- "Hope Community: a 24-hour fast starts tomorrow" to group members who opted
  into a new `fastingReminders` preference (default on, but only for fasts they
  joined or the group they are in).
- Keep server logic idempotent (`bundleKey` includes group/fast/uid) so a retry
  does not double-send.
- Add `fastingReminders` to `notificationPreferences` and the notification
  settings screen.
- No daily scan of all groups is needed for local reminders; a scheduled function
  is optional for the "starts tomorrow" push.

### 8.3 Prune

Group fasts are small, but clean historical records: extend the existing daily
prune pattern (like `reading-prune`) with `pruneGroupFasts` removing records
whose `endAt` is more than 7 days old. If nested participants are used, deleting
the node is enough. Add tests.

---

## 9. Phases, files and estimates

| Phase | Work | Files | Estimate |
| --- | --- | --- | --- |
| 0 | Copy and mode catalogue; translations scaffold; design tokens; Duck.ai illustration set (prompts + chosen images) | `state/fasting-modes.ts` (new), `ui/translations/en.ts`, `sv.ts`, `ui/theme.ts`, `assets/fasting/*`, `docs/fasting-art-prompts.md` (new) | 1 day |
| 1 | Schedule engine + types + selectors + unit tests; legacy normalisation | `state/types.ts`, `state/fasting.ts`, `state/fasting-plan.ts` (new), `scripts/validate-fasting-time.mjs` (extend), new `scripts/validate-fasting-modes.mjs` | 1.5 days |
| 2 | Setup sheet by mode; dashboard variants; mode sheet; tips deck; teaching card | `features/fasting/fasting-setup-sheet.tsx`, `fasting-screen.tsx`, new `fast-mode-sheet.tsx`, `fasting-tips.tsx`, `fasting-card.tsx` | 2 days |
| 3 | Group projection, actions, subscriptions, rules, emulator tests | `state/koino-store.tsx`, `state/store/types.ts`, `firebase.rules.json`, `scripts/validate-fasting-groups-emulator.mjs` (new) | 2 days |
| 4 | Group screen, Home and Community entries, join/leave, pushes, preferences | `app/group-fasting.tsx` (new), `features/fasting/group-fasting-screen.tsx` (new), `group-fast-card.tsx` (new), `features/home-screen.tsx`, `features/settings-screen.tsx`, `functions/src/*` | 2 days |
| 5 | Polish: dark mode, dynamic type, accessibility, Swedish copy review, empty/error/offline states | all touched UI + `ui/translations/sv.ts` | 1 day |
| 6 | QA on Pixel 11 Pro + emulator + iOS simulator; rules deploy koino-dev → koino-codex; EAS Update; Play build after credits reset; docs | `docs/fasting-modes-groups-plan.md` status, test notes | 1–1.5 days |

Total: about 10 working days for one engineer, plus design review. The work is
independent of the native `FastingAlarm` module except for the end alarm, so no
new native dependency is required. A JS-only EAS Update can reach existing
installs; a fresh Play binary (versionCode 43+) is still needed for new installs
after the EAS build credits reset on 1 December 2026. Android and iOS builds
share that same build-credit reset.

Suggested branch: `feat/fasting-modes-groups`, merged to `main` after
`npm run typecheck` and the fasting suites pass.

---

## 10. Test plan

### Unit / pure (`node`)

- every mode produces the right first/last window, including `fastStart >
  fastEnd` crossing midnight;
- DST spring-forward and fall-back keep local 18:00 and 20:00 stable;
- weekly: chosen weekdays, plan length, next window, no window after the last;
- join cutoff: one millisecond before start allowed, at start denied;
- plan phases and day numbers for continuous, daily, weekly, Daniel;
- legacy fast without mode/schedule = custom/continuous/private;
- validation caps: dry 24 h, water 72 h, eating window ≥ 4 h, weekday count.

### Rules emulator

- host creates a group fast only with a matching `fasts/{uid}/{id}`;
- another member cannot forge a host or another user's participant record;
- join before cutoff succeeds; at/after cutoff denied;
- leave before start succeeds; after start denied;
- non-member read/write denied; departed member denied;
- private fast remains unreadable to group members;
- group owner can remove a group fast; a random member cannot;
- `e2eeGroupLocks` blocks creation/join but allows leaving/deleting.

### UI checks

- all mode keys present in both languages; no hardcoded English in the new
  screens;
- mode rail scrolls and snaps; one tip open at a time; back button closes sheet;
- dynamic type 1.3+ and dark mode screenshots;
- VoiceOver/TalkBack labels for countdown, mode cards, join and share.

### Device QA (Pixel 11 Pro, Pixel_10 emulator, iOS simulator)

1. Legacy fast shows as Custom/private and still counts down.
2. Create each mode; verify start/end, countdown, day number, completion.
3. Change device timezone and date; windows stay at local times.
4. Share a fast; switch to a member account; see the card on Home, Community and
   Fasting together; join before start; verify the personal fast and participant
   record; leave; rejoin; join after start blocked.
5. Host edits before/after first join (locked); makes private with participants;
   ends; participant ends.
6. Join with an existing open fast → confirm flow.
7. Daniel: day counter, plate card, no food countdown, completion.
8. Dry: acknowledgement required, 24 h cap, warning copy.
9. Notifications: daily boundary, weekly start, end alarm, test alert, opt-out.
10. Offline: group card cached, join fails with a clear message, local fast kept.
11. Non-member and signed-out accounts cannot read group fasts (emulator and
    manual).
12. Swedish long labels and screen reader on the mode rail and dashboard.

### Acceptance criteria

- A fast can be toggled private ↔ shared with the active group, and the shared
  projection appears/disappears for members immediately.
- Members can join a planned fast any time before its start, and cannot after.
- All requested modes exist with correct schedules, descriptions and safety.
- The five required tips and the "real fasting = abstaining from food" teaching
  are visible and interactive.
- Daniel is clearly a partial fast and never presented as total abstention.
- Private fasts never leak to a group; groups never see more than mode,
  schedule, host and participants.
- Existing fasts and old app builds keep working.
- Typecheck, unit checks, emulator rules and manual QA pass; rules deployed to
  koino-dev and koino-codex.

---

## 11. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Scope creep across modes, scheduling, groups and content | Phase it; ship Phase 1–3 (private modes + sharing) before group UI polish |
| Dry fasting health risk | 24 h hard cap, explicit acknowledgement, repeated safety copy, easy break, no multi-day |
| Long water fasts | 72 h ceiling; medical advice copy; Daniel/IF as safer long plans |
| Privacy leak | Minimal projection; no notes/health; emulator tests for non-members and departed members |
| Time zone/DST bugs | Local-calendar window builder + DST unit tests; device timezone QA |
| Notification overload / iOS limit | Rolling 7-day schedules, 2 per day max, cancel on change; no full-screen alarm for every boundary |
| Rules complexity | Nested participants, single `update()` joins, emulator tests, generated rules |
| Group fasts becoming a competition | No streaks/rankings; copy focuses on encouragement and secrecy |
| Design feeling gimmicky | Calm cards, one accent per mode, no gradients/badges/emoji, reuse app type scale |
| Swedish theological wording | Native copy review with Alex before release |

---

## 12. Decisions baked in (change before Phase 2 if you disagree)

1. **One active plan at a time.** Starting a new fast while a 5:2 or 16:8 plan
   runs requires ending the plan. Keeps the dashboard unambiguous.
2. **Schedule lock after the first joiner.** Host can unshare or end, but not
   move the times under someone else's feet.
3. **Safety ceilings:** dry 24 h, water/custom 72 h, Daniel 10/21 days, plans up
   to 6 weeks. Existing longer records remain viewable.
4. **Group visibility is per active community**, not global. A fast shared with
   one group is invisible to other groups.
5. **Any member can plan a group fast**; the group owner can remove one for
   moderation. No leader-only gate.
6. **No note field** on group fasts in v1. If people want a prayer intention,
   add an optional 80-character "focus" later, still visible only to the group.

---

## 13. Definition of done

- All modes in section 3 are selectable, scheduled correctly and visible in
  history with their mode name.
- Private/group toggle works both ways, including with participants, and the
  group projection is deleted on unshare/end.
- Join before start works for group members; join after start is impossible in
  UI and rules.
- The five tips and the biblical-fasting teaching card are live in EN and SV,
  with the Duck.ai mode illustrations in place (or the icon fallback if an
  image is unavailable).
- Daniel is clearly marked and explained as a partial fast.
- Alerts behave per schedule without duplicate or missed notifications across
  app restarts.
- Typecheck, new unit checks, rules emulator tests and device QA pass.
- Rules are live in koino-dev and koino-codex; the JS ships to existing installs
  and a new Play build is submitted when credits allow.
