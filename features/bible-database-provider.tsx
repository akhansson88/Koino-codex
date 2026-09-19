import { PropsWithChildren, useEffect } from "react";
import { SQLiteProvider, useSQLiteContext, type SQLiteOpenOptions } from "expo-sqlite";

import { initializeBibleDatabase, releaseBibleDatabase, retainBibleDatabase } from "@/features/bible-database";
import { markStartupMilestone } from "@/features/startup-performance";

// The Bible screen and verse picker can remain mounted at the same time. Expo SQLite
// otherwise reuses one native connection for both providers, so unmounting either
// provider can close the connection while the other is still querying it.
const BIBLE_DATABASE_OPTIONS = { useNewConnection: true } satisfies SQLiteOpenOptions;

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

function BibleDatabaseLifetime({ children }: PropsWithChildren) {
  const database = useSQLiteContext();

  useEffect(() => {
    retainBibleDatabase(database);
    return () => releaseBibleDatabase(database);
  }, [database]);

  return children;
}

export function BibleDatabaseProvider({ children }: PropsWithChildren) {
  return (
    <SQLiteProvider
      assetSource={{ assetId: require("../assets/bible/koino-bible-v2.db") }}
      databaseName="koino-bible-v2.db"
      onInit={initializeInstrumentedBibleDatabase}
      options={BIBLE_DATABASE_OPTIONS}
    >
      <BibleDatabaseLifetime>{children}</BibleDatabaseLifetime>
    </SQLiteProvider>
  );
}
