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
export type TestamentFilter = "old" | "new";
export type SearchScope = { testament?: TestamentFilter; book?: string };

const OLD_TESTAMENT_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Solomon's Song",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
] as const;
const NEW_TESTAMENT_BOOKS = [
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation",
] as const;

export function testamentBooks(scope?: SearchScope) {
  if (!scope?.testament) return undefined;
  return scope.testament === "old" ? OLD_TESTAMENT_BOOKS : NEW_TESTAMENT_BOOKS;
}

export type SearchAllOptions = {
  /** Trim the long semantic tail relative to the query's own best match. */
  relativeSemanticCutoff?: boolean;
  /** Precise mode keeps keyword recovery instead of question routing. */
  mode?: QueryMode;
  scope?: SearchScope;
};

export type ScriptureSearchBackend = {
  lexical(query: string, translationId: number, limit: number, options?: { mode?: QueryMode; scope?: SearchScope }): Promise<RankedDocument[]>;
  hybrid(query: string, translationId: number, lexical: RankedDocument[], limit: number, signal?: AbortSignal, scope?: SearchScope): Promise<RankedDocument[]>;
  /** Enumerate every eligible range without the preview's candidate limits. */
  all?(query: string, translationId: number, includeSemantic: boolean, signal?: AbortSignal, options?: SearchAllOptions): Promise<RankedDocument[]>;
};

const noise = new Set("a an the and or of to in for with where verses verse bible passage passages about show me find that was were is are as at from on by en ett och eller om i på av med som var är visa mig hitta vers verser bibeln bibelställe bibelställen när där hur".split(" "));

/**
 * Filler words that are safe to discard from a natural-language question.
 * They are deliberately not applied to keyword or quoted searches, where
 * every token can be evidence (for example the phrase "I am").
 */
const questionNoise = new Set(`
what who whom whose why how when where which
does did do is are was were am be been being
can could should would will shall may might must
say says said tell tells told mean means meant meaning
about concerning regarding according please really actually just
i me my mine we us our you your yours he him his she her hers
they them their it its this that these those
not no nor but if then than so there here also too very
more most some any all every each other such only again
up out down off over under after before during between into
from to in on at by for with without of and or a an the
get got make made take taken give given go going went come came
thing things something someone somebody anyone anybody everyone
deal dealing cope coping handle handling help helps helped
care cares caring cared cannot
need needs needed want wants wanted feel feels felt feeling
think thinks thought know knows knew live lives lived life
jag mig min mitt mina vi oss vår vårt våra du dig din ditt dina
han hon de dem det den detta dessa
att har hade kan kunde ska skulle vill måste inte ingen inget
men då där här så för till från med utan också bara som vid
över under efter före mellan igen mer mest någon något några
alla varje sin sitt sina blir blev vara varit gör göra gjorde
får fick kommer kom gå går gick ta tar tog ge ger gav
säger säga sagt menar betyder enligt om vad vem vilka vilken
varför hur när var är kan ska bör borde vill skulle
hjälp hjälpa hantera hanterar orkar känner känna tänker tänka
vet veta behöver behövde vill velat någonting någonstans
bryr bry sig dem hans hennes deras själv själva verkligen faktiskt
egentligen kanske alltid aldrig ofta ibland mycket lite väldigt
`.trim().split(/\s+/));

/** Light, domain-safe lemmas so a question and its topic label meet. */
const questionLemmas: Record<string, string> = {
  grieving: "grief", grieves: "grief", grieved: "grief",
  forgive: "forgiveness", forgiven: "forgiveness", forgiving: "forgiveness",
  wronged: "forgiveness", wrongs: "forgiveness",
  worshipping: "worship", worshipped: "worship", worships: "worship",
  suffering: "suffering", suffered: "suffering", suffers: "suffering",
  anxious: "anxiety", anxieties: "anxiety",
  lonely: "loneliness", depressed: "depression", depressing: "depression",
  afraid: "fear", scared: "fear", fearful: "fear",
  healing: "healing", healed: "healing", heals: "healing",
  married: "marriage", marrying: "marriage",
  parenting: "parenting", parents: "parenting", parent: "parenting",
  sörjer: "sorg", sörjde: "sorg", sorgsen: "sorg",
  förlåta: "förlåtelse", förlåtit: "förlåtelse", förlåtelse: "förlåtelse",
  tillber: "tillbedjan", tillbad: "tillbedjan", tillbedd: "tillbedjan",
  lidande: "lidande", lider: "lidande", led: "lidande",
  orolig: "ångest", oro: "ångest", ångest: "ångest",
  ensam: "ensamhet", ensamhet: "ensamhet",
  rädd: "rädsla", rädsla: "rädsla",
  sjuk: "sjukdom", sjukdom: "sjukdom", sjuka: "sjukdom",
  helande: "helande", helad: "helande", helar: "helande",
  gift: "äktenskap", gifta: "äktenskap", äktenskap: "äktenskap",
  förälder: "föräldraskap", föräldrar: "föräldraskap",
  hopplös: "hopplöshet", hopplöshet: "hopplöshet",
  generös: "generositet", generositet: "generositet",
};

