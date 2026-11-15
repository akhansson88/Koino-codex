const projectId = "koino-staging";
const databaseURL = "https://koino-staging-default-rtdb.europe-west1.firebasedatabase.app";

let config;
try {
  config = JSON.parse(process.env.FIREBASE_CONFIG ?? "null");
} catch {
  throw new Error("KOINO staging Functions require inline Firebase Admin configuration.");
}

if (process.env.GCLOUD_PROJECT !== projectId ||
    ["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT"].some(name =>
      process.env[name] !== undefined && process.env[name] !== projectId) ||
    config?.projectId !== projectId ||
    (config?.databaseURL !== databaseURL && config?.databaseURL !== databaseURL + "/")) {
  throw new Error("KOINO staging Functions require the exact koino-staging project and default database.");
}

for (const name of [
  "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "FUNCTIONS_EMULATOR",
  "KOINO_EMULATOR_TEST_MODE", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_DATABASE_EMULATOR_HOST",
  "FIREBASE_REALTIME_URL", "FIREBASE_SECRET_REF_KOINO_SUPABASE_SERVICE_KEY",
  "KOINO_SUPABASE_SERVICE_KEY", "STRIPE_SECRET_KEY",
]) {
  if (process.env[name]) throw new Error(`KOINO staging Functions forbid ${name}.`);
}

const { getApps, initializeApp } = require("firebase-admin/app");
if (getApps().length > 0) throw new Error("KOINO staging Functions require a fresh Firebase Admin SDK.");

// Use the default app for both callable token verification and database access.
// Explicit options also pin the URL used by encryptedAccount's REST transactions.
initializeApp({ projectId, databaseURL });
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({
  serviceAccount: "koino-dev-runtime@koino-staging.iam.gserviceaccount.com",
  minInstances: 0,
  maxInstances: 2,
});

exports.encryptedAccount = require("./encryption").encryptedAccount;
