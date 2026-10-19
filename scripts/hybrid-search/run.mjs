#!/usr/bin/env node
/** One-command build entrypoint. Downloads only verified pinned inputs and resumes vectors. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const python=process.env.PYTHON??(process.platform==="win32"?"python":"python3");
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:"inherit",windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
const deps=path.join(root,"scripts/hybrid-search/.deps/sqlite_vec");
if(!process.env.SQLITE_VEC_EXTENSION&&!existsSync(path.join(root,"scripts/hybrid-search/.deps/sqlite_vec-0.1.7a2.dist-info")))run(python,["-m","pip","install","--upgrade","--target","scripts/hybrid-search/.deps","sqlite-vec==0.1.7a2"]);
if(!existsSync(path.join(root,"scripts/hybrid-search/.deps/tokenizers")))run(python,["-m","pip","install","--no-deps","--target","scripts/hybrid-search/.deps","tokenizers==0.22.2"]);
run(python,["scripts/hybrid-search/fetch-sources.py"]);
const inputs=["scripts/hybrid-search/prepare.py","scripts/hybrid-search/versification.py","scripts/hybrid-search/sources.lock.json","assets/bible/koino-bible-v2.db","assets/bible/search/narrative-labels.json"];
const digest=createHash("sha256");
for(const input of inputs)digest.update(readFileSync(path.join(root,input)));
const fingerprint=digest.digest("hex");
const cache=path.join(root,"assets/bible/search/.cache");
mkdirSync(cache,{recursive:true});
const fingerprintPath=path.join(cache,"preparation.sha256");
if(!existsSync(fingerprintPath)||readFileSync(fingerprintPath,"utf8").trim()!==fingerprint){run(python,["scripts/hybrid-search/prepare.py"]);writeFileSync(fingerprintPath,`${fingerprint}\n`);}
run(python,["scripts/hybrid-search/tokenize.py"]);
run(process.execPath,["scripts/hybrid-search/build.mjs"]);
