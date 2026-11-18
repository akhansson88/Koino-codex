# Bible plan library

KOINO's reading plans are now a small product, not a CRUD form.

## What ships

- **20 starter plans** in `features/bible-plan-library.ts`:
  - whole Bible in 1 year / 2 years
  - New Testament in 90 days / 1 year
  - Gospels in 30 days
  - the life of Jesus in 21 days
  - Psalms in 30 / 90 days
  - Proverbs in 31 days
  - wisdom, anxiety, hope, prayer, gratitude, love, forgiveness
  - Paul's letters in 30 days
  - the Bible's great story in 30 days
  - women of the Bible in 21 days
  - new to faith in 14 days
- **Featured art for every plan** in `assets/bible-plans/`, built with FigCraft. The covers are intentionally language-neutral; the app overlays the localized title, category, day count, and reading time.
- **A library tab** with search, category filters, featured cards, one-tap start, and a preview of the first days.
- **A today-first experience** on Home and in the plans screen: today's passage, progress, week strip, catch-up state, and a single primary action.
- **A plan detail sheet** with the full (virtualized) day list, progress, pause, reschedule, restart, sharing, editing custom plans, and a completion state.
- **A compact reader strip** that appears while the reader header is hidden, with expandable actions and localized "start here" / "finish here" markers.
- **Verse-balanced scheduling** so a year plan does not give one day Psalm 119 and another day four short chapters.

## Data model

`features/bible-plan-library.ts` exports `BiblePlanTemplate`:

```ts
type BiblePlanTemplate = {
  id: string;
  coverKey: string;
  title: { en: string; sv: string };
  description: { en: string; sv: string };
  category: "start" | "whole" | "jesus" | "psalms" | "wisdom" | "life" | "letters" | "story" | "women";
  dayCount: number;
  minutesPerDay: number;
  featured?: boolean;
  tags: string[];
} & (
  | { kind: "continuous"; ranges: BiblePlanRange[] }
  | { kind: "curated"; days: BiblePlanRange[][] }
);
```

- **Continuous** plans distribute a contiguous range across the requested days.
- **Curated** plans keep hand-picked days exactly as written.
- `planTemplateDays()` builds and caches the plan days.
- `planTemplateRanges()` produces the stored `ranges` field.
- `templateId` and `coverKey` are stored on the user's plan and on group announcements, so titles, descriptions, and art stay correct after a language switch or a share.

## Adding a plan

1. Add a `BiblePlanTemplate` entry to `biblePlanTemplates`.
2. Add a cover key to `features/bible-plan-images.ts` and the matching PNG to `assets/bible-plans/`.
3. Add the cover to `design/build-bible-plan-covers.mjs` and run:

   ```sh
   node design/build-bible-plan-covers.mjs
   ```

   This rewrites `design/bible-plan-covers.figcraft`, exports all covers to `assets/bible-plans/`, and refreshes `design/bible-plan-covers-overview.png`.

4. Run the checks:

   ```sh
   npm run typecheck
   npm run validate:bible-plans
   node scripts/validate-me-bible-plans.mjs
   ```

## Scheduling rules

`buildBiblePlanDays` in `features/bible-plans.ts` expands ranges to chapters, walks them verse by verse, de-duplicates overlapping verses, and distributes verses evenly across the requested days. Consecutive verses in the same chapter are merged into one range. The whole-Bible plan now lands at 85–86 verses per day instead of varying wildly by chapter.

`planTemplateDays` previews are cached. The create flow only builds previews in `useMemo`, and the detail sheet uses a `FlatList` for the full 365/730-day plans.

## UI entry points

- Home: `HomeScripture` shows today's plan or the library invitation.
- Me: `MeBiblePlans` shows the active plan, completed plans, or the library.
- Plans: `BiblePlansScreen` with `Today`, `My plans`, `Library`, and `Community`.
- Reader: `BiblePlanReaderPanel` compact strip plus inline markers.

## Community

Announcing a plan now includes the owner in the participant list and aggregate progress. The owner's `GroupBiblePlanParticipation` is created at announcement time, so their progress is visible and the participant count is correct.

## Covers

The FigCraft source is `design/bible-plan-covers.figcraft`. Each cover is 1440×810, uses a restrained KOINO palette, a large day-count numeral, abstract geometry, and a small `KOINO` mark. The app adds the localized title and metadata on top, so the same art works for both Swedish and English.
