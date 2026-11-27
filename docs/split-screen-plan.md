# Jämför — split screen with live verse sync

Plan for a two-pane Bible reader in KOINO: scroll either pane and the other follows
the same **text**, not the same verse number. A live-mirrored reading shows both panes,
with both panes following the sharer.

Status: **implemented** 27 November 2026, verified on the Pixel 11 Pro.
The dev database and the reading-mirror rules were deployed to `koino-dev`; the
AAB/store build is the remaining release step.

Implementation notes:

- Each pane has its own `ChapterPager` and its own chapter when the link is off. The
  pager mounts three pages (previous/current/next) of that one translation, the pan
  drags them with the same resistance, the settle spring and `chapterSelectionHaptic()`
  fire at the same moment, and the header title crossfades through that pane's cursor.
  When the link is on, both pagers share one cursor and turn together; when it is off,
  only the swiped pane (and its header) moves. Each pane wraps its own `ScrollView` in
  `Gesture.Native().requireExternalGestureToFail(pan)` so vertical scrolling still wins;
  the pager skips its whole-page native wrapper (`wrapNativeGesture={false}`).
- The Bible asset is now `assets/bible/koino-bible-v5.db` (62.8 MB) with all four
  translations and 186,886 cross-translation links.
- The alignment is **verse-level structural**, not word-level: merges, splits,
  omitted verses and psalm titles are mapped, and a sub-verse anchor uses the
  proportional position inside the verse. That is the honest limit without a
  parallel corpus; the UI marks anything approximate with `≈`.
- Verified on the device: Psalm 3 (title offset), Psalm 51 (two title verses),
  John 3, NKJV/SRB26, both scroll directions, seam resize and restart
  persistence.
- The two-account live-mirror path is implemented and model-tested; it still
  needs a second signed-in account for a full end-to-end check.

---

## 0. The short version

- Two panes, one reader. Each pane has its own chapter position while the link is off
  and they page independently; turning the link on shares one chapter and one anchor.
- The scroll anchor is `book + chapter + verse + fraction through the verse`, never a
  pixel offset and never just a verse number.
- A precomputed, structural alignment table translates that anchor from one
  translation to the other. It knows where translations split, merge, skip or number
  verses differently.
- The passive pane is scrolled on the UI thread with no animation, so it tracks the
  finger without lag.
- When the reader is live-mirrored, the mirror payload carries both translations and the
  anchor; the follower sees the same split, read-only, and both panes follow.
- Where an exact correspondence does not exist, the pane header shows `≈` and a short
  explanation. KOINO never pretends the numbering is identical when it is not.

The reference app, as you describe it, syncs only the verse **number**. That can only
jump to the top of a verse, and it is wrong wherever the numbering differs. KOINO syncs
the line you are actually reading.

---

## 1. Why verse numbers alone fail — measured on the shipped database

The app currently ships two translations in `assets/bible/koino-bible-v2.db`: KJV and
Reformationsbibeln 2026 (a Swedish translation). Comparing them verse by verse:

| Fact | Number |
| --- | --- |
| Chapters in the canon | 1,189 |
| Chapters where the two translations have a different verse count | **92 (7.7%)** |
| Chapters where the Swedish has exactly one verse more | 71 |
| Psalms with a different verse count | 62 |
| Psalms where the Swedish has exactly one verse more | 58 |

The cause is structural, not noise:

- **The psalm title is a verse in Swedish.** In 58 psalms the superscription
  ("En psalm av David, när han flydde…") is verse 1 in Swedish and not a verse at all
  in KJV. Every verse in that psalm is then one number higher. Psalm 3 is 8 verses in
  KJV and 9 in Swedish; Psalm 75 is 10 vs 11.
- **Verses merge and split.** Psalm 51 is 19 vs 21. Job 38–41 differs by up to 8
  verses. Daniel 3–4 differs by 3. 2 Corinthians 13 is 14 verses in KJV but 13 in
  Swedish: the Swedish verse 12 merges KJV 12+13, and the Swedish grace verse 13 is
  KJV 14. 3 John is 14 vs 15, with KJV 14 merging the Swedish 14+15.
