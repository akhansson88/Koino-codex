# Bible highlight latency

Device verification on 2026-10-19 (Europe/Stockholm), Pixel 11 Pro, Android 17, KOINO Dev / Hermes. The updated JavaScript is loaded on the connected development app.

| Scenario | Samples | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Before | 30 | 38614.9 ms | 40419.7 ms | 40485.3 ms |
| After, acknowledgement between trials | 30 | 56.6 ms | 91.5 ms | 114.5 ms |
| After, rapid repeated changes | 30 | 58.6 ms | 101.4 ms | 109.2 ms |
| After, database disconnected | 1 | 57.9 ms | n/a | 57.9 ms |

The comparison meets the 100 ms target at the 95th percentile. The burst test is reported separately: subsequent selections begin while previous saves may still be pending. In the offline test the color appeared before any save confirmation; reconnecting completed the pending save. Test records were removed or restored and the original count of 122 highlights was verified afterward.

## Measurement method

The interval starts inside the palette callback and ends after the matching React commit plus two animation frames. It includes application rendering and frame scheduling but excludes touchscreen dispatch. Before and final after each contain 15 single-verse and 15 adjacent two-verse changes. The final comparison waits for save acknowledgement between samples, outside the timed interval, matching the old flow which necessarily completed its write before displaying the color. These are physical-device development-build diagnostics, not production-build latency guarantees. Raw trials and intermediate measurements are in [highlight-performance.json](highlight-performance.json).

## Bottlenecks removed

- Repeated construction of the English locale comparator during authenticated serialization. One reused collator preserves existing signed bytes and encrypted-record compatibility.
- Full re-verification of unchanged highlight history on every snapshot. Subscription-local caches compare the whole encrypted record and metadata and invalidate on key, signer, session or account changes.
- A 16 ms scheduling delay for every record. Collection decodes now share 8 ms slices and synchronously requeue records within that budget.
- Waiting for database acknowledgement before displaying the color. Ordered optimistic operations now paint immediately and roll back rejected writes without overwriting newer choices. Multi-record deletions use one atomic update.
- Repeated work in the closed Bible drawer, duplicate renders for local database echoes and acknowledgement, and rebuilding unchanged verse rows and header controls.

## Verification

Passed TypeScript checking and the encryption, encryption-adapter, highlight-mutation, verse-selection, audio-follow, drawer, history, selective-state, startup, startup-membership, lazy Bible startup and asynchronous Bible query validations.

Added regressions cover legacy Unicode serialization and cross-decryption, 123/1000-record snapshots, one-record incremental decrypts, metadata changes, tampering, cache invalidation, rapid ordered colors, batch rollback, account cancellation, error feedback, and unchanged verse/native-ref preservation.
