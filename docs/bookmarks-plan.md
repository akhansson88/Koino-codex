# KOINO — Bokmärken och läsband (Bookmarks and reading ribbons)

**Product and implementation plan**
27 November 2026 · proposal for review
Owner: MausBot (Chief of Staff) with Sana (product/design), Noah (mobile), Tess (QA), Kai (lead)

---

## 1. The decision in brief

KOINO already has saved verses, but they are buried three taps deep, mixed in with highlights and reflections, and they cannot be organised, searched, annotated, exported or carried across Bible translations. The forum research in the Gemini thread points to one clear conclusion: **readers want two different tools, not one long list.**

1. **Läsband (reading ribbons)** — up to five one-tap place markers for active reading. A ribbon is where I am, not something I collect. It lives on the page edge, in a small ribbon sheet, and on Home as “Fortsätt läsa”. It syncs across devices.
2. **Bokmärken (bookmarks)** — the archive. A saved verse or passage, with an optional collection, an optional note, instant search, sort, swipe actions, bulk move/delete, and export. Private by default.
3. **The archive gets a real home.** A dedicated Bokmärken screen replaces the cramped “Sparade verser” list inside Mina platser. Compact rows, previews, collection chips, search and one-tap access from the reader.
4. **Saving stays out of the way.** Two taps from the text (select, bookmark), a soft toast, haptic feedback and undo. No modal, no forced folder, no interruption.
5. **One verse, every translation.** A bookmark is tied to the passage, not to the translation it was saved from. It opens in whichever Bible version the reader is using, with “Sparad från …” when the wording differs.
6. **Nothing gets lost.** Bookmarks are mirrored on the device, queued when offline, merged when the connection returns, and exportable as Markdown or CSV.
7. **It connects to the rest of KOINO.** A bookmark can be read aloud, opened in the Bible, shared to the community, turned into a prayer or used as the starting point for a journal reflection.

The feature is deliberately **private, quiet and personal**. There is no public bookmark feed, no follower counts and no notification spam.

---

## 2. What the research says

The Gemini conversation summarises discussions from Reddit (r/Bible, r/Christianity, r/Christian, r/kindle, r/DataHoarder, r/OliveTreeBETA). It is directional evidence, not a formal study, but the pattern is consistent and matches what mainstream Bible apps get wrong.

### 2.1 What readers want

| Want | What it means in practice |
|---|---|
| True ribbons for active reading | One-tap place-keeping at the exact verse or chapter. Readers juggle several chapters at once and want to jump between them without leaving the text. |
| Folders, labels and filtering | A way to group saved verses by topic or purpose, not one undifferentiated pile. |
| Fast, compact navigation | A quick dropdown or compact row list, with a preview of the passage, instead of oversized cards and full-page detours. |
| Cross-translation support | Bookmarks map to the verse, not to the translation, so they survive a version switch. |
| Offline-first reliability and sync | Bookmarks load and save in weak reception and airplane mode, then sync cleanly across devices. |
| Data export and ownership | A real export for backup, spreadsheets or flashcards, not a locked ecosystem. |

### 2.2 What frustrates them

| Pain point | What users complain about |
|---|---|
| Bookmarks buried in annotations | Apps lump active bookmarks in with hundreds of highlights and notes, with no filter to see only bookmarks. |
| Too many taps to view or delete | Full-page scrolling interfaces add friction; deleting one old bookmark can take four or more taps. |
| No export | YouVersion/Bible.com lack native export, forcing copy-paste or console scripts. |
| Web vs mobile mismatch | Tags added on mobile do not appear on the web version. |
| Sync delays and lost data | Bookmarks take minutes to appear, or disappear after an app update. |
| Weak spot-saving on web readers | Browser readers fail to remember the exact verse where the reader stopped. |

### 2.3 The design takeaway

> Separate ephemeral ribbons (a handful of movable, one-tap reading markers) from archival bookmarks (searchable, taggable, exportable verse collections).

That is the backbone of this plan. KOINO currently violates the first rule: saved verses, highlights, reflections and reading plans all sit under one “Mina platser” roof, and the saved list is a stage inside a bottom sheet.

### 2.4 Why this will feel different

Six moments do the emotional work:

1. **The ribbon on the page edge.** One tap, a small physical gesture, and the place is kept. It feels like a paper Bible, not a database.
2. **Saving without leaving the verse.** The text stays on screen; a toast and an undo are enough.
3. **A bookmark that survives a translation switch.** The verse is the object, not the wording. This quietly fixes something most Bible apps get wrong.
4. **Collections that feel like a shelf.** A few named folders, visible counts, no nested filing cabinet.
5. **An archive that is actually yours.** Search, sort, export, offline. No lock-in.
6. **A bookmark that can become a prayer or a share.** In KOINO, a saved word is not the end of the interaction; it is the beginning of one.

---

## 3. Where KOINO is today

### 3.1 What exists

| Area | Today |
|---|---|
| Saving | `savedVerses/{uid}` in Realtime Database. A verse or contiguous passage is saved from the selection sheet or the verse preview. Duplicate detection uses a stable identity. |
| Browsing | Bible tab → reader → More → Mina platser → Sparade verser. The list is a stage inside the reader’s bottom sheet. |
| Acting on a saved verse | Tap opens the verse position; a “…” sheet offers open, copy and remove. Saved passages also get an audio play control. |
| Identity | `savedVerseIdentity` includes the translation, so the same passage saved in two versions is two records. |
| Sync | `savedVerses` is read with `onValue` from RTDB. There is no local read cache, so a cold start without reception shows nothing until the network returns. |
| Rules | `savedVerses` is owner-only, validated, and `$other: false` — any new field needs a rules update. |
| Account deletion | `savedVerses` is already in the deletion manifest. |

### 3.2 Gaps against the research

| Research finding | KOINO today | What this plan does |
|---|---|---|
| Bookmarks buried in annotations | Three taps deep, inside Mina platser, beside highlights and reflections | Dedicated Bokmärken screen, one tap inside the reader’s tools sheet and a prominent Mina platser row |
| Folders, labels, filtering | None | Collections with counts and chips |
| Fast, compact navigation | Full text cards inside a bottom sheet, no search or sort | Compact rows, instant search, three sort orders, preview sheet |
| Cross-translation support | Translation is part of the identity | Canonical passage identity; resolves in the active version |
| Offline-first reliability | Network list only; no cold-start cache | AsyncStorage mirror plus an outbox; pending sync is visible but never blocks |
| Export and ownership | None | Markdown and CSV via clipboard/share; file export in the next native build |
| Ribbons for active reading | Reader remembers one last position locally/cloud, but there is no intentional marker and no multiple places | Up to five synced Läsband with a page-edge tab and a ribbon sheet |
| Too many taps to delete | “…” → remove, no undo | Swipe to delete, undo toast, bulk selection |
| Sync delays and lost data | No merge model beyond duplicate cleanup | Canonical keys, field-level merge, tombstones, deterministic migration |

