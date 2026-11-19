import { developmentFirebaseConfiguration } from "./firebase-bootstrap";
import { assertStagingAppOptions } from "./firebase-development-config.cjs";
import productionFirebaseConfiguration from "./firebase-production.json";
import AsyncStorage from "@/state/encryption/local-storage";
import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth } from "@firebase/auth";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

export const developmentMode = Boolean(developmentFirebaseConfiguration);

const { functionsRegion, ...stagingOptions } = developmentFirebaseConfiguration ?? {};
const firebaseConfig: FirebaseOptions = developmentFirebaseConfiguration ? stagingOptions : productionFirebaseConfiguration;

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
export const auth = authInstance;
export const database = getDatabase(app);
export const functions = getFunctions(app, functionsRegion ?? "europe-west1");
