import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApp, getApps } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth } from "@firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCLLSGBYogHq7YqUx6an4JRTWRhU9Y950s",
  authDomain: "koino-codex.firebaseapp.com",
  databaseURL: "https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "koino-codex",
  storageBucket: "koino-codex.firebasestorage.app",
  messagingSenderId: "181081151239",
  appId: "1:181081151239:web:e598ebe4e6e4493eac57a2",
  measurementId: "G-66WFNQ6Z29",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance: Auth;

try {
  authInstance = FirebaseAuth.getReactNativePersistence
    ? FirebaseAuth.initializeAuth(app, {
        persistence: FirebaseAuth.getReactNativePersistence(AsyncStorage),
      })
    : FirebaseAuth.getAuth(app);
} catch {
  authInstance = FirebaseAuth.getAuth(app);
}

export const auth = authInstance;

export const database = getDatabase(app);
