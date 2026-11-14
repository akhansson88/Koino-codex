# KOINO mobile app

KOINO is an Expo app for iPhone and Android. The project only targets these two
mobile platforms.

## Code organization

Existing screen and shared UI entry points retain their exports. Their supporting
implementations are grouped by responsibility:

- `features/bible-reader`, `features/community`, `features/donation`, and
  `features/identity` contain feature-specific components, types, and helpers.
- `state/store` contains Firebase initialization and standalone store operations;
  `state/koino-store.tsx` owns provider state, subscriptions, dispatch, and hooks.
- `ui/app-components` contains shared UI primitives, and `ui/translations` contains
  the English and Swedish dictionaries and translation types.

Within these folders, import sibling implementations directly instead of going
through their public entry point to avoid circular dependencies. Keep Bible
reader dependencies out of Home's eager imports (`npm run validate:startup`).

## KOINO Dev

KOINO Dev is blocked until a reviewed staging configuration is set in
`state/store/firebase-staging.json`. Keep existing Dev installs closed until
cutover has been approved and verified. Payments, password reset links, image
storage, push, topic votes, external links and previews are disabled in Dev.

### Local iOS development build

After the staging configuration is approved, use a Mac with Node.js 20.19.4 or
later, the locked npm dependencies, CocoaPods, and full Xcode 16.1 or later.
Select full Xcode as the active developer directory. Xcode must support the connected iPhone's iOS
version and provide `xcrun devicectl`. Pair and unlock the iPhone, enable
Developer Mode, and put it on a network that can reach the Mac over IPv4.
The iPhone must run iOS 17 or later.

Generate the iOS project in a checkout dedicated to Dev, with no existing
`ios/` directory. This preserves other generated projects and local data.

```sh
npm ci
APP_VARIANT=development npx expo prebuild --platform ios
```

Set up local development signing in the generated Xcode workspace for
`com.akhansson.koino.dev`, with an installed certificate and a provisioning
profile that includes the iPhone. Find the phone's hardware UDID in Xcode
Devices and Simulators and set it as `IPHONE_UDID` in your shell. The launcher
uses your existing provisioning profile.

```sh
npm run ios:dev:verify
npm run ios:dev -- --device "$IPHONE_UDID" --build-only
```

Build-only verifies the generated project, effective Xcode settings, and the
resulting app. It prints the retained `.app` path for inspection and exits
before starting Metro or installing anything. Once that passes, run:

```sh
npm run ios:dev -- --device "$IPHONE_UDID"
```

This performs a fresh local build and installs it only after verifying the
artifact and the new Dev Metro instance. The launcher prints the Metro URL.
Open **KOINO Dev** on the selected phone, allow Local Network access, and enter
that URL in the Dev Client.
Keep the terminal open for Fast Refresh. If verification reports a stale
project, use a clean Dev checkout and regenerate it there.

### Local Android development build

Use `npm run android:dev` from a clean checkout. The launcher refuses stale
native Google Services or Expo Updates configuration and verifies the APK
before installation.

The Android development build is a separate app named **KOINO Dev** with the
package ID `com.akhansson.koinomvp.dev`. It can stay installed alongside the
Google Play internal-test app (`com.akhansson.koinomvp`). Local builds do not
use EAS cloud-build credits.

Release APK builds regenerate their embedded update manifest each time. This
ensures reinstalling a local APK runs its new JavaScript instead of an older
bundle cached by `expo-updates` under the same update ID.

Connect and unlock the phone, enable USB debugging, and accept the computer's
RSA authorization prompt. Confirm that `adb devices` reports `device`, then run:

```sh
npm run android:dev
```

Every run reconciles the native Android project with the development variant,
compiles for the connected device, and checks the generated package ID and the
actual APK package before installation. It then installs that verified APK,
configures USB port forwarding, and starts Metro. If multiple devices are
connected, select one with `npm run android:dev -- --device <adb-serial>`.
Setting `APP_VARIANT` alone does not update an already generated native project.
For normal JavaScript or TypeScript changes after installation, only
start Metro:

```sh
npm run start:dev
```

