import type { FirebaseOptions } from "firebase/app";

export type StagingFirebaseConfiguration = Readonly<{
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  functionsRegion: "europe-west1";
}>;

export function validateDevelopmentConfig(config: unknown, nativeApplicationId: string | null): StagingFirebaseConfiguration | undefined;
export function assertStagingAppOptions(expected: FirebaseOptions, actual: FirebaseOptions): void;
