# KOINO Step 1B.2: two physical devices, local Firebase only

This setup runs Auth9099, RTDB9001 and the real Functions5001 emulators on Windows for project **demo-koino**. No Blaze, Firebase deployment, Firebase login, production keys or public tunnel is needed. Use dummy accounts and test content. Auth emulator tokens/admin interfaces are for trusted developers, not a production security boundary. The local exports include test Auth accounts and encrypted data; do not upload them.

## Current acceptance status (2026-10-30)

Critical post/prayer/comment moderation, cross-device encrypted membership and approved membership persistence have passed on physical iOS and Android devices, as reported by the developers. The remaining automated moderation acceptance also passed; see [the acceptance report](community-moderation-acceptance.md) for coverage and limits. This does not establish that every previously reported settings issue is fixed.

The validation results and 50-file manifest at the end of this guide are historical setup snapshots. Network commands below require your own current private addresses. They do not authorize a restart, firewall change, device registration or build.

## What is real and what is disabled

Real: Firebase Auth emulator ID tokens; callable HTTP authentication; device signatures/certificates; E2EE account recovery and community admission; journals; posts/check-ins/replies; rules; atomic moderation, tombstones/audits and daily claims; in-app notification triggers.

Disabled only in the separate Emulator apps/backend: external Supabase images, Expo/APNs/FCM push registration/delivery, Stripe/donations, password-reset emails, scheduled jobs and external browser/network features. Images have no new insecure local persistence path. Prayer Dwell data remains local/emulated; push delivery is not covered. The backend exports only encryptedAccount and the two local notification triggers. A local RTDB limitation requires us-central1 for those triggers; the callable stays europe-west1 and production regions are unchanged.

The app uses IDs com.akhansson.koino.emulator and com.akhansson.koinomvp.emulator, URL scheme koino-emulator, runtime2.1.0-emulator, a visible badge and disabled Expo Updates. Production/dev profiles retain their current identities and routing. Invalid emulator host/configuration stops startup before Firebase initialization; no live fallback.

## 1. Validate locally before exposing anything

From the repository root in PowerShell7:

```powershell
pwsh -NoProfile -File scripts/start-emulator-devices.ps1 -CheckOnly
pwsh -NoProfile -File scripts/start-emulator-devices.ps1 -SmokeTest -VerifyPersistence
```

The smoke launcher uses only loopback, starts all three emulators, calls the signed moderation endpoint through actual Auth tokens, and shuts down automatically. With VerifyPersistence it exports a disposable dataset, restarts all services, and verifies the same Auth users, private journal ciphertext, tombstones and daily claims. This uses smoke-export, separate from phone-session data. Never run destructive legacy/emulator suites in an active phone session. This launcher scrubs inherited credentials only in its own process, isolates Firebase CLI login state, and restores its environment on exit. It uses the existing workspace-local Java21 and firebase-tools15.34.1 under .npm-cache/koino-validation; it does not install system tooling. Java/Firebase must be prepared there if that ignored cache is missing.

## 2. Select one trusted network

### Different networks: Tailscale (recommended)

Install Tailscale on Windows, iPhone and Android and connect them to the same private tailnet, or explicitly share only the PC with the other developer. No exit node, subnet router, Serve, Funnel, router port-forwarding or public hostname is required. Do not use Funnel/ngrok/Expo tunnel for Firebase.

On Windows, after installation/login:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' ip -4
& 'C:\Program Files\Tailscale\tailscale.exe' status
```

Use the PC's100.64.0.0/10 address as PcIp and each phone's own Tailscale IPv4 address as PhoneA/PhoneB. Confirm both phones are connected/online. If tailnet policy needs changing, allow only these two phones to PC TCP5001,9001,9099; do not broaden the policy to the whole tailnet. Tailscale encrypts traffic even through DERP relays. Windows Firewall and the relay's exact source-IP allowlist add restrictions. A VPN may conflict with Tailscale on the phones; confirm connectivity before building.

### Same LAN

Connect all three devices to one trusted Wi-Fi/LAN without client isolation. Use the PC's RFC1918 IPv4 address and each phone's Wi-Fi IPv4 address. Discover the current private addresses rather than reusing a previous session address. Reserve its DHCP address if possible. LAN HTTP lacks Tailscale transport encryption, so use only a trusted network and dummy credentials/content.

## 3. Explicit firewall approval and startup

These example variables must be replaced with the actual addresses. Both phone addresses are mandatory. Do not use wildcards or subnets.

```powershell
$Network = 'Tailscale' # or 'Lan'
$PcIp = Read-Host 'PC private IPv4 address'
$PhoneA = Read-Host 'iPhone private IPv4 address'
$PhoneB = Read-Host 'Android private IPv4 address'
```

First validate the inputs from ordinary PowerShell without reading or changing Windows Firewall:

```powershell
& .\scripts\configure-emulator-device-firewall.ps1 `
  -Network $Network -ListenAddress $PcIp -DeviceAddress @($PhoneA,$PhoneB) `
  -ValidateOnly