### 3.3 What is already good and must stay

- The save action is already two taps and never leaves the text.
- Saved passages already support audio playback.
- The existing duplicate cleanup (`normalizeSavedVerseRecords`) is a good foundation for a translation-independent merge.
- The visual language is calm and warm; the new feature must not turn into a productivity dashboard.

---

## 4. The model: two tools, one home

|  | **Läsband** (ribbon) | **Bokmärke** (bookmark) |
|---|---|---|
| Job | Hold my place while I read | Keep this word for later |
| Lifetime | Hours to a few weeks | Months to years |
| Count | Up to 5 | Unlimited |
| Created by | One tap on the page edge | Select a verse, tap the bookmark pill |
| Holds | Position, optional label, last opened | Passage, saved text, collection, note, timestamps |
| Appears in | Reader edge tab, ribbon sheet, Home “Fortsätt läsa” | Bokmärken screen, search, reader preview, community |
| Removed by | Move or remove from the ribbon sheet | Swipe, bulk action or detail sheet, with undo |
| Shared | Never | Only when the person explicitly shares the verse |

### Why they must not be the same object

A ribbon is a **place**. A bookmark is a **word**. If we store ribbons as bookmarks, the archive fills with “where I stopped” noise, which is exactly the complaint in the research. If we store bookmarks as ribbons, we cap the archive at five. Separate stores, separate UI, one entry point called **Mina platser** (or **Bokmärken** from the reader).

### Naming

- **Bokmärken** — the archive. Replaces “Sparade verser” in the UI.
- **Läsband** — a ribbon. A physical, warm metaphor that fits KOINO’s Bible-first tone.
- Internally the RTDB path stays `savedVerses` for compatibility. New code uses “bookmark” naming; the path is an implementation detail.

---

## 5. The bookmark experience

### 5.1 Saving a verse

**From the reader**

1. The reader selects a verse or a contiguous passage (existing behaviour).
2. The selection toolbar shows the bookmark pill: **“Spara vers”** for one verse, **“Spara passagen”** for a range.
3. Tap once. The pill fills, a light haptic fires, and a toast appears above the bottom controls:
   - **“Sparat i Bokmärken”** · **Ändra** · **Ångra**
4. “Ändra” opens the bookmark detail sheet with the note field focused. “Ångra” removes it. The toast dismisses after 5 seconds; swiping it away keeps the bookmark.
5. If the passage is already saved, the toast says **“Redan sparat”** with **“Öppna”** instead of creating a duplicate.

**From everywhere else**

The same action works from:

- the verse preview sheet (community posts, search results, plan days),
- a Bible search result row (a small bookmark icon on the row),
- a reading-plan day (“Spara dagens läsning” saves the whole range),
- an audio passage (“Spara passagen”).

**What we deliberately avoid**

- No modal before saving.
- No “choose a collection first”.
- No full-screen confirmation.
- No confetti. A small scale on the pill and one haptic is enough.

### 5.2 The Bokmärken screen

**Route:** `/bookmarks`, a full screen in the app stack, opened from the reader’s tools sheet, Mina platser, and the Home card’s secondary action when bookmarks exist.

**Layout**

