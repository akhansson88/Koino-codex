#!/usr/bin/env node
/** Read-only build/query parity and bilingual direct-similarity diagnostic. */
import fs from "node:fs";
import path from "node:path";
import{fileURLToPath}from"node:url";
import{createHash}from"node:crypto";
import{DatabaseSync}from"node:sqlite";
import*as runtime from"onnxruntime-node";
import{createTextEncoder}from"../../features/bible-search/embedding-core.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const assets=path.join(root,"assets/bible/search");
const docs=JSON.parse(fs.readFileSync(path.join(assets,".cache/tokenized-documents.json"),"utf8"));
const db=new DatabaseSync(path.join(assets,"koino-search-v1.db"),{readOnly:true,allowExtension:true});
db.loadExtension(path.join(root,"scripts/hybrid-search/.deps/sqlite_vec/vec0.dll"));
const cache=new DatabaseSync(path.join(assets,".cache/embeddings.sqlite"),{readOnly:true});
const revision=db.prepare("SELECT value FROM meta WHERE key='embedding_revision'").get().value;
const hash=(value)=>createHash("sha256").update(value).digest("hex");
const selected=docs.filter((d)=>d.kind==="verse"&&((d.book==="Numbers"&&d.chapter===22&&d.start_verse===28)||(d.book==="2 Kings"&&d.chapter===6&&d.start_verse===6)));
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return dot/Math.sqrt(aa*bb);};
const readFloat=(value)=>{const view=new DataView(value.buffer,value.byteOffset,value.byteLength);return Float32Array.from({length:value.byteLength/4},(_,i)=>view.getFloat32(i*4,true));};
const encoder=await createTextEncoder({runtime,modelPath:path.join(assets,"multilingual-e5-small-int8.onnx"),tokenizerJson:JSON.parse(fs.readFileSync(path.join(assets,"multilingual-e5-small.tokenizer"),"utf8")),tokenizerConfig:JSON.parse(fs.readFileSync(path.join(assets,"multilingual-e5-small-config.tokenizer"),"utf8")),sessionOptions:{intraOpNumThreads:4}});
const current=await encoder.embedBatch(selected.map((d)=>d.embeddingText),"passage");
const idLookup=new Map(selected.map((document)=>[`passage: ${document.embeddingText.trim()}`,document.token_ids]));
class StoredTokenizer{encode(text){return{ids:idLookup.get(text)};}}
const storedEncoder=await createTextEncoder({runtime,modelPath:path.join(assets,"multilingual-e5-small-int8.onnx"),tokenizerJson:JSON.parse(fs.readFileSync(path.join(assets,"multilingual-e5-small.tokenizer"),"utf8")),tokenizerConfig:JSON.parse(fs.readFileSync(path.join(assets,"multilingual-e5-small-config.tokenizer"),"utf8")),TokenizerClass:StoredTokenizer,sessionOptions:{intraOpNumThreads:4}});
const fromStoredIds=await storedEncoder.embedBatch(selected.map((d)=>d.embeddingText),"passage");await storedEncoder.dispose();
const targets=selected.map((document,index)=>{const key=hash(`${revision}:${document.embeddingText}:${document.token_ids.join(",")}`);const cached=readFloat(cache.prepare("SELECT vector FROM embeddings WHERE key=?").get(key).vector);return {id:document.id,translation:document.translation_id,reference:`${document.book} ${document.chapter}:${document.start_verse}`,embeddingText:document.embeddingText,parityCosine:cosine(cached,current[index]),maximumAbsoluteDifference:Math.max(...cached.map((v,i)=>Math.abs(v-current[index][i]))),storedIdsVsNormalJSCosine:cosine(current[index],fromStoredIds[index]),storedIdsVsNormalJSMaximumDifference:Math.max(...current[index].map((v,i)=>Math.abs(v-fromStoredIds[index][i]))),cached};});
const queries=["The talking donkey","Den talande åsnan","An animal talks to its rider","Ett djur talar med sin ryttare","The axe head floats","Yxhuvudet flyter","A borrowed iron tool is lost in the water","Ett lånat järnredskap försvinner i vattnet"];
const queryVectors=await encoder.embedBatch(queries,"query");
const nearest=db.prepare("SELECT id,1-distance AS similarity FROM vec_documents WHERE embedding MATCH vec_quantize_int8(?,'unit') AND translation_id=CAST(?AS INTEGER) AND k=200 ORDER BY distance");
const results=queries.map((query,index)=>({query,targetCosines:targets.map((target)=>({id:target.id,translation:target.translation,reference:target.reference,cosine:cosine(queryVectors[index],target.cached)})),nearest:[1,2].map((translation)=>{const rows=nearest.all(Buffer.from(queryVectors[index].buffer),BigInt(translation));return{translation,targets:targets.filter((target)=>target.translation===translation).map((target)=>({id:target.id,rank:rows.findIndex((row)=>row.id===target.id)+1})),top:rows.slice(0,5).map((row)=>({...row,...db.prepare("SELECT book,chapter,start_verse,end_verse,kind,title FROM documents WHERE id=?").get(row.id)}))};})}));
const report={targets:targets.map(({cached,...rest})=>rest),queryPairs:[[0,1],[2,3],[4,5],[6,7]].map(([first,second])=>({query:queries[first],versus:queries[second],cosine:cosine(queryVectors[first],queryVectors[second])})),results};
fs.writeFileSync(path.join(assets,".cache/parity-diagnostic.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({targets:report.targets,queryPairs:report.queryPairs,results:report.results.map(({query,targetCosines})=>({query,targetCosines}))},null,2));
await encoder.dispose();cache.close();db.close();
