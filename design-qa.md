# Design QA — ljudspelare mot nedersta menyn

final result: passed

Verifierat på Pixel 11 Pro den 8 november 2026. Den uppdaterade ARM64-versionen är installerad på telefonen.

## Källa och jämförelse

- Användarens markerade referens: C:\Users\alexh\Downloads\WhatsApp Image 2026-11-08 at 14.46.44.jpeg, 917 × 2048 pixlar.
- Före ändringen: design-qa/bible-player-gap-before.png.
- Efter, med följknapp: design-qa/bible-player-gap-with-follow.png.
- Efter, utan följknapp: design-qa/bible-player-gap-without-follow.png.
- Efter, med versverktyg: design-qa/bible-player-gap-verse-tools.png.
- Gemensam helbildsjämförelse: design-qa/bible-player-gap-comparison.png.
- Gemensam detaljjämförelse av nederdelen: design-qa/bible-player-gap-footer-comparison.png.

Implementationsbilderna är 1080 × 2410 pixlar, tagna på samma telefon som referensen. Skärmen har 420 dpi och skala 2,625, motsvarande cirka 411,4 × 918,1 dp. Jämförelserna normaliserar alla helbilder till cirka 459 × 1024 pixlar. Detaljbilderna visar samma nederdel i samma skala. CSS-viewport gäller inte för denna Android-app.

Tillstånd: stående läge, ljust tema, Psaltaren 36 i SRB26, pausad uppläsning vid vers 8 och 0:50/1:29. Med följknappen visas manuellt bläddrad text kring vers 11–13. Utan följknappen visas den följda versen 8. Läsinställningarna behölls.

## Fel och korrigering

- [P2, åtgärdat] Kapitelpilarnas höjd lades till spelarens bottenposition. Det skapade en glipa mot menyn vid manuell bläddring och lät pilarna delvis hamna under spelaren.
- Spelaren förankras nu direkt vid menyns överkant. Kapitelpilarna och versverktygen staplas ovanför den. Läsytans bottenutrymme och verktygens position följer spelarens uppmätta höjd.
- Efter installation jämfördes båda följlägena och versverktygen på den fysiska telefonen. Ingen glipa eller överlappning återstår i dessa lägen.

## Uppmätta gränser på telefonen

| Tillstånd | Spelarens underkant | Menyns överkant | Glipa |
| --- | --- | --- | --- |
| Följknapp synlig | y=2200 | y=2200 | 0 px |
| Följknapp dold | y=2200 | y=2200 | 0 px |
| Versverktyg synliga | y=2200 | y=2200 | 0 px |

Med följknappen synlig ligger kapitelpilarnas underkant vid y=1806 och spelarens överkant vid y=1848. Pilarna är fullt synliga ovanför spelaren. Övergången via följknappen kontrollerades också: spelarens höjd ändras uppåt medan underkanten ligger kvar.

## Visuella ytor

| Yta | Resultat |
| --- | --- |
| Typsnitt och typografi | Läsarens sparade typsnitt och storlek samt spelarens etiketter är bibehållna och läsbara. |
| Avstånd och layout | Glipan är borttagen i båda följlägena. Kapitelpilar och versverktyg ligger ovanför spelaren. |
| Färger och designtokens | Befintliga ytor, ramar och färger är bevarade. |
| Bilder och ikoner | Befintliga vektorikoner är skarpa och oförändrade. |
| Text och innehåll | Bibeltext, ljudposition, knapptexter och översättning är bevarade. |

## Verifiering

- TypeScript-kontroll: godkänd.
- Bible audio follow-valideringen: godkänd, inklusive nya regressioner för fast spelarposition vid manuell bläddring, ändrad spelarhöjd, versval och återgång till följning.
- ARM64 releasebygge och installation: godkända.
- Visuell kontroll på telefonen: med och utan följknapp samt med versverktyg.
- AndroidRuntime, ReactNativeJS och ReactNative: inga fel returnerades för appens process i loggkontrollen efter provningen.
- Telefonen lämnades i Psaltaren 36 med pausad uppläsning vid samma ljudposition. Tillfällig versmarkering rensades.

Ingen kvarstående P0/P1/P2-avvikelse i de provade lägena. Fysisk provning är begränsad till denna telefon i stående läge.

Tidigare fullständig granskning av alternativ 2 finns i design-qa/bible-option-2.md.


---

# Design QA — KOINO navigation dock, option 1

final result: passed

Reviewed on 8 November 2026. Scope: the existing app's four-tab bottom navigation. The selected white dock, peach active tile, equal columns, rounded corners and outline icons are implemented in the existing Expo navigator.

## Evidence

All paths below are relative to C:/Users/alexh/Downloads/Koino-codex.