Press `j` in Expo CLI to open React Native DevTools. For focused Android crash
and React Native logs, use `npm run android:logs`. Rebuild with
`npm run android:dev` after changing native dependencies or Expo app config.

The Play internal-test build remains a signed store build:

```sh
eas build --platform android --profile production
eas submit --platform android --profile internal
```

Use EAS Update only for JavaScript and asset changes compatible with the
installed native runtime. Native dependency or app-config changes require a new
binary.

## Android debugging over Tailscale

With Tailscale connected on both devices, Codex can use Android debugging over
the phone's private Tailscale address. The phone uses Android's paired TLS
wireless debugging, with Metro forwarded through that ADB connection. No public
port, router forwarding, or Windows inbound Metro firewall rule is needed.

```sh
npm run android:tailscale
npm run start:tailscale
npm run android:tailscale:logs
```

The first command reconnects and opens **KOINO Dev** if Metro is already running.
The second also starts Metro when needed. The third reads phone logs. Existing
Metro sessions on port 8081 are reused. For screenshots, shell commands, native
installation, or other debugging, use `adb -s <address:port>` with the endpoint
printed by the reconnect command; USB and wireless may both appear in the device
list, so always select the device explicitly. Rebuild native changes with
`npm run android:dev -- --device <address:port>` after reconnecting.

Local device selection is stored in the ignored file
`.codex/tailscale-android.local.json`, containing the Tailscale Android peer `ID`
as `peerId`, its USB serial as `usbSerial`, and its wireless debugging `port`.
It contains no credentials. The reconnect command checks that this peer is online
in the current tailnet and connects only to its Tailscale IP. Local discovery
can refresh the port when both devices are on the same Wi-Fi.

After a phone restart or network change, open **Settings > System > Developer
options > Wireless debugging** and enable it if necessary. Android can change
the port. Read the port under **IP address and port** (not the pairing port), then:

```sh
npm run android:tailscale -- --port <new-port>
```

If Android forgets the computer, use **Pair device with pairing code**, then
`adb pair <phone-tailscale-ip>:<pairing-port>` and enter the displayed code.
Reconnect using the separate debugging port. Wireless debugging depends on
Android's Wi-Fi and developer settings; Tailscale alone cannot keep it enabled
through every restart or guarantee debugging on cellular-only connections.

Windows Tailscale is configured to run unattended. Keep Tailscale connected on
Android; its battery optimization exemption helps it remain available in the
background. This setup is for Codex sessions running on this computer.

## Run in Expo Go

Install dependencies and start the development server:

```sh
npm install
npm start
```

Scan the QR code with Expo Go on Android, or with the iPhone camera and open it
in Expo Go. For devices on the same local network, `npm run start:lan` is also
available.

Remote push notifications on Android require a native build with push
enabled. Use the existing production push test workflow below.

Push setup is device- and backend-dependent. Before testing, deploy the Realtime
Database rules and Functions, confirm the EAS project has an Android FCM V1 key
and an iOS APNs push key, then install a newly built binary. The notification
settings screen reports whether the current device granted permission and
successfully registered an Expo push token.

```sh
npx firebase-tools deploy --only database,functions --project koino-codex
eas build --platform android --profile production
eas build --platform ios --profile production
```

Use two accounts on physical devices to test replies, mentions, followed
discussions, and completed prayers. Delivery ticket and receipt failures are
logged by Cloud Functions; invalid device tokens are removed automatically.

Useful checks:

```sh
npm run typecheck
npm run doctor
npm run validate:bible-plans
npm run validate:bible-search
npm run validate:startup
npm run validate:pagination
```

Cold-start milestones are logged as `[startup] … +Nms` and are also available
at runtime in `globalThis.__KOINO_STARTUP_MARKS__` for device-side inspection.

Bible text, full-text search, and cross-references are packaged in
`assets/bible/koino-bible-v2.db`. Normal development starts never rebuild this
asset or clear Metro's cache. After changing Bible source data, rebuild it
explicitly with `npm run bible:build`; this requires Python 3 with SQLite FTS5.
Use `npm run start:tunnel` only when LAN discovery is unavailable, and
`npm run start:clear` only when Metro's cache genuinely needs resetting.