```
┌──────────────────────────────────────────┐
│  ‹   Bokmärken                    🔍  ⋯  │
│                                          │
│  Ditt läsband                            │
│  ┌────────────────────────────────────┐  │
│  │ ▍ Morgonläsning                    │  │
│  │   Filipperbrevet 4:13              │  │
│  │   Fortsätt läsa →                  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [Alla 24] [Bön 8] [Tröst 4] [+ Ny]     │
│                                          │
│  Senast sparade                  Sortera │
│  ┌────────────────────────────────────┐  │
│  │ ▍ Filipperbrevet 4:13         ⋯    │  │
│  │   Jag förmår allt genom honom …    │  │
│  │   Bön · anteckning                 │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ▍ Psaltaren 23:1–3            ⋯    │  │
│  │   Herren är min herde …            │  │
│  │   Tröst                            │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Behaviour**

- **Ribbon strip** at the top: the most recently used ribbon, or a compact horizontal row of up to five ribbons. “Fortsätt läsa” opens the exact position in the reader. A pencil icon opens the ribbon sheet. Hidden when there are no ribbons.
- **Collection chips**: “Alla” with total count, then user collections with counts, then “Ogrupperade” when it has items, then “+ Ny samling”. Horizontal scroll, never wraps.
- **Rows**: reference in semibold, two lines of verse text, a collection chip and a note indicator. The row is compact, not a large card. Tapping opens the preview sheet; the “⋯” button opens the same actions as a swipe.
- **Sort**: “Senast sparade” (default), “Bibelordning”, “Senast öppnade”. A bottom sheet, remembered per account on the device.
- **Search**: a field that expands under the header. Searches reference, verse text and note text instantly. Shows “3 träffar i Bön” when a collection filter is active.
- **Swipe**: right → “Läs”, left → “Flytta” and “Ta bort” (red). Full swipe left deletes with undo. Every swipe action is also available from the “⋯” menu for accessibility.
- **Long-press**: enters selection mode with checkboxes. Bottom bar: “Flytta”, “Ta bort”, “Kopiera”. “Välj alla” in the header.
- **Empty state**: a warm illustration of an open Bible with three ribbons and the copy “Spara det du vill återvända till.” Three examples underneath: “En vers som tröstar”, “Ett löfte du ber över”, “Något du vill dela.” One button: “Öppna Bibeln”.
- **Offline**: rows are readable immediately from the local mirror. If writes are waiting, a slim chip in the header says “Väntar på synk” with a cloud-off icon. It disappears when the outbox drains. No blocking spinner.

### 5.3 The bookmark preview sheet

Tapping a row opens a bottom sheet, not the reader. This is the “preview without losing my spot” requirement.

```
┌────────────────────────────────────────┐
│  Filipperbrevet 4:13              ×    │
│  Sparad från Reformationsbibeln        │
│                                        │
│  Jag förmår allt genom honom som ger   │
│  mig kraft.                            │
│                                        │
│  [Läs i Bibeln]        [Lyssna]        │
│                                        │
│  Samling      [Bön ▾]                  │
│  Anteckning                            │
│  ┌──────────────────────────────────┐  │
│  │ Bär den här i bönen för Elliot.  │  │
│  └──────────────────────────────────┘  │
│  Sparat                                │
│                                        │
│  [Dela]  [Be]  [Reflektera]            │
│  Ta bort bokmärket                     │
└────────────────────────────────────────┘
```

- **Läs i Bibeln** closes the sheet and opens the passage at the bookmark, preserving the reader’s back stack.
- **Lyssna** plays the saved passage with the existing audio control.
- **Collection** opens a compact picker; choosing one writes immediately and shows a check.
- **Note** autosaves 600 ms after typing stops and on blur, with a quiet “Sparat” line. Limit 500 characters, counter appears after 400. The note is not a journal entry; “Reflektera” opens the journal with the verse attached for longer writing.
- **Dela** opens the existing community share flow with the verse attached. The bookmark itself stays private; the note and collection are never included.
- **Be** opens the existing prayer flow with the verse attached. This is the KOINO-specific move: a saved word becomes a prayer, not just a highlight.
- **Ta bort** asks once, removes the bookmark and shows an undo toast for 5 seconds.

### 5.4 Collections

- One collection per bookmark in v1. A folder model, not a tag cloud: it keeps the picker to one tap and the mental model clear.
- Default smart views: **Alla**, **Ogrupperade**. “Ogrupperade” only appears when it has items.
- User collections: name 1–40 characters, one of six muted colour IDs (ember, clay, moss, rose, gold, violet), sort order.
- Create from the chip row (“+ Ny samling”), from the bookmark sheet, or from a selection (“Flytta till ny samling”).
- Rename and delete from the collection header menu. Deleting a collection **never deletes bookmarks**; its items move to Ogrupperade and the confirmation says so: “Bokmärkena finns kvar i Ogrupperade.”
- Colour is a dot and a thin left rule on the row, never the only signal. The collection name is always visible.
- No nested folders. No multiple tags in v1. The data model can grow to `collectionIds: string[]` later without a migration, but the UI stays one folder until people ask.

### 5.5 Search

- Local, instant, over the bookmarks already loaded in the store.
- Matches:
  - reference: `Fil 4:13`, `Filipperbrevet 4:13`, `Phil 4:13`, `Philippians 4:13`;
  - words in the verse text, including partial words;
  - words in the note.
- Swedish diacritics are folded: `å`, `ä`, `ö` match `a`, `a`, `o`; case-insensitive.
- Ranking: exact reference, then reference prefix, then note, then verse text, then recency.
- A “Sök i bokmärken” field also appears in the Bible search screen as a section above the Scripture results when the query matches saved items. It links to the full Bokmärken screen with the query applied.
- No results: “Inga bokmärken matchar ‘{query}’” with a button that clears the search.
- Debounce 120 ms. No network. No spinner.

### 5.6 Sort

| Sort | Use |
|---|---|
| Senast sparade | Default: what I just saved |
| Bibelordning | Study: Genesis → Revelation |
| Senast öppnade | Return to what I actually use |

The choice is stored per account on the device. It does not need to sync.

### 5.7 Export and ownership

- **Export** lives in the Bokmärken header’s “⋯” menu.
- **V1 (no new native modules):**
  - “Kopiera som Markdown” — grouped by collection, with reference, text, note and saved date.
  - “Dela som text” — the same Markdown through the native share sheet.
  - “Kopiera som CSV” — one row per bookmark.
- **V1.1 (next native build):** “Spara som fil” with `expo-sharing`, offering `.md` and `.csv`.
- A short line above the buttons: “Exporten innehåller dina personliga anteckningar.”
- No bookmark is ever uploaded anywhere except the person’s own KOINO account.

### 5.8 Cross-translation behaviour

- Identity is canonical: `book + chapter + startVerse + endVerse`. Translation is **not** part of the key.
- The bookmark stores the text and translation it was saved from, so it can always be shown exactly as saved.
- When opened in another Bible version, KOINO resolves the passage in the active version:
  - If the passage exists: show the active version’s text and a caption “Visas i Reformationsbibeln · sparad från KJV”.
  - If the verse range does not exist in that version: show the saved text with “Visas som sparad · finns inte i Reformationsbibeln”.
- Notes and collections belong to the passage, so they follow across versions.
- Saving the same passage again in another version updates nothing and shows “Redan sparat”.

### 5.9 Offline and sync

- **Read cache:** every change writes a compact snapshot to AsyncStorage per user (`koino.bookmarks.<uid>`). On app start, the list renders from this snapshot before the network responds. This is what makes bookmarks available in airplane mode and on a cold start.
- **Write outbox:** saves, edits, moves and deletes go to the local snapshot immediately and to RTDB when online. If the app is offline, the operation is queued in `koino.bookmarks.outbox.<uid>` and replayed when `.info/connected` returns.
- **Merge:** records carry `updatedAt` (record), `noteUpdatedAt` (note) and `savedAt`. On a remote snapshot:
  - if the local record has a newer pending edit, the local value stays until the write is acknowledged;
  - notes merge by `noteUpdatedAt`, so a collection change on one device does not overwrite a note typed on another;
  - deletes leave a tombstone for 30 days, so an offline device cannot resurrect a deleted bookmark;
  - the newest text and translation win for display, but `savedAt` keeps the earliest save date.
- **Indicator:** pending work shows as “Väntar på synk” in the header, never as an error dialog.
- **Failure:** if a write is rejected by rules, the local optimistic state is rolled back and a plain toast says “Kunde inte spara bokmärket. Försök igen.” The bookmark is not silently lost.

---

## 6. The ribbon experience

### 6.1 Setting a ribbon

- A slim ribbon tab sits on the right edge of the reader, below the header, vertically centred. It is 12 × 56 px, rounded on the left, ember coloured, with a small notch at the top like a real ribbon end.
- One tap sets or moves a ribbon to the **top visible verse**. The tab fills, a light haptic fires, and a toast says “Läsband satt vid Filipperbrevet 4:13” with “Ändra” and “Ångra”.
- If a ribbon already exists at that verse, the tap opens the ribbon sheet instead of creating a duplicate.
- The tab is hidden in split view, in flowing-paragraph mode when it would overlap text, and when the reader setting “Visa läsband” is off (default on). This keeps the text clean for people who do not want it.

### 6.2 The ribbon sheet

Opened by long-pressing the edge tab, from the tools sheet (“Läsband”), or from Mina platser.

```
Läsband
┌──────────────────────────────────────┐
│ ▍ Morgonläsning                      │
│   Filipperbrevet 4:13        Fortsätt│
├──────────────────────────────────────┤
│ ▍ Tröst                              │
│   Psaltaren 23:1             Fortsätt│
└──────────────────────────────────────┘
[ Sätt ett läsband här ]
```

- Each row shows the label (default: the reference), the reference, and “Fortsätt”.
- A pencil opens rename (1–40 characters, default reference). A trash icon removes it with undo.
- “Sätt ett läsband här” is disabled when the current position already has one.
- **Limit: five.** Adding a sixth opens a picker: “Du har fem läsband. Välj ett att flytta hit.” The chosen ribbon keeps its label and moves; its old position disappears. One confirmation, no silent deletion.
- Below the pinned ribbons, a muted **“Senaste platser”** section shows the last three places from the reader’s own history, so someone juggling more than five chapters still has a fast path. These are automatic and not ribbons; they follow the reader’s own history.
- Ribbons sync through `bibleRibbons/{uid}` so the same place is available on another phone.

### 6.3 Home

- When there is no active reading plan, the existing Home card becomes ribbon-aware:
  - title: the ribbon label or reference;
  - body: the verse preview;
  - primary: “Fortsätt läsa” opens the ribbon position;
  - secondary: “Bokmärken” when the person has bookmarks, otherwise “Hitta plan” so plan discovery is not lost.
- When a plan has today’s reading, the plan card wins, exactly as today. The ribbon remains available in the reader and Mina platser; Home stays calm.
- If there is no ribbon but there is a last reading position, the old “Fortsätt läsa” behaviour remains as a fallback.

### 6.4 Why five

A physical Bible has a handful of ribbons, not fifty. Five covers the common patterns: personal reading, a study passage, a sermon series, a passage prayed for someone, and a passage to share. The automatic “Senaste platser” list absorbs the extra chapters a heavy reader moves through, so the pinned set stays intentional. The limit is what keeps ribbons from becoming another archive.

---

## 7. Entry points and navigation

| Where | Action | Cost |
|---|---|---|
| Reader, right edge | Set/move ribbon; long-press opens ribbon sheet | 1 tap |
| Reader, tools sheet (More) | “Bokmärken” row with count; “Läsband” row | 2 taps |
| Reader, selection toolbar | Save verse/passage | 2 taps (select, save) |
| Mina platser | “Bokmärken” first row with count; “Läsband” second; highlights, reflections and plans below | 3 taps |
| Bible search result | Bookmark icon on the row | 1 tap on a result |
| Plan day | “Spara dagens läsning” | 2 taps |
| Community post verse | Save in the verse preview | 2 taps |
| Home, no plan | “Fortsätt läsa” (ribbon) + “Bokmärken” when bookmarks exist | 1 tap |
| Bokmärken row | Preview sheet, then “Läs i Bibeln” | 2 taps from the list |

**Mina platser becomes:**

```
Mina platser
  Bokmärken            24
  Läsband               2
  Senast markerat      12
  Mina bibelreflektioner 5
  Läsplaner             3
