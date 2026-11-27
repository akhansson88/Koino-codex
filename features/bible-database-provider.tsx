import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from "react";
import { defaultDatabaseDirectory, SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";
import { ActivityIndicator, Text, View } from "react-native";

import { initializeBibleDatabase, releaseBibleDatabase, retainBibleDatabase } from "@/features/bible-database";
import { markStartupMilestone } from "@/features/startup-performance";
import { colors } from "@/ui/theme";

const BIBLE_DATABASE_NAME = "koino-bible-v4.db";
const BIBLE_DATABASE_ASSET = require("../assets/bible/koino-bible-v4.db");

const BibleDatabaseState = createContext<{ ready: boolean; error?: Error; request: () => void }>({ ready: false, request: () => {} });

async function initializeInstrumentedBibleDatabase(database: Parameters<typeof initializeBibleDatabase>[0]) {
  markStartupMilestone("bibleInitializationStart");
  try {
    await initializeBibleDatabase(database);
    markStartupMilestone("bibleInitializationReady");
  } catch (error) {
    markStartupMilestone("bibleInitializationError", error instanceof Error ? error.message : "unknown error");
    throw error;
  }
}

/**
 * The asset only has to be imported when the database file is missing.
 * Passing `assetSource` unconditionally makes expo-sqlite resolve and hash the
 * 33 MB asset on every open, which delayed the first Bible page by ~160 ms.
 */
async function bibleDatabaseNeedsImport() {
  try {
    const directory = String(defaultDatabaseDirectory ?? "").replace(/\/+$/, "");
    if (!directory) return true;
    const path = directory.startsWith("file://") ? `${directory}/${BIBLE_DATABASE_NAME}` : `file://${directory}/${BIBLE_DATABASE_NAME}`;
    const info = await FileSystem.getInfoAsync(path);
    return !info.exists;
  } catch {
    return true;
  }
}

function BibleDatabaseLifetime({ onReady }: { onReady: () => void }) {
  const database = useSQLiteContext();

  useEffect(() => {
    retainBibleDatabase(database);
    onReady();
    return () => releaseBibleDatabase(database);
  }, [database, onReady]);

  return null;
}

export function BibleDatabaseProvider({ children }: PropsWithChildren) {
  const [requested, setRequested] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [needsImport, setNeedsImport] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error>();
  const onReady = useCallback(() => setReady(true), []);
  const request = useCallback(() => setRequested(true), []);
  const onError = useCallback((nextError: Error) => {
    // Expo invokes onError during rendering. Publish it after that render.
    void Promise.resolve().then(() => setError(nextError));
  }, []);

  useEffect(() => {
    if (!requested) return;
    let active = true;
    void bibleDatabaseNeedsImport().then((missing) => {
      if (!active) return;
      setNeedsImport(missing);
      setPrepared(true);
    });
    return () => { active = false; };
  }, [requested]);

  // Opening the bundled SQLCipher database costs a few seconds of file work on
  // a cold start. Pay that in the background once the first screen is settled,
  // so tapping Bible finds an open connection instead of a spinner. A tap
  // before the timer fires simply requests it sooner.
  useEffect(() => {
    if (requested) return;
    const timer = setTimeout(() => setRequested(true), 1200);
    return () => clearTimeout(timer);
  }, [requested]);

  // Load the Bible asset only when a reader or picker requests it. Once opened,
  // keep the connection above the routes so dismissing a picker cannot close
  // active queries. Home never imports or opens this large database.
  return (
    <BibleDatabaseState.Provider value={{ ready, error, request }}>
      {children}
      {prepared ? <SQLiteProvider
        assetSource={needsImport ? { assetId: BIBLE_DATABASE_ASSET } : undefined}
        databaseName={BIBLE_DATABASE_NAME}
        onInit={initializeInstrumentedBibleDatabase}
        onError={onError}
      >
        <BibleDatabaseLifetime onReady={onReady} />
      </SQLiteProvider> : null}
    </BibleDatabaseState.Provider>
  );
}

export function BibleDatabaseBoundary({ children }: PropsWithChildren) {
  const { ready, error, request } = useContext(BibleDatabaseState);
  useEffect(() => { request(); }, [request]);
  if (ready) return children;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream, padding: 24 }}>
      {error ? <Text style={{ color: colors.ink, textAlign: "center" }}>{error.message}</Text> : <ActivityIndicator color={colors.olive} />}
    </View>
  );
}
