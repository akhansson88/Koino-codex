# Onboarding 1.0 security acceptance

## Open release requirement

The native iOS app-switcher cover introduced in `78ff3ca` still requires Swift compilation and physical iPhone verification. Expo declined the acceptance build because the account exhausted its iOS build quota. The previously tested iPhone build at `f405c51` predates the cover.

This source integration does not establish production readiness. Keep iOS release acceptance open until the following checks pass on an approved `emulator-ios` build from the integrated source, using the isolated `demo-koino` backend and a dummy account.

1. Open recovery setup and verify the key is fully readable and selectable while the app is active.
2. Enter part of the confirmation with the keyboard open, then open the iOS app switcher. The preview must be fully opaque and reveal no recovery-key characters. Repeat rapid background and foreground transitions.
3. Return to the app and verify that the same draft and partial confirmation are restored. Complete confirmation and verify that VoiceOver, Dynamic Type, and onboarding navigation still work.

Record the tested Git commit, EAS build ID, iOS version, and result without capturing or recording the recovery key.

Persistent Community request listing and owner decline also require the matching signed Functions version before a client release. Merging this source does not deploy that backend.