The `functions/` directory contains the Firebase backend used by app services.
It is separate from the Expo client and is not a website.

## Offline bilingual Bible search

Bible search combines local keyword ranking, multilingual E5 embeddings, passage
windows, topics and cross-references. English and Swedish queries work with
either packaged translation. The reader and Scripture attachment picker share
the same engine, and every displayed quotation comes from the selected local
Bible text.

**Smart** mode routes each query before retrieval: references and quoted phrases
stay exact; short keywords keep the BM25 recovery stages; natural-language
questions strip question/filler words, use only strong near/and evidence, and
consult the 6,752-topic index. Swedish pastoral terms receive a small English
semantic expansion. A bundled query-validity classifier rejects general-domain
requests (recipes, finance, technology, health, travel, sports and repairs)
before semantic retrieval. **Precise** mode is an explicit exact-word search and
never loads the inference runtime. Results are fused with weighted reciprocal
rank fusion, then near-duplicate verse hits from the same sermon section are
grouped into one passage card. Old/New Testament and “this book” scope are
applied consistently to lexical, topic, semantic and paged queries. The search
box offers local topic completion from the same 6,752-topic index, and question
queries receive a cited extractive synopsis: every line is a direct quotation
from the top passages.

The model, tokenizer and complete search database are bundled with the native
app. Large `.onnx` and search `.db` assets use Git LFS; run `git lfs pull` after
cloning. Search requires runtime `2.1.0` or newer and a fresh native build with
ONNX Runtime and SQLite's vector extension. The existing Expo Go binary cannot
provide these native modules.

Rebuild search explicitly after changing its source data or preprocessing:

```sh
npm run bible:search:build
npm run validate:hybrid-search
npm run validate:bible-search-ui
npm run test:bible-search-pagination
node --test scripts/embedding-core.test.mjs scripts/search-query-validity.test.mjs scripts/search-engine.test.mjs scripts/search-scope.test.mjs scripts/search-synopsis.test.mjs scripts/search-suggestions.test.mjs
```

The query-validity prototypes are separate from the corpus index. Rebuild them
after changing the curated question list (the build also reports classifier
precision/recall):

```sh
npm run bible:search:prototypes
npm run bible:search:suggestions
```

## Offline study pack

Search also ships a separate offline study index built from Easton's Bible
Dictionary (1897) and Matthew Henry's Bible Commentary (1662-1714). Both
underlying texts are public domain. The dictionary's structured dataset is by
NEUU under CC BY 4.0; the commentary JSON is from the Free Use Bible API at
bible.helloao.org under the Creative Commons Public Domain Mark 1.0. Koino
normalizes the entries and compiles them into
`assets/bible/study/koino-study-v1.db` with SQLite FTS5: 3,962 dictionary
entries and 5,280 commentary/chapter comments. Exact title matches are ranked
first, then BM25 matches across text and scripture references. Results keep at
least one dictionary and one commentary card when both exist, and cards can be
expanded in place. Source commits, snapshot date, checksums and entry counts are
recorded in `assets/bible/study/study-manifest.json`.

Rebuild the study pack when the pinned sources change:

```sh
npm run bible:study:fetch
npm run bible:study:build
node --test scripts/study-search.test.mjs
```

## Fine-tuned Bible embeddings (development)

The offline embedding model can be fine-tuned on synthetic topic questions with
BM25 hard negatives. The pipeline lives in `scripts/finetune/` and emits a new
int8 ONNX encoder; `apply_model.mjs` updates the runtime model revision/hash,
then the normal search build re-embeds every verse, passage and window and
regenerates the manifest and quantization report. See
`scripts/finetune/README.md` for the environment, dataset, training, export,
held-out evaluation gates, rebuild steps and the current run status. This is a
build-time workflow; the device only runs an accepted model and index. Five
fine-tuned candidates have been evaluated and rejected, and fine-tuning is
paused before the MVP pilot. The shipped search assets remain the pinned
upstream E5 export until a future candidate passes the locked narrative,
full-index and app-level zero-regression gates. See the decision and
current-status sections in `scripts/finetune/README.md`.

