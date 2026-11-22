# Onboarding 1.0 security acceptance

## Verification levels

The native iOS app-switcher cover introduced in `78ff3ca` still requires release-equivalent verification on a physical iPhone. Expo declined the earlier acceptance build because the account exhausted its iOS build quota. The previously tested iPhone build at `f405c51` predates the cover.

Use the local KOINO Dev Debug and Metro workflow to check staging sign-in, onboarding, and Fast Refresh. Automated checks and Debug results leave the release privacy gate open. [Local iOS development build](../README.md#local-ios-development-build)

For release-equivalent verification, use the integrated source in a disposable local build copy. Set `APP_VARIANT=development` and `EXPO_NO_DOTENV=1` for native generation and the Xcode **Release** build. Use local signing for `com.akhansson.koino.dev` and leave `SKIP_BUNDLING` unset. The resulting app must launch its embedded JavaScript with Metro stopped. Before installation, run `npm run ios:dev:verify -- --app "$RELEASE_APP"`, where `RELEASE_APP` is the path to the signed Release `.app`. The verifier checks the Dev identity, pinned staging configuration, and disabled Expo Updates.

## Controlled staging recovery fixture

Use a fresh, approved staging Auth test account with no encrypted account record. A fresh account with working escrow normally completes setup silently. In the disposable build copy only, insert the following guard at the start of `escrowAvailable(uid)`. Substitute the exact synthetic staging Auth UID before compiling the Release bundle. [Encryption session](../state/encryption/session.ts)

```ts
if (developmentMode &&
    auth.app.options.projectId === "koino-staging" &&
    uid === "<approved synthetic staging Auth UID>" &&
    auth.currentUser?.uid === uid) {
  return false;
}
```

The guard forces the existing manual setup screen even when staging escrow is available. It leaves confirmation, native privacy handling, and the staging backend in place. Keep this override in the disposable build copy and use the build only for this fixture. Start each fresh setup test with an account that has yet to complete encrypted setup.

## Physical iPhone release acceptance — OPEN

- [ ] Open manual recovery setup on the signed Release build. Verify the code is readable and selectable while the app is active, then type part of the confirmation with the keyboard visible.
- [ ] Open the iOS app switcher while the keyboard is visible. Verify the preview is fully opaque and obscures both the recovery code and partial entry. Repeat through rapid background and foreground transitions.
- [ ] Return to the app. Verify the same recovery draft and partial confirmation remain, then complete confirmation. Check VoiceOver, Dynamic Type, and onboarding navigation.
- [ ] Verify the physical app signs in with the staging fixture UID and completes encrypted setup through the pinned staging Auth, database, and `encryptedAccount` callable. Use the verified artifact and observed project and endpoint metadata to confirm that routing is exclusively staging.

Keep all four checks open until they pass on a physical iPhone with the Release build. Record the Git revision, fixture override, local build identifier, iPhone model, iOS version, and results. Keep recovery codes, partial entries, and Auth credentials out of screenshots and test records.

Persistent Community request listing and owner decline also require the matching signed Functions version before a client release. Merging this source does not deploy that backend.
