import { expandTopicGraphCandidates } from "./topic-graph";

/** Native-independent retrieval. The same SQL/ranking runs in device and asset tests. */
export type SearchDocument = {
  id: number;
  translation_id: number;
  book: string;
  chapter: number;
  start_verse: number;
  end_verse: number;
  kind: "verse" | "passage" | "window";
  title: string;
  text: string;
  canonical_order: number;
};

export type SearchSource = "reference" | "lexical" | "semantic" | "topic";
export type RankedDocument = { document: SearchDocument; score: number; sources: SearchSource[] };
export type SearchConnection = {
  getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]>;
};
export type ScriptureSearchBackend = {
  lexical(query: string, translationId: number, limit: number): Promise<RankedDocument[]>;
  hybrid(query: string, translationId: number, lexical: RankedDocument[], limit: number, signal?: AbortSignal): Promise<RankedDocument[]>;
  /** Enumerate every eligible range without the preview's candidate limits. */
  all?(query: string, translationId: number, includeSemantic: boolean, signal?: AbortSignal): Promise<RankedDocument[]>;
};

const noise = new Set("a an the and or of to in for with where verses verse bible passage passages about show me find that was were is are as at from on by en ett och eller om i på av med som var är visa mig hitta vers verser bibeln bibelställe bibelställen när där hur".split(" "));

export function queryTerms(query: string) {
  return (query.normalize("NFKC").toLocaleLowerCase("sv").match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => !noise.has(token)).slice(0, 16);
}

function quoted(tokens: string[], join: string) {
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(join);
}

/** A range has one identity even when both language corpora retrieve it. */
export function searchRangeIdentity(document: SearchDocument) {
  return `${document.translation_id}:${document.book}:${document.chapter}:${document.start_verse}:${document.end_verse}`;
}

function abortIfNeeded(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Search cancelled"); error.name = "AbortError"; throw error;
}

const yieldSearchWork = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Sort large candidate sets without monopolizing the React Native JS thread. */
async function sortSearchRows<T>(values: T[], compare: (a: T, b: T) => number, signal?: AbortSignal): Promise<T[]> {
  let runs: T[][] = [];
  for (let offset = 0; offset < values.length; offset += 2048) {
    abortIfNeeded(signal);
    runs.push(values.slice(offset, offset + 2048).sort(compare));
    if (offset && offset % 8192 === 0) await yieldSearchWork();
  }
  while (runs.length > 1) {
    const next: T[][] = [];
    for (let index = 0; index < runs.length; index += 2) {
      const left = runs[index], right = runs[index + 1];
      if (!right) { next.push(left); continue; }
      const merged: T[] = [];
      let l = 0, r = 0;
      while (l < left.length && r < right.length) {
        merged.push(compare(left[l], right[r]) <= 0 ? left[l++] : right[r++]);
        if (merged.length % 8192 === 0) { abortIfNeeded(signal); await yieldSearchWork(); }
      }
      while (l < left.length) {
        merged.push(left[l++]);
        if (merged.length % 8192 === 0) { abortIfNeeded(signal); await yieldSearchWork(); }
      }
      while (r < right.length) {
        merged.push(right[r++]);
        if (merged.length % 8192 === 0) { abortIfNeeded(signal); await yieldSearchWork(); }
      }
      next.push(merged);
      abortIfNeeded(signal);
    }
    runs = next;
    await yieldSearchWork();
  }
  return runs[0] ?? [];
}

