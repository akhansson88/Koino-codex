import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { assertDemoFirebaseOptions, emulatorTestConfiguration, installEmulatorNetworkGuards } from "./emulator-safety";

const emulator = emulatorTestConfiguration();
if (emulator) installEmulatorNetworkGuards();
const existing = emulator ? getApps().find(app => app.name === "[DEFAULT]") : undefined;
if (emulator && existing) assertDemoFirebaseOptions(existing.options, emulator.databaseHost);
export const adminApp = emulator
  ? existing ?? initializeApp({ projectId: emulator.projectId, databaseURL: emulator.databaseURL,
    // The local Admin SDK never discovers workstation/service-account credentials.
    credential: { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) } })
  : getApps().length > 0 ? getApp() : initializeApp();

// No Firestore emulator is part of this test environment. Fail closed if an
// unrelated feature is accidentally imported; production initialization is unchanged.
export const firestore = emulator ? new Proxy({} as Firestore, {
  get() { throw new Error("Firestore is disabled in emulator test mode."); },
}) : getFirestore(adminApp);
