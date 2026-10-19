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

## Local Android development build

The Android development build is a separate app named **KOINO Dev** with the
package ID `com.akhansson.koinomvp.dev`. It can stay installed alongside the
Google Play internal-test app (`com.akhansson.koinomvp`). Local builds do not
use EAS cloud-build credits.

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

## Run in Expo Go

Install dependencies and start the development server:

```sh
npm install
npm start
```

Scan the QR code with Expo Go on Android, or with the iPhone camera and open it
in Expo Go. For devices on the same local network, `npm run start:lan` is also
available.

Remote push notifications on Android require a development, preview, or
production build. Expo Go does not support Android remote notifications for
this SDK, so use the local KOINO Dev build when testing the notification flow.

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
node --test scripts/embedding-core.test.mjs
```

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