```

The old “Sparade verser” stage inside the bottom sheet is removed. Its row opens `/bookmarks` instead. This is the single biggest fix for the “buried in annotations” complaint.

---

## 8. Visual and interaction design

### 8.1 Principles

- **Paper, not dashboard.** Cream surfaces, white rows, one ember accent, thin lines. No purple gradients, no glassmorphism, no glow.
- **The bookmark is a physical object.** A thin coloured rule on the left of a row, a ribbon tab on the page edge, a folded-corner motif in the empty state. Not a generic outline icon everywhere.
- **Quiet motion.** 150–220 ms. A soft spring on save, a fade on undo, a slide on sheets. Reduce Motion replaces springs with fades.
- **One accent per screen.** Ember for actions and the active ribbon; collection colours are small dots, never large fills.
- **Text is the hero.** Verse text is at least 16 px, line height 26, maximum two lines in a row and full text in the preview. Notes are 14–15 px, muted, never truncated to one word.

### 8.2 Components

| Component | Notes |
|---|---|
| `BookmarkRow` | 72–88 px tall, left colour rule 3 px, reference 15/20 semibold, text 15/22 two lines, meta line with collection + note icon. 44 px “⋯” hit target. |
| `CollectionChip` | 36 px tall, 12 px horizontal padding, 6 px colour dot, count in muted text. Selected state: ink border, cream fill. |
| `RibbonTab` | 12 × 56 px, ember, left-rounded, 1 px inner highlight, notch at top. Pressed: 92% scale. |
| `RibbonRow` | 56 px, small ribbon glyph, label semibold, reference muted, “Fortsätt” with chevron. |
| `BookmarkSheet` | Standard bottom sheet, 28 px top radius, drag handle, max height 88%, keyboard-aware. |
| `EmptyBookmarks` | Custom illustration (open Bible, three ribbon tails) at 180 px, headline, three examples, one button. |
| `SyncChip` | 28 px, cloud-off icon, “Väntar på synk”, muted. Never red. |

### 8.3 Colour and type

Use existing tokens:

- canvas `#FAF6F0`, surface `#FFFFFF`, ink `#1D1611`, muted `#6A5A4C`, line `#E7DCCE`;
- ember `#A64B21` for the ribbon and primary action;
- collection IDs map to theme tokens: ember, clay, moss, rose, gold, violet;
- headings Montserrat SemiBold, body Inter, verse text in the reader’s chosen font when previewed inside the reader; in the library, Inter for UI consistency.

### 8.4 Dark mode

- Rows use `#1D1813` with `#332A22` hairlines.
- The ribbon becomes amber `#E8A45C`, not the light-mode ember, to keep contrast.
- Collection dots use the dark variants; the collection name is always present, so colour is never the only cue.
- The empty-state illustration switches to a dark paper version; no pure-white card.

### 8.5 Motion spec

| Moment | Motion |
|---|---|
| Save | Pill scales 1 → 1.06 → 1 over 180 ms; haptic light. |
| Toast | Slide up 8 px + fade 160 ms; auto-dismiss 5 s. |
| Delete | Row collapses 180 ms; toast with undo. |
| Ribbon set | Tab fills with a 200 ms wipe from top to bottom; haptic light. |
| Sheet | Standard 240 ms ease-out; reduce motion = fade. |
| Collection pick | Check mark pops 120 ms; no bounce. |

---

## 9. Data model

### 9.1 Bookmark (`savedVerses/{uid}/{id}`)

The path stays `savedVerses` for compatibility. New fields are additive.

```json
{
  "id": "passage_%5B%22philippians%22%2C4%2C13%2C13%5D",
  "schema": 2,
  "book": "Philippians",
  "chapter": 4,
  "startVerse": 13,
  "endVerse": 13,
  "reference": "Filipperbrevet 4:13",
  "referenceText": "Filipperbrevet 4:13",
  "text": "Jag förmår allt genom honom som ger mig kraft.",
  "translation": "reformationsbibeln2026",
  "contextBefore": null,
  "contextAfter": null,
  "savedAt": "2026-11-12T07:14:00.000Z",
  "updatedAt": "2026-11-27T16:02:00.000Z",
  "note": "Bär den här i bönen för Elliot.",
  "noteUpdatedAt": "2026-11-27T16:02:00.000Z",
  "collectionId": "prayer",
  "lastOpenedAt": "2026-11-27T18:10:00.000Z"
}
```

- `id` is `passage_` + URL-encoded `[book, chapter, startVerse, endVerse]` with normalized lowercase book names. No translation in the key.
- `savedAt` is the first save. It never changes.
- `updatedAt` changes on collection or note edits.
- `noteUpdatedAt` changes only on note edits, so notes merge independently.
- `lastOpenedAt` is written at most once every five minutes per bookmark, to avoid write storms.
- Legacy fields (`contextBefore`, `contextAfter`) are preserved.

### 9.2 Collection (`bookmarkCollections/{uid}/{collectionId}`)

```json
{
  "id": "prayer",
  "name": "Bön",
  "color": "rose",
  "sortOrder": 2,
  "createdAt": "2026-11-27T15:00:00.000Z",
  "updatedAt": "2026-11-27T15:00:00.000Z"
}
```