- **A verse can cross a chapter boundary.** Revelation 12:18 in Swedish ("Och jag stod
  på sanden vid havet") is the first half of Revelation 13:1 in KJV, which also
  contains "and saw a beast rise up out of the sea".
- **The reverse also happens.** KJV Psalm 3:1 maps to Swedish Psalm 3:2; Swedish
  Psalm 3:1 (the title) has no KJV verse and must map to the top of KJV Psalm 3.

The screenshot happens to show Psalm 73, a chapter where the Swedish and English
counts match (28/28 in the shipped pair). One psalm later (Psalm 75) a number-only sync
is already one verse off. Psalm 3 or 51 would be visibly wrong within two lines.

This is why the feature cannot be "scroll pane B to verse N". It needs an alignment
layer, and the alignment must be precomputed and testable.

Additional sources of difference the model must survive:

- Swedish `å/ä/ö`, punctuation and footnote markers;
- versification that differs by tradition (Joel 3 vs 4 chapters, Malachi 3 vs 4) —
  not present between KJV/SRB26/SFB15/NKJV, but the reader must not break if a future
  translation has it;
- one translation quoting a textual variant the other omits (Mark 16:9–20,
  John 7:53–8:11, Acts 8:37, etc.).

---

## 2. Product

Working name **Jämför** (EN: *Compare*). One reader, two panes.

### 2.1 Layout

```
┌────────────────────────────────────┐
│  ‹   Psaltaren 73        Jämför  ⋯ │  main header, compact
├────────────────────────────────────┤
│ NKJV                    Ps 73:4  ≈ │  pane header: version + live reference
│ 4  For there are no bands in their │
│    death: but their strength is…   │
│ 5  They are not in trouble as…     │
│ 6  Therefore pride compasseth…     │
├───────────────●●●──────────────────┤  seam: drag 35–65%, link icon = sync
│ SFB15                   Ps 73:4    │
│ 4  De slipper svårigheter ända…    │
│ 5  De råkar inte i människans nöd… │
│ 6  Därför är högmod deras halsband │
├────────────────────────────────────┤
│  ‹ Föregående    Kapitel 73    ›   │  shared chapter controls
└────────────────────────────────────┘
```

- **Phones (the only shipped form factor today):** stacked, 50/50 default. Each pane
  is roughly 38–42% of the screen, about 8–10 verses at the default font size. This is
  the only honest way to fit two readable columns in portrait.
- **Width ≥ 700 dp (web later, iPad if it is ever enabled):** side by side, 50/50,
  resizable seam.
- **Seam:** 1 px rule with a 32 × 18 grabber. Drag to 35–65%. Double-tap the grabber
  resets to 50/50.
- **Pane header:** translation short label (`NKJV`, `SFB15`), current reference
  (`Ps 73:4`), sync state icon, and `×` on the secondary pane. Tapping the label opens
  the version sheet **for that pane only**.
- **Main header:** the existing header, with the translation pill replaced by a
  `Jämför` chip showing `NKJV / SFB15`. The chapter title stays.
- **Bottom controls:** previous/next chapter. They step the primary pane's pager; when
  the link is on the secondary turns with it, when the link is off only the primary turns.
  Each pane has its own chapter pager: a horizontal swipe in a pane drags only that pane
  and its header, with the same resistance, settle spring, header crossfade and haptic
  tick as the single reader. When the link is on, both pagers share the cursor and turn
  together. A short drag springs back and does not turn the page.
  Swipes that start on a pane header stay in the header: the version pill, reference,
  sync, close and boundary hint run their own pan that blocks that pane's pager, so
  opening or tapping those menus never turns the page.
- **Exit:** `×` on the secondary pane header, or the menu row again. The primary pane
  remains where it is, single-pane.

### 2.2 Interaction

- **Driver = the pane last touched.** The other pane follows. A small filled dot on
  the driver's pane header (and a 1 px accent edge) shows which one is driving. It is
  deliberately quiet; no labels shouting "active".
- **Scroll:** the follower mirrors continuously during drag and momentum, not only on
  scroll end. Updates are direct (`animated: false`); with 250–400 ms of movement the
  eye reads it as one surface.
- **Tap a verse:** selects the same text in both panes, the other pane scrolls that
  verse to the reading line, and the normal verse sheet opens quoting the **tapped**
  pane's translation.
- **Long-press / highlight / copy / save / share:** unchanged, applied to the tapped
  pane's translation. The sheet subtitle names the translation when the two differ.
- **Chapter change:** each pane has its own chapter pager and can turn independently
  while the link is off; turning the link on aligns the secondary to the primary. When
  linked, both pagers share one cursor and turn together to the mapped chapter. A short
  drag springs back. Tapping or long-pressing a verse quotes that pane's own chapter and
  translation. No automatic chapter advance at the end of a chapter; a `Nästa kapitel`
  chip appears when the driver reaches the bottom. This avoids the follower pane flipping
  chapter while the driver is still finishing a paragraph.
- **Audio:** the spoken verse drives both panes. The audio player's translation is the
  primary pane; the secondary pane follows the mapped anchor.
- **Sync off:** the link icon toggles. The driver pane scrolls alone; the other stays
  where it was, and a `Följ igen` pill appears on it. Turning sync back on re-anchors
  from the driver.
- **Search / history / plans / cross-references:** jump the primary pane and then
  align the secondary. Deep links may add `&compare=sfb15`.
- **Reduce motion:** no easing; instant set. Seam drag still works.
- **Haptics:** one light tick when a chapter turn settles (identical timing to the
  single reader) and when the sync direction changes (driver switch), nothing per frame.

### 2.3 Entry points

1. Reader menu (`⋯` → Verktyg) → **Jämför översättningar**.
2. The translation pill in the header, long-press → **Jämför med…** (power-user shortcut).
3. A row at the bottom of the version sheet: **Jämför med en annan översättning**.
4. When a followed reader is in split mode, the mirror enters split automatically
   (section 6).

Remember the last pair, ratio and sync state per user, in the existing reader
preferences (local + cloud), with defaults: secondary = the other available
translation, ratio 0.5, sync on.

### 2.4 Honesty about numbering

- Pane header shows `≈` before the reference when the anchor is approximate
  (fallback or cross-chapter clamp), with an accessibility label:
  "Ungefärlig position: versnumreringen skiljer sig".
- Tapping `≈` shows one line: *"Versnumreringen skiljer sig här. Det undre fönstret
  följer texten, inte versnumret."*
- When the mapping is exact, no badge. No permanent explanatory chrome.

---

## 3. The anchor model

```ts
type VerseAnchor = {
  verse: number;    // 1-based, in the pane's own translation
  fraction: number; // 0..1 through the *rendered* verse height
};

type ReaderAnchor = {
  book: string;     // canonical English name, as BiblePosition
  chapter: number;
  ...VerseAnchor;
};
```

Why this shape:

- **Not pixels.** Font size, font family, line height, device width and theme all
  change the pixel height. A pixel mirror would drift immediately.
- **Not chapter percentage.** Chapters have very different verse lengths (Psalm 119,
  Esther 8:9). A percentage puts the panes at unrelated text.
- **Not a verse number.** Fails exactly where the translations differ.
- **Fraction through a verse** keeps the panes together between verse starts, which
  is what "scrolls at the corresponding position" means. The fraction is mapped
  through the aligned verse ranges, so it lands at the corresponding part of the
  target verse, not a blind linear guess across the whole verse.

### 3.1 Reading line

Each pane has a reading line just below its sticky pane header: `paneTop + 10`.
The anchor is the verse that straddles that line, with:

```
fraction = clamp((scrollY + line - verseTop) / verseHeight, 0, 1)
```

The inverse:

```
targetY = targetVerseTop - line + fraction * targetVerseHeight
```

Both panes use their own measured verse tops/heights in **content coordinates**. No
`measureInWindow` during scroll; measurement happens on layout only.

### 3.2 Pane layout index

Each pane keeps a compact, sorted index, rebuilt when verse layout changes:

```ts
type PaneLayout = {
  version: BibleVersionId;
  chapterKey: string;       // version:book:chapter
  verses: Int32Array;       // ascending
  tops: Float64Array;       // content coordinates
  heights: Float64Array;
};
```

`anchorAtOffset()` is a binary search (`O(log n)`), not a loop over the chapter.
The existing single-reader `getMirrorAnchor` loops every verse once per second; that is
fine at 1 Hz but not at 60 Hz. Split mode uses the index.

---

## 4. Alignment

### 4.1 What is stored

Alignment is computed over a **book**, not a chapter, so a segment may cross a chapter
boundary (Revelation 12:18 / 13:1). It is split into verse-level segments shared by
all translations, with fractional inside-verse coverage.

```sql
CREATE TABLE align_segments (
  id           INTEGER PRIMARY KEY,
  book_id      INTEGER NOT NULL,
  chapter      INTEGER NOT NULL,   -- chapter of the segment's first token
  ordinal      INTEGER NOT NULL,   -- order in the book
  confidence   REAL    NOT NULL,   -- 0..1, share of matched tokens
  approximate  INTEGER NOT NULL    -- 1 when confidence < 0.45
);

CREATE TABLE verse_segments (
  translation_id INTEGER NOT NULL,
  book_id        INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  segment_id     INTEGER NOT NULL,
  start_fraction REAL    NOT NULL, -- where this verse enters the segment
  end_fraction   REAL    NOT NULL, -- where it leaves it
  PRIMARY KEY (translation_id, book_id, chapter, verse, segment_id)
);
CREATE INDEX verse_segments_lookup
  ON verse_segments (translation_id, book_id, chapter, verse);

-- Only populated where two translations number chapters differently
-- (Joel 3 vs 4, Malachi 3 vs 4, a future translation).
CREATE TABLE chapter_links (
  source_translation_id INTEGER NOT NULL,
  source_book_id        INTEGER NOT NULL,
  source_chapter        INTEGER NOT NULL,
  target_translation_id INTEGER NOT NULL,
  target_book_id        INTEGER NOT NULL,
  target_chapter        INTEGER NOT NULL,
  confidence            REAL    NOT NULL,
  approximate           INTEGER NOT NULL
);
```

A verse that spans several segments has several rows; a verse that is a title has one
row with `confidence = 0` and `approximate = 1` and points at the following content
segment's start.

### 4.2 Resolving an anchor

```ts
resolveAnchor(
  from: BibleVersionId, to: BibleVersionId,
  book: string, chapter: number, anchor: VerseAnchor
): { chapter: number; anchor: VerseAnchor; approximate: boolean }
```

1. **Chapter link** (identity for the shipped four; table lookup otherwise).
2. **Segment lookup** for `(from, book, chapter, verse)`; pick the row whose
   `[start_fraction, end_fraction]` contains the anchor's fraction (else the nearest).
3. **Target row** for `(to, segment_id)`; compute the target fraction linearly inside
   that segment's target span. If several target verses cover the segment, choose the
   one containing the mapped ratio.
4. **Cross-chapter result** is allowed (Revelation case).
5. **Fallback**, in order:
   a. same verse number clamped to the target chapter's verse count;
   b. proportional position `(verse - 1) / (fromCount - 1)`;
   c. nearest following verse.
   All fallbacks set `approximate = true`.

The mapping is **monotonic**: moving down in pane A never moves pane B up. Assert
this in the build and in tests.

### 4.3 Build pipeline

`scripts/build-bible-alignment.py` (new), run after the Bible text is parsed:

1. Load every translation's verses per book in canonical order.
2. Tokenize: NFKC, lowercase, strip diacritics, map `å/ä/ö` to `a/a/o`, remove
   punctuation and footnote markers, keep numbers. Build a token stream per
   translation with verse/chapter boundaries.
3. Align each translation to a pivot (KJV) with a token-level global alignment
   (`difflib.SequenceMatcher` or `rapidfuzz`, `autojunk=False`), in 4-chapter windows
   with 1 chapter of overlap so cross-boundary segments survive. Long books stay
   bounded.
4. Turn matched blocks into cut points in pivot token coordinates. Add every verse
   boundary from every translation. Sort and dedupe.
5. Create segments between consecutive cut points. For each verse, record the segments
   it covers and its start/end fraction inside each.
6. Confidence per segment = matched tokens / segment length. Below 0.45 → approximate.
7. Apply `scripts/bible-alignment-overrides.json` for known hard cases
   (Psalm titles, Psalm 51, Job 38–41, Daniel 3–4, 2 Corinthians 13, 3 John 14,
   Revelation 12:17–13:1).
8. Emit a report: per-book coverage, monotonicity violations, round-trip error,
   top 20 least confident chapters. Fail the build on any uncovered verse.

The overrides file is deliberately small and reviewable; the algorithm handles the
other 1,100+ chapters.

### 4.4 Runtime

`features/bible-database.ts` gains:

```ts
queryVerseAlignment(translation, book, chapter): VerseSegmentRow[]
queryChapterLink(sourceTranslation, book, chapter, targetTranslation)
```

Both cached in the existing LRU (6 chapters). A chapter has at most ~200 segments,
so the cost is a few arrays and a map, loaded when the chapter loads. No query during
scroll.

### 4.5 Why precompute

- 66 books, ~31k verses per translation. The Python build takes under a minute.
- Deterministic and testable; no embeddings, no on-device model, no network.
- The runtime is a dictionary lookup and a linear interpolation per frame.

---

## 5. Sync engine

### 5.1 Two ScrollViews, one controller

```ts
type SplitSync = {
  driver: "primary" | "secondary";
  sync: boolean;
  onDriverAnchor(anchor: ReaderAnchor): void;
  onExternalAnchor(anchor: ReaderAnchor): void; // audio, mirror, search
};
```

- Active pane: `useAnimatedScrollHandler` on the UI thread computes the anchor from
  the pane's `PaneLayout` shared value. No React render per frame.
- Passive pane: `useAnimatedReaction` maps the anchor through the alignment (preloaded
  per chapter into a shared value) and calls Reanimated's `scrollTo(passiveRef, 0, y,
  false)` on the UI thread.
- If the worklet path is unavailable on a device, a JS fallback throttles to 30 Hz
  with `scrollEventThrottle={16}` and `requestAnimationFrame`. Ship the worklet path
  first; measure on the Pixel 11 Pro.
- **Loop guard:** the passive pane ignores scroll events while `programmatic` is true
  and for one frame after; a target within 0.75 px is skipped.
- **Driver lock:** on `onScrollBeginDrag` / `onTouchStart`, the touched pane becomes
  the driver immediately. Programmatic scrolls never change the driver.
- **Momentum:** keep syncing through momentum; stop when both panes report idle.
- **External changes:** `navigationRevision`, audio follow, plans, mirror and search
  call `onExternalAnchor`, which sets both panes to the mapped position without
  changing the driver.
- **Divider drag:** freeze sync, capture the driver anchor, relayout, then re-apply.
- **Font size / line height / flowing paragraphs:** capture anchor before the layout
  key changes, re-apply after both panes have measured.

### 5.2 Chapter edges

- The driver crossing into a new chapter is the only thing that changes chapters
  automatically.
- If the mapped target is in the next chapter (Revelation 12:18 ↔ 13:1) while the
  driver is still in the current one, the follower clamps to the current chapter's
  last verse and shows `≈` plus a one-line chip **"Fortsätter i Upp 13:1"**. Tapping
  it moves both panes.
- If the target chapter does not exist in the other translation (future Joel 4),
  clamp to the nearest existing chapter and mark approximate.

### 5.3 Audio and mirror interaction

- Audio follow already owns a scroll intent for the single reader. In split mode it
  drives the primary pane and calls `onExternalAnchor`; the secondary follows.
- While mirroring as a follower, the split is read-only: both panes are driven by the
  sharer's anchor. The follower's own drag pauses the mirror (existing behavior) and
  shows `Följ igen`.
- The follower can change font size; that is local and does not affect the anchor.

---

## 6. Live mirroring

The existing feature is `groupReadingLive/{groupId}/{userId}` with a follower list and
a 1 s publisher (`state/reading-mirror.ts`). It already publishes `anchorVerse` +
`anchorOffset`, so the concept is in place. Split extends it.

### 6.1 Payload (backward compatible)

```jsonc
{
  "book": "Psalms",
  "chapter": 73,
  "verse": 4,                 // primary pane's verse (existing field)
  "anchorVerse": 4,           // primary pane's anchor (existing field)
  "anchorOffset": 0.35,       // fraction through the verse (existing field)
  "versionId": "nkjv",        // primary pane translation (existing field)
  "mode": "split",            // NEW: "single" | "split"
  "secondaryVersionId": "sfb15", // NEW
  "splitRatio": 0.5,          // NEW: 0.35..0.65
  "sync": true,               // NEW
  "segmentId": 18234,         // NEW: helps exact mapping; optional
  "alignmentVersion": 1,      // NEW: bump if the table changes
  "at": 1730000000000
}
```

- Old followers ignore the new fields and see the primary pane at `anchorVerse` /
  `anchorOffset` — the existing behavior, no crash.
- New followers of an old sharer see `mode` absent → single pane.
- `segmentId` is advisory: if the follower's DB does not know it, it resolves locally.
- Only published when `scope === "verse"`. Chapter-scope sharing never reveals the
  anchor, the second translation, or the split layout.
- Validation in the RTDB rules accepts the new fields only inside the allowed ranges
  (`mode` enum, `secondaryVersionId` string ≤ 60, `splitRatio` 0.35–0.65, `sync`
  boolean, `segmentId` integer, `alignmentVersion` integer).

### 6.2 Cadence

- 400 ms while the sharer is actively scrolling (3 s after the last touch), 1 s idle,
  5 s heartbeat. Payload < 300 bytes.
- Skip identical bodies as today; delete on zero followers, on stop, on background,
  on disconnect.
- This is a real write-rate increase: 2.5 writes/s while scrolling. It only exists
  while at least one member follows and the sharer opted into verse scope. Measure
  battery/data on a 10-minute session; if it is too much, fall back to 600 ms and
  interpolate with a 180 ms ease on the follower.

### 6.3 Follower experience

- On the first record with `mode: "split"`, the follower enters split with the same
  two translations and ratio, read-only.
- Mirror bar copy: **"Följer Sara · jämför NKJV / SFB15"**, reference `Ps 73:4`, and
  a `Visa bara en` action for focus. The existing `×` stops following.
- Both panes follow the sharer's anchor. The follower's active pane indicator is
  hidden; the halo covers the whole split surface.
- If the sharer changes the pair, the follower changes within one publish. If the
  sharer turns split off, the follower returns to single pane at the same anchor.
- On stop, restore the follower's own split state (pair, ratio, sync) and position,
  the same way `mirrorRestoreRef` restores the version today.
- Old follower build: receives `mode` but has no split renderer; it shows the primary
  pane. No error, no blank screen.
- Member reading markers: primary pane only, to avoid duplicate dots. Highlights from
  the sharer: both panes, mapped by verse where exact.

### 6.4 Privacy

- Split is only shared with verse scope. Chapter scope stays chapter-level.
- The second translation is not sensitive on its own, but the anchor is; it is covered
  by the same 20 s live window, 60 s stale window and 10 min retention as today.
- The follower list and `onDisconnect` cleanup are unchanged.
- No new node, no history: one record overwritten in place.

---

## 7. Architecture and files

### 7.1 Recommended shape: an opaque split surface

Do **not** rewrite the shipping reader into a pane framework in the first version.
Add `SplitReader` as an opaque surface rendered over the existing reader when split is
on. The single reader keeps its state, audio, plans, history and mirror wiring; the
split surface reads the same `position` / `bibleVersionId` and writes back through the
existing callbacks. It renders two lightweight panes and hides the pager underneath.
This keeps the blast radius small and ships in days, not weeks.

A later cleanup can extract a shared `ReaderPane` core; that is not required for this
feature.

```
BibleScreen
├─ existing single reader (mounted, inert while split)
│   ├─ ChapterPager (hidden in split)
│   └─ verse action sheets, audio, plans, mirror publisher
└─ SplitReader (absolute fill, opaque, only when split)
    ├─ SplitPane (primary)   ← own ScrollView, PaneLayout, BibleText
    ├─ SplitPane (secondary) ← own ScrollView, PaneLayout, BibleText
    ├─ seam + link toggle
    └─ SplitSync (worklets, driver lock, mapping)
