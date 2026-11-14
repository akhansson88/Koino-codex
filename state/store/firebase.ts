import { developmentFirebaseConfiguration, emulatorConfiguration } from "./firebase-emulator-bootstrap";
import { assertStagingAppOptions } from "./firebase-development-config.cjs";
import productionFirebaseConfiguration from "./firebase-production.json";
import { installEmulatorClientNetworkGuard } from "./emulator-client-network";
import AsyncStorage from "@/state/encryption/local-storage";
import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth } from "@firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";


export { emulatorConfiguration };
installEmulatorClientNetworkGuard(emulatorConfiguration);
export const emulatorMode = Boolean(emulatorConfiguration);
export const developmentMode = Boolean(developmentFirebaseConfiguration);

const { functionsRegion, ...stagingOptions } = developmentFirebaseConfiguration ?? {};
const firebaseConfig: FirebaseOptions = developmentFirebaseConfiguration ? stagingOptions : emulatorConfiguration ? {
  apiKey: "demo-koino-emulator-only",
  authDomain: "demo-koino.firebaseapp.com",
  databaseURL: "https://demo-koino-default-rtdb.firebaseio.com",
  projectId: "demo-koino",
  appId: "1:000000000000:web:demo-koino",
} : productionFirebaseConfiguration;

// Keep the DEFAULT app: encryption and existing consumers expect getApp().
const apps = getApps();
if (developmentFirebaseConfiguration) {
  for (const initialized of apps) assertStagingAppOptions(stagingOptions, initialized.options);
}
const existingApp = developmentFirebaseConfiguration
  ? apps.find(candidate => candidate.name === "[DEFAULT]")
  : apps.length ? getApp() : undefined;
const app = existingApp ?? initializeApp(firebaseConfig);
if (app.options.projectId !== firebaseConfig.projectId) throw new Error("Firebase app mode does not match this KOINO build. Restart the app.");

let authInstance: Auth;
try {
  authInstance = FirebaseAuth.getReactNativePersistence
    ? FirebaseAuth.initializeAuth(app, { persistence: FirebaseAuth.getReactNativePersistence(AsyncStorage) })
    : FirebaseAuth.getAuth(app);
} catch {
  authInstance = FirebaseAuth.getAuth(app);
}
// Configure emulator routing synchronously, before exposing any service. Errors
// deliberately stop startup; emulator builds never fall back to live services.
if (emulatorConfiguration) FirebaseAuth.connectAuthEmulator(authInstance, `http://${emulatorConfiguration.host}:${emulatorConfiguration.authPort}`, { disableWarnings: true });
export const auth = authInstance;
export const database = getDatabase(app);
if (emulatorConfiguration) connectDatabaseEmulator(database, emulatorConfiguration.host, emulatorConfiguration.databasePort);
export const functions = getFunctions(app, functionsRegion ?? "europe-west1");
if (emulatorConfiguration) connectFunctionsEmulator(functions, emulatorConfiguration.host, emulatorConfiguration.functionsPort);
