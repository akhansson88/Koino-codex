# Step 1B.2 physical-device UI diagnosis

Scope: the Identity & Support controls blocking the isolated demo-koino phone test. No backend, encryption, Firebase/EAS configuration or existing test data was changed for this correction.

## Current status and historical scope (2026-10-30)

This document records the earlier physical-device blocker investigation and its focused navigation correction. The developers subsequently confirmed working Community admission, encrypted membership and critical moderation flows on iOS and Android; see [the acceptance report](community-moderation-acceptance.md). Those results do not separately verify every Appearance, Language, Password & Security or profile-photo interaction.

Historical observations and proposed verification steps below must not be read as proof that the current devices still have each reported failure, or that all settings defects are resolved. Android Appearance/Security native behavior was not conclusively diagnosed by the earlier static/mocked tests. Reset-email and external-avatar-upload restrictions remain intentional in emulator mode. No rebuild is requested for this documentation update.

## Historical findings and confidence

| Observation | Verified code and interpretation | Confidence / limit |
| --- | --- | --- |
| iOS Join/Create and Language do not open | `/identity` is already a transparent native-stack modal. Its AppSheet also owned a React Native Modal, while the requested RoomSwitcher/settings Modals were siblings outside that Modal. RN iOS presents those siblings from their containing route controller, which already has the outer RN Modal. The same redundant host also conflicts with navigation to Encryption. | High confidence in the structural presentation defect. The prior implementation fails the new host regression. Actual UIKit callback order on the reported device has not been captured. |
| iOS Encryption Back exposes Home and Identity will not reopen | Encryption was pushed with that outer RN Modal still presented. If the native sheet is dismissed while the transparent `/identity` route remains, Home shows through; AvatarButton explicitly ignores presses while pathname is `/identity`. | High confidence source-level chain: React Navigation classifies Encryption as a subsequent modal; RNSScreenStack dismisses the foreign RN Modal before presenting it. Fabric keeps its `_isPresented` flag true after this external dismissal, so returning does not present it again. The route guard then blocks reopening. Physical callback traces remain uncollected. |
| Android Appearance label and colors do not change | Appearance is a direct toggle. The real setTheme action applies the palette and React state before awaiting its profile write; language and theme have no platform-dependent setters. No code-level cause of this Android tap failure was established. | Unresolved. Do not claim the reported Android defect is fixed just because mocked handler tests pass. |
| Android Password & Security never opens | Its row, activeSheet state and security sheet all exist. It uses the same pattern as the functioning Android Language sheet. | Unresolved native touch/presentation failure. Separate from the intentional reset-email restriction. |
| Password reset cannot send | The requestPasswordReset action explicitly rejects emulator mode before Firebase email delivery. The UI previously replaced that explanation with a generic error. | Verified intentional restriction on both platforms. Now explained in English/Swedish with a disabled send action and handler guard. |
| iOS profile photo does not work | Profile sheet/picker presentation can encounter the same modal hierarchy conflict. Independently, emulator Functions intentionally reject imageUpload, so neither platform can save a new avatar through external storage. | Upload restriction verified. Native picker cause not proven. Emulator UI now explains the restriction and prevents a pointless picker/upload attempt. The production picker path is unchanged. |


## Source-level iOS lifecycle evidence

The installed versions in this workspace explain the otherwise contradictory Home-with-Identity-route symptom:

1. `app/_layout.tsx` makes Identity a transparent native-stack modal. `@react-navigation/native-stack/src/utils/getModalRoutesKeys.ts` classifies the following Encryption route as modal too; NativeStackView uses that presentation by default.
2. Identity's previous AppSheet created a separate `RCTFabricModalHostViewController` above that managed Identity controller. Language/RoomSwitcher were sibling native Modals, rather than children presented from that controller.
3. `react-native-screens/ios/RNSScreenStack.mm` (foreign-modal handling around lines697-733) explicitly dismisses that unmanaged RN Modal before presenting Encryption.
4. `react-native/React/Fabric/Mounting/ComponentViews/Modal/RCTModalHostViewComponentView.mm` sets `_isPresented=true` on initial presentation and requires it to be false to present again. A dismissal initiated by RNSScreenStack does not run the host's controlled-hide path; `presentationControllerDidDismiss` also does not reset that flag.
5. Back removes Encryption but retains transparent Identity. Its RN Modal remains marked presented while invisible. The underlying Home shows through, and `AvatarButton` declines a new push because pathname is still `/identity`.

The fix removes that unmanaged controller from Identity. It does not bypass the route guard, force navigation to Home, or reset authentication/encryption to mask stale state.

## Focused correction

AppSheet defaults to its existing native Modal behavior. Identity alone passes `modal={false}` and reuses its transparent navigation route. Its appearance, backdrop, height and close controls remain. When closed, the route-hosted sheet removes its view before invoking callbacks. Child settings and RoomSwitcher can present from the route without competing with an outer RN Modal. Encryption pushes above the retained Identity route and its existing Back action can reveal that route again.