const divineNames = new Set(["god", "gud", "jesus", "christ", "kristus", "lord", "herren", "holy", "spirit", "ande"]);

export function queryTerms(query: string) {
  return (query.normalize("NFKC").toLocaleLowerCase("sv").match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => !noise.has(token)).slice(0, 16);
}

/** Terms used to interpret a natural-language question. */
export function contentTerms(query: string) {
  const seen = new Set<string>();
  return (query.normalize("NFKC").toLocaleLowerCase("sv").match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => !noise.has(token) && !questionNoise.has(token))
    .map((token) => questionLemmas[token] ?? token)
    .filter((token) => {
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    })
    .slice(0, 16);
}

export type QueryMode = "keyword" | "question";

const questionStarts = /^(what|who|whom|whose|why|how|when|where|which|does|did|do|is|are|can|could|should|would|will|vad|vem|vilka|vilken|varför|hur|när|var|är|kan|ska|bör)\b/i;

const sentenceMarkers = /\b(the|a|an|is|are|was|were|has|have|had|does|did|can|could|should|would|will|i|we|you|he|she|they|my|our|your|his|her|their|me|us|him|them|for|of|to|in|with|about|from|by|on|that|who|which|where|det|den|ett|en|är|var|har|hade|kan|kunde|ska|skulle|vill|jag|vi|du|han|hon|de|dem|mig|oss|som)\b/;

export function isQuestionQuery(query: string) {
  const normalized = query.trim();
  if (!normalized) return false;
  if (/\?$/.test(normalized) || questionStarts.test(normalized)) return true;
  const raw = normalized.normalize("NFKC").toLocaleLowerCase("sv").match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = contentTerms(normalized);
  return raw.length >= 4 && terms.length >= 2 && sentenceMarkers.test(normalized);
}

export function queryMode(query: string): QueryMode {
  return isQuestionQuery(query) ? "question" : "keyword";
}

const swedishQueryWords = /\b(och|att|det|som|på|är|av|för|med|till|den|har|inte|om|ett|jag|mig|du|vi|oss|han|hon|de|dem|vad|vem|vilka|vilken|varför|hur|när|var|säger|säga|bibeln|verser|vers|hjälp|känner|behöver|orolig|ledsen|ensam)\b/;
const englishQueryWords = /\b(the|and|of|to|in|that|was|were|is|are|for|with|what|who|whom|why|how|does|did|do|bible|scripture|verse|passage|about)\b/;

export type QueryLanguage = "en" | "sv" | "mixed";

/** Avoid applying one language's stemming and prefix rules to the other corpus. */
export function detectQueryLanguage(query: string): QueryLanguage {
  const normalized = query.normalize("NFKC").toLocaleLowerCase("sv");
  const swedish = /[åäö]/.test(normalized) || swedishQueryWords.test(normalized);
  const english = englishQueryWords.test(normalized);
  if (swedish && !english) return "sv";
  if (english && !swedish) return "en";
  return "mixed";
}

/**
 * The corpus is bilingual, but the embedding space still benefits from a
 * small English expansion of Swedish pastoral vocabulary. It also makes the
 * 6,752 English topic labels reachable from ordinary Swedish questions.
 */
