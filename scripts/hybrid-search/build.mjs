#!/usr/bin/env node
/** Reproducible, resumable corpus embedding and immutable sqlite-vec asset build. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Tokenizer } from "@huggingface/tokenizers";
import * as runtime from "onnxruntime-node";
import { createTextEncoder, E5_MODEL_REVISION, E5_DIMENSIONS } from "../../features/bible-search/embedding-core.mjs";
import { normalizeSwedishForSearch } from "./lexical.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ASSETS = path.join(ROOT,"assets/bible/search");
const CACHE = path.join(ASSETS,".cache");
const outputPath = path.join(ASSETS,"koino-search-v1.db");
const temporaryPath = `${outputPath}.tmp`;
const extension = process.env.SQLITE_VEC_EXTENSION ?? path.join(ROOT,"scripts/hybrid-search/.deps/sqlite_vec",process.platform==="win32"?"vec0.dll":process.platform==="darwin"?"vec0.dylib":"vec0.so");
const readJson = (name) => JSON.parse(readFileSync(path.join(CACHE,name),"utf8"));
const hash = (value, algorithm="sha256") => createHash(algorithm).update(value).digest("hex");
const fileHash = (file,algorithm="sha256") => hash(readFileSync(file),algorithm);
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);

mkdirSync(CACHE,{recursive:true});
if (!existsSync(extension)) throw new Error("sqlite-vec extension missing. Run python -m pip install --target scripts/hybrid-search/.deps sqlite-vec==0.1.7a2, or set SQLITE_VEC_EXTENSION.");
const sources = JSON.parse(readFileSync(path.join(ROOT,"scripts/hybrid-search/sources.lock.json"),"utf8"));
for (const source of sources.sources) {
  if (!source.sha256 || fileHash(path.join(ROOT,source.path))!==source.sha256) throw new Error(`Unverified build source ${source.path}`);
}
const modelPath = path.join(ASSETS,"multilingual-e5-small-int8.onnx");
const tokenizerPath = path.join(ASSETS,"multilingual-e5-small.tokenizer");
const tokenizerConfigPath = path.join(ASSETS,"multilingual-e5-small-config.tokenizer");
const encoderSourceHash = fileHash(path.join(ROOT,"features/bible-search/embedding-core.mjs"));
const embeddingRevision = hash(`${E5_MODEL_REVISION}:${fileHash(modelPath)}:${fileHash(tokenizerPath)}:${fileHash(tokenizerConfigPath)}:${encoderSourceHash}:rust-tokenizers-0.22.2`);
const prepared = readJson("prepared-meta.json");
if (prepared.readerSha256 !== fileHash(path.join(ROOT,"assets/bible/koino-bible-v2.db"))) throw new Error("Reader asset changed after preparation; rerun prepare.py");
const tokenizerJson=JSON.parse(readFileSync(tokenizerPath,"utf8"));
const tokenizerConfig=JSON.parse(readFileSync(tokenizerConfigPath,"utf8"));
const documents=readJson("tokenized-documents.json");
const topics=readJson("tokenized-topics.json");
const tokenLookup=new Map([...documents,...topics].map((item)=>[`passage: ${item.embeddingText.trim()}`,item.token_ids]));
for(const [text,ids]of Object.entries(readJson("query-tokens.json")))tokenLookup.set(text,ids);
log("Verifying Rust/JavaScript tokenizer parity on 64 corpus documents, bilingual normalization and long-passage fixtures");
const javascriptTokenizer=new Tokenizer(tokenizerJson,tokenizerConfig);
for(const fixture of readJson("tokenizer-parity.json")) {
  const ids=javascriptTokenizer.encode(fixture.text,{add_special_tokens:false}).ids;
  if(ids.length!==fixture.ids.length||ids.some((id,index)=>id!==fixture.ids[index]))throw new Error(`Build/app tokenizer mismatch for ${fixture.text.slice(0,90)}`);
}
class PrecomputedTokenizer {
  encode(text,options){const ids=tokenLookup.get(text);if(!ids)throw new Error(`Missing verified corpus token IDs: ${text.slice(0,90)}`);return {ids};}
}
const openEncoder=(threads)=>createTextEncoder({runtime,modelPath,tokenizerJson,tokenizerConfig,TokenizerClass:PrecomputedTokenizer,sessionOptions:{intraOpNumThreads:threads,graphOptimizationLevel:"all"}});
let encoder = await openEncoder(4);
let encoderThreads=4;
const cache = new DatabaseSync(path.join(CACHE,"embeddings.sqlite"));
cache.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS embeddings(key TEXT PRIMARY KEY, vector BLOB NOT NULL, tokens INTEGER NOT NULL)");
const cacheGet = cache.prepare("SELECT vector FROM embeddings WHERE key=?");
const cacheInsert = cache.prepare("INSERT OR REPLACE INTO embeddings(key,vector,tokens) VALUES(?,?,?)");
function embeddingText(document) {
  const context=document.book?`${document.book} ${document.chapter} | ${document.title}`:document.title;
  return [context,document.text,document.keywords].filter(Boolean).join("\n");
}
for(const document of documents) {
  if(document.embeddingText!==embeddingText(document))throw new Error("Prepared embedding context differs from the runtime/build contract; rerun tokenize.py");
  if(document.tokens>512||document.tokens!==document.token_ids.length+2)throw new Error("Prepared document exceeds512token budget");
  document.embeddingKey=hash(`${embeddingRevision}:${document.embeddingText}:${document.token_ids.join(",")}`);
}
for(const topic of topics)topic.embeddingKey=hash(`${embeddingRevision}:${topic.embeddingText}:${topic.token_ids.join(",")}`);
const work = [...documents,...topics];
const byKey=new Map();
for(const item of work)if(!byKey.has(item.embeddingKey)&&!cacheGet.get(item.embeddingKey))byKey.set(item.embeddingKey,item);
const pending=[...byKey.values()].sort((a,b)=>a.tokens-b.tokens||a.embeddingKey.localeCompare(b.embeddingKey));
const totalUnique=new Set(work.map((item)=>item.embeddingKey)).size;
const cachedUnique=totalUnique-pending.length;
log(`Corpus: ${documents.length} documents, ${topics.length} topics. ${pending.length}/${totalUnique} unique embeddings remaining; ${cachedUnique} cached.`);
if(process.argv.includes("--finalize-only")&&pending.length)throw new Error(`Cannot finalize: ${pending.length} corpus embeddings are missing from the verified cache`);
writeFileSync(path.join(CACHE,"build-progress.json"),JSON.stringify({embeddingRevision,documents:documents.length,topics:topics.length,totalUnique,cachedUnique,pending:pending.length,completed:0}));
let completed=0;
const start=Date.now();
while(completed<pending.length) {
  const tokenLength=pending[completed].tokens;
  if(tokenLength>=192&&encoderThreads===4){await encoder.dispose();encoder=await openEncoder(8);encoderThreads=8;log("Using8CPUthreads for the calibrated long-passage batches");}
  const batchSize=Math.min(32,Math.max(4,Math.floor(3072/tokenLength)));
  const batch=pending.slice(completed,completed+batchSize);
  const vectors=await encoder.embedBatch(batch.map((item)=>item.embeddingText),"passage");
  cache.exec("BEGIN");
  try {
    vectors.forEach((vector,index)=>cacheInsert.run(batch[index].embeddingKey,Buffer.from(vector.buffer,vector.byteOffset,vector.byteLength),batch[index].tokens));
    cache.exec("COMMIT");
  }catch(error){cache.exec("ROLLBACK");throw error;}
  completed+=batch.length;
  if(completed%512<batch.length||completed===pending.length) {
    const elapsed=(Date.now()-start)/1000;
    log(`Embedded ${completed}/${pending.length} (${(completed/elapsed).toFixed(1)}/s), batch token length ${tokenLength}`);
    writeFileSync(path.join(CACHE,"build-progress.json"),JSON.stringify({embeddingRevision,documents:documents.length,topics:topics.length,totalUnique,cachedUnique,pending:pending.length,completed,elapsedSeconds:elapsed,lastTokenLength:tokenLength,threads:encoderThreads}));
  }
}

const database=new DatabaseSync(temporaryPath,{allowExtension:true});
database.loadExtension(extension);
if(database.prepare("SELECT vec_version() AS version").get().version!=="v0.1.7-alpha.2")throw new Error("Search builder must use sqlite-vec0.1.7a2 to match Expo's native extension");
database.exec(`PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;PRAGMA temp_store=MEMORY;PRAGMA page_size=4096;
  DROP TABLE IF EXISTS meta;DROP TABLE IF EXISTS documents;DROP TABLE IF EXISTS documents_en;DROP TABLE IF EXISTS documents_sv;
  DROP TABLE IF EXISTS document_verses;DROP TABLE IF EXISTS topics;DROP TABLE IF EXISTS topic_documents;DROP TABLE IF EXISTS search_cross_references;DROP TABLE IF EXISTS document_authority;DROP TABLE IF EXISTS verse_correspondence;
  DROP TABLE IF EXISTS vec_documents;DROP TABLE IF EXISTS vec_topics;DROP TABLE IF EXISTS gate_float;DROP TABLE IF EXISTS gate_int8;
  CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE documents(id INTEGER PRIMARY KEY,translation_id INTEGER NOT NULL,book TEXT NOT NULL,chapter INTEGER NOT NULL,start_verse INTEGER NOT NULL,end_verse INTEGER NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,keywords TEXT NOT NULL,canonical_order INTEGER NOT NULL);
  CREATE INDEX documents_position ON documents(translation_id,book,chapter,start_verse,kind);
  CREATE TABLE document_verses(document_id INTEGER NOT NULL,verse_document_id INTEGER NOT NULL,PRIMARY KEY(document_id,verse_document_id)) WITHOUT ROWID;
  CREATE VIRTUAL TABLE documents_en USING fts5(title,text,keywords,content='',tokenize='porter unicode61 remove_diacritics 2');
  CREATE VIRTUAL TABLE documents_sv USING fts5(title,text,keywords,content='',tokenize='unicode61 remove_diacritics 0');
  CREATE TABLE topics(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
  CREATE TABLE topic_documents(topic_id INTEGER NOT NULL,document_id INTEGER NOT NULL,weight REAL NOT NULL,PRIMARY KEY(topic_id,document_id)) WITHOUT ROWID;
  CREATE INDEX topic_documents_document ON topic_documents(document_id);
  CREATE TABLE search_cross_references(source_document_id INTEGER NOT NULL,target_document_id INTEGER NOT NULL,weight REAL NOT NULL,PRIMARY KEY(source_document_id,target_document_id)) WITHOUT ROWID;
  CREATE TABLE document_authority(document_id INTEGER PRIMARY KEY,weight REAL NOT NULL);
  CREATE TABLE verse_correspondence(source_verse_id INTEGER NOT NULL,target_verse_id INTEGER NOT NULL,PRIMARY KEY(source_verse_id,target_verse_id)) WITHOUT ROWID;
  CREATE INDEX verse_correspondence_target ON verse_correspondence(target_verse_id,source_verse_id);
  PRAGMA user_version=1;`);
const insertDocument=database.prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)");
const insertEn=database.prepare("INSERT INTO documents_en(rowid,title,text,keywords)VALUES(?,?,?,?)");
const insertSv=database.prepare("INSERT INTO documents_sv(rowid,title,text,keywords)VALUES(?,?,?,?)");
const insertMember=database.prepare("INSERT INTO document_verses VALUES(?,?)");
database.exec("BEGIN");
for(const item of documents) {
  insertDocument.run(item.id,item.translation_id,item.book,item.chapter,item.start_verse,item.end_verse,item.kind,item.title,item.text,item.keywords,Math.floor(item.canonical_order/1000)*1000+item.start_verse);
  if(item.translation_id===1)insertEn.run(item.id,item.title,item.text,item.keywords);
  else insertSv.run(item.id,normalizeSwedishForSearch(item.title),normalizeSwedishForSearch(item.text),normalizeSwedishForSearch(item.keywords));
  for(const member of item.members)insertMember.run(item.id,member.id);
}
const insertTopic=database.prepare("INSERT INTO topics VALUES(?,?)");
for(const item of topics)insertTopic.run(item.id,item.name);
const insertLink=database.prepare("INSERT INTO topic_documents VALUES(?,?,?)");
for(const row of readJson("topic-links.json"))insertLink.run(...row);
const insertEdge=database.prepare("INSERT INTO search_cross_references VALUES(?,?,?)");
for(const row of readJson("crossrefs.json"))insertEdge.run(...row);
database.exec("INSERT INTO document_authority SELECT target_document_id,SUM(weight) FROM search_cross_references GROUP BY target_document_id");
database.exec("COMMIT");
log("Created relational search index, checking vector quantization recall");

// Use scratch tables to compare quantization against the exact same model's float corpus.
database.exec("CREATE VIRTUAL TABLE gate_float USING vec0(id INTEGER PRIMARY KEY,embedding float[384] distance_metric=cosine,translation_id INTEGER partition key);CREATE VIRTUAL TABLE gate_int8 USING vec0(id INTEGER PRIMARY KEY,embedding int8[384] distance_metric=cosine,translation_id INTEGER partition key)");
const insertFloat=database.prepare("INSERT INTO gate_float VALUES(?,?,?)");
const insertInt8=database.prepare("INSERT INTO gate_int8 VALUES(?,vec_quantize_int8(?,'unit'),?)");
database.exec("BEGIN");
for(const document of documents) {
  const vector=cacheGet.get(document.embeddingKey).vector;
  insertFloat.run(BigInt(document.id),vector,BigInt(document.translation_id));
  insertInt8.run(BigInt(document.id),vector,BigInt(document.translation_id));
}
database.exec("COMMIT");
const recallQueries=JSON.parse(readFileSync(path.join(ROOT,"scripts/hybrid-search/recall-queries.json"),"utf8"));
const recallGold=JSON.parse(readFileSync(path.join(ROOT,"scripts/hybrid-search/recall-gold.json"),"utf8"));
const versification=readJson("versification.json");
const books=[...new Set(documents.filter((document)=>document.kind==="verse"&&document.translation_id===1).map((document)=>document.book))];
const verseIds=new Map(documents.filter((document)=>document.kind==="verse").map((document)=>[`${document.translation_id}:${books.indexOf(document.book)+1}:${document.chapter}:${document.start_verse}`,document.id]));
const documentById=new Map(documents.map((document)=>[document.id,document]));
const insertCorrespondence=database.prepare("INSERT OR IGNORE INTO verse_correspondence VALUES(?,?)");
database.exec("BEGIN");
for(const [source,targets]of Object.entries(versification)) {
  const sourceId=verseIds.get(`1:${source}`);
  if(!sourceId)throw new Error(`Unknown KJV correspondence source ${source}`);
  for(const target of targets) {
    const targetId=verseIds.get(`2:${target.join(":")}`);
    if(!targetId)throw new Error(`Unknown Swedish correspondence target ${target}`);
    insertCorrespondence.run(sourceId,targetId);
    insertCorrespondence.run(targetId,sourceId);
  }
}
database.exec("COMMIT");
const correspondenceCount=database.prepare("SELECT COUNT(*)AS count FROM verse_correspondence").get().count;
if(recallGold.length!==recallQueries.length)throw new Error("Recall gold/query fixtures differ in length");
function relevantIds(queryIndex,translation) {
  const result=new Set();
  for(const [book,chapter,first,last]of recallGold[queryIndex])for(let verse=first;verse<=last;verse++) {
    const positions=translation===1?[[book,chapter,verse]]:versification[`${book}:${chapter}:${verse}`]??[];
    for(const position of positions) {
      const id=verseIds.get(`${translation}:${position.join(":")}`);
      if(id)result.add(id);
    }
  }
  if(!result.size)throw new Error(`Gold fixture ${queryIndex} does not resolve in translation ${translation}`);
  return result;
}
function relevantRecall(ids,gold){const members=new Set(ids.flatMap((id)=>documentById.get(id).members.map((member)=>member.id)));return [...gold].filter((id)=>members.has(id)).length/gold.size;}
const queryFloat=database.prepare("SELECT id FROM gate_float WHERE embedding MATCH ? AND translation_id=? AND k=10 ORDER BY distance");
const queryInt8=database.prepare("SELECT id FROM gate_int8 WHERE embedding MATCH vec_quantize_int8(?,'unit') AND translation_id=? AND k=10 ORDER BY distance");
const recallResults=[];
for(const [queryIndex,pair]of recallQueries.entries()) {
  const embeddings=await encoder.embedBatch(pair,"query");
  for(let language=0;language<pair.length;language++) {
    const vector=Buffer.from(embeddings[language].buffer,embeddings[language].byteOffset,embeddings[language].byteLength);
    for(const translation of [1,2]) {
      const full=queryFloat.all(vector,BigInt(translation)).map((row)=>row.id);
      const quantized=queryInt8.all(vector,BigInt(translation)).map((row)=>row.id);
      const gold=relevantIds(queryIndex,translation);
      const floatRecall=relevantRecall(full,gold);
      const int8Recall=relevantRecall(quantized,gold);
      recallResults.push({query:pair[language],language:language===0?"en":"sv",translation,floatRecallAt10:floatRecall,int8RecallAt10:int8Recall,floatHitAt10:Number(floatRecall>0),int8HitAt10:Number(int8Recall>0)});
    }
  }
}
const languages=Object.fromEntries(["en","sv"].map((language)=>{const rows=recallResults.filter((row)=>row.language===language);const average=(field)=>rows.reduce((sum,row)=>sum+row[field],0)/rows.length;return [language,{floatRecallAt10:average("floatRecallAt10"),int8RecallAt10:average("int8RecallAt10"),floatHitRateAt10:average("floatHitAt10"),int8HitRateAt10:average("int8HitAt10")}];}));
const vectorType=Object.values(languages).every((scores)=>scores.floatRecallAt10-scores.int8RecallAt10<=0.02&&scores.floatHitRateAt10-scores.int8HitRateAt10<=0.02)?"int8":"float32";
const recallReport={maximumAllowedLoss:0.02,metric:"Mean judged relevant verse coverage in the first 10 documents, plus query hit rate. Assessed independently by query language across both selected translations.",languages,queryCount:recallResults.length,selectedVectorType:vectorType,results:recallResults};
writeFileSync(path.join(ASSETS,"quantization-recall.json"),`${JSON.stringify(recallReport,null,2)}\n`);
log(`Unit int8 judged recall ${JSON.stringify(languages)}; storing ${vectorType}`);
database.exec(`CREATE VIRTUAL TABLE vec_documents USING vec0(id INTEGER PRIMARY KEY,embedding ${vectorType==="int8"?"int8":"float"}[384] distance_metric=cosine,translation_id INTEGER partition key);CREATE VIRTUAL TABLE vec_topics USING vec0(id INTEGER PRIMARY KEY,embedding ${vectorType==="int8"?"int8":"float"}[384] distance_metric=cosine)`);
const insertVector=database.prepare(vectorType==="int8"?"INSERT INTO vec_documents VALUES(?,vec_quantize_int8(?,'unit'),?)":"INSERT INTO vec_documents VALUES(?,?,?)");
const insertTopicVector=database.prepare(vectorType==="int8"?"INSERT INTO vec_topics VALUES(?,vec_quantize_int8(?,'unit'))":"INSERT INTO vec_topics VALUES(?,?)");
database.exec("BEGIN");
for(const document of documents)insertVector.run(BigInt(document.id),cacheGet.get(document.embeddingKey).vector,BigInt(document.translation_id));
for(const topic of topics)insertTopicVector.run(BigInt(topic.id),cacheGet.get(topic.embeddingKey).vector);
database.exec("COMMIT;DROP TABLE gate_float;DROP TABLE gate_int8;");
const pipelineSources=["prepare.py","tokenize.py","versification.py","lexical.mjs","build.mjs","recall-queries.json","recall-gold.json"].map((file)=>[file,fileHash(path.join(ROOT,"scripts/hybrid-search",file))]);
const metadata={schema_version:"1",model_revision:E5_MODEL_REVISION,dimensions:String(E5_DIMENSIONS),max_tokens:"512",maximum_document_tokens:String(documents.reduce((maximum,document)=>Math.max(maximum,document.tokens),0)),vector_type:vectorType,semantic_min_similarity:"0.72",embedding_revision:embeddingRevision,reader_sha256:prepared.readerSha256,mapping_revision:prepared.mappingRevision,document_count:String(documents.length),topic_count:String(topics.length),correspondence_count:String(correspondenceCount),build_fingerprint:hash(JSON.stringify({sources,prepared,embeddingRevision,pipelineSources,labelsHash:fileHash(path.join(ASSETS,"narrative-labels.json"))}))};
const insertMeta=database.prepare("INSERT INTO meta VALUES(?,?)");
for(const [key,value]of Object.entries(metadata))insertMeta.run(key,value);
database.exec("INSERT INTO documents_en(documents_en)VALUES('optimize');INSERT INTO documents_sv(documents_sv)VALUES('optimize');ANALYZE;VACUUM;");
if(database.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")throw new Error("Generated database integrity check failed");
database.close();
cache.close();
await encoder.dispose();
renameSync(temporaryPath,outputPath);
function descriptor(file){const absolute=path.join(ASSETS,file);return {file,bytes:statSync(absolute).size,sha256:fileHash(absolute),md5:fileHash(absolute,"md5")};}
const manifest={schemaVersion:1,databaseSha256:fileHash(outputPath),modelRevision:E5_MODEL_REVISION,dimensions:E5_DIMENSIONS,vectorType,semanticMinSimilarity:0.72,model:{revision:E5_MODEL_REVISION,dimensions:E5_DIMENSIONS,maxTokens:512},assets:{model:descriptor(path.basename(modelPath)),tokenizer:descriptor(path.basename(tokenizerPath)),tokenizerConfig:descriptor(path.basename(tokenizerConfigPath)),database:descriptor(path.basename(outputPath))},counts:{documents:documents.length,topics:topics.length,verses:prepared.verseCount,correspondences:correspondenceCount},buildFingerprint:metadata.build_fingerprint,readerSha256:prepared.readerSha256,mappingRevision:prepared.mappingRevision};
writeFileSync(path.join(ASSETS,"search-manifest.json"),`${JSON.stringify(manifest,null,2)}\n`);
log(`Built ${outputPath} (${manifest.assets.database.bytes.toLocaleString()} bytes)`);
