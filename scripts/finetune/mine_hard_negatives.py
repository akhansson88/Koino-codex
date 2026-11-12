#!/usr/bin/env python3
"""Mine hard negatives from the shipped and rejected candidate encoders.

Both models are run against the actual translation-1 corpus vectors stored in
the build cache. The resulting negatives include the candidate's passage/window
favorites, which the old-model-only proxy missed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
CACHE_DIR = ASSETS / ".cache"
OUT = ROOT / "scripts/hybrid-search/.cache/finetune"
V4 = OUT / "v4"
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
PAD, CLS, SEP = 1, 0, 2


def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def load_books():
    connection = sqlite3.connect(ROOT / "assets/bible/koino-bible-v2.db")
    try:
        return {row[0]: row[1] for row in connection.execute("SELECT id,name FROM books")}
    finally:
        connection.close()


def load_gold(book_names):
    gold = json.loads((ROOT / "scripts/hybrid-search/recall-gold.json").read_text(encoding="utf-8"))
    intervals = set()
    for item in gold:
        for book_id, chapter, first, last in item:
            intervals.add((book_names[book_id], chapter, first, last))
    return intervals


def overlaps(gold, book, chapter, first, last):
    return any(gb == book and gc == chapter and gf <= last and gl >= first for gb, gc, gf, gl in gold)


def encode_queries(session, texts):
    rows = []
    for text in texts:
        ids = TOKENIZER.encode("query: " + text, add_special_tokens=False).ids[:94]
        rows.append([CLS, *ids, SEP])
    order = sorted(range(len(rows)), key=lambda index: len(rows[index]))
    vectors = np.zeros((len(rows), 384), dtype=np.float32)
    for start in range(0, len(order), 64):
        indexes = order[start:start + 64]
        width = max(len(rows[index]) for index in indexes)
        ids = np.full((len(indexes), width), PAD, dtype=np.int64)
        mask = np.zeros((len(indexes), width), dtype=np.int64)
        for row, index in enumerate(indexes):
            sequence = rows[index]
            ids[row, :len(sequence)] = sequence
            mask[row, :len(sequence)] = 1
        hidden = session.run(["last_hidden_state"], {
            "input_ids": ids,
            "attention_mask": mask,
            "token_type_ids": np.zeros_like(ids),
        })[0]
        weights = mask[..., None].astype(np.float32)
        pooled = (hidden * weights).sum(axis=1) / np.clip(weights.sum(axis=1), 1, None)
        pooled /= np.linalg.norm(pooled, axis=1, keepdims=True)
        for local, index in enumerate(indexes):
            vectors[index] = pooled[local]
        if start % 640 == 0:
            print(f"Embedded queries {start}/{len(rows)}", flush=True)
    return vectors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--old-model", type=Path, default=ASSETS / "multilingual-e5-small-int8.onnx")
    parser.add_argument("--candidate-model", type=Path, default=Path(r"C:\Users\alexh\AppData\Local\Temp\opencode\koino-finetune-candidate-v3\model-finetuned-v3.onnx"))
    parser.add_argument("--old-revision", default="bb71624ca302e06ee7b4cdb6ae2672df87d32102629b792d40cc83e8e30e0d24")
    parser.add_argument("--candidate-revision", default="12660b51348c65cce880f5988f191c1bb7cc5547a25577e8ab07f0f2e39b8bac")
    parser.add_argument("--train", type=Path, default=V4 / "train.jsonl")
    parser.add_argument("--output", type=Path, default=V4 / "train-mined.jsonl")
    parser.add_argument("--proxy-output", type=Path, default=OUT / "proxy-hard-ids.json")
    parser.add_argument("--candidates", type=int, default=100)
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.train.read_text(encoding="utf-8").splitlines()]
    queries = sorted({row["query"] for row in rows})
    docs = json.loads((CACHE_DIR / "tokenized-documents.json").read_text(encoding="utf-8"))
    docs = [doc for doc in docs if doc["translation_id"] == 1 and doc["kind"] in ("verse", "passage", "window")]
    by_id = {doc["id"]: doc for doc in docs}
    by_text = {doc["embeddingText"]: doc for doc in docs}
    print(json.dumps({"trainRows": len(rows), "queries": len(queries), "documents": len(docs)}), flush=True)

    # Fetch only the two revisions' vectors from the content-addressed cache.
    wanted = {}
    for doc in docs:
        for revision in (args.old_revision, args.candidate_revision):
            key = sha(f"{revision}:{doc['embeddingText']}:{','.join(map(str, doc['token_ids']))}")
            wanted[key] = (doc["id"], revision)
    cache = sqlite3.connect(CACHE_DIR / "embeddings.sqlite")
    vectors = {}
    try:
        for key, blob in cache.execute("SELECT key,vector FROM embeddings"):
            if key in wanted:
                vectors[key] = np.frombuffer(blob, dtype=np.float32).copy()
    finally:
        cache.close()
    print(json.dumps({"wantedVectors": len(wanted), "foundVectors": len(vectors)}), flush=True)

    doc_ids = []
    old_rows, candidate_rows = [], []
    for doc in docs:
        old_key = sha(f"{args.old_revision}:{doc['embeddingText']}:{','.join(map(str, doc['token_ids']))}")
        candidate_key = sha(f"{args.candidate_revision}:{doc['embeddingText']}:{','.join(map(str, doc['token_ids']))}")
        if old_key in vectors and candidate_key in vectors:
            doc_ids.append(doc["id"])
            old_rows.append(vectors[old_key])
            candidate_rows.append(vectors[candidate_key])
    old_matrix = np.asarray(old_rows, dtype=np.float32)
    candidate_matrix = np.asarray(candidate_rows, dtype=np.float32)
    print(json.dumps({"usableDocuments": len(doc_ids), "oldMatrix": list(old_matrix.shape), "candidateMatrix": list(candidate_matrix.shape)}), flush=True)

    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    old_session = ort.InferenceSession(str(args.old_model), sess_options=options, providers=["CPUExecutionProvider"])
    candidate_session = ort.InferenceSession(str(args.candidate_model), sess_options=options, providers=["CPUExecutionProvider"])
    old_queries = encode_queries(old_session, queries)
    candidate_queries = encode_queries(candidate_session, queries)
    print("Query embeddings complete", flush=True)

    def top_ids(matrix, query_vector):
        scores = matrix @ query_vector
        indexes = np.argpartition(-scores, min(args.candidates, len(scores) - 1))[: args.candidates]
        return [doc_ids[index] for index in indexes[np.argsort(-scores[indexes])]]

    candidates = {}
    for index, query in enumerate(queries):
        candidates[query] = {
            "old": top_ids(old_matrix, old_queries[index]),
            "candidate": top_ids(candidate_matrix, candidate_queries[index]),
        }
    print(json.dumps({"candidateQueries": len(candidates)}), flush=True)

    book_names = load_books()
    gold = load_gold(book_names)
    output_rows = []
    added_old = added_candidate = 0
    for row in rows:
        positive = by_text.get(row["positive"])
        ranges = [tuple(value) for value in row.get("reference_ranges", [])]
        if not ranges and positive:
            ranges = [(positive["book"], positive["chapter"], positive["start_verse"], positive["end_verse"])]
        old_negatives, candidate_negatives, seen = [], [], set()
        for source, target in (("old", old_negatives), ("candidate", candidate_negatives)):
            for doc_id in candidates[row["query"]][source]:
                doc = by_id[doc_id]
                if doc["embeddingText"] == row["positive"]:
                    continue
                if positive and doc["book"] == positive["book"] and doc["chapter"] == positive["chapter"] and doc["title"] == positive["title"]:
                    continue
                if any(book == doc["book"] and chapter == doc["chapter"] and first <= doc["end_verse"] and last >= doc["start_verse"]
                       for book, chapter, first, last in ranges):
                    continue
                if overlaps(gold, doc["book"], doc["chapter"], doc["start_verse"], doc["end_verse"]):
                    continue
                text = doc["embeddingText"]
                if text in seen:
                    continue
                seen.add(text)
                target.append(text)
                if len(target) >= 2:
                    break
        added_old += len(old_negatives)
        added_candidate += len(candidate_negatives)
        negatives = old_negatives + candidate_negatives + row["hard_negatives"]
        unique = []
        for text in negatives:
            if text == row["positive"] or text in unique:
                continue
            unique.append(text)
        row["hard_negatives"] = unique[:4]
        output_rows.append(row)
    with args.output.open("w", encoding="utf-8") as handle:
        for row in output_rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps({"output": str(args.output), "oldNegatives": added_old, "candidateNegatives": added_candidate}), flush=True)

    # Candidate-aware proxy pool for the real eval queries.
    recall = json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    flat = [query for pair in recall for query in pair]
    old_eval = encode_queries(old_session, flat)
    candidate_eval = encode_queries(candidate_session, flat)
    proxy_ids = set()
    for index in range(len(flat)):
        proxy_ids.update(top_ids(old_matrix, old_eval[index])[:100])
        proxy_ids.update(top_ids(candidate_matrix, candidate_eval[index])[:100])
    args.proxy_output.write_text(json.dumps({"ids": sorted(proxy_ids)}), encoding="utf-8")
    print(json.dumps({"proxyDocuments": len(proxy_ids), "proxyOutput": str(args.proxy_output)}), flush=True)


if __name__ == "__main__":
    main()
