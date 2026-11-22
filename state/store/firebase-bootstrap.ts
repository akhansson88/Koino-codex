import Constants from "expo-constants";
import { applicationId } from "expo-application";
import { assertSupportedAppConfig, validateDevelopmentConfig } from "./firebase-development-config.cjs";

// Validate the native app and bundle before any Firebase module loads.
const expoConfig = Constants.expoConfig;
assertSupportedAppConfig(expoConfig, applicationId);
export const developmentFirebaseConfiguration = validateDevelopmentConfig(expoConfig, applicationId);
if (developmentFirebaseConfiguration &&
    ((globalThis as { __FIREBASE_DEFAULTS__?: unknown }).__FIREBASE_DEFAULTS__ !== undefined ||
     process.env.__FIREBASE_DEFAULTS__ !== undefined)) {
  throw new Error("KOINO Dev refuses Firebase SDK environment overrides.");
}