const swedishSemanticTerms: Record<string, string> = {
  gud: "god", jesus: "jesus", kristus: "christ", ande: "spirit", kyrka: "church", bibeln: "bible",
  pengar: "money", rikedom: "wealth", fattigdom: "poverty", generositet: "generosity",
  "hjärta": "heart", "hjärtat": "heart", "tillfredsställa": "satisfy", "tillfredsställer": "satisfy",
  sorg: "grief", "sörjer": "grief", "sörjande": "grief", "ångest": "anxiety", "orolig": "anxiety",
  "förlåtelse": "forgiveness", "förlåta": "forgiveness", ensamhet: "loneliness", "rädsla": "fear",
  ilska: "anger", hopp: "hope", frid: "peace", "kärlek": "love", tro: "faith", "nåd": "grace",
  "bön": "prayer", "frälsning": "salvation", synd: "sin", frestelse: "temptation",
  lidande: "suffering", helande: "healing", "äktenskap": "marriage", "föräldraskap": "parenting",
  vishet: "wisdom", "tålamod": "patience", "vänlighet": "kindness", "glädje": "joy",
  mod: "courage", tillit: "trust", lydnad: "obedience", "omvändelse": "repentance",
  helgelse: "sanctification", "tröst": "comfort", mening: "purpose", identitet: "identity",
  gemenskap: "community", "tjänst": "service", mission: "mission", evangelisation: "evangelism",
  "lärjungaskap": "discipleship", tvivel: "doubt", skam: "shame", skuld: "guilt",
  beroende: "addiction", depression: "depression", "utbrändhet": "burnout", vila: "rest",
  sabbat: "sabbath", "död": "death", begravning: "funeral", "änglar": "angels",
  demoner: "demons", satan: "satan", "bibelstudium": "bible study",
  "hopplöshet": "hopelessness", sinnesro: "peace of mind", "människovärde": "human dignity",
  "medkänsla": "compassion", "osjälvisk": "selfless",
  "helige": "holy", "helig": "holy", talar: "speak", tala: "speak", "tillbedjan": "worship",
  "tillbedja": "worship", "frälsare": "savior", "skapelse": "creation", "förbund": "covenant",
  "profet": "prophet", "apostel": "apostle", "lärjunge": "disciple", "liknelse": "parable",
  "psalm": "psalm", "ordspråk": "proverb", dop: "baptism", nattvard: "communion",
  "församling": "church", "församlingen": "church", "gudstjänst": "worship",
  "barmhärtighet": "mercy", "rättvisa": "justice", "rättfärdighet": "righteousness",
  "helighet": "holiness", "återlösning": "redemption",
  "uppståndelse": "resurrection", "himmel": "heaven", "helvete": "hell",
  "ängel": "angel", "demon": "demon",
};

const swedishActionWords = /\b(bryr|sörjer|hanterar|övervinner|förlåter|hittar|behöver|kämpar|söker|känner|älskar|följer|tjänar|ber|lovar|tackar|oroar|lider|gråter|hoppas|tror|tvivlar|tillfredsställer|tillfredsställa)\b/;

export function semanticQueryText(query: string) {
  if (detectQueryLanguage(query) === "en") return query;
  const terms = contentTerms(query);
  // Single concepts already work in the multilingual space; expanding them
  // can lose a direct hit such as hopplöshet -> Romans 8:24.
  if (terms.length <= 1) return query;
  // A two-word Swedish topic such as "osjälvisk generositet" is already well
  // represented. Only translate a short phrase when it carries an action
  // ("Gud bryr sig ...") that the embedding space otherwise misses.
  if (terms.length === 2 && !swedishActionWords.test(query)) return query;
  const mapped = terms.map((term) => swedishSemanticTerms[term]).filter((term): term is string => Boolean(term));
  if (mapped.length && mapped.length / Math.max(1, terms.length) >= 0.6) return [...new Set(mapped)].join(" ");
  return query;
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
  oro: "anxiety", "ångest": "anxiety", hopp: "hope", "förlåtelse": "forgiveness",
  identitet: "identity", ensamhet: "loneliness", mening: "purpose", "bön": "prayer",
  "nåd": "grace", "kärlek": "love", tro: "faith", frid: "peace", fred: "peace",
  "frälsning": "salvation", "barmhärtighet": "mercy", "omvändelse": "repentance",
  vishet: "wisdom", "glädje": "joy", sinnesro: "peace of mind",
  sorg: "grief", "sörjer": "grief", "medkänsla": "compassion",
  "hopplöshet": "hopelessness", "generositet": "generosity", "osjälvisk generositet": "generosity",
  "människovärde": "human dignity", "rättvisa": "justice", "rädsla": "fear",
  "ilska": "anger", "stolthet": "pride", "avundsjuka": "jealousy",
  "frestelse": "temptation", "helgelse": "sanctification", "sjukdom": "sickness",
  "helande": "healing", "död": "death", "äktenskap": "marriage",
  "föräldraskap": "parenting", "arbete": "work", "pengar": "money",
  "rikedom": "wealth", "fattigdom": "poverty", "gemenskap": "community",
  "tålamod": "patience", "vänlighet": "kindness", "trohet": "faithfulness",
  "självkontroll": "self-control",
  "den helige ande": "holy spirit", "helig ande": "holy spirit",
  "jesus": "jesus", "gud": "god",
};