- `id` is a Firebase-safe slug generated on creation (`prayer`, `troest`, or a short random suffix on collision).
- `name` 1–40 characters.
- `color` one of `ember`, `clay`, `moss`, `rose`, `gold`, `violet`.
- `sortOrder` is a number; ties sort by name.
- Deleting a collection is a client multi-path update: remove the collection, set `collectionId: null` on its bookmarks. No bookmark is deleted.

### 9.3 Ribbon (`bibleRibbons/{uid}/{ribbonId}`)

```json
{
  "id": "ribbon_philippians_4_13",
  "book": "Philippians",
  "chapter": 4,
  "verse": 13,
  "label": "Morgonläsning",
  "createdAt": "2026-11-26T06:40:00.000Z",
  "updatedAt": "2026-11-27T06:42:00.000Z",
  "lastOpenedAt": "2026-11-27T18:10:00.000Z"
}
```

- `id` is deterministic from the position, so the same position cannot have two ribbons.
- Moving a ribbon is a single multi-path update: create the new key, remove the old key, keep the label.
- `label` optional, 1–40 characters; defaults to the localized reference.
- Max five enforced in the client; rules validate each record.

### 9.4 Tombstone (`bookmarkTombstones/{uid}/{bookmarkId}`)

```json
{ "bookmarkId": "passage_...", "deletedAt": "2026-11-27T16:10:00.000Z" }
```

- Written on delete, read during merge, pruned after 30 days by the client on launch.
- Prevents an offline device from resurrecting a deleted bookmark.
- Not needed for collections or ribbons in v1 (collection delete reassigns; ribbon delete is rare), but the same pattern can be added later.

### 9.5 Local cache keys

| Key | Contents |
|---|---|
| `koino.bookmarks.<uid>` | `{version, bookmarks[], collections[], ribbons[], savedAt}` compact snapshot |
| `koino.bookmarks.outbox.<uid>` | `[{op, path, value, at}]` pending writes |
| `koino.bookmarks.backup.<uid>` | Raw pre-migration `savedVerses` node, kept 90 days |
| `koino.bookmarks.sort.<uid>` | Last sort choice |

All local keys are cleared on sign-out, like the rest of the user’s local data.

---

## 10. Migration

### 10.1 Goals

- No saved verse disappears.
- The same passage saved in two translations becomes one bookmark.
- Notes, collections and saved dates survive.
- The migration is idempotent and safe to run on two devices.
- A failed migration never blocks app start.

### 10.2 Read-time merge first, write-time migration second

1. **Read-time:** `normalizeSavedVerseRecords` becomes translation-independent. It groups by canonical passage and returns one record per passage, choosing:
   - the earliest `savedAt`,
   - the newest `text` and `translation`,
   - the newest `reference`/`referenceText`,
   - the newest `note` and `noteUpdatedAt`,
   - any existing `collectionId`,
   - the maximum `updatedAt`.
   This means the new UI never shows duplicates, even before the migration writes.
2. **Write-time:** when online, a one-time migration writes the merged records under canonical keys and removes the old translation-keyed keys in a multi-path `update()` call. Under 500 records this is one atomic update; larger libraries are migrated in idempotent chunks of 500. It writes `bookmarkMeta/{uid}` with `{schema: 2, migratedAt}` and sets a local flag.
3. **Backup:** before the write, the raw `savedVerses/{uid}` node is saved to `koino.bookmarks.backup.<uid>` on the device. It is kept for 90 days and never uploaded.
4. **Failure:** if the update fails, the local flag is not set and the app keeps using the read-time merged view. The next launch retries.

### 10.3 Old builds

An older app build on another device can still write translation-keyed records after migration. The new build merges them on read and rewrites them on the next successful migration pass. This is acceptable while old builds are in the field; the merge is deterministic and lossless. We will not invalidate old builds.

### 10.4 What is not migrated

- No new collection is created automatically. All existing bookmarks start in Ogrupperade.
- No note is invented.
- No saved verse is re-fetched from the Bible database during migration; the stored text is preserved.
- `savedAt` keeps the earliest date, even if the duplicate from another translation was saved later.

---

## 11. Rules and backend

### 11.1 Database rules

Add to `firebase.rules.json`:

- **`savedVerses/{uid}/{verseId}`**: allow `schema`, `updatedAt`, `note`, `noteUpdatedAt`, `collectionId`, `lastOpenedAt`; validate lengths and types; keep `$other: false`.
- **`bookmarkCollections/{uid}`**: owner read/write; each child validates `id`, `name` (1–40), `color` (six IDs), `sortOrder`, `createdAt`, `updatedAt`; `$other: false`.
- **`bibleRibbons/{uid}`**: owner read/write; each child validates `id`, `book`, `chapter` > 0, `verse` > 0, `label` (1–40 when present), timestamps; `$other: false`.
- **`bookmarkTombstones/{uid}`**: owner read/write; `bookmarkId`, `deletedAt`; `$other: false`.
- **`bookmarkMeta/{uid}`**: owner read/write; `schema`, `migratedAt`.

No group read access. Bookmarks are personal.

### 11.2 Functions and manifests

- `functions/src/account-deletion/manifest.ts`: add `bookmarkCollections`, `bibleRibbons`, `bookmarkTombstones`, `bookmarkMeta`.
- `functions/src/signup-guard/store.ts`: add the same paths to the personal collection list, so a failed signup cleans them.
- `functions/src/encryption.ts`: add the same paths to the personal collection list used by account conversion/deletion.
- No new Cloud Function is required for v1. Tombstone pruning runs on the client at launch; if that proves unreliable, add a daily scheduled prune later.

### 11.3 Deployment order

1. Rules to `koino-dev`; test with the Dev build.
2. Rules to `koino-codex` (production). Additive rules are safe for old clients: they ignore new fields, and old writes still validate.
3. Functions with the updated manifests (account deletion path).
4. EAS Update with the new JS to the production branch.
5. After 1 December, the next Android store build (versionCode 43) and the matching iOS build carry the same JS for new installs.

---

## 12. Privacy and data ownership

- Bookmarks, notes, collections and ribbons are **private to the account**. Rules allow only the owner to read or write.
- There is no public bookmark count, no “saved by 12 people”, no social proof.
- Sharing is always explicit: “Dela” creates a community post through the existing flow. The bookmark itself stays private.
- Notes may contain sensitive prayer details. They are never sent to analytics, crash reports or logs. Error messages include the bookmark ID, not the note text.
- Export is user-initiated and warns that it contains personal notes.
- Account deletion removes all bookmark data through the existing manifest.
- Sign-out clears the local cache and outbox for that user, so the next account cannot see the previous person’s bookmarks.

---

## 13. Accessibility and performance

### 13.1 Accessibility

