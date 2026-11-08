<!-- Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 -->
# Bible header scroll QA

Implemented and verified on 8 November 2026. The Android release was built and installed over Koino Dev (`com.akhansson.koinomvp.dev`) on the connected Pixel 11 Pro. The signed-in session and reading preferences were retained.

## Behavior

- The header follows deliberate vertical reading gestures, with 12 dp downward and 6 dp upward thresholds and a 160 ms settle.
- The status area stays opaque and stationary. The chapter viewport keeps the same native bounds with the header visible or hidden: `[0,172][1080,2410]`.
- Manual chapter navigation and search destinations reveal the header. Automatic audio scrolling preserves its visibility.
- Verse selection, verse action sheets, and other reader sheets suspend header tracking. The native verse-selection check confirmed the header retained `[0,172][1080,337]` bounds during a downward scroll.
- Hidden controls leave the compressed native accessibility hierarchy. Screen-reader enablement pins the header in the automated lifecycle checks.
- Reduced motion uses opacity with a 120 ms maximum duration. Native reduced-motion behavior was exercised by temporarily disabling Android animation scales.
- System font scale, display resolution, and animation scales were restored after testing.

## Device evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Visible header and stable reading surface | [Visible](header-scroll/final-visible.png), `header-scroll/final-visible.xml` | Passed |
| Header completely clears the reading area | [Hidden](header-scroll/final-hidden.png), `header-scroll/final-hidden.xml` | Passed |
| A short upward gesture reveals the header | [Revealed](header-scroll/revealed.png) | Passed |
| Hidden header controls excluded from accessibility | `header-scroll/final-hidden-accessibility.xml` | Passed; no chapter chooser in the compressed hierarchy |
| Direct chapter navigation reveals the updated label | [Next chapter](header-scroll/next-chapter.png) | Passed; Psalm 55 to Psalm 56 |
| Horizontal paging and hidden-header handoff | [Next](header-scroll/horizontal-next.png), [Return](header-scroll/horizontal-return.png) | Passed; the new chapter starts with its header visible |
| Search destination sits below the visible header | [Psalm 55:9](header-scroll/search-destination.png) | Passed |
| Audio remains available while the header is hidden | [Audio](header-scroll/audio-hidden.png) | Passed; staged paused playback and Follow control |
| Narrow viewport and larger text | [320 dp width, 1.3 font scale](header-scroll/narrow-large-hidden.png) | Passed |
| Reduced-motion visibility | [Reduced motion](header-scroll/reduced-motion-hidden.png) | Passed |
| Verse action bar suspends header movement | [Selected verse after scrolling](header-scroll/verse-actions-scroll.png) | Passed on the final installed build |
| Cold restart and restoration | [Restored Psalm 55:9](header-scroll/restored.png) | Passed; selection cleared, audio stopped, Bible tab open |

## Automated checks

Passed:

- `npm run typecheck`
- `npm run validate:bible-header`
- `npm run validate:bible-chapter-navigation`
- `npm run validate:bible-reading-layout`
- `npm run validate:bible-audio`
- `npm run validate:bible-audio-follow`
- Android ARM64 release build and `git diff --check`

The new header validator exercises thresholds, reversals, interrupted settling, overscroll, short chapters, programmatic scrolling, outgoing chapter events, previews, suspension, native refs/callbacks, fractional measured heights, reduced motion, and screen-reader lifecycle changes. The audio-follow validator also covers header occlusion during verse selection, in-flight measurement invalidation, explicit verse alignment, history tracking, audio-follow alignment, and selection-bar tracking suspension/resumption. The final app process produced no ReactNativeJS, ReactNative, or AndroidRuntime error log entries.

## Coverage limits and shared workspace

iOS hardware/simulator and a live TalkBack session were unavailable. Device testing briefly paused while another session used the phone, then resumed after the user confirmed availability. Concurrent navigation/menu changes in this checkout were preserved. A final cold launch confirmed restoration of the original Psalm 55:9 position in SRB26, with the original reader preferences and device settings retained.

Build output is in `header-scroll/build-final.log`. No header setting, persisted header state, or data migration was introduced.