export function canonicalTopicLabel(terms: string[]) {
  const label = terms.join(" ");
  return topicLabelAliases[label] ?? label;
}

const pastoralTopicTerms = new Set([
  "grief", "anxiety", "forgiveness", "loneliness", "fear", "anger", "hope", "peace",
  "love", "joy", "salvation", "sin", "temptation", "suffering", "healing", "marriage",
  "parenting", "money", "purpose", "identity", "depression", "addiction", "doubt",
  "shame", "guilt", "comfort", "strength", "wisdom", "patience", "kindness",
  "generosity", "mercy", "grace", "faith", "prayer", "sorg", "ångest", "förlåtelse",
  "ensamhet", "rädsla", "ilska", "hopp", "frid", "kärlek", "glädje", "frälsning",
  "synd", "frestelse", "lidande", "helande", "äktenskap", "föräldraskap", "pengar",
  "mening", "identitet", "depression", "beroende", "tvivel", "skam", "skuld",
  "tröst", "styrka", "vishet", "tålamod", "vänlighet", "generositet", "barmhärtighet",
  "nåd", "tro", "bön",
]);

/**
 * Exact-topic lookup with two narrow allowances:
 * - a one-term phrase can use the shared Swedish/English alias table;
 * - "God/Jesus + grief" may identify the "grief" topic without discarding the
 *   divine name from ranking, but only when the other term is a pastoral topic.
 *   This keeps "who worshipped Jesus" as a semantic question instead of turning
 *   it into the broad "worship" topic. Three-term phrases stay untouched.
 */
