#!/usr/bin/env python3
"""Evaluate a candidate encoder on a fixed held-out subset of the real index.

This is a fast pre-gate before the ~90 minute full corpus rebuild. It keeps all
gold documents and a deterministic random sample of other translation-1
documents, then compares the candidate against the currently shipped model on
the exact same pool.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
CACHE = ASSETS / ".cache"
OUT = ROOT / "scripts/hybrid-search/.cache/finetune"
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
PAD, CLS, SEP = 1, 0, 2


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def load_intervals() -> tuple[list[tuple[str, int, int, int]], dict[int, str]]:
    import sqlite3

    reader = sqlite3.connect(ROOT / "assets/bible/koino-bible-v2.db")
    try:
        books = {row[0]: row[1] for row in reader.execute("SELECT id,name FROM books")}
    finally:
        reader.close()
    gold = json.loads((ROOT / "scripts/hybrid-search/recall-gold.json").read_text(encoding="utf-8"))
    intervals = []
    for item in gold:
        for book_id, chapter, first, last in item:
            intervals.append((books[book_id], chapter, first, last))
    return intervals, books


def overlaps(intervals, book: str, chapter: int, first: int, last: int) -> bool:
    return any(g_book == book and g_chapter == chapter and g_first <= last and g_last >= first
               for g_book, g_chapter, g_first, g_last in intervals)


def load_pool(pool_size: int, seed: int = 42):
    documents = json.loads((CACHE / "tokenized-documents.json").read_text(encoding="utf-8"))
    intervals, _ = load_intervals()
    translation = [item for item in documents if item["translation_id"] == 1]
    relevant = [item for item in translation
                if overlaps(intervals, item["book"], item["chapter"], item["start_verse"], item["end_verse"])]
    relevant_ids = {item["id"] for item in relevant}
    hard_ids = set()
    hard_path = OUT / "proxy-hard-ids.json"
    if hard_path.exists():
        hard_ids = set(json.loads(hard_path.read_text(encoding="utf-8"))["ids"])
    hard = [item for item in translation if item["id"] in hard_ids and item["id"] not in relevant_ids]
    selected_ids = relevant_ids | hard_ids
    rest = [item for item in translation if item["id"] not in selected_ids]
    random.Random(seed).shuffle(rest)
    selected = relevant + hard + rest[: max(0, pool_size - len(relevant) - len(hard))]
    selected.sort(key=lambda item: item["id"])
    return selected, intervals


def batched(rows, size):
    for index in range(0, len(rows), size):
        yield rows[index:index + size]


def encode_documents(session, rows):
    order = sorted(range(len(rows)), key=lambda index: (rows[index]["tokens"], rows[index]["id"]))
    vectors = np.zeros((len(rows), 384), dtype=np.float32)
    for offset in range(0, len(order), 24):
        indexes = order[offset:offset + 24]
        sequences = []
        for index in indexes:
            ids = [CLS, *rows[index]["token_ids"][:510], SEP]
            sequences.append(ids)
        width = max(len(sequence) for sequence in sequences)
        ids = np.full((len(sequences), width), PAD, dtype=np.int64)
        mask = np.zeros((len(sequences), width), dtype=np.int64)
        for row, sequence in enumerate(sequences):
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
        if offset % 2400 == 0:
            print(f"Embedded {offset}/{len(order)}", flush=True)
    return vectors


def encode_queries(session, queries):
    results = []
    for start in range(0, len(queries), 16):
        batch = queries[start:start + 16]
        sequences = []
        for query in batch:
            ids = TOKENIZER.encode("query: " + query, add_special_tokens=False).ids[:94]
            sequences.append([CLS, *ids, SEP])
        width = max(len(sequence) for sequence in sequences)
        ids = np.full((len(sequences), width), PAD, dtype=np.int64)
        mask = np.zeros((len(sequences), width), dtype=np.int64)
        for row, sequence in enumerate(sequences):
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
        results.extend(pooled)
    return np.asarray(results, dtype=np.float32)


def evaluate(doc_vectors, query_vectors, rows, query_pairs, intervals):
    relevant = np.array([
        overlaps(intervals, row["book"], row["chapter"], row["start_verse"], row["end_verse"])
        for row in rows
    ])
    output = []
    for language_index, language in enumerate(("en", "sv")):
        for query_index, pair in enumerate(query_pairs):
            query = pair[language_index]
            scores = doc_vectors @ query_vectors[query_index * 2 + language_index]
            order = np.argsort(-scores)
            hits = order[:20]
            flags = relevant[hits]
            first = int(np.where(flags)[0][0]) + 1 if flags.any() else None
            output.append({
                "query": query,
                "language": language,
                "recallAt10": bool(flags[:10].any()),
                "recallAt20": bool(flags.any()),
                "rank": first,
                "topSimilarity": float(scores[hits[0]]),
                "topKind": rows[hits[0]]["kind"],
                "top5Kinds": [rows[index]["kind"] for index in hits[:5]],
                "bestRelevantSimilarity": float(scores[hits[first - 1]]) if first else None,
            })
    summary = {
        "queries": len(output),
        "recallAt10": sum(row["recallAt10"] for row in output) / len(output),
        "recallAt20": sum(row["recallAt20"] for row in output) / len(output),
        "mrr": sum((1 / row["rank"] if row["rank"] else 0) for row in output) / len(output),
        "similarity": {
            "meanTop": float(np.mean([row["topSimilarity"] for row in output])),
            "meanBestRelevant": float(np.mean([row["bestRelevantSimilarity"] for row in output if row["bestRelevantSimilarity"] is not None])),
            "bestRelevantQuantiles": {
                str(q): float(np.quantile(
                    [row["bestRelevantSimilarity"] for row in output if row["bestRelevantSimilarity"] is not None], q
                )) for q in (0.25, 0.5, 0.575, 0.75)
            },
        },
        "topKinds": {
            kind: sum(1 for row in output if row["topKind"] == kind) for kind in ("verse", "passage", "window")
        },
        "top5Kinds": {
            kind: sum(1 for row in output for value in row["top5Kinds"] if value == kind)
            for kind in ("verse", "passage", "window")
        },
        "byLanguage": {},
    }
    for language in ("en", "sv"):
        subset = [row for row in output if row["language"] == language]
        summary["byLanguage"][language] = {
            "recallAt10": sum(row["recallAt10"] for row in subset) / len(subset),
            "recallAt20": sum(row["recallAt20"] for row in subset) / len(subset),
            "mrr": sum((1 / row["rank"] if row["rank"] else 0) for row in subset) / len(subset),
        }
    return summary, output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pool-size", type=int, default=15000)
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()
    rows, intervals = load_pool(args.pool_size)
    print(json.dumps({"pool": len(rows), "goldDocs": sum(
        overlaps(intervals, row["book"], row["chapter"], row["start_verse"], row["end_verse"]) for row in rows
    )}), flush=True)
    session_options = ort.SessionOptions()
    session_options.intra_op_num_threads = args.threads
    session = ort.InferenceSession(str(args.model), sess_options=session_options, providers=["CPUExecutionProvider"])
    vector_path = OUT / f"proxy-docs-{digest(args.model)[:16]}-{len(rows)}.npy"
    if vector_path.exists():
        doc_vectors = np.load(vector_path)
        print(f"Using cached document vectors {vector_path}", flush=True)
    else:
        doc_vectors = encode_documents(session, rows)
        np.save(vector_path, doc_vectors)
    queries = json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    flat_queries = [query for pair in queries for query in pair]
    query_vectors = encode_queries(session, flat_queries)
    # Flat order is [en, sv] per query pair.
    summary, details = evaluate(doc_vectors, query_vectors, rows, queries, intervals)
    summary["model"] = str(args.model)
    summary["pool"] = len(rows)
    args.output.write_text(json.dumps({"summary": summary, "results": details}, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