- Selected visual: design-qa/menu-option-1-reference.png. This is the first displayed ImageGen result, selected by the user.
- Before: design-qa/menu-before.png.
- Final installed package: design-qa/menu-device-final.png.
- Final navigation close-up: design-qa/menu-device-detail.png.
- Source and final implementation together: design-qa/menu-comparison-detail.png.
- Reader/audio context comparison: design-qa/menu-comparison.png, using design-qa/menu-device-audio.png.
- All four selected states: design-qa/menu-selected-states.png; original captures are menu-device-bible.png, menu-device-home.png, menu-device-me.png and menu-device-community.png in design-qa.

## Viewport, normalization and state

Native Android app on Pixel 11 Pro: 1080 × 2410 physical pixels, density 420 dpi, scale 2.625, approximately 411.4 × 918.1 dp. There is no CSS viewport. System font scale was 1.0.

The selected source is a 1254 × 1254 component/context image. The full context comparison normalizes the source to 600 × 600 and the device's 1080 × 1066 crop at (0, 1300) to 600 × 592, preserving aspect ratios and excluding the system navigation indicator. The focused comparison aligns the source crop (0, 930, 1254, 302) with the final device crop (0, 2100, 1080, 260), both at 840 pixels wide. The combined images were opened and inspected, including the final package comparison after installation.

Both navigation-detail views show Bible selected in the light theme, with all four English labels visible. The reference's Psaltaren 36 content and elapsed audio time are context rather than requested changes. Audio integration was separately captured paused in Psaltaren 56; the final reinstall restored the user's saved Psaltaren 55 position with the player closed. These content/state differences are excluded from the navigation fidelity assessment. The audio context and all-tab captures precede the final reinstall; navigation source files were unchanged between these checks and the final build.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Typography | Existing Inter Medium, 11dp labels, 15dp line height, single lines with adaptive fitting. All labels are readable and centered. The size remains within the selected concept's 11–12dp brief and fits the longer translations. |
| Spacing and layout | 90dp dock, 12dp side margins, 24dp outer radius, 18dp active-tile radius and equal columns. Measured native buttons are approximately 86.9 × 66.3dp. The shared height also reserves clearance in reader, feed and form content. |
| Colors | Existing warm ivory, warm white, navy and stone tokens; selected peach uses the brand accent at 50% opacity. Calculated text contrast is 5.29:1 for inactive labels and 15.26:1 for the selected label. |
| Assets and icons | Real Feather book-open, sun, user and users glyphs provide one consistent outline family. No rasterized UI, decorative placeholder assets or custom icon drawings. Small glyph-shape differences from the generated mock are acceptable library substitutions. |
| Copy and content | Bible, Home, Me and Community retain their destinations and order. Existing English and Swedish translations supply visible text and accessibility labels. |

## Findings and comparison history

The first combined comparison found no actionable P0/P1/P2 issue within the navigation scope. The final installed package was captured and compared again in the focused image, with the same result. No visual correction loop was necessary.

- P3: Android's native elevation gives the dock a slightly stronger lower shadow than the generated mock. Corners, border, active tile and spacing remain consistent with the selected design; a flatter shadow can be considered in a later polish pass.
- The audio mini-player's measured parent ends at y=2111, matching the dock's top. No gap or overlapping control was observed in the paused audio capture.

## Verification

- TypeScript: npm run typecheck passed.
- Audio/player positioning: npm run validate:bible-audio-follow passed.
- Startup/lazy loading: npm run validate:startup passed.
- Navigation and content clearance: npm run validate:community-navigation passed. Its native-boundary fixtures and expected footer clearance were updated for the new dock.
- Actual device: captured Home selected, navigated to Bible, Me and Community, verified selected accessibility state, and returned to Bible. The final package was launched and Bible selected again after installation.
- English and Swedish label widths were measured using the bundled Inter font. At 320dp, each item has 64dp available: Community measures 60.33dp and Gemenskap 62.65dp at the normal label size. The supported 120% scaling fits with the configured minimum fitting scale. Measurements are in artifacts/menu-label-measurements.json; these do not substitute for native narrow-device rendering.
- Initial Android assembly failed because another build replaced the shared generated bundle. Retrying after the other build finished succeeded in 1m 17s; see artifacts/menu-dock-build-retry.log. The final package was independently copied, package-checked, installed successfully, launched, and captured.
- Final APK: android/app/build-menu-dock/koino-menu-dock-final.apk, package com.akhansson.koinomvp.dev. SHA-256: 1F4EEE870610175415AEE6F5B41F58DDD191DF4C5F4CE8A8AD15022B5BCB81F2.
- Final process log check returned zero AndroidRuntime, ReactNativeJS or ReactNative error lines; see artifacts/menu-final-runtime-errors.log.

## Remaining test coverage

Native geometry was verified at the phone's approximately 411dp width. Smaller widths and Swedish text were assessed through font measurements and existing translation tests; no native iPhone, narrow-screen, or VoiceOver/TalkBack session was available in this pass.

Implementation checklist complete: selected design implemented, shared clearance updated, regression checks passed, native package built and installed, final comparison inspected, evidence saved. No blocking open questions.
