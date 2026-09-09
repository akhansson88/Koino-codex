import { PropsWithChildren, useEffect } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";

import { initializeBibleDatabase, releaseBibleDatabase, retainBibleDatabase } from "@/features/bible-database";

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
      assetSource={{ assetId: require("../assets/bible/koino-bible-v1.db") }}
      databaseName="koino-bible-v1.db"
      onInit={initializeBibleDatabase}
    >
      <BibleDatabaseLifetime>{children}</BibleDatabaseLifetime>
    </SQLiteProvider>
  );
}