```

This checks address/peer restrictions only. Administrator privileges, local-interface ownership and existing rule ownership are still required when applying the rule. Both PowerShell scripts invoke the shared validate-emulator-network-input.mjs file and send JSON through stdin; neither passes inline JavaScript through Windows native argument quoting.

To run the quoting/IP regressions without opening any listeners or touching firewall cmdlets:

```powershell
node scripts/validate-emulator-device-network.mjs --validation-only
```

This includes Legacy, Standard and Windows native argument-passing modes. The unrestricted networking suite also tests loopback listeners, so use the flag when only validating configuration.


In an **Administrator PowerShell** opened in this repository, explicitly create the narrow firewall rule:

```powershell
& .\scripts\configure-emulator-device-firewall.ps1 `
  -Network $Network -ListenAddress $PcIp -DeviceAddress @($PhoneA,$PhoneB)
```

The helper resolves PcIp to exactly one preferred local IPv4 interface and binds the rule to its literal InterfaceAlias (for example Tailscale). It changes only its named local PersistentStore KOINO rule: inbound TCP5001,9001,9099, the selected local address and exactly two phone addresses, no edge traversal. An existing owned rule is repaired in place with Set-NetFirewallRule; repeated runs do not create duplicates. Foreign-owned, duplicate or non-local policy rules are refused. It leaves every other firewall rule/configuration unchanged. Both configuration and startup use one shared verifier, including the effective ActiveStore rule, scalar/array normalization and TCP/6 protocol normalization. The launcher never adds rules itself and refuses device mode unless the exact interface/host/peer/port restrictions exist and Windows Firewall is enabled.

After creation or repair, verify without starting emulators or changing policy:

```powershell
& .\scripts\configure-emulator-device-firewall.ps1 `
  -Network $Network -ListenAddress $PcIp -DeviceAddress @($PhoneA,$PhoneB) `
  -VerifyOnly

& .\scripts\start-emulator-devices.ps1 `
  -Network $Network -ListenAddress $PcIp -DeviceAddress @($PhoneA,$PhoneB) `
  -CheckOnly
```

VerifyOnly resolves the current interface and reads rule/profile metadata; unlike ValidateOnly it checks the installed rule. Neither changes firewall policy. The reported InterfaceIndex is discovered each time, not hardcoded. A rule with InterfaceAlias Any must be repaired, never accepted as a fallback. The former generic startup failure on this PC was a separate scalar-string bug: indexing LocalAddress directly returned the first character, not the whole IP. The shared verifier now normalizes filter values before comparison.

Safe in-memory interface/repair regressions (all Windows networking/firewall cmdlets mocked):

```powershell
pwsh -NoProfile -File scripts/validate-emulator-device-firewall.ps1
```

The TCP relay separately rejects unlisted source addresses before opening a backend connection, so an unrelated broad existing firewall allowance does not grant emulator access.

In a normal PowerShell, set the same variables and start:

```powershell
& .\scripts\start-emulator-devices.ps1 `
  -Network $Network -ListenAddress $PcIp -DeviceAddress @($PhoneA,$PhoneB)
