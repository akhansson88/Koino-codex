import { contentTerms } from "./retrieval";
import { E5_MODEL_REVISION } from "./embedding-core.mjs";

type QuantizedPrototype = { scale: number; q: number[] };
type PrototypeAsset = {
  schemaVersion: number;
  modelRevision: string;
  dimensions: number;
  threshold: number;
  positive: QuantizedPrototype[];
  negative: QuantizedPrototype[];
};

const prototypes = require("../../assets/bible/search/query-prototypes.json") as PrototypeAsset;
if (prototypes.schemaVersion !== 1 || prototypes.dimensions !== 384 || prototypes.modelRevision !== E5_MODEL_REVISION) {
  throw new Error("The bundled query-validity prototypes do not match the search model.");
}

/** Compare Swedish and English labels without diacritics. */
const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/['’]/g, "").toLocaleLowerCase("sv");

const positiveAnchors = new Set(`
god gud jesus christ kristus lord herren holy spirit ande bible bibeln scripture skriften
gospel evangelium church kyrka christian kristen christians kristna faith tro grace nad sin synd salvation fralsning
worship tillbedjan prayer bon pray ber forgive forlatelse forlata forgive forgiven love karlek hope hopp
peace frid joy gladje mercy barmhartighet justice rattvisa righteousness holiness helighet
repentance omvandelse redemption aterlosning resurrection uppstandelse heaven himmel hell helvete
angel anglar demon demoner satan covenant forbund prophet profet apostle apostel disciple larjunge
parable liknelse psalm proverbs ordspr bible baptism dop communion nattvard fasting fasta
tithe tionde offering offer marriage aktenskap spouse maka parent parenting foralder child barn children
family familj friendship van friend van husband wife spouse father mother dad mom son daughter brother sister
work arbete money pengar wealth rikedom poverty fattigdom debt budget
generosity generositet giving givande generously stewardship forvaltarskap contentment fornojsamhet purpose mening
identity identitet community gemenskap service tjanst mission mission evangelism evangelisation
discipleship larjungaskap doubt tvivel shame skam guilt skuld depression addiction beroende
pornography pornografi abortion abort suicide sjalvmord mental psykisk grief sorg mourning sorjande
comfort trost loneliness ensamhet fear radsla anger ilska temptation frestelse patience talamod
kindness vanlighet humility odmjukhet pride stolthet jealousy avundsjuka self control sjalvkontroll
courage mod trust tillit obedience lydnad truth sanning suffering lidande healing helande
sickness sjukdom death dod dying doende bereavement anxiety angest stress burnout utbrandhet
rest vila sabbath sabbat loss forlust purpose mening identity identitet worth varde dignity
mankind manniska humanity manniskor compassion medkansla generosity generositet hospitality
gastvanlighet reconciliation forsoning forgiveness forlatelse sin synd guilt skuld
faithfulness trohet gentleness mildhet selfcontrol sjalvkontroll
hopploshet sinnesro manniskovarde osjalvisk
humble humility patient kind generous content contentment happy happiness stress
saved salvation tongues prophecy prophesy spiritual warfare devil discernment discern
testimony evangelize praise thanksgiving grateful gratitude believe belief heal sick
tongue steward blessing bless apology apologize conflict reconcile reconciliation
alcohol drinking drugs porn lust
biblically bibliskt
balaam bileam baal balaams prophets elisha elisa elijah elia moses mosa abraham isaac jacob
david solomon samson samuel saul paul peter john matthew mark luke mary joseph noah jonah job
daniel esther ruth deborah gideon goliath pharaoh cain abel enoch melchizedek nebuchadnezzar
cyrus jeremiah isaiah ezekiel hosea joel amos obadiah micah nahum habakkuk zephaniah haggai
zechariah malachi tabernacle ark temple jerusalem israel judah egypt babylon sinai exodus
genesis revelation angels prophets disciples apostles nephilim
`.trim().split(/\s+/).map(fold));

const positivePhrases = [
  "word of god", "holy spirit", "jesus christ", "lord jesus", "bible study",
  "small group", "quiet time", "business ethics", "mental health", "social justice",
  "racial reconciliation", "creation care", "work life balance", "fruit of the spirit",
  "lords prayer", "ten commandments", "prodigal son", "good samaritan", "lost sheep",
  "second coming", "end times", "spiritual warfare", "born again", "gods will", "god's will",
  "den helige ande", "guds vilja", "den forlorade sonen", "den barmhartige samariern",
  "det forlorade faret", "andens frukt", "herrens bon", "tio budorden",
  "kristen tro", "biblisk", "bibliska", "bibelstudium", "gudstjanst",
].map(fold);

const negativeDomains = new Set(`
pizza recipe recipes bake baking cake cakes cook cooking rice sourdough coffee
restaurant restaurants sushi steak grill beer cocktail soap knit scarf dessert chocolate
chokladkaka glutenfri kaka baka recept pizzan kaffe restaurang mat
python javascript java code coding programming tutorial website web excel windows
computer laptop phone screenshot password account install software app internet email
wifi router printer telefon installera programmerar anvander
bitcoin crypto cryptocurrency battery warranty quantum stock stocks market invest investing investment
mortgage loan loans bank credit insurance tax salary resume cv career job
business ebay sell house apartment rental estate gold
aktier investerar investering bolan lan bank lonespecifikation jobb cv
foretag salja kopera bostad hyra
weight diet calories muscle workout marathon cold headache insomnia doctor medicine
hospital sunburn smoking procrastinating productive focus memorize swim bike
vikt diet kalorier muskel tranar maraton hudvudvard medicin sjukhus simma cykel
flight hotel passport visa travel vacation booking airport luggage suitcase
flyg flygresa hotell pass visum resa semester bokning vaska
world cup football soccer basketball nba nfl tennis golf olympics game match score team
varldscupen fotboll basket tennis golf match lag
movie movies netflix tv series guitar piano concert celebrity
film filmen serie gitarr piano konsert kandidat
tire tires car engine oil faucet dishwasher ants carpet furniture chair paint wall
renovate kitchen garden tomatoes plant laundry iron shirt closet pack organize fold
sheet stains repair fix
dack bil motor olja kran diskmaskin myror matta mobler stol mala vag
renovera kok tradgard tomater planta tvatt stryka skjorta garderob packaorganisera
vika lakan flackar reparera laga
exam test homework school university college math history science physics chemistry
spanish french language student employee boss interview promotion office
tenta prov larxa skola universitet college matematik historia naturvetenskap fysik kemi
spanska franska sprak student anstalld chef intervju befordran kontor
wedding party birthday decorate decoration
brollop fest fodelsedag dekorera
weather forecast temperature stockholm
vader prognos temperatur
democracy election president politics government tax
val politik regering
`.trim().split(/\s+/).map(fold));

/** Explicitly spiritual language wins over a general-domain phrase. */
const coreAnchors = new Set(`
god gud jesus christ kristus lord herren bible bibeln scripture skriften gospel evangelium
church kyrka christian kristen christians kristna holy helig spirit ande faith tro grace nad
sin synd salvation fralsning worship tillbedjan prayer bon pray forgive forlatelse forgiveness
savior fralsare messiah messias resurrection uppstandelse heaven himmel hell helvete covenant
forbund prophet profet apostle apostel disciple larjunge baptism dop communion nattvard
fasting fasta tithe tionde offering offer
`.trim().split(/\s+/).map(fold));

const corePhrases = [
  "word of god", "holy spirit", "jesus christ", "lord jesus", "bible study",
  "biblically", "den helige ande", "guds ord", "bibeln", "kristen tro",
].map(fold);

const negativePhrases = [
  "get rich", "become rich", "get wealth", "make money", "earn money", "save money",
  "lose weight", "belly fat", "blood pressure", "world cup",
  "real estate", "book a flight", "change a tire", "flat tire", "fix a car",
  "repair a car", "bake a cake", "make a cake", "treat a cold", "train a dog",
  "learn spanish", "write a resume", "pass an exam", "start a business",
  "invest in bitcoin", "buy a house", "sell on ebay", "renew a passport",
  "take a screenshot", "reset a password", "build a website", "change oil",
  "clean a dishwasher", "get rid of ants", "install windows", "use excel",
  "code in javascript", "plan a wedding", "grow tomatoes", "paint a wall",
  "assemble furniture", "remove stains", "do laundry", "iron a shirt",
  "fold a fitted sheet", "organize a closet", "pack a suitcase", "apply for a visa",
  "find a rental", "negotiate a salary", "ask for a raise", "quit smoking",
  "stop procrastinating", "be more productive", "focus better", "memorize faster",
  "speed read", "learn to swim", "ride a bike", "drive a car", "driving test",
  "ga ner i vikt", "maga fett", "hoga blodtryck", "varldscupen", "boka flyg",
  "byta dack", "laga bil", "baka kaka", "gor kaka", "behandla forkylning",
  "trana hund", "lara sig spanska", "skriva cv", "klara tenta", "starta foretag",
  "investera i bitcoin", "kopa hus", "salja pa ebay", "fornya pass",
  "ta skarmdump", "aterstalla losenord", "bygga hemsida", "byta olja",
  "rengora diskmaskin", "bli av med myror", "installera windows", "anvanda excel",
  "programmera javascript", "planera brollop", "odla tomater", "mala vag",
  "montera mobler", "ta bort flackar", "tvattta klader", "stryka skjorta",
  "vika lakan", "organisera garderob", "packa vaska", "ansoka om visum",
  "hitta hyreslagenhet", "forhandla lon", "be om lonforhojning", "sluta roka",
  "sluta skjuta upp", "bli mer produktiv", "fokusera battre", "memorera snabbare",
  "speed reading", "lara sig simma", "cykla", "kora bil", "klorprov",
].map(fold);

const instructionPattern = /\b(how to|how do i|how can i|how should i|what should i do|hur|hur gor jag|hur kan jag|hur ska jag)\b/;
const questionPattern = /\b(what|who|whom|why|where|when|which|does|did|is|are|vad|vem|vilka|vilken|varfor|var|nar|ar|ar det)\b/;

function decoded(entries: QuantizedPrototype[]) {
  return entries.map((entry) => Float32Array.from(entry.q, (value) => value * entry.scale));
}

let positiveVectors: Float32Array[] | undefined;
let negativeVectors: Float32Array[] | undefined;

function vectors() {
  if (!positiveVectors || !negativeVectors) {
    positiveVectors = decoded(prototypes.positive);
    negativeVectors = decoded(prototypes.negative);
  }
  return { positive: positiveVectors, negative: negativeVectors };
}

function topMean(vector: Float32Array, entries: Float32Array[], count: number) {
  const best: number[] = [];
  for (const entry of entries) {
    let dot = 0;
    for (let index = 0; index < vector.length; index += 1) dot += vector[index] * entry[index];
    if (best.length < count) {
      best.push(dot);
      best.sort((a, b) => a - b);
    } else if (dot > best[0]) {
      best[0] = dot;
      best.sort((a, b) => a - b);
    }
  }
  return best.reduce((sum, value) => sum + value, 0) / Math.max(1, best.length);
}

/** Cosine-like score against curated Bible and non-Bible query prototypes. */
export function queryPrototypeScore(vector: Float32Array) {
  const entries = vectors();
  return topMean(vector, entries.positive, 5) - topMean(vector, entries.negative, 5);
}

export type QuerySupport = {
  /** A strong lexical phrase matched inside Scripture. */
  lexical?: boolean;
  /** The question maps directly to a curated topic. */
  exactTopic?: boolean;
};

export type QueryValidity = {
  valid: boolean;
  reason: "empty" | "quoted" | "original-language" | "anchor" | "out-of-domain" | "lexical" | "instruction" | "question" | "short" | "prototype";
  score: number;
};

export function classifyBibleQuery(query: string, vector: Float32Array, support?: QuerySupport): QueryValidity {
  const normalized = query.normalize("NFKC").toLocaleLowerCase("sv").trim();
  if (!normalized) return { valid: false, reason: "empty", score: 0 };
  if (/^["“”'].+["“”']$/.test(normalized)) return { valid: true, reason: "quoted", score: 1 };
  if (/[\u0370-\u03ff\u0590-\u05ff]/.test(normalized)) return { valid: true, reason: "original-language", score: 1 };
  const terms = contentTerms(normalized);
  if (!terms.length) return { valid: false, reason: "empty", score: 0 };
  const folded = fold(normalized);
  const foldedTerms = terms.map(fold);
  // Ranking noise removes domain words such as "bible"; explicit anchors must
  // see the raw query tokens instead.
  const anchorTerms = (normalized.match(/[\p{L}\p{N}]+/gu) ?? []).map(fold);
  const core = anchorTerms.some((term) => coreAnchors.has(term)) || corePhrases.some((phrase) => folded.includes(phrase));
  const positive = anchorTerms.some((term) => positiveAnchors.has(term)) || positivePhrases.some((phrase) => folded.includes(phrase));
  const negative = anchorTerms.some((term) => negativeDomains.has(term)) || negativePhrases.some((phrase) => folded.includes(phrase));
  if (negative && !core) return { valid: false, reason: "out-of-domain", score: -1 };
  if (positive || core) return { valid: true, reason: "anchor", score: 1 };
  if (support?.exactTopic) return { valid: true, reason: "lexical", score: 1 };
  if (support?.lexical) return { valid: true, reason: "lexical", score: 1 };
  // Short keyboard-mash queries without any vowel are not plausible words in
  // either supported language, and can otherwise drift over the lenient
  // short-query prototype threshold.
  if (foldedTerms.length === 1 && foldedTerms[0].length >= 5 && !/[aeiouy\u00e5\u00e4\u00f6]/i.test(foldedTerms[0])) {
    return { valid: false, reason: "short", score: 0 };
  }
  const score = queryPrototypeScore(vector);
  if (instructionPattern.test(folded)) return { valid: score >= 0.05, reason: "instruction", score };
  if (questionPattern.test(folded) || folded.endsWith("?")) return { valid: score >= 0.02, reason: "question", score };
  if (terms.length <= 3) return { valid: score >= 0.03, reason: "short", score };
  return { valid: score >= 0.02, reason: "prototype", score };
}

export function validateBibleQuery(query: string, vector: Float32Array, support?: QuerySupport) {
  return classifyBibleQuery(query, vector, support).valid;
}
