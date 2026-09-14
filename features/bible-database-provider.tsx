import { PropsWithChildren, useEffect } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";

import { initializeBibleDatabase, releaseBibleDatabase, retainBibleDatabase } from "@/features/bible-database";
import { markStartupMilestone } from "@/features/startup-performance";

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
    >
      <BibleDatabaseLifetime>{children}</BibleDatabaseLifetime>
    </SQLiteProvider>
  );
}