```

### 7.2 Files

| File | Change |
| --- | --- |
| `scripts/build-bible-database.py` | Add SFB15/NKJV sources; add alignment tables; bump schema to v3; output `koino-bible-v3.db` |
| `scripts/build-bible-alignment.py` *(new)* | Token alignment, segments, confidence, overrides, report |
| `scripts/bible-alignment-overrides.json` *(new)* | Manual anchors for the known hard chapters |
| `scripts/validate-bible-alignment.mjs` *(new)* | Pure checks: coverage, monotonicity, round-trip, named cases |
| `features/bible-database.ts` | Schema 3 guard; `queryVerseAlignment`, `queryChapterLink`; LRU cache |
| `features/bible-versions.ts` | Add `sfb15`, `nkjv`; add `databaseId`; `hasCompare` capability |
| `features/bible-canon.ts` | Version-aware `chaptersForBook(book, versionId)`; `normalizeBiblePosition` uses it |
| `features/bible-reader/split-anchor.ts` *(new)* | Pure `anchorAtOffset`, `offsetForAnchor`, `resolveAnchor`, fallbacks |
| `features/bible-reader/split-pane.tsx` *(new)* | One pane: plain `ScrollView`, `BibleText`, measurement, pane header |
| `features/bible-reader/split-reader.tsx` *(new)* | Two panes, seam, ratio, pane version pickers, exit |
| `features/bible-reader/split-sync.ts` *(new)* | Worklet handlers, driver lock, loop guard, external anchors |
| `features/bible-reader/split-preferences.ts` *(new)* | Persist pair/ratio/sync locally and in `bibleReaderPreferences` |
| `features/bible-screen.tsx` | Split state, entry points, hide pager, route position/version/audio/mirror |
| `features/bible-reader/tools-sheet.tsx` | `Jämför översättningar` row |
| `features/bible-reader/version-sheet.tsx` | Compare row; per-pane mode |
| `state/reading-mirror-model.ts` | Parse/validate split fields; keep old shape |
| `state/reading-mirror.ts` | Publish split fields; adaptive cadence |
| `features/community/reading-mirror.tsx` | Bar copy for compare; `Visa bara en` |
| `ui/translations/sv.ts`, `ui/translations/en.ts` | `bible.compare.*`, `reading.mirror.compare.*` |
| `firebase.rules.json` | `groupReadingLive` validation for split fields |
| `docs/split-screen-plan.md` | This document |

### 7.3 Prerequisites (must land first)

1. **SFB15 and NKJV in the database.** The parser work already started
   (`assets/bible/SFB15.docx`, `sfb15-rows.json`). The DB needs all four translations
   and regenerated `features/bible-verse-counts.json`.
2. **Version → database ID is not a ternary.** `features/bible-search.ts` currently
   maps `"reformationsbibeln2026" → 2`, everything else → 1. Add `databaseId` to
   `bibleVersions` and use it everywhere; otherwise search and embeddings silently use
   KJV for the new translations.
3. **New DB filename.** The provider imports `koino-bible-v2.db` only when the file is
   missing; existing installs will never see a changed v2. Ship the schema as
   `koino-bible-v3.db` so the new asset is imported once, and keep the v2 code path for
   rollback builds.
4. **Version-aware canon.** `kjvBooks` assumes the KJV chapter list. All four planned
   translations match today, but `normalizeBiblePosition` would silently send Joel 4
   to Joel 1 if a future translation has four chapters. Add `chaptersForBook` now.
5. **Reconcile the live rules.** `firebase.rules.json` in this checkout has no
   `groupReading`, `groupReadingLive` or `groupReadingFollowers` nodes at all. Either
   the deployed rules live only in the Firebase console or the mirror is running
   against different rules. Before adding split fields, export the deployed rules,
   commit them, and extend the validation. Do not assume the repo file is live — a
   wrong rule rejects the new payload and the mirror silently shows "ended".
6. **Measure the asset.** Four translations plus FTS plus alignment may take the DB
   from 33 MB to 55–65 MB. Confirm the EAS Update/native asset limits before shipping;
   if it is too large, ship alignments as a separate compact asset (only the 92
   differing chapters plus segment tables) and keep the Bible DB unchanged.

---

## 8. Build order

| Phase | Work | Estimate |
| --- | --- | --- |
| 0 | Prerequisites: translations in DB v3, version→DB id, version-aware canon, rules reconciliation | 1.5 d |
| 1 | Alignment pipeline, overrides, report, pure validation | 2 d |
| 2 | Split surface: two panes, headers, seam, ratio, entry points, verse actions | 2.5 d |
| 3 | Sync engine: worklets, driver lock, anchor mapping, chapter edges, audio | 2 d |
| 4 | Mirror: payload, rules, follower split, restore, backward compat | 1.5 d |
| 5 | QA: a11y, themes, reduce motion, performance, device tests, store build | 1.5 d |
| **Total** | | **≈ 11 working days** |

### First shippable slice (≈ 4 days)

KJV + Reformationsbibeln 2026 split, full alignment for those two, sync on one device,
no mirror. This proves the hard part — the psalm-title offset and the merged verses —
using translations that are already shipped, before SFB15/NKJV land. Then add the
mirror fields in phase 4.

---

## 9. Performance budget

- **Second pane only exists while split is open.** No extra DB open, no extra startup
  cost, no extra listener.
- One chapter per pane (not the 3-page pager window) in split mode. At most 2 extra
  chapter texts in memory (~80 KB each).
- Alignment load: ≤ 200 rows per chapter, one query, cached with the chapter.
- Scroll work: binary search + one interpolation per frame; no React render, no
  `measureInWindow`, no array allocation in the handler. Target < 2 ms per frame on a
  Pixel 11 Pro; no frame over 16 ms during a 10 s scroll.
- Mirror: ≤ 2.5 writes/s while scrolling, < 300 bytes, only while followed and only
  with verse scope.
- The database cache stays at 6 chapters; split uses 2 of them. No change.

---

## 10. Acceptance tests

### Alignment (pure, CI)

1. Every verse in every translation maps to at least one segment.
2. Mapping is monotonic within a book.
3. Round-trip 10,000 random anchors: A → B → A returns to the same verse ±1.
4. `KJV Ps 3:1 → SFB15 Ps 3:2`, `SFB15 Ps 3:1 → KJV Ps 3:1 (fraction 0)`.
5. `KJV Ps 51:*` and `SFB15 Ps 51:*` stay within ±1 through the chapter.
6. `KJV 2 Cor 13:13 → SRB 12` (fraction > 0.5); `KJV 2 Cor 13:14 → SRB 13`;
   `SRB 13 → KJV 13:14`.
7. `KJV 3 John 14 → SRB 14`; `SRB 15 → KJV 14` (fraction > 0.5).
8. `SRB Rev 12:18 → KJV 13:1` (different chapter, flagged cross-chapter).
9. No mapping ever leaves the book; no mapping jumps backwards.
10. Report has zero uncovered verses and zero low-confidence chapters above the agreed
    threshold (review the top 20 manually).

### Split UI (device)

1. Open Jämför with KJV + SRB26. Both panes start at the same text.
2. Scroll the top pane to the middle of verse 4; the bottom pane shows the
   corresponding Swedish text at its reading line, not the top of verse 4.
3. Scroll the bottom pane to the Swedish title of Psalm 3; the top stays on KJV 3:1
   and shows `≈`.
4. Psalm 51, Job 39, Daniel 4, 2 Corinthians 13, 3 John, Revelation 12.
5. Change font size 12 → 28 and back; the anchor is preserved within one verse.
6. Drag the seam 35% / 65%; the anchor is preserved; no jump.
7. Link on: a chapter swipe in either pane turns both panes and both headers together.
   Link off: swipe the top pane; only the top pane and its header turn; repeat from the
   bottom pane.
8. Link off with the bottom pane on a different chapter: tap a verse in the bottom pane;
   the action sheet quotes that pane's chapter and translation, and the main reader keeps
   the top pane's chapter. A horizontal swipe starting on either pane header does not
   turn that pane.
9. Turn sync off, scroll one pane, turn it on: it re-anchors from the driver.
10. Reduce motion: instant, no easing; no motion sickness.
11. Dark theme (Vigil): both panes ≥ 4.5:1 text contrast; seam visible.
12. TalkBack/VoiceOver: each pane announces its translation and reference; scroll
    sync does not steal focus; the seam has an adjustable role.

### Mirror (two accounts, emulator + devices)

13. Sharer opens split, verse scope, follower taps Följ → follower sees both panes
    with the same translations within 1.5 s.
14. Sharer scrolls; both follower panes track within one publish interval; no visible
    rubber-banding.
15. Follower drags a pane → mirror pauses, `Följ igen` appears; tapping it returns to
    the sharer's current anchor.
16. Sharer turns split off → follower returns to one pane at the same anchor.
17. Sharer stops → follower restores its own split pair/ratio/position.
18. Old follower build → single pane at the right verse; no error.
19. Chapter scope → follower never receives `mode`, `secondaryVersionId` or an anchor
    fraction; only book + chapter.
20. Airplane mode on the follower → recorded position goes stale, no phantom live.

---

## 11. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Alignment is wrong in a hard chapter | Segment confidence, manual overrides, `≈` badge, named acceptance cases, report gate in CI |
| Two ScrollViews jank on low-end Android | UI-thread `scrollTo`, binary search, no per-frame React, 30 Hz JS fallback, test on the oldest supported device |
| Mirror write rate drains battery/data | Adaptive 400 ms only while scrolling, 1 s idle, only while followed, measure a 10 min session |
| Rules drift (not in repo) | Export and commit deployed rules before the payload change; emulator test that the exact payload is accepted |
| DB asset grows too large for OTA | Measure; ship alignments as a separate compact asset if needed; native build carries the DB |
| User confusion when numbering differs | `≈` badge with a one-line explanation, never silently wrong; no permanent banner |
| Follower forced into split unexpectedly | Auto per the requirement, but the bar offers `Visa bara en`; stop restores their layout |
| Font-size change loses the anchor | Capture before layout-key change, re-apply after both panes measure; test 12→28 |
| Cross-chapter mapping flips the follower | Clamp + `Fortsätter i …` chip; only the driver's own chapter change flips chapters |

---

## 12. Defaults chosen (change any of these and the plan adjusts)

- Vertical split, 50/50, 35–65% range; side by side only at ≥ 700 dp.
- Primary = the translation the reader was already in; secondary = the other available
  translation (last used pair remembered).
- Sync on by default; paging and scrolling move both panes together. With sync off each
  pane keeps its own chapter and scroll position; turning sync on aligns the secondary to
  the primary.
- Selectable text in both panes; the action sheet quotes the tapped pane's chapter and
  translation, even when the panes are on different chapters.
- No automatic chapter advance; a chip instead.
- `≈` for approximate and cross-chapter anchors; exact anchors are silent.
- Mirror auto-enters split for verse scope; `Visa bara en` for focus; chapter scope
  never reveals split details.
- No server-side alignment; everything ships in the database.
