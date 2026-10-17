import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import sodium from "react-native-libsodium";

let opening: Promise<SQLite.SQLiteDatabase> | undefined;
async function database() {
  if (!opening) opening = (async () => {
    let key = await SecureStore.getItemAsync("koino.local.database-key", { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    if (!key) {
      // A restored device-only key is unavailable. Discard its unreadable local
      // database so sign-in plus recovery can rebuild it from encrypted backups.
      const restored = await FileSystem.getInfoAsync(`${SQLite.defaultDatabaseDirectory}/koino-private.db`);
      if (restored.exists) await SQLite.deleteDatabaseAsync("koino-private.db");
      key = sodium.to_hex(sodium.randombytes_buf(32));
      await SecureStore.setItemAsync("koino.local.database-key", key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid local encryption key.");
    const db = await SQLite.openDatabaseAsync("koino-private.db");
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    // Fail closed on a binary accidentally built without SQLCipher.
    const cipher = await db.getFirstAsync<Record<string, unknown>>("PRAGMA cipher_version");
    if (!cipher || !Object.values(cipher).some(Boolean)) { await db.closeAsync(); throw new Error("This app build does not support encrypted storage. Install the updated app."); }
    await db.execAsync("CREATE TABLE IF NOT EXISTS private_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA secure_delete = ON;");
    return db;
  })().catch((error) => { opening = undefined; throw error; });
  return opening;
}

// Compatible with Firebase's React Native persistence adapter. Legacy values
// are removed only after the SQLCipher write succeeds.
const encryptedStorage = {
  async getItem(key: string): Promise<string | null> {
    const db = await database();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM private_kv WHERE key = ?", key);
    if (row) return row.value;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) { await encryptedStorage.setItem(key, legacy); await AsyncStorage.removeItem(key); }
    return legacy;
  },
  async setItem(key: string, value: string) {
    const db = await database();
    await db.runAsync("INSERT INTO private_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  },
  async removeItem(key: string) {
    const db = await database();
    await db.runAsync("DELETE FROM private_kv WHERE key = ?", key);
    await AsyncStorage.removeItem(key);
  },
  async clearContent() {
    const db = await database();
    await db.runAsync("DELETE FROM private_kv WHERE key NOT LIKE 'firebase:%' AND key NOT LIKE 'e2ee.%'");
  },
  async clearLegacyCommunities() {
    const matches = (key: string) => key.startsWith("e2ee.legacy-group.") || key.startsWith("e2ee.legacy-communities.") || key.startsWith("e2ee.image-migration.");
    const db = await database();
    await db.runAsync("DELETE FROM private_kv WHERE key LIKE 'e2ee.legacy-group.%' OR key LIKE 'e2ee.legacy-communities.%' OR key LIKE 'e2ee.image-migration.%'");
    const keys = (await AsyncStorage.getAllKeys()).filter(matches);
    if (keys.length) await AsyncStorage.multiRemove(keys);
  },
  async migrateLegacy() {
    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys.filter((value) => value.startsWith("koino.") || value.startsWith("firebase:"))) await encryptedStorage.getItem(key);
  },
};
export default encryptedStorage;