/** Project through audited verse correspondence, never through matching verse numbers. */
export async function projectSearchDocuments(connection: SearchConnection, documents: SearchDocument[], translationId: number, signal?: AbortSignal, compact = false): Promise<SearchDocument[]> {
  abortIfNeeded(signal);
  const foreign = [...new Set(documents.filter((doc) => doc.translation_id !== translationId).map((doc) => doc.id))];
  const members = new Map<number, SearchDocument[]>();
  for (let offset = 0; offset < foreign.length; offset += 400) {
    const ids = foreign.slice(offset, offset + 400);
    const mapped = await connection.getAllAsync<SearchDocument & { source_document_id: number }>(
      `SELECT membership.document_id AS source_document_id, ${compact ? "target.id,target.translation_id,target.book,target.chapter,target.start_verse,target.end_verse,target.kind,'' AS title,'' AS text,target.canonical_order" : "target.*"}
         FROM document_verses membership
         JOIN verse_correspondence correspondence ON correspondence.source_verse_id=membership.verse_document_id
         JOIN documents target ON target.id=correspondence.target_verse_id
        WHERE membership.document_id IN (${ids.map(() => "?").join(",")})
          AND target.translation_id=? AND target.kind='verse'
        GROUP BY membership.document_id,target.id
        ORDER BY membership.document_id,target.canonical_order,target.id`, ...ids, translationId);
    abortIfNeeded(signal);
    for (const { source_document_id, ...doc } of mapped) {
      const list = members.get(source_document_id) ?? [];
      list.push(doc); members.set(source_document_id, list);
    }
  }
  return documents.flatMap((doc) => {
    if (doc.translation_id === translationId) return [doc];
    const groups: SearchDocument[][] = [];
    for (const member of members.get(doc.id) ?? []) {
      const group = groups.at(-1), previous = group?.at(-1);
      if (previous && previous.book === member.book && previous.chapter === member.chapter && previous.end_verse + 1 === member.start_verse) group!.push(member);
      else groups.push([member]);
    }
    return groups.map((group) => {
      const first = group[0], last = group[group.length - 1];
      if (doc.kind === "verse" && group.length === 1) return first;
      return { ...first,
        // Native verse IDs and native end verses make a stable synthetic range ID.
        id: -(first.id * 10_000 + last.end_verse),
        end_verse: last.end_verse,
        kind: doc.kind === "verse" ? "passage" as const : doc.kind,
        text: group.map((member) => member.text).join(" "),
      };
    });
  });
}

// Translate ordinary concept labels, not results or verse references. The same
// dictionary supports suggestion chips and freely typed queries in either UI language.
const topicLabelAliases: Record<string, string> = {
  oro: "anxiety", hopp: "hope", "förlåtelse": "forgiveness", identitet: "identity",
  ensamhet: "loneliness", mening: "purpose", "bön": "prayer", "nåd": "grace",
  "kärlek": "love", tro: "faith", frid: "peace", fred: "peace", "frälsning": "salvation",
  "barmhärtighet": "mercy", "omvändelse": "repentance", vishet: "wisdom", "glädje": "joy",
  sinnesro: "peace of mind",
};

export function canonicalTopicLabel(terms: string[]) {
  const label = terms.join(" ");
  return topicLabelAliases[label] ?? label;
}

export function isBroadTopicMatch(terms: string[], topicName: string, similarity: number, bestSimilarity: number) {
  if (!terms.length || terms.length > 3) return false;
  const topicTerms = queryTerms(topicName);
  const exact = queryTerms(canonicalTopicLabel(terms)).join(" ") === topicTerms.join(" ");
  if (exact) return true;
  const confidence = similarity >= 0.84 && similarity >= bestSimilarity - 0.015;
  // A nearby topic vector alone cannot establish a concept: multilingual names
  // can resemble unrelated names (for example Swedish nåd and English Noah).
  const shared = terms.filter((term) => topicTerms.includes(term)).length;
  return confidence && topicTerms.length === terms.length && shared / terms.length >= 0.8;
}

