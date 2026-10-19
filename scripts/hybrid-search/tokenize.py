#!/usr/bin/env python3
"""Build-only fast Rust tokenization, checked against the app's JS tokenizer."""
from __future__ import annotations
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import random
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).with_name(".deps")))
from tokenizers import Tokenizer

ASSETS=ROOT / "assets/bible/search"
CACHE=ASSETS / ".cache"
tokenizer=Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
tokenizer.no_truncation()
tokenizer.no_padding()

@lru_cache(maxsize=180000)
def tokens(value):
    return tokenizer.encode(value,add_special_tokens=False).ids

def read(name):
    return json.loads((CACHE / name).read_text(encoding="utf-8"))

labels=read("verse-labels.json")
def decorate(document):
    document["keywords"]="; ".join(dict.fromkeys(labels.get(str(member["id"]),"")for member in document["members"] if labels.get(str(member["id"]))))
    context=f"{document['book']} {document['chapter']} | {document['title']}"
    document["embeddingText"]="\n".join(value for value in [context,document["text"],document["keywords"]]if value)
    document["token_ids"]=tokens("passage: "+document["embeddingText"].strip())
    document["tokens"]=len(document["token_ids"])+2
    return document

def fit(document):
    decorate(document)
    if document["tokens"]<=512:
        return [document]
    if len(document["members"])==1:
        raise ValueError(f"A single verse exceeds512tokens: {document['book']} {document['chapter']}:{document['start_verse']}")
    results=[]
    members=[]
    def subset(members):
        return decorate({**document,"start_verse":members[0]["verse"],"end_verse":members[-1]["verse"],"canonical_order":document["canonical_order"]-document["start_verse"]+members[0]["verse"],"text":" ".join(member["text"]for member in members),"members":members})
    for member in document["members"]:
        candidate=subset([*members,member])
        if members and candidate["tokens"]>512:
            results.append(subset(members))
            members=[]
        members.append(member)
    if members:
        results.append(subset(members))
    if any(document["tokens"] > 512 for document in results):
        raise ValueError("Passage cannot be split safely at verse boundaries")
    return results

def main():
    documents=[]
    source=read("documents.json")
    next_id=read("prepared-meta.json")["verseCount"]+1
    for index,document in enumerate(source):
        for part in fit(document):
            if part["kind"]!="verse":
                part["id"]=next_id
                next_id+=1
            documents.append(part)
        if index%10000==9999:
            print(f"Rust tokenized {index+1}/{len(source)} document candidates",flush=True)
    topics=[]
    for topic in read("topics.json"):
        topics.append({**topic,"title":"","text":topic["name"],"keywords":"","embeddingText":topic["name"],"token_ids":tokens("passage: "+topic["name"].strip())})
        topics[-1]["tokens"]=len(topics[-1]["token_ids"])+2
    pairs=json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    query_tokens={"query: "+text.strip():tokens("query: "+text.strip())for pair in pairs for text in pair}
    randomizer=random.Random(20261018)
    samples=randomizer.sample(documents,64)
    fixtures=[{"text":"passage: "+document["embeddingText"].strip(),"ids":document["token_ids"]}for document in samples]
    extra=["ÅÄÖ åäö; FÅR far. Änglarna, nåden och frälsningen!","A\u0308nglarna och Guds kärlek — Johannesevangeliet 3:16","Jesus' disciples: bread, fish, and a storm.","Nåd är en gåva; den helige Ande talar."]
    for kind in ["query","passage"]:
        for text in extra:
            value=f"{kind}: {text}"
            fixtures.append({"text":value,"ids":tokens(value)})
    for document in sorted(source,key=lambda item:len(item["text"]),reverse=True)[:4]:
        value="passage: "+document["text"].strip()
        fixtures.append({"text":value,"ids":tokens(value)})
    for name,value in [("tokenized-documents.json",documents),("tokenized-topics.json",topics),("query-tokens.json",query_tokens),("tokenizer-parity.json",fixtures)]:
        (CACHE / name).write_text(json.dumps(value,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f"Prepared {len(documents):,} bounded documents + {len(topics):,} topics; {len(fixtures)} exact token parity fixtures",flush=True)

if __name__=="__main__":
    main()