The build verifies pinned source hashes, generates translation-specific passage
documents, and caches embeddings under `assets/bible/search/.cache` so interrupted
builds can resume. Initial generation is CPU intensive. Normal Expo startup never
downloads models or regenerates search. See `scripts/hybrid-search/README.md` for
source attribution, the build pipeline and validation details.

After building a self-contained Android release APK, verify its native libraries
and all four bundled search assets against the generated manifest:

```sh
python scripts/native/validate-android-search.py android/app/build/outputs/apk/release/app-release.apk --manifest assets/bible/search/search-manifest.json
```

The check streams APK contents to verify asset sizes and SHA-256 even when Expo
renames them, and checks 16 KB ELF and ZIP alignment for ARM64 libraries. Add
`--abi x86_64` when validating a release that includes that ABI. Omit `--manifest`
for a debug development client whose JavaScript and assets are served by Metro.

The shared search footer provides offline source attribution and complete
licenses. After changing the tracked notices or licenses, regenerate its small
bundled asset with `node scripts/generate-search-credits.mjs`; verify it with
the same command followed by `--check`.

Search initializes inference after its UI first appears and shows text matches
while preparing semantic results. If inference is unavailable, a localized text
search status is shown. Validate cold preparation, warm search latency, memory,
airplane mode and background/resume on physical Android and iOS devices before
release. Audio streaming still requires its existing audio catalog and network.

The reader, drawer and verse picker load more results as the user scrolls. The
initial ranked preview is followed by all eligible word, topic and meaning
matches; broad searches can consequently contain many related passages. The
full ranking is prepared on demand, and off-screen passage text is reloaded from
the local Bible database when needed. Search playback snapshots the passages
loaded when playback starts; later pages do not change that playing snapshot.

## Donations

The Expo app uses the existing donation API at
`https://koino-community.netlify.app` by default. No local `.env` is needed for
this connection. To use another backend, set `EXPO_PUBLIC_DONATION_API_ORIGIN`
to its HTTPS origin (without a path) and restart Expo with a cleared cache.
This is a public address; never put Stripe keys in Expo environment variables.
Stripe credentials and test/live mode are managed on the payment server.

Run `npm run test:donations` to check the client connection and error handling.


## Reformationsbibeln audio

The Bible headphones button opens verse playback with chapter seeking, speed,
sleep timer, continuous chapters, and lock-screen/background audio. Only complete
chapters in the public catalog are playable. Browsing does not replace playback;
use **Follow the spoken verse** to return to the current audio position.

Audio repository: https://github.com/akhansson88/reformationsbibeln-audio

```sh
npm run bible:audio -- estimate --books John --chapters 1
npm run bible:audio -- dispatch --books John --chapters 1
npm run bible:audio -- dispatch --books "John,Romans"
npm run bible:audio -- dispatch --all
npm run validate:bible-audio
python -m unittest discover -s scripts/bible-audio -p "test_*.py"
```

See [generation and recovery instructions](scripts/bible-audio/README.md).
The Actions secret `ELEVENLABS_API_KEY` belongs to the audio repository, never the
mobile app. Generation uses ElevenLabs voice `qAZH0aMXY8tw1QufPN0D` and removes
footnote asterisks. Use `--overwrite` to replace audio for the selected chapters.

The Android background-audio fix patches TrackPlayer's native event delivery for
React Native's New Architecture. `npm install` applies it through
`scripts/patch-track-player.cjs`. It uses the active headless-service React context
so chapter transitions and lock-screen controls keep reaching the playback
service while the screen is off. Runtime version `2.0.1` requires a fresh native
build; an OTA update to an older binary is insufficient.
Regenerate local native configuration using the project's normal Expo prebuild
flow before building, or let EAS generate it from `app.config.js`. Test background
verse transitions, lock-screen controls, calls, and headphone disconnection on
physical iOS and Android devices before release. Offline downloads are not included.
For the screen-off regression, verify at least three consecutive chapter
transitions without waking the phone, beyond the chapter prefetched before locking.

## Content encryption

See [ENCRYPTION.md](./ENCRYPTION.md) for the implementation, readable metadata, recovery behavior, migration, validation and required release checks. A new native binary is required.
