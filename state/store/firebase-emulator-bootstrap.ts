import Constants from "expo-constants";
import { emulatorConfigFromExpo } from "./firebase-emulator-config.cjs";
import { installEmulatorClientNetworkGuard } from "./emulator-client-network";

// The entry point imports this before Firebase: RTDB captures WebSocket when
// its module loads, so configuring only inside initializeApp would be too late.
export const emulatorConfiguration = emulatorConfigFromExpo(Constants.expoConfig);
installEmulatorClientNetworkGuard(emulatorConfiguration);
