import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { ActivityIndicator, Text, View } from "react-native";

import { initializeBibleDatabase, releaseBibleDatabase, retainBibleDatabase } from "@/features/bible-database";
import { markStartupMilestone } from "@/features/startup-performance";
import { colors } from "@/ui/theme";

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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error>();
  const onReady = useCallback(() => setReady(true), []);
  const request = useCallback(() => setRequested(true), []);
  const onError = useCallback((nextError: Error) => {
    // Expo invokes onError during rendering. Publish it after that render.
    void Promise.resolve().then(() => setError(nextError));
  }, []);

  // Load the Bible asset only when a reader or picker requests it. Once opened,
  // keep the connection above the routes so dismissing a picker cannot close
  // active queries. Home never imports or opens this large database.
  return (
    <BibleDatabaseState.Provider value={{ ready, error, request }}>
      {children}
      {requested ? <SQLiteProvider
        assetSource={{ assetId: require("../assets/bible/koino-bible-v2.db") }}
        databaseName="koino-bible-v2.db"
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
