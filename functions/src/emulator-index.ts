import { requireEmulatorTestConfiguration } from "./emulator-safety";

// The launcher prepares this as the emulator package's only entry point.
// Never import payments or scheduled jobs into the isolated local environment.
requireEmulatorTestConfiguration();
export { encryptedAccount } from "./encryption";
export { createCommentNotification, sendPrayerNotification } from "./activity-notifications";
