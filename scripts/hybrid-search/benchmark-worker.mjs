#!/usr/bin/env node
/** Optional local CPU calibration. Stop other host inference workers before running. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as runtime from "onnxruntime-node";
import {createTextEncoder} from "../../features/bible-search/embedding-core.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const assets=path.join(root,"assets/bible/search");
const docs=JSON.parse(fs.readFileSync(path.join(assets,".cache/tokenized-documents.json"),"utf8"));
const tokenizerJson=JSON.parse(fs.readFileSync(path.join(assets,"multilingual-e5-small.tokenizer"),"utf8"));
const tokenizerConfig=JSON.parse(fs.readFileSync(path.join(assets,"multilingual-e5-small-config.tokenizer"),"utf8"));
const selected=[128,256].map((length)=>docs.reduce((best,document)=>Math.abs(document.tokens-length)<Math.abs(best.tokens-length)?document:best,docs[0]));
const lookup=new Map(selected.map((document)=>[`passage: ${document.embeddingText.trim()}`,document.token_ids]));
class CachedTokenizer{encode(text){return {ids:lookup.get(text)};}}
const results=[];
for(const threads of [4,8]){
  const encoder=await createTextEncoder({runtime,modelPath:path.join(assets,"multilingual-e5-small-int8.onnx"),tokenizerJson,tokenizerConfig,TokenizerClass:CachedTokenizer,sessionOptions:{intraOpNumThreads:threads,graphOptimizationLevel:"all"}});
  const cases=[];
  for(const document of selected){const batch=Array(Math.min(32,Math.floor(3072/document.tokens))).fill(document.embeddingText);await encoder.embedBatch(batch,"passage");const start=performance.now();for(let i=0;i<2;i++)await encoder.embedBatch(batch,"passage");const milliseconds=(performance.now()-start)/2;cases.push({tokens:document.tokens,batch:batch.length,milliseconds,tokensPerSecond:document.tokens*batch.length/(milliseconds/1000)});}
  await encoder.dispose();
  results.push({threads,cases});console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync(path.join(assets,".cache/worker-benchmark.json"),JSON.stringify(results,null,2));