- Every touch target is at least 44 × 44 px.
- The ribbon tab has `accessibilityLabel` “Sätt läsband här” / “Öppna läsband” and `accessibilityRole="button"`.
- A bookmark row announces: reference, first line of text, collection, “har anteckning”, and the actions available.
- Saved state is announced: “Sparad” / “Inte sparad”.
- Swipe actions are duplicated in the “⋯” menu, so no action requires a gesture.
- Dynamic type up to 200%: rows grow, the reference wraps, the “⋯” stays 44 px, the chip row scrolls.
- Reduce Motion: springs become fades; the ribbon wipe becomes a fill.
- Dark mode: all tokens have dark variants; collection colour is never the only cue.
- VoiceOver/TalkBack order: header, ribbon strip, chips, sort, rows.

### 13.2 Performance

- Target: 1,000 bookmarks on a Pixel 11 Pro and an iPhone 13, 60 fps scrolling.
- `FlatList` with `getItemLayout` for fixed-height rows (estimated height for two-line rows; measure if needed).
- Search index built lazily on first open: a normalized string per bookmark (`reference + text + note`). Rebuild only when the bookmark list changes.
- Debounce search 120 ms; no results under 50 ms for 1,000 items on device.
- Cache hydration before the first paint; no full-screen spinner on a warm start.
- RTDB listeners are scoped to the signed-in user and detached on sign-out.
- Migration runs once, off the main interaction path, and is chunked at 500 records; each chunk is idempotent and safe to retry.

---

## 14. Copy deck

| Key | Swedish | English |
|---|---|---|
| `bookmarks.title` | Bokmärken | Bookmarks |
| `bookmarks.search` | Sök i bokmärken | Search bookmarks |
| `bookmarks.empty.title` | Spara det du vill återvända till | Save what you want to return to |
| `bookmarks.empty.body` | En vers som tröstar, ett löfte du ber över, något du vill dela. | A verse that comforts, a promise you pray, something you want to share. |
| `bookmarks.empty.example1` | En vers som tröstar | A verse that comforts |
| `bookmarks.empty.example2` | Ett löfte du ber över | A promise you pray |
| `bookmarks.empty.example3` | Något du vill dela | Something you want to share |
| `bookmarks.empty.action` | Öppna Bibeln | Open the Bible |
| `bookmarks.savedToast` | Sparat i Bokmärken | Saved to Bookmarks |
| `bookmarks.alreadySaved` | Redan sparat | Already saved |
| `bookmarks.undo` | Ångra | Undo |
| `bookmarks.change` | Ändra | Change |
| `bookmarks.open` | Öppna | Open |
| `bookmarks.readInBible` | Läs i Bibeln | Read in the Bible |
| `bookmarks.listen` | Lyssna | Listen |
| `bookmarks.share` | Dela | Share |
| `bookmarks.pray` | Be | Pray |
| `bookmarks.reflect` | Reflektera | Reflect |
| `bookmarks.delete` | Ta bort bokmärket | Remove bookmark |
| `bookmarks.deleted` | Bokmärket togs bort | Bookmark removed |
| `bookmarks.note.label` | Anteckning | Note |
| `bookmarks.note.placeholder` | Varför sparade du den här? | Why did you save this? |
| `bookmarks.note.saved` | Sparat | Saved |
| `bookmarks.note.limit` | {count}/500 | {count}/500 |
| `bookmarks.collection.label` | Samling | Collection |
| `bookmarks.collection.all` | Alla | All |
| `bookmarks.collection.unsorted` | Ogrupperade | Unsorted |
| `bookmarks.collection.new` | Ny samling | New collection |
| `bookmarks.collection.name` | Namn | Name |
| `bookmarks.collection.deleteTitle` | Ta bort samlingen? | Delete the collection? |
| `bookmarks.collection.deleteBody` | Bokmärkena finns kvar i Ogrupperade. | The bookmarks stay in Unsorted. |
| `bookmarks.sort.recent` | Senast sparade | Recently saved |
| `bookmarks.sort.canonical` | Bibelordning | Biblical order |
| `bookmarks.sort.opened` | Senast öppnade | Recently opened |
| `bookmarks.savedFrom` | Sparad från {version} | Saved from {version} |
| `bookmarks.shownIn` | Visas i {version} | Shown in {version} |
| `bookmarks.savedTextFallback` | Visas som sparad · finns inte i {version} | Shown as saved · not in {version} |
| `bookmarks.sync.pending` | Väntar på synk | Waiting to sync |
| `bookmarks.export.title` | Exportera bokmärken | Export bookmarks |
| `bookmarks.export.markdown` | Kopiera som Markdown | Copy as Markdown |
| `bookmarks.export.csv` | Kopiera som CSV | Copy as CSV |
| `bookmarks.export.share` | Dela som text | Share as text |
| `bookmarks.export.warning` | Exporten innehåller dina personliga anteckningar. | The export contains your personal notes. |
| `ribbons.title` | Läsband | Ribbons |
| `ribbons.set` | Sätt läsband här | Set a ribbon here |
| `ribbons.setToast` | Läsband satt vid {reference} | Ribbon set at {reference} |
| `ribbons.exists` | Det finns redan ett läsband här | There is already a ribbon here |
| `ribbons.continue` | Fortsätt | Continue |
| `ribbons.rename` | Byt namn | Rename |
| `ribbons.remove` | Ta bort läsbandet | Remove ribbon |
| `ribbons.limitTitle` | Du har fem läsband | You have five ribbons |
| `ribbons.limitBody` | Välj ett att flytta hit. | Choose one to move here. |
| `ribbons.move` | Flytta hit | Move here |
| `ribbons.hide` | Visa läsband | Show ribbons |
| `ribbons.homeTitle` | Ditt läsband | Your ribbon |

Tone: short, warm, no exclamation marks. “Sparat” is enough; no “Great job!”. Swedish is the source, English mirrors it.

### Existing keys that change

| Key | New Swedish | Why |
|---|---|---|
| `bible.selection.savePassage` | Spara passagen | Clearer than “Spara bibelord” |
| `bible.selection.savedPassage` | Passagen sparad | Matches the action |
| `bible.selection.savedDetail` | Du hittar den under Bokmärken. | Points to the new home |
| `shared.scripture.saveVerse` | Spara bibelvers | Unchanged; still used in previews |
| `shared.scripture.savedVerse` | Bibelvers sparad | Unchanged |
| Toast fallback in `features/bible-reader/toast.tsx` | Du hittar den under Bokmärken. | Replaces “sparade verser” |

No other existing key changes. The old “Sparade verser” strings stay in the file for one release, then are removed once no screen references them.

---

## 15. Edge cases

