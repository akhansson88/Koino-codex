#!/usr/bin/env python3
"""Precompute shipped-model embeddings for embedding-level distillation."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
CACHE = ROOT / "scripts/hybrid-search/.cache/finetune"
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
PAD, CLS, SEP = 1, 0, 2


def encode(session, texts: list[str], prefix: str, limit: int, batch_size: int = 32) -> np.ndarray:
    rows = []
    for text in texts:
        ids = TOKENIZER.encode(f"{prefix}: {text}", add_special_tokens=False).ids[: limit - 2]
        rows.append([CLS, *ids, SEP])
    order = sorted(range(len(rows)), key=lambda index: len(rows[index]))
    vectors = np.zeros((len(rows), 384), dtype=np.float32)
    for start in range(0, len(order), batch_size):
        indexes = order[start:start + batch_size]
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
        if start % 3200 == 0:
            print(f"Embedded {start}/{len(rows)}", flush=True)
    return vectors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=ASSETS / "multilingual-e5-small-int8.onnx")
    parser.add_argument("--train", type=Path, default=CACHE / "train.jsonl")
    parser.add_argument("--output", type=Path, default=CACHE / "teacher-vectors-v2.npz")
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.train.read_text(encoding="utf-8").splitlines()]
    queries = sorted({row["query"] for row in rows})
    passages = sorted({row["positive"] for row in rows} | {
        negative for row in rows for negative in row["hard_negatives"]
    })
    print(json.dumps({"queries": len(queries), "passages": len(passages)}), flush=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    session = ort.InferenceSession(str(args.model), sess_options=options, providers=["CPUExecutionProvider"])
    query_vectors = encode(session, queries, "query", 96)
    passage_vectors = encode(session, passages, "passage", 192)
    np.savez_compressed(
        args.output,
        query_texts=np.array(queries, dtype=object),
        query_vectors=query_vectors,
        passage_texts=np.array(passages, dtype=object),
        passage_vectors=passage_vectors,
    )
    print(json.dumps({"output": str(args.output), "bytes": args.output.stat().st_size}), flush=True)


if __name__ == "__main__":
    main()