```

The actual emulators, hub and logs listen only on127.0.0.1. A launcher-only Node preload also constrains Firebase SDK's transient discovery server, which otherwise uses an implicit wildcard bind. A byte-transparent relay binds only PcIp on the three device ports and allows those two source addresses. It carries RTDB WebSockets, Auth and Functions to the same demo namespace. The PC must remain awake and connected. No Metro/ADB is required for these standalone test builds.

Before using an app, open this URL in each phone's browser (substitute PcIp):

```text
http://PC_PRIVATE_IP:9099/emulator/v1/projects/demo-koino/config
```

A JSON response confirms Auth reachability. Then sign in using the Emulator app; HTTP callable/RTDB behavior must also pass acceptance below. If a connection fails, check relay.log/relay-error.log under .codex/koino-emulator-device, exact phone addresses, Tailscale ACLs, VPN state and Wi-Fi client isolation. Never disable the firewall or bind to0.0.0.0 as a workaround.

## 4. Installable apps (commands for after approval)

No builds or device registrations are performed by the scripts above. These are release-mode, internal-distribution binaries containing JavaScript, not Metro-dependent development clients. Expo Go is unsuitable because KOINO uses native libsodium/SQLCipher.

For approved future builds, use an existing EAS CLI available as eas.cmd on PATH. Both emulator profiles already define their host in their own env blocks. Read and compare those values below instead of changing shared EAS environment variables. The profiles use the preview environment, but these commands do not overwrite its variables. The private host is routing metadata, not a credential.

```powershell
$EasCli = (Get-Command eas.cmd -ErrorAction Stop).Source
$EasProfiles = Get-Content -Raw .\eas.json | ConvertFrom-Json
$BuildHost = $EasProfiles.build.'emulator-ios'.env.EXPO_PUBLIC_KOINO_EMULATOR_HOST
$AndroidBuildHost = $EasProfiles.build.'emulator-android'.env.EXPO_PUBLIC_KOINO_EMULATOR_HOST
if ([string]::IsNullOrWhiteSpace($BuildHost) -or
    $BuildHost -ne $PcIp -or $BuildHost -ne $AndroidBuildHost) {
  throw 'The selected PC and both approved emulator profile hosts must match.'
}
$env:APP_VARIANT = 'emulator'
$env:EXPO_PUBLIC_KOINO_EMULATOR_HOST = $BuildHost
& $EasCli config --platform ios --profile emulator-ios
& $EasCli config --platform android --profile emulator-android
```

Verify emulator IDs/runtime, disabled updates, demo-koino and PcIp. Then, only after build/device-registration approval:

```powershell
& $EasCli device:create
& $EasCli build --platform ios --profile emulator-ios
& $EasCli build --platform android --profile emulator-android
```

Install from the EAS artifact links. Android receives a standalone APK, with no Play upload/Google service key. iOS internal distribution is **ad hoc**, not TestFlight: it requires an existing paid Apple Developer membership, the iPhone UDID registered before provisioning, an Apple distribution certificate/profile for the emulator bundle, and Developer Mode if iOS requires it. No App Store submission, Firebase Blaze or push credentials are needed. If the Apple membership/signing access is unavailable, iOS installability is a blocker; do not silently use the main app or Expo Go. EAS builds may use the account's existing free allowance; this task does not purchase builds or establish available credits. A local Android native build is also possible; local iOS builds require macOS/Xcode.

The PC host is embedded in the binary/ATS exception. If it changes, obtain approval to update only the two emulator profile hosts and rebuild both binaries; do not overwrite shared preview variables. If only phone IPs change, update the firewall/launcher allowlists after approval; no rebuild is needed. Tailscale PC IP is usually more stable than DHCP. No additional build is needed for documentation changes.

Android's emulator-only manifest enables cleartext HTTP; iOS's emulator-only ATS/local-network settings permit the selected private host. Grant iOS Local Network access if prompted (Settings > Privacy & Security > Local Network). These native settings still require real-device validation. Client JavaScript guards constrain fetch/XHR/WebSocket source endpoints; native HTTP redirect behavior cannot be treated as an OS egress firewall. Trusted local Firebase emulators do not return external redirects. Keep production credentials out of the test app and use only the selected private backend.

## 5. Shutdown, restart and reset

Press Ctrl+C in the launcher terminal **once**, wait for Firebase's export/shutdown to complete, then close the terminal. PowerShell may return an interrupt exit code even after successful export/shutdown; verify the Export complete and stopping messages. Auth/RTDB data is exported to .codex/koino-emulator-device/data and imported on next normal startup; tombstones and test Auth IDs survive PC backend restarts. The launcher stops its relay and restores process environment variables. Never use task termination as the normal shutdown, because an export may be lost.

When finished, remove only the dedicated firewall rule in Administrator PowerShell:

```powershell
& .\scripts\configure-emulator-device-firewall.ps1 -Remove
```

To reset disposable test data, stop everything and **rename** the data directory to a dated backup rather than deleting it. Launch again for fresh data and create new accounts. Old installed auth/vault state may need sign-out or clearing only the Emulator app's data; never clear production app data. On iOS, reinstalling alone can retain Keychain material, so follow the app's normal account/recovery flow instead of assuming a fresh vault.

## Two-device acceptance (record build IDs, OS versions and results)

1. Verify both apps say KOINO Emulator/demo-koino, use separate OS app IDs and coexist with production. Backend console shows only demo-koino and local services. Only the two selected phones can connect; no public port/tunnel exists.
2. Create fresh A (iPhone) and B (Android) with dummy emails/passwords. Complete real encryption setup/recovery-code confirmation. A creates a community, B joins with its invite, A grants access. Both decrypt shared content.
3. B creates an ordinary private journal entry; A cannot see it. B opens a new Heart check-in, verifies the initial audience is Private, explicitly chooses community sharing and saves exactly once. It appears for A and B retains its personal journal copy. Do not save a private daily check-in first or attempt a second one that day; test standalone private check-in persistence with A's own check-in or another day's fixture.
4. B creates a reflection, prayer request, praise and replies. B has no owner removal control. A cancels confirmation once, then removes each shared type. Both feeds/details stop displaying it. Individual reply removal preserves its parent and other replies. Check automatic in-app notification references disappear. Push delivery is intentionally out of scope.
5. B's private journal/check-in and Prayer Dwell remain decryptable. Moderating today's shared check-in does not release its daily claim or permit a second private/shared check-in. Removal copy never promises to recall downloaded copies.
6. Put B offline, queue a reply/reaction, remove its parent as A, reconnect B. Queued writes fail and removed content does not return. Retry removal/double tap; no duplicate audit. Paginate old history and restart both apps.
7. Stop/restart the backend gracefully, reconnect both apps: Auth IDs, journals, tombstones and claims persist. Stop PC/network without changing the app: operations fail/offline; there is no production fallback.
8. A and B can still self-delete their own nonmoderated content through the existing atomic flow. Verify owner self-delete also removes another member's child reply.
9. Swap owner/platform roles in a fresh community, repeat removal. Test stale ownership after transfer: previous owner is denied. Outsider/unauthenticated/impersonation and direct owner-write bypass checks are covered by the HTTP smoke/rules suites; optionally create a separate disposable outsider account to check UI denial.
10. Test English/Swedish and accessibility. Attempt image upload, donation, password-reset email and push registration: they remain disabled, with no external service activity. Bible references and Prayer Dwell should still work within the documented offline test scope.

## References

- https://firebase.google.com/docs/functions/local-emulator
- https://firebase.google.com/docs/emulator-suite/connect_auth
- https://docs.expo.dev/build/internal-distribution/
- https://tailscale.com/docs/reference/faq/firewall-ports

## Historical validation results (initial device setup)

These results describe the earlier setup snapshot, not the current acceptance status. Later automated and physical-device evidence is summarized in [the acceptance report](community-moderation-acceptance.md).

Windows firewall correction (2026-10-26):32 in-memory mocked cases and the no-listener network/PowerShell suite passed. Read-only diagnostics confirmed scalar LocalAddress indexing was the original startup failure; InterfaceAlias Any was a separate creation omission. The repair now resolves/binds the literal interface and verifies PersistentStore plus effective ActiveStore, updating an existing owned rule in place. No actual firewall repair was applied during validation.

That initial snapshot was validated on feature/community-moderation-1b2, starting from6d0c392.

- App TypeScript and Functions build: PASS.
- Functions unit tests:29/29 PASS (including six emulator safety tests).
- Emulator client/config/outbound guards: PASS.
- Private-network/TCP peer allow-deny, wildcard-bind preload and production-config refusal: PASS.
- Real HTTP Auth+RTDB+Functions signed moderation through loopback TCP relays: PASS.
- Export, full emulator restart/import, persisted Auth UIDs/private ciphertext/tombstones/daily claims: PASS.
- Existing community moderation, encryption rules and encryption backend emulator suites: all three PASS.
- Moderation backend/UI, encryption/adapter/migration, donation7/7, startup memberships/dependencies, Community/notification navigation, check-in persistence and Bible reading layout: PASS.
- Normal launcher start/bootstrap and one Ctrl+C export/shutdown: PASS (all five inspected ports bound127.0.0.1).
- git diff --check: PASS.

The host ran Node24.15.0/Java21.0.12.1/Firebase CLI15.34.1. Functions declare Node22; the emulator logs that it uses host Node24. Firebase SDK also emits an outdated-version warning; no dependency upgrades were made. Early smoke attempts exposed fixture/discovery/standalone-process shutdown issues; these were corrected and the complete final launcher returned exit0 across both startup cycles. At that stage, native phone builds, signing, ATS/permissions, firewall application and physical connectivity had not yet been executed. The subsequent physical-device results above supersede that earlier status. No production deployment or external service credential was used.

## Historical 50-file setup manifest

These 50 paths record the original setup snapshot relative to6d0c392; they are not the complete current checkpoint inventory, which contains70 files. Use git status for the current inventory. Generated emulator data, logs and tooling caches are ignored.

- [.gitignore](../.gitignore)
- [app.config.js](../app.config.js)
- [app/_layout.tsx](../app/_layout.tsx)
- [docs/emulator-device-testing.md](../docs/emulator-device-testing.md)
- [eas.json](../eas.json)
- [features/bible-reader/topics-api.ts](../features/bible-reader/topics-api.ts)
- [features/donation-api.ts](../features/donation-api.ts)
- [firebase.emulator-device.json](../firebase.emulator-device.json)
- [functions/package.json](../functions/package.json)
- [functions/src/activity-notifications.ts](../functions/src/activity-notifications.ts)
- [functions/src/emulator-index.ts](../functions/src/emulator-index.ts)
- [functions/src/emulator-safety.test.ts](../functions/src/emulator-safety.test.ts)
- [functions/src/emulator-safety.ts](../functions/src/emulator-safety.ts)
- [functions/src/encryption.ts](../functions/src/encryption.ts)
- [functions/src/firebase-admin.ts](../functions/src/firebase-admin.ts)
- [functions/src/push-delivery.ts](../functions/src/push-delivery.ts)
- [index.js](../index.js)
- [package.json](../package.json)
- [plugins/with-emulator-local-network.cjs](../plugins/with-emulator-local-network.cjs)
- [scripts/configure-emulator-device-firewall.ps1](../scripts/configure-emulator-device-firewall.ps1)
- [scripts/donation-api.test.cjs](../scripts/donation-api.test.cjs)
- [scripts/emulator-device-firewall.ps1](../scripts/emulator-device-firewall.ps1)
- [scripts/emulator-device-network.mjs](../scripts/emulator-device-network.mjs)
- [scripts/emulator-device-relay.mjs](../scripts/emulator-device-relay.mjs)
- [scripts/emulator-node-loopback.cjs](../scripts/emulator-node-loopback.cjs)
- [scripts/firebase-emulator-guard.mjs](../scripts/firebase-emulator-guard.mjs)
- [scripts/prepare-emulator-device.cjs](../scripts/prepare-emulator-device.cjs)
- [scripts/run-emulator-device-smoke.mjs](../scripts/run-emulator-device-smoke.mjs)
- [scripts/start-emulator-devices.ps1](../scripts/start-emulator-devices.ps1)
- [scripts/validate-bible-reading-layout.mjs](../scripts/validate-bible-reading-layout.mjs)
- [scripts/validate-community-moderation-callable.mjs](../scripts/validate-community-moderation-callable.mjs)
- [scripts/validate-community-moderation-ui.mjs](../scripts/validate-community-moderation-ui.mjs)
- [scripts/validate-emulator-client.mjs](../scripts/validate-emulator-client.mjs)
- [scripts/validate-emulator-device-firewall.ps1](../scripts/validate-emulator-device-firewall.ps1)
- [scripts/validate-emulator-device-network.mjs](../scripts/validate-emulator-device-network.mjs)
- [scripts/validate-emulator-device-restart.mjs](../scripts/validate-emulator-device-restart.mjs)
- [scripts/validate-emulator-network-input.mjs](../scripts/validate-emulator-network-input.mjs)
- [scripts/validate-startup-dependencies.mjs](../scripts/validate-startup-dependencies.mjs)
- [scripts/validate-startup-memberships.mjs](../scripts/validate-startup-memberships.mjs)
- [state/encryption/session.ts](../state/encryption/session.ts)
- [state/koino-store.tsx](../state/koino-store.tsx)
- [state/store/emulator-client-network.ts](../state/store/emulator-client-network.ts)
- [state/store/firebase-emulator-bootstrap.ts](../state/store/firebase-emulator-bootstrap.ts)
- [state/store/firebase-emulator-config.cjs](../state/store/firebase-emulator-config.cjs)
- [state/store/firebase-emulator-config.d.cts](../state/store/firebase-emulator-config.d.cts)
- [state/store/firebase.ts](../state/store/firebase.ts)
- [ui/emulator-badge.tsx](../ui/emulator-badge.tsx)
- [ui/in-app-browser.tsx](../ui/in-app-browser.tsx)
- [ui/notification-runtime.tsx](../ui/notification-runtime.tsx)
- [ui/open-link.ts](../ui/open-link.ts)
