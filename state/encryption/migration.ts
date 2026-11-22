// Legacy plaintext communities were retired when accounts moved to
// encryptedData/. There is no personal or community copy migration left; the
// deprecated listener resolves once with an empty snapshot.
export type LegacyCommunitySnapshot = { groups: never[]; memberships: never[]; ready: boolean };
export type MigrationProgress = (message: string) => void;

export function listenLegacyCommunities(_userId: string, listener: (snapshot: LegacyCommunitySnapshot) => void, _onError?: () => void) {
  const timer = setTimeout(() => listener({ groups: [], memberships: [], ready: true }), 0);
  return () => clearTimeout(timer);
}
export async function personalMigrationComplete() { return true; }
export async function migratePersonal(_progress: MigrationProgress, _signupName?: string) { return; }
export async function migrateOwnedGroups(_progress: MigrationProgress) { return; }
