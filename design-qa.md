# Design QA — KOINO Prayer Moment / Dwell

## Source and test state

- Primary source: `C:\Users\siito\Downloads\ChatGPT Image 15 juli 2026 21_07_04.png`
- Normalized source: `design-qa/dwell-reference-normalized-390x844.png`
- Implementation capture: `design-qa/dwell-implementation-390x844.png`
- Primary viewport: 390 × 844
- State: Sara's prayer request open; exact request text visible; Amen fully revealed after the 1.8-second pause.

## Comparison evidence

- Pass 1: `design-qa/dwell-comparison-pass-1.png`
  - Found an overly cool upper field, undersized avatar, wide card/button, weak card accent, and lower controls sitting too low.
- Pass 2: `design-qa/dwell-comparison-pass-2.png`
  - Corrected hierarchy and sizing; found a visible horizontal gradient seam and an overly faint accent.
- Pass 3: `design-qa/dwell-comparison-pass-3.png`
  - Final full-view source/implementation comparison. Card, content hierarchy, pause cue, lower wave, and Amen placement align with the selected variation.
- Focused pass 3: `design-qa/dwell-comparison-details-pass-3.png`
  - Final card and lower-action comparison at readable scale.

## Required fidelity surfaces

| Surface | Result | Evidence |
| --- | --- | --- |
| Recipient context | Passed | Real-avatar component, centered name, and first-name heading preserve the source hierarchy. |
| Prayer card | Passed | Soft white rounded card, exact KOINO logo, decorative wave accent, and exact request body match the target composition. |
| Dwell atmosphere | Passed | Warm-to-cool full-screen gradient, lower multicolor line wave, thin heart cue, and quiet helper text are present without timer or progress UI. |
| Amen action | Passed | Soft pill treatment and placement match the source; the button begins visually hidden, remains enabled, and becomes fully visible after the intended pause. |
| Safe return | Passed | Amen and the labeled back control both dismiss the local modal and reveal the still-mounted Community context. |

## Interaction and responsive checks

- Amen was enabled while its animated parent opacity was `0`, then reached opacity `1` after the reveal; there is no time lock.
- Amen completion dismissed the modal and restored the underlying Community state.
- Re-entry followed by `Lämna bönen` dismissed without marking the prayer completed.
- Repeated entry was verified.
- Layout was checked at 390 × 844, 430 × 932, and the compact 390 × 600 branch; no card/action overlap was found.
- The cleaned app entry screen loaded after the temporary preview harness was removed, with zero current browser console errors.
- Reduced-motion behavior was reviewed in code: entrance/exit motion is skipped and Amen is shown immediately.

## Automated validation

- `npm run typecheck` — passed
- `npm run build` — passed (Expo web export and PWA injection)
- `git diff --check` — passed; only repository line-ending notices were emitted.

## Residual P3 differences and limits

- The source image's phone frame and Dynamic Island are presentation chrome, not application UI, so they are intentionally excluded.
- The production flow uses each member's real profile image. A source-derived avatar crop was used only for visual QA and was removed from the app.
- Native haptic output and physical safe-area behavior were not exercised on a device in this Windows browser run; the native haptic path is platform-gated, safe-area insets are applied, and type/build validation passed.
- The implementation uses a smooth branded gradient rather than reproducing every organic peach contour in the concept artwork; the primary hierarchy, palette, wave language, and interaction remain faithful.

final result: passed
