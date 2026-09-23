# App responsiveness and query inventory

The Android resume delay has not yet been measured on a device. The repository was inspected for work on navigation, rendering, and database paths. Run the release-build device procedure below before attributing the delay to a specific change.

| Data path | Consumer | Query and index | Remaining cost |
| --- | --- | --- | --- |
| Community posts, check-ins, replies, prayer reactions, post reactions | Active group screens | `createdAt` index, 50 newest records per stream; older pages use an indexed cursor | Five live streams update the active group. Rendering now uses a virtualized list, memoized visible cards, and indexed in-memory lookups. |
| Prayer reaction duplicate check | Prayer completion | `targetId` index; filter matching user and target type after query | One target's reactions are transferred instead of the whole group. The existing transaction still protects the write. |
| Notification badge | Push Function | `readAt == null` index | Transfers unread records only; the function still counts them to set the badge. |
| Member counts and active members | Group UI | Full `groupMembers/{groupId}` snapshots | Counts for other joined groups still require their full member nodes. The active group's existing member subscription supplies its count, avoiding a duplicate subscription. A compact server-maintained counter would remove this remaining cost but requires a separate consistency migration. |
| Profiles, joined groups, notification preferences | Account and header UI | Individual profile/group nodes and the user's membership index | Reads are scoped to the signed-in user or joined group IDs; subscription keys remain stable when membership metadata changes. |
| Journal, private check-ins, prayer notifications | User screens | `createdAt` index, 50 newest records per stream | Older pages load on demand. |
| Saved verses, highlights, plans, prayer sessions, support intents, plan participation | User or group screens | Full collection listeners | Complete records are currently needed for local features or selections. These should be split into smaller views if account data grows materially. |
| Comment notification recipients | Push Function | Target, actor/owner profiles, discussion followers, and full group members | Recipient resolution still reads the group member node. This is needed for current mention and discussion notification behavior. |
| Bible chapter | Bible reader | SQLite `verses_chapter_idx`, `chapters_lookup_idx`; async chapter queries | The reader no longer performs chapter SQL during render. Other synchronous Bible helpers remain for selection and previews. |
| Bible cross-reference markers | Bible reader | SQLite `cross_references_source_idx`; async chapter marker query | Cross-reference detail lookup is deferred until after a frame, but target verse text still uses synchronous cached chapter reads. |
| Bible search | Bible search screen | SQLite FTS5 index, bounded result limit | The query is already async and bounded. |

SQLite `EXPLAIN QUERY PLAN` on the bundled database confirmed indexed chapter lookup, indexed cross-reference source lookup, and an FTS5 virtual-table search. Realtime Database indexes are declared in `firebase.rules.json`; deploy database rules before relying on the new `targetId` and `readAt` queries in production.

On 2026-09-23 the database rules and `createCommentNotification` Function were deployed to `koino-codex`. The targeted Function deployment excluded the unrelated payment export during upload because Secret Manager API is disabled in that project; the source export was restored afterward. A future full Functions deployment will still need Secret Manager enabled or the payment function separated from the notification deployment.

## Android release-build check

Use the same signed build and account before and after the change. After 30 short and 30 long background/resume cycles, immediately open each tab and a Community screen. Repeat while offline and with a slow connection. Capture the interval from tap to visible feedback, navigation start, JavaScript long tasks, render counts, and Realtime Database bytes/requests. Report median and 95th-percentile values; the target is feedback within 100 ms and local navigation starting within 200 ms at the 95th percentile. No physical Android device was connected during this audit, so these measurements remain outstanding.
