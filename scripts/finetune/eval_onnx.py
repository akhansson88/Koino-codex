#!/usr/bin/env python3
"""Compare held-out retrieval for PyTorch, ONNX fp32 and ONNX int8."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from tokenizers import Tokenizer
from transformers import AutoModel

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
DATA = ROOT / "scripts/hybrid-search/.cache/finetune"
OUT = DATA
MODEL = DATA / "model"
FP32 = OUT / "model-fp32.onnx"
INT8 = OUT / "multilingual-e5-small-int8.onnx"
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
MAX_QUERY = 96
MAX_PASSAGE = 192
PAD = 1
CLS = 0
SEP = 2


def encode(text: str, prefix: str, limit: int) -> list[int]:
    ids = TOKENIZER.encode(prefix + text, add_special_tokens=False).ids
    return [CLS, *ids[: limit - 2], SEP]


def pad(sequences: list[list[int]]):
    width = max(len(sequence) for sequence in sequences)
    ids = np.full((len(sequences), width), PAD, dtype=np.int64)
    mask = np.zeros((len(sequences), width), dtype=np.int64)
    for row, sequence in enumerate(sequences):
        ids[row, : len(sequence)] = sequence
        mask[row, : len(sequence)] = 1
    return ids, mask


def pool(hidden: np.ndarray, mask: np.ndarray) -> np.ndarray:
    weights = mask[..., None].astype(np.float32)
    value = (hidden * weights).sum(axis=1) / np.clip(weights.sum(axis=1), 1, None)
    return value / np.linalg.norm(value, axis=1, keepdims=True)


def torch_vectors(texts: list[str], prefix: str, limit: int, model) -> np.ndarray:
    ids, mask = pad([encode(text, prefix, limit) for text in texts])
    with torch.no_grad():
        hidden = model(
            input_ids=torch.tensor(ids),
            attention_mask=torch.tensor(mask),
            token_type_ids=torch.zeros_like(torch.tensor(ids)),
        ).last_hidden_state.numpy()
    return pool(hidden, mask)


def onnx_vectors(texts: list[str], prefix: str, limit: int, session, batch: int = 32) -> np.ndarray:
    chunks = []
    for index in range(0, len(texts), batch):
        ids, mask = pad([encode(text, prefix, limit) for text in texts[index : index + batch]])
        feeds = {
            "input_ids": ids,
            "attention_mask": mask,
            "token_type_ids": np.zeros_like(ids),
        }
        hidden = session.run(["last_hidden_state"], feeds)[0]
        chunks.append(pool(hidden, mask))
    return np.concatenate(chunks, axis=0)


def rank_metrics(rows: list[dict], query_vectors: np.ndarray, passage_vectors: np.ndarray, index_of: dict[str, int]):
    recalls = {1: [], 5: [], 10: []}
    reciprocal = []
    ranks = []
    for row, query_vector in zip(rows, query_vectors):
        scores = passage_vectors @ query_vector
        order = np.argsort(-scores)
        rank = int(np.where(order == index_of[row["positive"]])[0][0]) + 1
        ranks.append(rank)
        for cutoff in recalls:
            recalls[cutoff].append(1.0 if rank <= cutoff else 0.0)
        reciprocal.append(1.0 / rank)
    return (
        {f"recall@{cutoff}": float(np.mean(values)) for cutoff, values in recalls.items()}
        | {"mrr": float(np.mean(reciprocal)), "median_rank": float(np.median(ranks))}
    ), ranks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--int8", type=Path, default=INT8)
    parser.add_argument("--output", type=Path, default=OUT / "onnx-eval.json")
    args = parser.parse_args()
    rows = json.loads((DATA / "eval.json").read_text(encoding="utf-8"))["rows"]
    passages = []
    seen = set()
    for row in rows:
        for text in [row["positive"], *row["hard_negatives"][:3]]:
            if text not in seen:
                seen.add(text)
                passages.append(text)
    index_of = {text: index for index, text in enumerate(passages)}
    queries = [row["query"] for row in rows]
    print(json.dumps({"queries": len(rows), "passages": len(passages)}), flush=True)

    model = AutoModel.from_pretrained(MODEL, cache_dir=os.environ.get("HF_HOME"))
    model.eval()
    torch_query = torch_vectors(queries, "query: ", MAX_QUERY, model)
    torch_passage = torch_vectors(passages, "passage: ", MAX_PASSAGE, model)
    fp32_session = ort.InferenceSession(str(FP32), providers=["CPUExecutionProvider"])
    int8_session = ort.InferenceSession(str(args.int8), providers=["CPUExecutionProvider"])
    fp32_query = onnx_vectors(queries, "query: ", MAX_QUERY, fp32_session)
    fp32_passage = onnx_vectors(passages, "passage: ", MAX_PASSAGE, fp32_session)
    int8_query = onnx_vectors(queries, "query: ", MAX_QUERY, int8_session)
    int8_passage = onnx_vectors(passages, "passage: ", MAX_PASSAGE, int8_session)

    output = {"queries": len(rows), "passages": len(passages), "int8_model": str(args.int8)}
    for name, query_vectors, passage_vectors in [
        ("torch", torch_query, torch_passage),
        ("onnx_fp32", fp32_query, fp32_passage),
        ("onnx_int8", int8_query, int8_passage),
    ]:
        metrics, ranks = rank_metrics(rows, query_vectors, passage_vectors, index_of)
        output[name] = metrics | {"ranks": ranks}
        print(name, json.dumps(metrics), flush=True)

    output["int8_query_cosine_vs_torch"] = float(
        np.mean(np.sum(int8_query * torch_query, axis=1))
    )
    output["int8_passage_cosine_vs_torch"] = float(
        np.mean(np.sum(int8_passage * torch_passage, axis=1))
    )
    output["int8_query_cosine_min_vs_torch"] = float(
        np.min(np.sum(int8_query * torch_query, axis=1))
    )
    output["int8_passage_cosine_min_vs_torch"] = float(
        np.min(np.sum(int8_passage * torch_passage, axis=1))
    )
    output["int8_top10_overlap_vs_torch"] = float(
        np.mean(
            [
                len(set(np.argsort(-(torch_passage @ q))[:10]) & set(np.argsort(-(int8_passage @ iq))[:10])) / 10
                for q, iq in zip(torch_query, int8_query)
            ]
        )
    )
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                key: output[key]
                for key in output
                if key.startswith("int8_") and "ranks" not in key
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
