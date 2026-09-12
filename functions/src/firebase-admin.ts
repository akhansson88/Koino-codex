import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const adminApp = getApps().length > 0 ? getApp() : initializeApp();

export const firestore = getFirestore(adminApp);