No theme/language persistence rewrite or Android gesture workaround was made without evidence. Emulator-only diagnostic messages contain UI event names, theme/language enums and requested sheet flags; they contain no email, user/group identifiers, content, credentials or keys. Native language/security onShow callbacks distinguish requested state from a presented modal. There is no remote telemetry added.

## Settings verification checklist retained from the investigation

1. Record build IDs and OS versions; confirm KOINO Emulator, demo-koino and the expected host. Keep production apps installed and existing emulator accounts/data intact.
2. On iPhone, open Identity -> Join/Create. Cancel, reopen and create/join the same test community using normal encrypted admission. Owner/member must still compare fingerprints and approve access.
3. On both phones, repeat Identity -> Encryption & Devices -> Back three times. Each Back returns to Identity. Close Identity, reopen from the avatar, then open Language, Security and Join/Create. Test backdrop/X, Android hardware Back, reduced motion and screen-reader focus. Home/tabs must respond after closing.
4. On each phone, tap Appearance once: label and palette must immediately change; toggle back. Restart and confirm the selected preference. Repeat with the network temporarily unavailable; no backend write should be required for the immediate visual change.
5. Switch English -> Swedish -> English. Close/reopen the sheet and restart the app. Confirm the stored language and localized restriction notices.
6. Password & Security must open and explain that emulator reset email is unavailable. Its send action stays disabled; no reset-sent success message is shown. Profile photo UI must explain disabled external storage without requesting a picker/upload or changing the current photo.
7. After joining, repeat owner removal and private journal preservation checks from emulator-device-testing.md. Nothing in this correction changes moderation permissions, tombstones, claims or encryption.

## Precise Android diagnosis if a control still fails

Android SDK Platform Tools / USB debugging are required for ADB; adb was unavailable in the diagnostic environment at the time of the investigation. Do not clear app data or reset emulator exports. On a developer machine with ADB already configured, connect the phone, authorize USB debugging, and collect a read-only log while reproducing:

```powershell
adb devices
adb logcat -v time 'ReactNativeJS:V' 'ReactNative:V' 'AndroidRuntime:E' '*:S'
```

First collect native/JavaScript errors from the currently installed Android binary while tapping the two failing controls; that can provide evidence before another cloud build. The structured events below are available only in the corrected binary.

Use the `[KOINO Emulator UI] identity:` events in the corrected app:

- No `appearance.press` / `security.press`: the press did not reach the handler. Capture the control's screen position, preceding scroll/keyboard/modal actions, and native gesture/presentation errors.
- `appearance.press` but no subsequent `state theme=dark` (or light): capture JS exceptions and provider/auth state timing. The local real-action test covers the normal pending/failed-write path, not native event delivery.
- `security.press` followed by `sheet=security` but no `security.presented`: state changed but native presentation failed. Capture the adjacent native logs and any previously open modal.
- `security.presented` with no visible sheet: inspect native view hierarchy, measurement/backdrop and window ordering rather than changing auth or enabling reset email.

These traces are local diagnostics in the new binary, not a claim that physical behavior is already verified. Existing installed binaries do not contain the new diagnostic events.

## Builds and cost

Both Emulator profiles disable Expo Updates and embed JavaScript. At the time of this correction, new installed binaries were needed to exercise its code changes; the later Community/moderation tests have since been completed on physical devices. This is historical build guidance, not a request for another build. Android Appearance and Security opening have not separately been confirmed fixed by the reported moderation results; diagnose a reproducible current failure before considering additional build quota. No code or native setting changes are made by this documentation update.

## Local validation commands

All checks below run locally with mocked native/backend boundaries or pure crypto/state fixtures. They do not reset or connect to the running phone emulator database.

```powershell
npm run typecheck
node scripts/validate-native-interactions.mjs
node scripts/validate-identity-interactions.mjs
node scripts/validate-emulator-client.mjs
node scripts/validate-community-moderation-ui.mjs
node scripts/validate-community-navigation.mjs
node scripts/validate-notification-navigation.mjs
node scripts/validate-encryption.mjs
node scripts/validate-encryption-adapter.mjs
node scripts/validate-startup-dependencies.mjs
node scripts/validate-bible-picker-lifecycle.mjs
node scripts/validate-selective-state.mjs
git diff --check
```

The route-host regression was run against the old AppSheet and failed because it created a second native Modal. It passed after the correction. React-test-renderer emits its existing deprecation notice; the startup test's fixture emits unused mocked-auth export warnings. These do not establish a device result. Real Firebase emulator suites were not rerun against the active phone-session backend because no backend/rule changes were made and those fixtures reset disposable data.

Final local result: all commands above passed. The Identity suite executes the actual setTheme action with pending/rejected persistence, the real Encryption Back and Avatar handlers through three full JavaScript history cycles per OS, and checks English/Swedish persistence and disabled emulator actions. The navigation fixture does not execute UIKit or Android native touch delivery.