| Case | Behaviour |
|---|---|
| Save while offline | Local save + toast; queued; syncs later. No error. |
| Save a passage that is already saved in another translation | “Redan sparat”; open the existing bookmark. |
| Save a passage with a very long verse range | Allow; row preview truncates; export contains the full text. |
| Verse range does not exist in the active translation | Show the saved text with the fallback caption. |
| Note contains only whitespace | Treated as empty; `note` removed; `noteUpdatedAt` updated. |
| Note over 500 characters | Input stops at 500 with a counter; paste is truncated with a gentle toast. |
| Delete a bookmark that is open in another device | Tombstone wins after merge; the other device removes it and shows no error. |
| Delete a collection with 40 bookmarks | Confirmation; all 40 move to Ogrupperade; undo restores the collection and assignments for 5 s. |
| Rename a collection to an existing name | Allowed; names are labels, not keys. |
| Five ribbons, add a sixth | Picker to move one; no silent deletion. |
| Ribbon position no longer exists in a new translation | Ribbon stores canonical book/chapter/verse; opening clamps to the nearest valid verse and shows a toast. |
| Sign out while the outbox has writes | Try to flush first. If still pending, warn that the latest changes may be lost, then clear all local bookmark keys. Nothing stays on the device for the next account. |
| Account deletion with pending writes | Local outbox is cleared on sign-out/deletion; server data is removed by the manifest. |
| Storage full | Cache write fails silently; the app still uses RTDB; a one-time toast explains that offline reading is unavailable. |
| 1,000+ bookmarks | Virtualized list, lazy search index, no jank. |

---

## 16. Acceptance criteria

1. From the reader, selecting a verse and tapping the bookmark pill saves it in **two taps**, with no modal, and shows a toast with undo.
2. The saved bookmark appears in Bokmärken within **300 ms** on the same device, including offline.
3. After reconnect, the same bookmark appears on a second device signed into the same account.
4. Saving the same passage in a different Bible translation does **not** create a duplicate; opening it in the new translation shows the passage with a “Sparad från …” caption.
5. A bookmark with a note can be found by a word in the note, and by `Fil 4:13` / `Filippians 4:13`, in under **100 ms** with 1,000 bookmarks.
6. Swipe-left + delete removes a bookmark in **one gesture**; undo restores the exact bookmark, note and collection.
7. Deleting a collection leaves all its bookmarks in Ogrupperade; the confirmation says so.
8. A ribbon can be set in **one tap** from the page edge, appears on Home as “Fortsätt läsa”, and syncs to a second device.
9. Adding a sixth ribbon opens the “choose one to move” sheet and never deletes a ribbon silently.
10. Export produces valid Markdown and CSV with every bookmark, note and collection, and no duplicates.
11. The migration preserves every existing saved verse; duplicate translations merge into one; the earliest `savedAt` is kept; no note is lost; running it twice changes nothing.
12. All new touch targets are at least 44 × 44 px; VoiceOver/TalkBack announces reference, text, collection, note state and actions; dark mode and 200% text pass.
13. The feature ships as an **EAS Update with no new native modules**; the next store builds (Android versionCode 43 and the matching iOS build) include it for new installs.
14. 1,000 bookmarks scroll at 60 fps on a Pixel 11 Pro and an iPhone 13.

---

## 17. Test plan

### 17.1 Unit / script tests

`scripts/validate-bookmarks.mjs`:

- canonical identity ignores translation, normalizes book names and whitespace;
- duplicate merge keeps earliest `savedAt`, newest text/translation, newest note, max `updatedAt`;
- migration is idempotent over 200 fixtures, including duplicates across two translations;
- search matches diacritics, partial words and reference aliases;
- sort orders are stable;
- export Markdown/CSV escapes quotes, commas and newlines correctly;
- collection deletion reassigns bookmarks;
- ribbon limit and deterministic keys;
- outbox replay is idempotent and drops acknowledged operations.

`scripts/validate-bookmarks-emulator.mjs`:

- owner can read/write own bookmarks, collections, ribbons, tombstones, meta;
- another user is denied all of them;
- `$other: false` rejects an unknown field;
- note > 500 characters is rejected;
- ribbon label > 40 characters is rejected;
- deleting a collection does not delete its bookmarks (client multi-path update tested against the emulator).

### 17.2 Device matrix

| Device | What to verify |
|---|---|
| Pixel 11 Pro, production build 41 + EAS Update | Save, list, search, collections, notes, swipe, undo, ribbon, Home, offline cold start, reconnect, migration of the real account |
| Pixel 10 emulator, Dev build (`koino-dev`) | Rules, migration fixtures, two-account isolation, error paths |
| iPhone 13 / next iOS build (TestFlight) | Same flows, share sheet, keyboard avoidance, dynamic type, VoiceOver |
| Tablet / split reader | Ribbon tab hidden, bookmark accessible from tools, preview sheet width |

### 17.3 Scenario script

1. Fresh account with no bookmarks → empty state → “Öppna Bibeln”.
2. Save one verse → toast → undo → re-save.
3. Save the same verse in another translation → “Redan sparat”.
4. Save a range → row shows the range.
5. Create “Bön” → add 3 bookmarks → filter chip → counts.
6. Add a note → search a word from it → open → edit → clear.
7. Swipe-left delete → undo.
8. Long-press select 5 → move to “Tröst” → select all → copy.
9. Export Markdown → paste into a note → verify structure.
10. Set a ribbon → Home shows it → open → move it → rename → delete.
11. Fill five ribbons → add sixth → move one.
12. Airplane mode: save, edit note, delete → restart app → verify local state → reconnect → verify server and second device.
13. Migrate the real `ak.hansson88@gmail.com` account with existing saved verses → compare counts and spot-check 10 records.
14. Delete account in the Dev environment → verify bookmark paths are removed.

---

## 18. Rollout

| Step | When | Notes |
|---|---|---|
| 1. Rules + types + migration (Dev) | Week 1 | `koino-dev`, test account, fixtures |
| 2. Bookmark screen + save + collections + notes | Week 1–2 | Feature-complete on Dev |
| 3. Search + export + swipe + bulk | Week 2 | No new native modules |
| 4. Ribbons + Home + edge tab | Week 2–3 | Dev and production |
| 5. Rules to production | Before the JS update | Additive; old clients unaffected |
| 6. EAS Update to production branch | After QA on Dev | Works on the installed production build 41 (runtime 2.1.0) |
| 7. Store build 43 | After 1 December | Android versionCode 43 and the matching iOS build carry the same JS for new installs |
| 8. Monitor | First week | Crash logs for migration, sync errors, bookmark counts |

**Rollback:** the EAS Update can be rolled back to the previous group. The rules are additive, so a rollback needs no database change. Migration writes only after a successful read; the local backup remains available for 90 days.

---

## 19. Effort and phases

| Phase | Scope | Owner | Estimate |
|---|---|---|---|
| 0. Data + rules + migration | Types, canonical identity, merge, outbox, rules, manifests, fixtures | Noah | 4 days |
| 1. Bookmark core | Bokmärken screen, rows, save flow, toast, preview sheet, undo | Noah + Sana | 4 days |
| 2. Organisation | Collections, notes, search, sort, swipe, bulk | Noah | 4 days |
| 3. Ribbons | Edge tab, sheet, Home integration, rename/move/limit | Noah | 3 days |
| 4. Export + offline polish | Markdown/CSV, sync chip, error states, dark mode, a11y | Noah | 2 days |
| 5. QA | Scripts, emulator, device matrix, migration rehearsal | Tess | 4 days |
| Design | Flows, 7 screens, empty/error/dark, motion spec | Sana | 3 days |

