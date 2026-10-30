import { emulatorConfiguration } from "./firebase-emulator-bootstrap";
import { installEmulatorClientNetworkGuard } from "./emulator-client-network";
import AsyncStorage from "@/state/encryption/local-storage";
import { initializeApp, getApp, getApps } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth } from "@firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";


export { emulatorConfiguration };
installEmulatorClientNetworkGuard(emulatorConfiguration);
export const emulatorMode = Boolean(emulatorConfiguration);

const firebaseConfig = emulatorConfiguration ? {
  apiKey: "demo-koino-emulator-only",
  authDomain: "demo-koino.firebaseapp.com",
  databaseURL: "https://demo-koino-default-rtdb.firebaseio.com",
  projectId: "demo-koino",
  appId: "1:000000000000:web:demo-koino",
} : {
  apiKey: "AIzaSyCLLSGBYogHq7YqUx6an4JRTWRhU9Y950s",
  authDomain: "koino-codex.firebaseapp.com",
  databaseURL: "https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "koino-codex",
  storageBucket: "koino-codex.firebasestorage.app",
  messagingSenderId: "181081151239",
  appId: "1:181081151239:web:e598ebe4e6e4493eac57a2",
  measurementId: "G-66WFNQ6Z29",
};

// Keep the DEFAULT app: encryption and existing consumers expect getApp().
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
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
export const functions = getFunctions(app, "europe-west1");
if (emulatorConfiguration) connectFunctionsEmulator(functions, emulatorConfiguration.host, emulatorConfiguration.functionsPort);
