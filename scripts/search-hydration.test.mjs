import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const built = await build({ bundle:true, format:"esm", platform:"node", write:false, logLevel:"silent",
  stdin:{ contents:'export * from "./features/bible-search.ts"; export {biblePassagesFromRanges,bibleVersesFromRanges,buildBibleVerse,kjvBooks} from "./features/bible-kjv.ts"; export {setBibleDatabaseForTesting} from "./features/bible-database.ts";', resolveDir:process.cwd() },
  plugins:[{ name:"native-boundary", setup(builder) { builder.onResolve({filter:/bible-search\/native-backend$/},()=>({path:"unused-native-search",external:true})); } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const reader = new DatabaseSync("assets/bible/koino-bible-v2.db",{readOnly:true});
after(()=>reader.close());

function connection(onAsync) {
  const calls={sync:0,async:[]};
  api.setBibleDatabaseForTesting({
    getAllSync:(sql,...args)=>{calls.sync++;return reader.prepare(sql).all(...args);},
    getFirstSync:(sql,...args)=>{calls.sync++;return reader.prepare(sql).get(...args);},
    getAllAsync:async(sql,...args)=>{
      calls.async.push({sql,args});
      const rows=reader.prepare(sql).all(...args);
      if(onAsync) await onAsync(calls.async.length);
      return rows;
    },
  });
  return calls;
}
const range = (book,chapter,startVerse,endVerse=startVerse)=>({book,chapter,startVerse,endVerse});
const ranked = (index)=>({document:{id:index+1,translation_id:1,book:api.kjvBooks[index].name,chapter:1,start_verse:2,end_verse:3,kind:"passage",title:"",text:"Index text must never become the displayed Scripture",canonical_order:index},score:1/(index+1),sources:["lexical"]});
const candidates = ()=>Array.from({length:20},(_,index)=>ranked(index));
const deferred = ()=>{let resolve;const promise=new Promise((done)=>{resolve=done;});return{promise,resolve};};
const numberedVerses = (item,versionId) => reader.prepare(`SELECT verses.verse,verses.text FROM verses
  JOIN books ON books.id=verses.book_id JOIN translations ON translations.id=verses.translation_id
  WHERE books.name=? AND verses.chapter=? AND verses.verse BETWEEN ? AND ? AND translations.code=? ORDER BY verses.verse`)
  .all(item.book,item.chapter,Math.min(item.startVerse,item.endVerse),Math.max(item.startVerse,item.endVerse),versionId)
  .map(({verse,text})=>({verse,text}));

test("batched excerpts preserve exact native text, reference fields, and translation-specific invalid ranges",async()=>{
  const ranges=[range("John",3,16,17),range("Psalms",119,1,8),range("Psalms",3,8,9),range("1 Samuel",20,42,43),range("2 Corinthians",13,12,14),range("John",3,999)];
  for(const versionId of ["kjv","reformationsbibeln2026"]){
    connection();
    const expected=ranges.map((item)=>api.buildBibleVerse(item.book,item.chapter,item.startVerse,item.endVerse,versionId));
    const calls=connection();
    assert.deepEqual(await api.bibleVersesFromRanges(ranges,versionId),expected);
    assert.equal(calls.async.length,1,"All excerpts share one bounded async statement");
    assert.equal(calls.sync,0,"Search hydration must not block on chapter metadata");
  }
});

test("numbered passages preserve authoritative verse boundaries in one batched query",async()=>{
  const ranges=[range("Exodus",34,29,31),range("John",3,16),range("Psalms",119,100,103),range("John",3,17,16),range("Psalms",3,8,9),range("John",3,999)];
  for(const versionId of ["kjv","reformationsbibeln2026"]){
    connection();
    const expected=ranges.map((item)=>{
      const verse=api.buildBibleVerse(item.book,item.chapter,item.startVerse,item.endVerse,versionId);
      return verse?{verse,verses:numberedVerses(item,versionId)}:undefined;
    });
    const calls=connection();
    const passages=await api.biblePassagesFromRanges(ranges,versionId);
    assert.deepEqual(passages,expected);
    for(const passage of passages.filter(Boolean)) assert.equal(passage.verses.map(({text})=>text).join(" "),passage.verse.text);
    assert.equal(calls.async.length,1,"Numbered verses come from the same batched read as combined text");
    assert.equal(calls.sync,0);
  }
});

test("partial and reranked final results reuse request-local excerpts with one async reader query",async()=>{
  const calls=connection();
  const lexical=candidates();
  api.setScriptureSearchBackendForTesting({lexical:async()=>lexical,hybrid:async()=>[...lexical].reverse().map((item)=>({...item,sources:["semantic"]}))});
  let partial;
  const response=await api.searchScripture({query:"a thematic query",versionId:"kjv",language:"en",onPartialResults:(value)=>{partial=value;}});
  assert.equal(partial.results.length,20);assert.equal(response.results.length,20);
  assert.equal(calls.sync,0);assert.equal(calls.async.length,1);
  for(const result of response.results){
    const previous=partial.results.find((item)=>item.id===result.id);
    assert.equal(result.verse,previous.verse,"The complete authoritative excerpt is reused across ranking changes");
    assert.equal(result.verses,previous.verses,"Numbered verses share the same request-local cache");
    assert.deepEqual(result.verses,numberedVerses(result.verse,"kjv"));
    assert.deepEqual(result.sources,["semantic"]);
    assert.notEqual(result.verse.text,lexical[0].document.text);
  }
});

test("final hydration fetches only newly introduced ranges and keeps complete excerpts",async()=>{
  const calls=connection();
  const lexical=candidates(),extra=ranked(20);
  api.setScriptureSearchBackendForTesting({lexical:async()=>lexical,hybrid:async()=>[extra,...lexical.slice(0,19)]});
  const response=await api.searchScripture({query:"another thematic query",versionId:"kjv",language:"en"});
  assert.equal(calls.sync,0);assert.equal(calls.async.length,2);
  assert.equal(calls.async[0].args.length,101,"Twenty ranges plus one translation binding");
  assert.equal(calls.async[1].args.length,6,"Only the newly introduced range is loaded");
  const first=response.results[0].verse;
  assert.deepEqual(first,api.buildBibleVerse(first.book,first.chapter,first.startVerse,first.endVerse,"kjv"));
});

test("cancellation during initial async hydration suppresses partial results and inference",async()=>{
  const entered=deferred(),release=deferred();
  const calls=connection(async()=>{entered.resolve();await release.promise;});
  let partial=0,hybrid=0;
  api.setScriptureSearchBackendForTesting({lexical:async()=>candidates(),hybrid:async()=>{hybrid++;return[];}});
  const controller=new AbortController();
  const request=api.searchScripture({query:"old request",versionId:"kjv",language:"en",signal:controller.signal,onPartialResults:()=>{partial++;}});
  await entered.promise;controller.abort();release.resolve();
  await assert.rejects(request,{name:"AbortError"});
  assert.equal(partial,0);assert.equal(hybrid,0);assert.equal(calls.async.length,1);
});

test("cancellation during final async hydration cannot publish a stale completed response",async()=>{
  const entered=deferred(),release=deferred();
  connection(async(count)=>{if(count===2){entered.resolve();await release.promise;}});
  const lexical=candidates();let partial=0;
  api.setScriptureSearchBackendForTesting({lexical:async()=>lexical,hybrid:async()=>[ranked(20),...lexical.slice(0,19)]});
  const controller=new AbortController();
  const request=api.searchScripture({query:"old final request",versionId:"kjv",language:"en",signal:controller.signal,onPartialResults:()=>{partial++;}});
  await entered.promise;controller.abort();release.resolve();
  await assert.rejects(request,{name:"AbortError"});assert.equal(partial,1);
});

test("direct Scripture references retain their existing immediate path",async()=>{
  const calls=connection();
  api.setScriptureSearchBackendForTesting({lexical:async()=>{throw new Error("Reference lookup must bypass search");},hybrid:async()=>{throw new Error("Reference lookup must bypass inference");}});
  const response=await api.searchScripture({query:"Johannes3:16-17",versionId:"reformationsbibeln2026",language:"en"});
  assert.equal(response.results[0].verse.reference,"John 3:16-17");
  assert.equal(response.results[0].matchType,"reference");assert.equal(calls.async.length,0);
  assert.deepEqual(response.results[0].verses,numberedVerses(range("John",3,16,17),"reformationsbibeln2026"));
});

test("single verses and full chapters include every verse number for both translations",async()=>{
  for(const versionId of ["kjv","reformationsbibeln2026"]){
    for(const query of ["John 3:16","Psalms 119"]){
      const calls=connection();
      const {results}=await api.searchScripture({query,versionId,language:"en"});
      const result=results[0];
      assert.deepEqual(result.verses,numberedVerses(result.verse,versionId));
      assert.equal(result.verses.map(({text})=>text).join(" "),result.verse.text);
      assert.equal(result.verses.length,query==="Psalms 119"?176:1);
      assert.equal(calls.async.length,0,"Reference searches retain the immediate lookup path");
    }
  }
});

test("topic results and unavailable-backend fallback retain numbered text",async()=>{
  connection();
  const item=ranked(0);
  api.setScriptureSearchBackendForTesting({lexical:async()=>[],hybrid:async()=>[{...item,sources:["topic"]}]});
  const topic=await api.searchScripture({query:"a topic",versionId:"kjv",language:"en"});
  assert.equal(topic.results[0].matchType,"topic");
  assert.deepEqual(topic.results[0].verses,numberedVerses(topic.results[0].verse,"kjv"));
  api.setScriptureSearchBackendForTesting(undefined);
  for(const versionId of ["kjv","reformationsbibeln2026"]){
    connection();
    const fallback=await api.searchScripture({query:"Jesus",versionId,language:"en"});
    assert.equal(fallback.semanticState,"unavailable");
    assert.ok(fallback.results.length>0);
    for(const result of fallback.results) assert.deepEqual(result.verses,numberedVerses(result.verse,versionId));
  }
});
