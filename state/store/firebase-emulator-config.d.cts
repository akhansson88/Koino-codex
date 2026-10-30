export type EmulatorConfiguration = Readonly<{
  enabled: true;
  host: string;
  projectId: "demo-koino";
  authPort: 9099;
  databasePort: 9001;
  functionsPort: 5001;
  functionsRegion: "europe-west1";
}>;
export function emulatorConfig(input?: { variant?: unknown; host?: unknown }): EmulatorConfiguration | undefined;
export function emulatorConfigFromExpo(config: unknown): EmulatorConfiguration | undefined;
