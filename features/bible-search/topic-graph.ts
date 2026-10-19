import type { SearchConnection, SearchDocument } from "./retrieval";

type GraphNeighbor = SearchDocument & { graph_weight: number; query_similarity: number };

function abortIfNeeded(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Search cancelled"); error.name = "AbortError"; throw error;
}

/**
 * Optional broad-topic expansion. Append one-hop evidence to the existing topic
 * list so it contributes one topic vote in fusion, rather than a second source.
 * The caller must establish the exact/high-confidence topic match first.
 */
export async function expandTopicGraphCandidates({
  connection, topicDocuments, hasTopicMatch, contentTerms, translationId, queryVector,
  vectorType = "int8", semanticMinSimilarity = 0.72, signal,
}: {
  connection: SearchConnection;
  topicDocuments: SearchDocument[];
  hasTopicMatch: boolean;
  contentTerms: readonly string[];
  translationId: number;
  queryVector: Float32Array;
  vectorType?: "int8" | "float32";
  semanticMinSimilarity?: number;
  signal?: AbortSignal;
}): Promise<SearchDocument[]> {
  abortIfNeeded(signal);
  if (!hasTopicMatch || contentTerms.length < 1 || contentTerms.length > 3) return [...topicDocuments];
  const seeds = [...new Set(topicDocuments.filter((doc) => doc.translation_id === translationId && doc.kind === "verse").map((doc) => doc.id))].slice(0, 8);
  if (!seeds.length) return [...topicDocuments];
  const existing = [...new Set(topicDocuments.map((doc) => doc.id))];
  const bytes = new Uint8Array(queryVector.buffer, queryVector.byteOffset, queryVector.byteLength);
  const vectorSQL = vectorType === "int8" ? "vec_quantize_int8(?, 'unit')" : "?";
  const neighbors = await connection.getAllAsync<GraphNeighbor>(
    `WITH neighbors AS (
       SELECT target_document_id, MAX(weight) AS graph_weight
         FROM search_cross_references
        WHERE source_document_id IN (${seeds.map(() => "?").join(",")})
        GROUP BY target_document_id
     )
     SELECT d.*, neighbors.graph_weight,
            1 - vec_distance_cosine(v.embedding, ${vectorSQL}) AS query_similarity
       FROM neighbors
       JOIN documents d ON d.id = neighbors.target_document_id
       JOIN vec_documents v ON v.id = d.id
      WHERE d.translation_id = ? AND d.kind = 'verse'
        AND d.id NOT IN (${existing.map(() => "?").join(",")})
        AND query_similarity >= ?
      ORDER BY neighbors.graph_weight DESC, d.canonical_order, d.id
      LIMIT 48`,
    ...seeds, bytes, translationId, ...existing, semanticMinSimilarity,
  );
  abortIfNeeded(signal);
  const seen = new Set(topicDocuments.map((doc) => doc.id));
  const additions = neighbors.filter((doc) => {
    if (seen.has(doc.id) || doc.translation_id !== translationId || doc.kind !== "verse" ||
      !Number.isFinite(doc.query_similarity) || doc.query_similarity < semanticMinSimilarity) return false;
    seen.add(doc.id);
    return true;
  }).slice(0, 48).map(({ graph_weight: _weight, query_similarity: _similarity, ...doc }) => doc);
  return [...topicDocuments, ...additions];
}
