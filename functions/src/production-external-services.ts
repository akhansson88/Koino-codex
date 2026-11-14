import { emulatorTestConfiguration } from "./emulator-safety";

const productionProject = "koino-codex";
const productionDatabase = "https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app";

// Firebase sets GCLOUD_PROJECT and FIREBASE_CONFIG during discovery and in
// deployed Functions. Require agreement with the actual Admin app options.
export function productionExternalServicesEnabled(
  options: { projectId?: string; databaseURL?: string } | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (emulatorTestConfiguration(env) || env.FUNCTIONS_EMULATOR === "true" ||
      env.FIREBASE_AUTH_EMULATOR_HOST || env.FIREBASE_DATABASE_EMULATOR_HOST) return false;
  return env.GCLOUD_PROJECT === productionProject &&
    (env.GOOGLE_CLOUD_PROJECT === undefined || env.GOOGLE_CLOUD_PROJECT === productionProject) &&
    (env.GCP_PROJECT === undefined || env.GCP_PROJECT === productionProject) &&
    options?.projectId === productionProject &&
    options.databaseURL?.replace(/\/$/, "") === productionDatabase;
}
