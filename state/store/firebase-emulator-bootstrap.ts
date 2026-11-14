import Constants from "expo-constants";
import { applicationId } from "expo-application";
import { validateDevelopmentConfig } from "./firebase-development-config.cjs";
import { emulatorConfigFromExpo } from "./firebase-emulator-config.cjs";
import { installEmulatorClientNetworkGuard } from "./emulator-client-network";

// Validate the native Dev identity before any Firebase module loads. The early
// import also lets the Emulator guard wrap WebSocket before RTDB captures it.
const expoConfig = Constants.expoConfig;
export const developmentFirebaseConfiguration = validateDevelopmentConfig(expoConfig, applicationId);
if (developmentFirebaseConfiguration &&
    ((globalThis as { __FIREBASE_DEFAULTS__?: unknown }).__FIREBASE_DEFAULTS__ !== undefined ||
     process.env.__FIREBASE_DEFAULTS__ !== undefined)) {
  throw new Error("KOINO Dev refuses Firebase SDK environment overrides.");
}
export const emulatorConfiguration = emulatorConfigFromExpo(expoConfig);
installEmulatorClientNetworkGuard(emulatorConfiguration);