export function topicLookupLabel(terms: string[]) {
  if (terms.length <= 2) {
    const filtered = terms.filter((term) => !divineNames.has(term));
    if (filtered.length && filtered.length < terms.length && filtered.every((term) => pastoralTopicTerms.has(term))) {
      const label = filtered.join(" ");
      return topicLabelAliases[label] ?? label;
    }
  }
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
export function reciprocalRankFusion(
  lists: { source: SearchSource; documents: SearchDocument[]; weight?: number }[],
): RankedDocument[] {
  const merged = new Map<string, RankedDocument>();
  const sourceRanks = new Map<SearchSource, Map<string, { document: SearchDocument; rank: number; weight: number }>>();
  for (const { source, documents, weight = 1 } of lists) {
    const ranks = sourceRanks.get(source) ?? new Map();
    sourceRanks.set(source, ranks);
    for (const [rank, document] of documents.entries()) {
      const identity = searchRangeIdentity(document);
      if (!ranks.has(identity) || ranks.get(identity)!.rank > rank) ranks.set(identity, { document, rank, weight });
    }
  }
  for (const [source, ranks] of sourceRanks) {
    for (const { document, rank, weight } of ranks.values()) {
      const identity = searchRangeIdentity(document);
      const item = merged.get(identity) ?? { document, score: 0, sources: [] };
      item.score += weight / (60 + rank + 1);
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

  // Ranked verse hits from the same sermon section are one result, not five
  // near-duplicate cards. Keep the gap bounded so distant verses in a long
  // chapter are still separate findings.
  const grouped: RankedDocument[] = [];
  for (const candidate of results) {
    const doc = candidate.document;
    if (doc.kind !== "verse") {
      grouped.push(candidate);
      continue;
    }
    const group = grouped.find((item) => item.document.kind === "verse" &&
      item.document.book === doc.book && item.document.chapter === doc.chapter &&
      item.document.translation_id === doc.translation_id && item.document.title === doc.title &&
      (doc.start_verse - item.document.end_verse <= 3 && item.document.start_verse - doc.end_verse <= 3) &&
      Math.max(item.document.end_verse, doc.end_verse) - Math.min(item.document.start_verse, doc.start_verse) <= 12);
    if (group) {
      group.document = { ...group.document,
        start_verse: Math.min(group.document.start_verse, doc.start_verse),
        end_verse: Math.max(group.document.end_verse, doc.end_verse),
      };
      group.score = Math.max(group.score, candidate.score);
      group.sources = [...new Set([...group.sources, ...candidate.sources])];
      continue;
    }
    grouped.push(candidate);
  }
  return grouped.slice(0, limit);
}

const MISSING_TOPIC_SCHEMA = /no such table: (topics|vec_topics|topic_documents|document_authority|search_cross_references)/i;

function isMissingTopicSchema(error: unknown) {
  return error instanceof Error && MISSING_TOPIC_SCHEMA.test(error.message);
}

export function createScriptureSearchBackend({
  connection, embedQuery, stemSwedish, vectorType = "int8", semanticMinSimilarity = 0.72,
  semanticOnlyMinSimilarity = 0.84, semanticRelativeFloor = 0.78, semanticRelativeMargin = 0.05,
  validateQuery,
}: {
  connection: SearchConnection;
  embedQuery: (query: string, signal?: AbortSignal) => Promise<Float32Array>;
  stemSwedish: (text: string) => string;
  vectorType?: "int8" | "float32";
  semanticMinSimilarity?: number;
  semanticOnlyMinSimilarity?: number;
  semanticRelativeFloor?: number;
  semanticRelativeMargin?: number;
  /** A cheap domain check run after the query vector is available. */
  validateQuery?: (query: string, vector: Float32Array, support: { lexical: boolean; exactTopic: boolean }) => boolean;
}): ScriptureSearchBackend {
  const candidates = 120;
  const vectorSQL = vectorType === "int8" ? "vec_quantize_int8(?, 'unit')" : "?";

  function scopeClause(scope?: SearchScope, alias = "d") {
    const books = scope?.book ? [scope.book] : testamentBooks(scope);
    return books
      ? { sql: ` AND ${alias}.book IN (${books.map(() => "?").join(",")})`, args: [...books] as string[] }
      : { sql: "", args: [] as string[] };
  }

  function corpusAllowed(translationId: number, language: QueryLanguage) {
    if (language === "mixed") return true;
    return language === "sv" ? translationId === 2 : translationId === 1;
  }

  async function lexicalCorpus(query: string, translationId: number, stage: "strong" | "or" | "prefix", complete: boolean, signal: AbortSignal | undefined, mode: QueryMode, language: QueryLanguage, scope?: SearchScope) {
    if (!corpusAllowed(translationId, language)) return [];
    const scopeFilter = scopeClause(scope);
    const table = translationId === 2 ? "documents_sv" : "documents_en";
    const rawTerms = mode === "question" ? contentTerms(query) : queryTerms(query);
    const tokens = translationId === 2 ? rawTerms.flatMap((term) => stemSwedish(term).split(/\s+/).filter(Boolean)) : rawTerms;
    if (!tokens.length) return [];
    const expressions = stage === "strong"
      ? mode === "question"
        ? [tokens.length > 1 ? `NEAR(${quoted(tokens, " ")}, 8)` : quoted(tokens, " ")]
        : [tokens.length > 1 ? `NEAR(${quoted(tokens, " ")}, 8)` : quoted(tokens, " "), quoted(tokens, " AND ")]
      : stage === "or"
        ? [quoted(tokens, " OR ")]
        : tokens.every((token) => token.length >= 3) ? [tokens.map((token) => `"${token}"*`).join(" OR ")] : [];
    const rows: SearchDocument[] = [];
    const seen = new Set<number>();
    for (const expression of [...new Set(expressions)]) {
      abortIfNeeded(signal);
      const found = await connection.getAllAsync<SearchDocument>(
        `SELECT ${complete ? "d.id,d.translation_id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,'' AS title,'' AS text,d.canonical_order" : "d.*"} FROM ${table} JOIN documents d ON d.id = ${table}.rowid WHERE ${table} MATCH ? AND d.translation_id = ?${scopeFilter.sql} ORDER BY ${stage === "prefix" ? `bm25(${table})` : `bm25(${table}, 1.4, 1.0, 0.7)`}, d.canonical_order${complete ? ",d.id" : ""} LIMIT ?`, expression, translationId, ...scopeFilter.args, complete ? -1 : candidates);
      abortIfNeeded(signal);
      for (const doc of found) if (!seen.has(doc.id)) { seen.add(doc.id); rows.push(doc); }
      if (!complete && rows.length >= candidates) break;
    }
    return complete ? rows : rows.slice(0, candidates);
  }

  async function searchLexical(query: string, translationId: number, complete: boolean, signal?: AbortSignal, modeOverride?: QueryMode, scope?: SearchScope) {
    const mode = modeOverride ?? queryMode(query);
    const language = detectQueryLanguage(query);
    const searchCorpora = (stage: "strong" | "or" | "prefix") =>
      Promise.all([1, 2].map((corpusId) => lexicalCorpus(query, corpusId, stage, complete, signal, mode, language, scope)));
    // Questions are semantic-first. The OR/prefix stages exist for keyword
    // recovery, but on a sentence they match filler words and poison ranking.
    let corpora = await searchCorpora("strong");
    if (mode === "keyword") {
      if (!corpora.some((documents) => documents.length)) corpora = await searchCorpora("or");
      if (!corpora.some((documents) => documents.length)) corpora = await searchCorpora("prefix");
    }
    const branches = complete
      ? await Promise.all(corpora.map((documents) => projectInBatches(documents, translationId, signal)))
      : await Promise.all(corpora.map((documents) => projectSearchDocuments(connection, documents, translationId)));
    abortIfNeeded(signal);
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

  async function lexical(query: string, translationId: number, _limit: number, options?: { mode?: QueryMode; scope?: SearchScope }) {
    return searchLexical(query, translationId, false, undefined, options?.mode, options?.scope);
  }

  async function lexicalAll(query: string, translationId: number, signal?: AbortSignal, modeOverride?: QueryMode, scope?: SearchScope) {
    return searchLexical(query, translationId, true, signal, modeOverride, scope);
  }

  async function topicCandidates(query: string, translationId: number, terms: string[], bytes: Uint8Array, vector: Float32Array, complete: boolean, signal?: AbortSignal, scope?: SearchScope) {
    if (!terms.length || terms.length > 5) return { topics: [] as SearchDocument[], exact: false, matched: false };
    const scopeFilter = scopeClause(scope);
    try {
      const exactTopics = await connection.getAllAsync<{ id: number; name: string }>("SELECT id,name FROM topics WHERE name=?", topicLookupLabel(terms));
      abortIfNeeded(signal);
      const matching = exactTopics.length ? [] : await connection.getAllAsync<{ id: number; name: string; distance: number }>(
        `SELECT t.*,v.distance FROM vec_topics v JOIN topics t ON t.id=v.id WHERE v.embedding MATCH ${vectorSQL} AND k=${terms.length >= 3 ? 8 : 3} ORDER BY v.distance`, bytes);
      abortIfNeeded(signal);
      const semanticTerms = contentTerms(semanticQueryText(query));
      const accepted = matching.filter((item) => {
        const similarity = 1 - item.distance;
        const bestSimilarity = 1 - matching[0].distance;
        if (isBroadTopicMatch(terms, item.name, similarity, bestSimilarity)) return true;
        if (terms.length < 3) return false;
        // Longer questions rarely equal a topic label exactly. Accept a
        // high-confidence topic only when the question and topic share a
        // concrete content term (for example money -> the money topic).
        const topicTerms = queryTerms(item.name);
        const shared = semanticTerms.filter((term) => !divineNames.has(term) && topicTerms.includes(term)).length;
        return similarity >= 0.84 && similarity >= bestSimilarity - 0.02 && shared >= 1;
      }).slice(0, 2);
      const topicIds = [...new Set([...exactTopics.map((item) => item.id), ...accepted.map((item) => item.id)])];
      if (!topicIds.length) return { topics: [] as SearchDocument[], exact: false, matched: false };
      let topics = await connection.getAllAsync<SearchDocument>(
        complete
          ? `SELECT d.id,d.translation_id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,'' AS title,'' AS text,d.canonical_order
               FROM topic_documents td JOIN documents d ON d.id=td.document_id
               LEFT JOIN document_authority incoming ON incoming.document_id=d.id
              WHERE td.topic_id IN (${topicIds.map(() => "?").join(",")}) AND d.translation_id=?${scopeFilter.sql}
              GROUP BY d.id ORDER BY MAX(td.weight) DESC,COALESCE(incoming.weight,0) DESC,d.canonical_order,d.id`
          : `SELECT d.* FROM topic_documents td JOIN documents d ON d.id=td.document_id
               LEFT JOIN document_authority incoming ON incoming.document_id=d.id
              WHERE td.topic_id IN (${topicIds.map(() => "?").join(",")}) AND d.translation_id=?${scopeFilter.sql}
              GROUP BY d.id ORDER BY MAX(td.weight) DESC,COALESCE(incoming.weight,0) DESC,d.canonical_order LIMIT ?`,
        ...topicIds, translationId, ...scopeFilter.args, ...(complete ? [] : [candidates]));
      abortIfNeeded(signal);
      topics = await expandTopicGraphCandidates({ connection, topicDocuments: topics, hasTopicMatch: true, contentTerms: terms, translationId, queryVector: vector, vectorType, semanticMinSimilarity, signal, maxNeighbors: complete ? null : 48, books: testamentBooks(scope) });
      return { topics, exact: exactTopics.length > 0, matched: true };
    } catch (error) {
      if (isMissingTopicSchema(error)) return { topics: [] as SearchDocument[], exact: false, matched: false };
      throw error;
    }
  }

  async function fuseAll(lists: { source: SearchSource; documents: SearchDocument[]; weight?: number }[], signal?: AbortSignal) {
    const merged = new Map<string, RankedDocument>();
    for (const { source, documents, weight = 1 } of lists) {
      const seen = new Set<string>();
      for (let rank = 0; rank < documents.length; rank++) {
        const document = documents[rank], identity = searchRangeIdentity(document);
        if (!seen.has(identity)) {
          seen.add(identity);
          const item = merged.get(identity) ?? { document, score: 0, sources: [] };
          item.score += weight / (61 + rank);
          item.sources.push(source);
          merged.set(identity, item);
        }
        if (rank && rank % 8192 === 0) { abortIfNeeded(signal); await yieldSearchWork(); }
      }
    }
    return sortSearchRows([...merged.values()], (a, b) => b.score - a.score || a.document.canonical_order - b.document.canonical_order || a.document.id - b.document.id, signal);
  }

  function semanticFloor(bestSimilarity: number) {
    return Math.max(semanticRelativeFloor, bestSimilarity - semanticRelativeMargin);
  }

  async function all(query: string, translationId: number, includeSemantic: boolean, signal?: AbortSignal, options?: SearchAllOptions) {
    const lexicalRows = await lexicalAll(query, translationId, signal, options?.mode, options?.scope);
    if (!includeSemantic) return lexicalRows;
    const vector = await embedQuery(semanticQueryText(query), signal);
    abortIfNeeded(signal);
    const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
    const terms = contentTerms(query);
    const topicResult = await topicCandidates(query, translationId, terms, bytes, vector, true, signal, options?.scope);
    abortIfNeeded(signal);
    if (validateQuery && !validateQuery(query, vector, { lexical: lexicalRows.length > 0, exactTopic: topicResult.exact })) return [];
    type ScoredDocument = SearchDocument & { search_distance: number | null };
    const semantic: ScoredDocument[] = [];
    const semanticScope = scopeClause(options?.scope, "documents");
    let cursor = 0;
    // vec0's KNN query has a hard k=4096 ceiling. Scan vectors in bounded ID
    // batches using the same cosine metric, without transferring embeddings to JS.
    for (;;) {
      abortIfNeeded(signal);
      const batch = await connection.getAllAsync<ScoredDocument>(
        `WITH batch AS (SELECT id,translation_id,book,chapter,start_verse,end_verse,kind,canonical_order FROM documents WHERE id>?${semanticScope.sql} ORDER BY id LIMIT ?)
         SELECT b.*, '' AS title, '' AS text,
                CASE WHEN v.id IS NULL THEN NULL ELSE vec_distance_cosine(v.embedding, ${vectorSQL}) END AS search_distance
           FROM batch b LEFT JOIN vec_documents v ON v.id=b.id ORDER BY b.id`, cursor, ...semanticScope.args, 1024, bytes);
      abortIfNeeded(signal);
      if (!batch.length) break;
      cursor = batch[batch.length - 1].id;
      for (const doc of batch) {
        if (typeof doc.search_distance !== "number" || !Number.isFinite(doc.search_distance)) continue;
        if (1 - doc.search_distance >= semanticMinSimilarity) semantic.push(doc);
      }
      if (batch.length < 1024) break;
      await yieldSearchWork();
    }
    const rankedSemantic = await sortSearchRows(semantic, (a, b) => a.search_distance! - b.search_distance! || a.canonical_order - b.canonical_order || a.id - b.id, signal);
    const bestSimilarity = rankedSemantic.length ? 1 - rankedSemantic[0].search_distance! : 0;
    // A weak semantic tail contains many merely adjacent topics. Keep a broad
    // list for paging, but trim it relative to this query's own best evidence.
    let relevantSemantic = rankedSemantic;
    if (options?.relativeSemanticCutoff && rankedSemantic.length > 20) {
      const floor = semanticFloor(bestSimilarity);
      const trimmed = rankedSemantic.filter((doc) => 1 - doc.search_distance! >= floor);
      relevantSemantic = trimmed.length >= 20 ? trimmed : rankedSemantic.slice(0, 20);
    }
    if (!lexicalRows.length && !topicResult.matched && !validateQuery && bestSimilarity < semanticOnlyMinSimilarity) return [];
    const relevant = await projectInBatches(relevantSemantic, translationId, signal);
    return fuseAll([
      { source: "lexical", documents: lexicalRows.map((item) => item.document) },
      { source: "semantic", documents: relevant },
      { source: "topic", documents: topicResult.topics, weight: topicResult.exact ? 1.4 : 0.6 },
    ], signal);
  }
  return {
    lexical,
    all,
    async hybrid(query, translationId, lexicalRows, limit, signal, scope) {
      const vector = await embedQuery(semanticQueryText(query), signal);
      abortIfNeeded(signal);
      const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
      const terms = contentTerms(query);
      const scopeFilter = scopeClause(scope);
      const topicResult = await topicCandidates(query, translationId, terms, bytes, vector, false, signal, scope);
      abortIfNeeded(signal);
      if (validateQuery && !validateQuery(query, vector, { lexical: lexicalRows.length > 0, exactTopic: topicResult.exact })) return [];
      const semantic = (await Promise.all([1, 2].map((corpusId) => connection.getAllAsync<SearchDocument & { distance: number }>(
        `SELECT d.*,v.distance FROM vec_documents v JOIN documents d ON d.id=v.id WHERE v.embedding MATCH ${vectorSQL} AND k=CAST(? AS INTEGER) AND v.translation_id=CAST(? AS INTEGER)${scopeFilter.sql} ORDER BY v.distance`, bytes, candidates, corpusId, ...scopeFilter.args)))).flat()
        .sort((a, b) => a.distance - b.distance || a.canonical_order - b.canonical_order || a.id - b.id);
      abortIfNeeded(signal);
      const bestSimilarity = semantic.length ? 1 - semantic[0].distance : 0;
      // E5 similarities have a high background floor even for unrelated text.
      // Without any textual or topic-label support, require a stronger leading
      // semantic match instead of presenting arbitrary Bible passages as hits.
      if (!lexicalRows.length && !topicResult.matched && !validateQuery && bestSimilarity < semanticOnlyMinSimilarity) return [];
      const floor = semanticFloor(bestSimilarity);
      let relevantSemantic = semantic.filter((doc) => 1 - doc.distance >= floor);
      if (relevantSemantic.length < Math.min(10, semantic.length)) relevantSemantic = semantic.slice(0, Math.min(10, semantic.length));
      const relevant = await projectSearchDocuments(connection, relevantSemantic, translationId, signal);
      const fused = reciprocalRankFusion([
        { source: "lexical", documents: lexicalRows.map((item) => item.document) },
        { source: "semantic", documents: relevant },
        { source: "topic", documents: topicResult.topics, weight: topicResult.exact ? 1.4 : 0.6 },
      ]);
      return collapseSearchRanges(fused, limit);
    },
  };
}