**Total:** about 2.5–3 weeks with one mobile engineer, with design and QA overlapping. The critical path is the data/migration phase; the UI can start once the types are stable.

---

## 20. What we deliberately will not build in v1 — and what comes later

**Not in v1:**

- **No public or shared bookmark collections.** Bookmarks are private; sharing is an explicit post.
- **No social feed of bookmarks, no counts, no “saved by”.**
- **No nested folders or multiple tags.** One collection per bookmark; the model can grow later.
- **No spaced repetition or flashcards in v1.** The research mentions them; they are a separate study mode, not a bookmark v1.
- **No web/desktop app.** The canonical data model is ready for it, but the app is the product.
- **No import.** Export only in v1.
- **No bookmark notifications or weekly digests.** Quiet by default.
- **No AI recommendations.** “Verses we think you’ll love” would undercut the personal, intentional tone.
- **No new native modules.** The feature ships via EAS Update; file export waits for the next build.

**Later, if people ask:**

- **Dela som bild** — a quiet verse card from a bookmark, with the reference and the KOINO mark. The strongest organic-growth feature and a natural next native build.
- **Dagens bokmärke** — an opt-in Home card that resurfaces one older bookmark, with “Öppna”, “Be” and “Inte idag”. No push notification.
- **Repetera** — a calm, card-by-card review of a collection for people who use bookmarks as study.
- **Widget / lock screen** — “Ditt läsband” and “Senaste bokmärket”.
- **Import** — from YouVersion or a CSV, if people ask.
- **Shared study collections** — only with an explicit privacy design; not before the personal version is proven.

---

## 21. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration loses or duplicates a bookmark | Low | High | Read-time merge, atomic multi-path write, local backup, 200-fixture test, migration rehearsal on the real account |
| Old builds recreate translation-keyed duplicates | Medium | Low | New build merges on read; deterministic rewrite; no data loss |
| Note overwritten by a concurrent edit | Low | Medium | `noteUpdatedAt` field-level merge; pending local wins until acknowledged |
| Deleted bookmark resurrects from an offline device | Low | Medium | 30-day tombstones |
| Ribbon tab obscures text | Medium | Low | Hide in split/flowing modes and in settings; test largest font; tab in the margin |
| Search slow on a huge library | Low | Medium | Lazy index, debounce, virtualized list, 1,000-item target |
| Rules deployment breaks old clients | Low | High | Additive rules, Dev first, emulator tests, old-client smoke test |
| Export leaks personal notes | Low | Medium | Explicit action, warning copy, share sheet, no automatic upload |
| Collection colour fails contrast in dark mode | Medium | Low | Store colour IDs, dark tokens, name always visible |
| Too many collections become a new clutter | Medium | Low | Counts, “Ogrupperade”, no nesting, sort by use; keep chips one row |

---

## 22. Decisions taken

These are the defaults in this plan; they are reversible before implementation starts.

1. **Two names, two tools:** Bokmärken (archive) and Läsband (ribbons).
2. **One collection per bookmark** in v1, not multiple tags.
3. **Five ribbons maximum.**
4. **Tap a bookmark row → preview sheet**, not straight into the reader. The preview preserves the reading spot and exposes the note.
5. **Keep the `savedVerses` path** and extend it; do not rename the database node.
6. **No new native modules**; export uses clipboard/share in v1.
7. **No notifications** for bookmarks in v1.
8. **Read-time merge before write-time migration**, so the UI is correct even if the migration is delayed.

---

## 23. One-paragraph summary for the team

KOINO’s bookmarks should feel like a well-kept paper Bible: a few ribbons hold your place, and a quiet archive holds the words you want to keep. We separate the two, give the archive a real home with collections, notes, search, sort, swipe actions and export, make every bookmark translation-independent, and make saving a two-tap, undoable, offline-safe action. The ribbon is one tap on the page edge and follows you to Home and to another phone. Nothing is public, nothing is lost, and nothing interrupts reading. That is the feature people will like: it does the small thing mainstream Bible apps make surprisingly hard, and it does it in KOINO’s voice.

---

## Appendix — Files and surfaces

**Data and state**

- `state/types.ts` — extend `SavedVerse`; add `BookmarkCollection`, `BibleRibbon`, `BookmarkTombstone`; add fields to `KoinoState`.
- `state/saved-verses.ts` — translation-independent identity; merge and migration helpers.
- `state/bookmarks.ts` *(new)* — sort, filter, search index, export formatting, collection helpers.
- `state/bookmark-cache.ts` *(new)* — AsyncStorage mirror and outbox.
- `state/koino-store.tsx` — listeners and actions for bookmarks, collections and ribbons.
- `state/store/types.ts` — new action types.
- `state/selective-store.ts` — new fields for selective subscriptions.

**Screens and components**

- `app/bookmarks.tsx` *(new)* — route.
- `features/bookmarks/bookmarks-screen.tsx` *(new)* — header, ribbon strip, chips, sort, list.
- `features/bookmarks/bookmark-row.tsx` *(new)*.
- `features/bookmarks/bookmark-sheet.tsx` *(new)* — preview, note, collection, actions.
- `features/bookmarks/collection-picker.tsx` *(new)*.
- `features/bookmarks/collection-editor.tsx` *(new)*.
- `features/bookmarks/export-sheet.tsx` *(new)*.
- `features/bookmarks/empty-bookmarks.tsx` *(new)*.
- `features/bible-reader/ribbon-tab.tsx` *(new)*.
- `features/bible-reader/ribbon-sheet.tsx` *(new)*.
- `features/bible-reader/tools-sheet.tsx` — add Bokmärken and Läsband rows.
- `features/bible-reader/drawer.tsx` — Mina platser rows; remove the internal saved stage.
- `features/bible-reader/verse-actions.tsx` — reuse the saved action sheet in the bookmark preview; new copy.
- `features/bible-reader/header.tsx` / `bible-screen.tsx` — mount the ribbon tab and sheet.
- `features/home-scripture.tsx` — ribbon-aware resume card.
- `features/bible-search/search-content.tsx` — bookmark matches section.

**Copy and design**

- `ui/translations/sv.ts`, `ui/translations/en.ts` — new keys and changed existing keys.
- `features/bible-reader/toast.tsx` — new fallback copy.

**Backend**

- `firebase.rules.json` — saved verse fields, collections, ribbons, tombstones, meta.
- `functions/src/account-deletion/manifest.ts` — new paths.
- `functions/src/signup-guard/store.ts` — new paths.
- `functions/src/encryption.ts` — new paths.

**Tests and docs**

- `scripts/validate-bookmarks.mjs` *(new)*.
- `scripts/validate-bookmarks-emulator.mjs` *(new)*.
- `docs/bookmarks-plan.md` — this plan.
