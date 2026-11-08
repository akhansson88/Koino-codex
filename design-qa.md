# Design QA — Bible reader option 2

final result: passed

Verified on the user's Pixel 11 Pro on 8 November 2026. The final ARM64 release was built and installed successfully over the existing application. The signed-in session and reader preferences were retained.

## Source, viewport, and state

- Source visual truth: C:\Users\alexh\.codex\generated_images\01a1b9d8-34ea-7c93-a129-97ae4b02c36e\exec-336e9ae2-a52d-4755-8166-efe18e8f5fd7.png (852 × 1846 pixels).
- Final implementation capture: design-qa/bible-device-final.png (1080 × 2410 pixels).
- Device density: 420 dpi, scale 2.625; equivalent native viewport approximately 411.4 × 918.1 dp. CSS viewport and browser deviceScaleFactor do not apply to this native Android build. System font scale was 1.0.
- State: portrait, light theme, English app controls, SRB26 Scripture, Matthew 10:20, saved Serif text size 24, verse numbers enabled, paragraph mode disabled. The final capture shows paused audio with a loaded timeline. The reference shows active playback and a different elapsed time.
- Restored state after testing: Jeremiah 5:1 in SRB26, original reading preferences, audio stopped, Bible tab open. A cold restart confirmed the restored position.

## Comparison evidence

- Full view: design-qa/bible-device-comparison.png. Source and implementation appear together. The source is scaled to 426 × 923; the device is cropped to native app content at (0, 142, 1080, 2216) and scaled to 426 × 874. Aspect ratios are preserved. The device's shorter usable viewport and saved text size explain the different amount of Scripture visible.
- Focused controls: design-qa/bible-device-controls-comparison.png. Both headers and audio bars are shown at readable scale. The header remains one row with the contextual return button present. The player spans the viewport above the tabs.
- Menu fix: design-qa/bible-device-menu-comparison.png, with full final menu in design-qa/bible-device-tools-final.png.
- Restored reader: design-qa/bible-device-header-final.png.

## Findings and comparison history

1. Initial device pass: the single-row header, player, and reader controls worked. A P2 menu issue remained: the visible history label was truncated to “Previous reading positi…”. Evidence: design-qa/bible-device-tools.png.
2. Fix: use short visible Back/Forward labels, localized as Bakåt/Framåt, while retaining the full accessibility labels.
3. Final device pass: rebuilt and installed the release, reopened the menu, and compared the revised capture. Both labels are fully visible; enabled and disabled states remain clear. Evidence: design-qa/bible-device-menu-comparison.png.

No actionable P0/P1/P2 finding remains in the tested portrait layout.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts and typography | Existing Koino interface typography and the user's Serif size 24 are retained. The compact chapter label and translation remain legible on one row, including the contextual return button. Header typography follows the app's interface style. |
| Spacing and layout rhythm | The second header row is removed. Native controls retain their touch sizes. The full-width audio bar meets the tab bar; native accessibility bounds confirmed its bottom at y=2200. Its separate full-width progress control gives it more height than the mock. This is an accepted interaction adaptation. |
| Colors and tokens | Existing cream, paper, navy, border, and warm peach tokens are retained. Audio progress uses Koino's peach accent. The existing glass tab treatment is preserved. |
| Images and assets | This screen uses real Scripture and the existing vector icon libraries. Icons remain sharp. No generated mock artwork is embedded in the application. |
| Copy and content | Actual SRB26 text, headings, book names, and audio timings are preserved. The mock's illustrative section heading is not added to the Scripture data. English interface labels follow the user's saved app language; new menu labels also have Swedish translations. |

## Device interactions and runtime verification

- Chapter selector: opened, filtered books, selected Jeremiah chapter 5, and returned to the reader.
- Chapter navigation: next button advanced Matthew 10 → 11; a horizontal swipe returned to chapter 10.
- Translation: switched SRB26 → KJV → SRB26; the header stayed on one row and audio availability updated.
- More menu: Search Scripture, My places, and Reading settings opened after the menu dismissed. History Back and Forward navigated correctly.
- Search: found Matthew 10:20 and opened the correct verse; the contextual return control fit in the header.
- Audio: staged the visible verse paused, started and paused playback, displayed the advancing timeline, expanded the player, sought from verse 23 to verse 8, dismissed with Android Back, and closed playback.
- Final cold launch: authenticated app opened and restored Jeremiah 5. No AndroidRuntime, ReactNativeJS, or ReactNative error entries were returned for that app process in the final log check.
- Build and static checks: final ARM64 release build, final TypeScript typecheck, and whitespace check passed. The Bible chapter navigation, audio, and audio-follow validators passed for the implementation before the final copy-only change.

Coverage is limited to this physical phone in portrait. Landscape, tablets, and an active TalkBack session were not exercised. Accessibility labels and progress semantics were inspected through the native accessibility hierarchy.

## Implementation checklist

- [x] Implement and verify the single-row header.
- [x] Verify moved actions and the audio player on the physical device.
- [x] Fix and visually recheck clipped history labels.
- [x] Install the final release and restore the user's reading state.

Previous in-app browser QA is preserved in design-qa/in-app-browser-report.md.
