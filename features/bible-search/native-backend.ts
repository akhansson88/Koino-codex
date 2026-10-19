import { createScriptureSearchBackend, type ScriptureSearchBackend } from "./retrieval";
import { normalizeSwedishForSearch } from "../../scripts/hybrid-search/lexical.mjs";
import { embedQuery } from "./semantic-runtime";
import { E5_MODEL_REVISION } from "./embedding-core.mjs";

let pendingBackend: Promise<ScriptureSearchBackend> | undefined;

/** Search assets are deliberately loaded outside the reader's and Home's eager graph. */
export function getNativeSearchBackend(): Promise<ScriptureSearchBackend> {
  if (!pendingBackend) pendingBackend = openBackend().catch((error) => { pendingBackend = undefined; throw error; });
  return pendingBackend;
}

async function openBackend() {
  const SQLite = await import("expo-sqlite");
  const manifest = require("../../assets/bible/search/search-manifest.json") as { databaseSha256: string };
  if (!/^[a-f0-9]{64}$/.test(manifest.databaseSha256)) throw new Error("Invalid bundled search fingerprint");
  const databaseName = `koino-search-${manifest.databaseSha256.slice(0, 16)}.db`;
  await SQLite.importDatabaseFromAssetAsync(databaseName, { assetId: require("../../assets/bible/search/koino-search-v1.db") });
  const connection = await SQLite.openDatabaseAsync(databaseName);
  try {
    const metadata = new Map((await connection.getAllAsync<{ key: string; value: string }>("SELECT key,value FROM meta")).map(({ key, value }) => [key, value]));
    if (metadata.get("model_revision") !== E5_MODEL_REVISION || metadata.get("dimensions") !== "384") throw new Error("Search index/model mismatch");
    if (!(Number(metadata.get("correspondence_count")) > 0)) throw new Error("The bundled search index has no bilingual verse mapping.");
    await connection.getAllAsync("SELECT source_verse_id,target_verse_id FROM verse_correspondence LIMIT 1");
    const vectorType = metadata.get("vector_type");
    if (vectorType !== "int8" && vectorType !== "float32") throw new Error("Unsupported search vector format");
    let vectorError: unknown;
    try {
      const extension = SQLite.bundledExtensions["sqlite-vec"];
      if (!extension) throw new Error("This app binary does not include semantic search. Install the new native build.");
      await connection.loadExtensionAsync(extension.libPath, extension.entryPoint);
    } catch (error) { vectorError = error; }
    await connection.execAsync("PRAGMA query_only = ON");
    return createScriptureSearchBackend({
      connection,
      embedQuery: (query, signal) => vectorError ? Promise.reject(vectorError) : embedQuery(query, signal),
      stemSwedish: normalizeSwedishForSearch,
      vectorType,
      semanticMinSimilarity: Number(metadata.get("semantic_min_similarity") ?? 0.72),
    });
  } catch (error) {
    await connection.closeAsync();
    throw error;
  }
}