/** Each source contributes at most once to an identity, independent of raw score scale. */
export function reciprocalRankFusion(lists: { source: SearchSource; documents: SearchDocument[] }[]): RankedDocument[] {
  const merged = new Map<string, RankedDocument>();
  const sourceRanks = new Map<SearchSource, Map<string, { document: SearchDocument; rank: number }>>();
  for (const { source, documents } of lists) {
    const ranks = sourceRanks.get(source) ?? new Map();
    sourceRanks.set(source, ranks);
    for (const [rank, document] of documents.entries()) {
      const identity = searchRangeIdentity(document);
      if (!ranks.has(identity) || ranks.get(identity)!.rank > rank) ranks.set(identity, { document, rank });
    }
  }
  for (const [source, ranks] of sourceRanks) {
    for (const { document, rank } of ranks.values()) {
      const identity = searchRangeIdentity(document);
      const item = merged.get(identity) ?? { document, score: 0, sources: [] };
      item.score += 1 / (60 + rank + 1);
      if (!item.sources.includes(source)) item.sources.push(source);
      merged.set(identity, item);
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score || a.document.canonical_order - b.document.canonical_order || a.document.id - b.document.id);
}

/** Prefer the best-ranked evidence; prevent windows and their containing verses filling a page. */
export function collapseSearchRanges(candidates: RankedDocument[], limit: number): RankedDocument[] {
  const results: RankedDocument[] = [];
  for (const candidate of candidates) {
    const doc = candidate.document;
    const overlap = results.find((item) => item.document.book === doc.book && item.document.chapter === doc.chapter &&
      item.document.translation_id === doc.translation_id && item.document.start_verse <= doc.end_verse && item.document.end_verse >= doc.start_verse);
    if (overlap) {
      overlap.sources = [...new Set([...overlap.sources, ...candidate.sources])];
      continue;
    }
    // Adjacent verse hits form an honest contiguous excerpt, never a cross-chapter invented range.
    const adjacent = doc.kind === "verse" && results.find((item) => item.document.kind === "verse" &&
      item.document.book === doc.book && item.document.chapter === doc.chapter && item.document.translation_id === doc.translation_id &&
      item.document.title === doc.title &&
      (item.document.end_verse + 1 === doc.start_verse || doc.end_verse + 1 === item.document.start_verse) &&
      Math.max(item.document.end_verse, doc.end_verse) - Math.min(item.document.start_verse, doc.start_verse) < 4);
    if (adjacent) {
      adjacent.document = { ...adjacent.document, start_verse: Math.min(adjacent.document.start_verse, doc.start_verse), end_verse: Math.max(adjacent.document.end_verse, doc.end_verse) };
      adjacent.sources = [...new Set([...adjacent.sources, ...candidate.sources])];
      continue;
    }
    results.push({ ...candidate, document: { ...doc }, sources: [...candidate.sources] });
  }
  return results.slice(0, limit);
}

export function createScriptureSearchBackend({ connection, embedQuery, stemSwedish, vectorType = "int8", semanticMinSimilarity = 0.72 }: {
  connection: SearchConnection;
  embedQuery: (query: string, signal?: AbortSignal) => Promise<Float32Array>;
  stemSwedish: (text: string) => string;
  vectorType?: "int8" | "float32";
  semanticMinSimilarity?: number;
}): ScriptureSearchBackend {
  const candidates = 120;
  const vectorSQL = vectorType === "int8" ? "vec_quantize_int8(?, 'unit')" : "?";
  async function lexicalCorpus(query: string, translationId: number, stage: "strong" | "or" | "prefix", complete = false, signal?: AbortSignal) {
    const table = translationId === 2 ? "documents_sv" : "documents_en";
    const rawTerms = queryTerms(query);
    const tokens = translationId === 2 ? rawTerms.flatMap((term) => stemSwedish(term).split(/\s+/).filter(Boolean)) : rawTerms;
    if (!tokens.length) return [];
    const expressions = stage === "strong"
      ? [tokens.length > 1 ? `NEAR(${quoted(tokens, " ")}, 8)` : quoted(tokens, " "), quoted(tokens, " AND ")]
      : stage === "or"
        ? [quoted(tokens, " OR ")]
        : tokens.every((token) => token.length >= 3) ? [tokens.map((token) => `"${token}"*`).join(" OR ")] : [];
    const rows: SearchDocument[] = [];
    const seen = new Set<number>();
    for (const expression of [...new Set(expressions)]) {
      abortIfNeeded(signal);
      const found = await connection.getAllAsync<SearchDocument>(
        `SELECT ${complete ? "d.id,d.translation_id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,'' AS title,'' AS text,d.canonical_order" : "d.*"} FROM ${table} JOIN documents d ON d.id = ${table}.rowid WHERE ${table} MATCH ? AND d.translation_id = ? ORDER BY ${stage === "prefix" ? `bm25(${table})` : `bm25(${table}, 1.4, 1.0, 0.7)`}, d.canonical_order${complete ? ",d.id" : ""} LIMIT ?`, expression, translationId, complete ? -1 : candidates);
      abortIfNeeded(signal);
      for (const doc of found) if (!seen.has(doc.id)) { seen.add(doc.id); rows.push(doc); }
      if (!complete && rows.length >= candidates) break;
    }
    return complete ? rows : rows.slice(0, candidates);
  }
  async function lexical(query: string, translationId: number, _limit: number) {
    const searchCorpora = (stage: "strong" | "or" | "prefix") => Promise.all([1, 2].map((corpusId) => lexicalCorpus(query, corpusId, stage)));
    // Fallback is global: a partial match in either language must not compete
    // with an all-term match already found in the other language corpus.
    let corpora = await searchCorpora("strong");
    if (!corpora.some((documents) => documents.length)) corpora = await searchCorpora("or");
    if (!corpora.some((documents) => documents.length)) corpora = await searchCorpora("prefix");
    const branches = await Promise.all(corpora.map((documents) => projectSearchDocuments(connection, documents, translationId)));
    return reciprocalRankFusion(branches.map((documents) => ({ source: "lexical", documents })));
  }

  async function projectInBatches(documents: SearchDocument[], translationId: number, signal?: AbortSignal) {
    const projected: SearchDocument[] = [];
    for (let offset = 0; offset < documents.length; offset += 400) {
      abortIfNeeded(signal);
      projected.push(...await projectSearchDocuments(connection, documents.slice(offset, offset + 400), translationId, signal, true));
      if (offset && offset % 3200 === 0) await yieldSearchWork();
    }
    return projected;
  }

  async function lexicalAll(query: string, translationId: number, signal?: AbortSignal) {
    const searchCorpora = (stage: "strong" | "or" | "prefix") => Promise.all([1, 2].map((corpusId) => lexicalCorpus(query, corpusId, stage, true, signal)));
    let corpora = await searchCorpora("strong");
    if (!corpora.some((documents) => documents.length)) corpora = await searchCorpora("or");
    if (!corpora.some((documents) => documents.length)) corpora = await searchCorpora("prefix");
    const branches = await Promise.all(corpora.map((documents) => projectInBatches(documents, translationId, signal)));
    abortIfNeeded(signal);
    return reciprocalRankFusion(branches.map((documents) => ({ source: "lexical", documents })));
  }

  async function fuseAll(lists: { source: SearchSource; documents: SearchDocument[] }[], signal?: AbortSignal) {
    const merged = new Map<string, RankedDocument>();
    for (const { source, documents } of lists) {
      const seen = new Set<string>();
      for (let rank = 0; rank < documents.length; rank++) {
        const document = documents[rank], identity = searchRangeIdentity(document);
        if (!seen.has(identity)) {
          seen.add(identity);
          const item = merged.get(identity) ?? { document, score: 0, sources: [] };
          item.score += 1 / (61 + rank);
          item.sources.push(source);
          merged.set(identity, item);
        }
        if (rank && rank % 8192 === 0) { abortIfNeeded(signal); await yieldSearchWork(); }
      }
    }
    return sortSearchRows([...merged.values()], (a, b) => b.score - a.score || a.document.canonical_order - b.document.canonical_order || a.document.id - b.document.id, signal);
  }

  async function all(query: string, translationId: number, includeSemantic: boolean, signal?: AbortSignal) {
    const lexicalRows = await lexicalAll(query, translationId, signal);
    if (!includeSemantic) return lexicalRows;
    const vector = await embedQuery(query, signal);
    abortIfNeeded(signal);
    const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
    type ScoredDocument = SearchDocument & { search_distance: number | null };
    const semantic: ScoredDocument[] = [];
    let cursor = 0;
    let bestDistance = Infinity;
    // vec0's KNN query has a hard k=4096 ceiling. Scan vectors in bounded ID
    // batches using the same cosine metric, without transferring embeddings to JS.
    for (;;) {
      abortIfNeeded(signal);
      const batch = await connection.getAllAsync<ScoredDocument>(
        `WITH batch AS (SELECT id,translation_id,book,chapter,start_verse,end_verse,kind,canonical_order FROM documents WHERE id>? ORDER BY id LIMIT ?)
         SELECT b.*, '' AS title, '' AS text,
                CASE WHEN v.id IS NULL THEN NULL ELSE vec_distance_cosine(v.embedding, ${vectorSQL}) END AS search_distance
           FROM batch b LEFT JOIN vec_documents v ON v.id=b.id ORDER BY b.id`, cursor, 1024, bytes);
      abortIfNeeded(signal);
      if (!batch.length) break;
      cursor = batch[batch.length - 1].id;
      for (const doc of batch) {
        if (typeof doc.search_distance !== "number" || !Number.isFinite(doc.search_distance)) continue;
        bestDistance = Math.min(bestDistance, doc.search_distance);
        if (1 - doc.search_distance >= semanticMinSimilarity) semantic.push(doc);
      }
      if (batch.length < 1024) break;
      await yieldSearchWork();
    }
    const rankedSemantic = await sortSearchRows(semantic, (a, b) => a.search_distance! - b.search_distance! || a.canonical_order - b.canonical_order || a.id - b.id, signal);
    let topics: SearchDocument[] = [];
    let hasTopicLabelMatch = false;
    const terms = queryTerms(query);
    if (terms.length > 0 && terms.length <= 3) {
      const exactTopics = await connection.getAllAsync<{ id: number; name: string }>("SELECT id,name FROM topics WHERE name=?", canonicalTopicLabel(terms));
      abortIfNeeded(signal);
      const matching = exactTopics.length ? [] : await connection.getAllAsync<{ id: number; name: string; distance: number }>(
        `SELECT t.*,v.distance FROM vec_topics v JOIN topics t ON t.id=v.id WHERE v.embedding MATCH ${vectorSQL} AND k=3 ORDER BY v.distance`, bytes);
      abortIfNeeded(signal);
      const topicIds = [...new Set([...exactTopics.map((item) => item.id), ...matching.filter((item) => isBroadTopicMatch(terms, item.name, 1 - item.distance, 1 - matching[0].distance)).map((item) => item.id)])];
      hasTopicLabelMatch = topicIds.length > 0;
      if (topicIds.length) {
        topics = await connection.getAllAsync<SearchDocument>(
          `SELECT d.id,d.translation_id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,'' AS title,'' AS text,d.canonical_order
             FROM topic_documents td JOIN documents d ON d.id=td.document_id
             LEFT JOIN document_authority incoming ON incoming.document_id=d.id
            WHERE td.topic_id IN (${topicIds.map(() => "?").join(",")}) AND d.translation_id=?
            GROUP BY d.id ORDER BY MAX(td.weight) DESC,COALESCE(incoming.weight,0) DESC,d.canonical_order,d.id`, ...topicIds, translationId);
        abortIfNeeded(signal);
        topics = await expandTopicGraphCandidates({ connection, topicDocuments: topics, hasTopicMatch: true, contentTerms: terms, translationId, queryVector: vector, vectorType, semanticMinSimilarity, signal, maxNeighbors: null });
      }
    }
    abortIfNeeded(signal);
    if (!lexicalRows.length && !hasTopicLabelMatch && 1 - bestDistance < 0.84) return [];
    const relevant = await projectInBatches(rankedSemantic, translationId, signal);
    return fuseAll([
      { source: "lexical", documents: lexicalRows.map((item) => item.document) },
      { source: "semantic", documents: relevant },
      { source: "topic", documents: topics },
    ], signal);
  }
  return {
    lexical,
    all,
    async hybrid(query, translationId, lexicalRows, limit, signal) {
      const vector = await embedQuery(query, signal);
      abortIfNeeded(signal);
      const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
      const semantic = (await Promise.all([1, 2].map((corpusId) => connection.getAllAsync<SearchDocument & { distance: number }>(
        `SELECT d.*,v.distance FROM vec_documents v JOIN documents d ON d.id=v.id WHERE v.embedding MATCH ${vectorSQL} AND k=CAST(? AS INTEGER) AND v.translation_id=CAST(? AS INTEGER) ORDER BY v.distance`, bytes, candidates, corpusId)))).flat()
        .sort((a, b) => a.distance - b.distance || a.canonical_order - b.canonical_order || a.id - b.id);
      abortIfNeeded(signal);
      let topics: SearchDocument[] = [];
      let hasTopicLabelMatch = false;
      const terms = queryTerms(query);
      if (terms.length > 0 && terms.length <= 3) {
        const exactTopics = await connection.getAllAsync<{ id: number; name: string }>("SELECT id,name FROM topics WHERE name=?", canonicalTopicLabel(terms));
        abortIfNeeded(signal);
        const matching = exactTopics.length ? [] : await connection.getAllAsync<{ id: number; name: string; distance: number }>(
          `SELECT t.*,v.distance FROM vec_topics v JOIN topics t ON t.id=v.id WHERE v.embedding MATCH ${vectorSQL} AND k=3 ORDER BY v.distance`, bytes);
        abortIfNeeded(signal);
        const topicIds = [...new Set([...exactTopics.map((item) => item.id), ...matching.filter((item) => isBroadTopicMatch(terms, item.name, 1 - item.distance, 1 - matching[0].distance)).map((item) => item.id)])];
        hasTopicLabelMatch = topicIds.length > 0;
        if (topicIds.length) topics = await connection.getAllAsync<SearchDocument>(
          `SELECT d.* FROM topic_documents td JOIN documents d ON d.id=td.document_id
           LEFT JOIN document_authority incoming ON incoming.document_id=d.id
           WHERE td.topic_id IN (${topicIds.map(() => "?").join(",")}) AND d.translation_id=?
           GROUP BY d.id ORDER BY MAX(td.weight) DESC,COALESCE(incoming.weight,0) DESC,d.canonical_order LIMIT ?`, ...topicIds, translationId, candidates);
        if (topicIds.length) topics = await expandTopicGraphCandidates({ connection, topicDocuments: topics, hasTopicMatch: true, contentTerms: terms, translationId, queryVector: vector, vectorType, semanticMinSimilarity, signal });
      }
      abortIfNeeded(signal);
      // E5 similarities have a high background floor even for unrelated text.
      // Without any textual or topic-label support, require a stronger leading
      // semantic match instead of presenting arbitrary Bible passages as hits.
      if (!lexicalRows.length && !hasTopicLabelMatch && 1 - (semantic[0]?.distance ?? 1) < 0.84) return [];
      const relevant = await projectSearchDocuments(connection, semantic.filter((doc) => 1 - doc.distance >= semanticMinSimilarity), translationId, signal);
      const fused = reciprocalRankFusion([
        { source: "lexical", documents: lexicalRows.map((item) => item.document) },
        { source: "semantic", documents: relevant },
        { source: "topic", documents: topics },
      ]);
      return collapseSearchRanges(fused, limit);
    },
  };
}
