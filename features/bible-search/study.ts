import { contentTerms } from "./retrieval";

export type StudyKind = "dictionary" | "commentary";

export type StudyEntry = {
  id: number;
  kind: StudyKind;
  title: string;
  text: string;
  refs: string[];
  snippet: string;
  rank: number;
};

export type StudyConnection = {
  getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]>;
};

type StudyRow = {
  id: number;
  kind: StudyKind;
  title: string;
  text: string;
  refs: string;
  snippet?: string;
  rank: number;
};

function quoted(term: string) {
  return `"${term.replaceAll('"', '""')}"`;
}

function expression(terms: string[], mode: "and" | "prefix" | "or") {
  if (mode === "or") return terms.map((term) => `${quoted(term)}*`).join(" OR ");
  if (mode === "prefix") return terms.map((term) => `${quoted(term)}*`).join(" AND ");
  return terms.map(quoted).join(" AND ");
}

function titleKey(terms: string[]) {
  return terms
    .flatMap((term) => term.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [])
    .sort()
    .join(" ");
}

function normalize(row: StudyRow): StudyEntry {
  const text = row.text.trim();
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    text,
    refs: row.refs.split("; ").map((ref) => ref.trim()).filter(Boolean),
    snippet: (row.snippet || text).replace(/\s+/g, " ").trim(),
    rank: row.rank,
  };
}

/** Pure study search over the bundled SQLite FTS index. */
export function createStudySearch(connection: StudyConnection) {
  async function queryRows(sql: string, ...args: any[]) {
    return await connection.getAllAsync<StudyRow>(sql, ...args);
  }

  function pickDiverse(entries: StudyEntry[], limit: number) {
    if (entries.length <= limit) return entries.slice(0, limit);
    const selected: StudyEntry[] = [];
    // Keep at least one dictionary and one commentary when both are available.
    for (const kind of ["dictionary", "commentary"] as const) {
      const first = entries.find((entry) => entry.kind === kind);
      if (first) selected.push(first);
    }
    for (const entry of entries) {
      if (selected.length >= limit) break;
      if (!selected.includes(entry)) selected.push(entry);
    }
    return selected.sort((a, b) => a.rank - b.rank).slice(0, limit);
  }

  async function search(query: string, limit = 3): Promise<StudyEntry[]> {
    const terms = contentTerms(query);
    if (!terms.length) return [];
    const bounded = Math.max(1, Math.min(5, Math.floor(limit)));
    const candidateLimit = Math.max(8, bounded * 4);
    const results: StudyEntry[] = [];
    const seen = new Set<number>();
    const add = (rows: StudyRow[]) => {
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        results.push(normalize(row));
      }
    };

    const exact = await queryRows(
      `SELECT id,kind,title,text,refs,substr(text,1,280) AS snippet,-1000 AS rank
         FROM entries WHERE title_key = ? LIMIT 1`,
      titleKey(terms),
    );
    add(exact);

    const base = `SELECT e.id,e.kind,e.title,e.text,e.refs,
        snippet(entries_fts,1,'','…','',24) AS snippet,
        bm25(entries_fts,12.0,1.0,2.0) AS rank
      FROM entries_fts f JOIN entries e ON e.id=f.rowid
      WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?`;
    for (const mode of ["and", "prefix", "or"] as const) {
      if (!terms.length) break;
      add(await queryRows(base, expression(terms, mode), candidateLimit));
      if (results.length >= candidateLimit) break;
    }
    return pickDiverse(results, bounded);
  }

  return { search };
}

let pendingConnection: Promise<StudyConnection> | undefined;

async function openStudyConnection(): Promise<StudyConnection> {
  const SQLite = await import("expo-sqlite");
  const manifest = require("../../assets/bible/study/study-manifest.json") as { databaseSha256: string; schemaVersion: number };
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.databaseSha256)) {
    throw new Error("Invalid bundled study index");
  }
  const databaseName = `koino-study-${manifest.databaseSha256.slice(0, 16)}.db`;
  await SQLite.importDatabaseFromAssetAsync(databaseName, { assetId: require("../../assets/bible/study/koino-study-v1.db") });
  const connection = await SQLite.openDatabaseAsync(databaseName);
  try {
    const metadata = new Map((await connection.getAllAsync<{ key: string; value: string }>("SELECT key,value FROM meta")).map(({ key, value }) => [key, value]));
    if (metadata.get("schema_version") !== "1" || !(Number(metadata.get("entry_count")) > 0)) {
      throw new Error("Study index metadata mismatch");
    }
    await connection.execAsync("PRAGMA query_only = ON");
    return { getAllAsync: (sql, ...params) => connection.getAllAsync(sql, ...params) };
  } catch (error) {
    await connection.closeAsync();
    throw error;
  }
}

export async function searchStudy(query: string, limit = 3): Promise<StudyEntry[]> {
  try {
    if (!pendingConnection) {
      pendingConnection = openStudyConnection().catch((error) => { pendingConnection = undefined; throw error; });
    }
    return await createStudySearch(await pendingConnection).search(query, limit);
  } catch {
    return [];
  }
}
