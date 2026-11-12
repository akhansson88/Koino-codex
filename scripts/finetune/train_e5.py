#!/usr/bin/env python3
"""Fine-tune multilingual-e5-small on Bible retrieval pairs, then export int8 ONNX."""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from tokenizers import Tokenizer
from transformers import AutoModel

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
DATA = ROOT / "scripts/hybrid-search/.cache/finetune"
OUT = ROOT / "scripts/hybrid-search/.cache/finetune/model"
BASE_MODEL = "intfloat/multilingual-e5-small"
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
MAX_QUERY = 96
MAX_PASSAGE = 192
PAD = 1
CLS = 0
SEP = 2


def encode(text: str, prefix: str, limit: int) -> list[int]:
    ids = TOKENIZER.encode(prefix + text, add_special_tokens=False).ids
    return [CLS, *ids[: limit - 2], SEP]


def batch(rows: list[dict], index: int, size: int):
    chunk = rows[index:index + size]
    queries = [encode(row["query"], "query: ", MAX_QUERY) for row in chunk]
    positives = [encode(row["positive"], "passage: ", MAX_PASSAGE) for row in chunk]
    negatives = [
        encode(negative, "passage: ", MAX_PASSAGE)
        for row in chunk for negative in row["hard_negatives"][:4]
    ]
    def tensor(sequences):
        width = max(len(sequence) for sequence in sequences)
        ids = torch.full((len(sequences), width), PAD, dtype=torch.long)
        mask = torch.zeros((len(sequences), width), dtype=torch.long)
        for row, sequence in enumerate(sequences):
            ids[row, :len(sequence)] = torch.tensor(sequence)
            mask[row, :len(sequence)] = 1
        return ids, mask
    return chunk, (*tensor(queries), *tensor(positives), *tensor(negatives))


def mean_pool(hidden: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    mask = mask.unsqueeze(-1).to(hidden.dtype)
    return (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)


def embed(model, ids, mask):
    output = model(input_ids=ids, attention_mask=mask, token_type_ids=torch.zeros_like(ids))
    return F.normalize(mean_pool(output.last_hidden_state, mask), p=2, dim=1)


def load_model():
    model = AutoModel.from_pretrained(BASE_MODEL, cache_dir=os.environ.get("HF_HOME"))
    return model


def evaluate(model, rows: list[dict], limit: int = 120):
    model.eval()
    torch.set_grad_enabled(False)
    positives = []
    seen = set()
    for row in rows[:limit]:
        if row["positive"] not in seen:
            seen.add(row["positive"])
            positives.append(row["positive"])
        for negative in row["hard_negatives"][:4]:
            if negative not in seen:
                seen.add(negative)
                positives.append(negative)
    texts = [encode(text, "passage: ", MAX_PASSAGE) for text in positives]
    width = max(len(sequence) for sequence in texts)
    ids = torch.full((len(texts), width), PAD, dtype=torch.long)
    mask = torch.zeros((len(texts), width), dtype=torch.long)
    for row, sequence in enumerate(texts):
        ids[row, :len(sequence)] = torch.tensor(sequence)
        mask[row, :len(sequence)] = 1
    with torch.no_grad():
        passage_vectors = embed(model, ids, mask)
        recalls = {1: [], 5: [], 10: []}
        reciprocal = []
        for row in rows[:limit]:
            query_ids = torch.tensor([encode(row["query"], "query: ", MAX_QUERY)])
            query_mask = torch.ones_like(query_ids)
            query_vector = embed(model, query_ids, query_mask)
            scores = (query_vector @ passage_vectors.T).squeeze(0)
            order = torch.argsort(scores, descending=True).tolist()
            rank = order.index(positives.index(row["positive"])) + 1
            for cutoff in recalls:
                recalls[cutoff].append(1.0 if rank <= cutoff else 0.0)
            reciprocal.append(1.0 / rank)
    torch.set_grad_enabled(True)
    model.train()
    return {f"recall@{cutoff}": float(np.mean(values)) for cutoff, values in recalls.items()} | {"mrr": float(np.mean(reciprocal))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, default=DATA / "train.jsonl")
    parser.add_argument("--eval", type=Path, default=DATA / "eval.json")
    parser.add_argument("--pairs", type=int, default=6000)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--temperature", type=float, default=20.0)
    parser.add_argument("--teacher-vectors", type=Path, default=None)
    parser.add_argument("--distill-weight", type=float, default=0.0)
    parser.add_argument("--freeze-layers", type=int, default=9)
    parser.add_argument("--eval-limit", type=int, default=120)
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    random.seed(42)
    rows = [json.loads(line) for line in args.train.read_text(encoding="utf-8").splitlines()]
    random.shuffle(rows)
    rows = rows[: args.pairs]
    eval_rows = json.loads(args.eval.read_text(encoding="utf-8"))["rows"]
    OUT.mkdir(parents=True, exist_ok=True)
    teacher_queries = teacher_passages = None
    if args.teacher_vectors and args.distill_weight > 0:
        teacher = np.load(args.teacher_vectors, allow_pickle=True)
        teacher_queries = {
            text: vector for text, vector in zip(teacher["query_texts"], teacher["query_vectors"])
        }
        teacher_passages = {
            text: vector for text, vector in zip(teacher["passage_texts"], teacher["passage_vectors"])
        }
        print(json.dumps({
            "teacher_vectors": str(args.teacher_vectors),
            "teacher_queries": len(teacher_queries),
            "teacher_passages": len(teacher_passages),
            "distill_weight": args.distill_weight,
        }), flush=True)
    model = load_model()
    for parameter in model.embeddings.parameters():
        parameter.requires_grad = False
    for layer in model.encoder.layer[: args.freeze_layers]:
        for parameter in layer.parameters():
            parameter.requires_grad = False
    trainable = [parameter for parameter in model.parameters() if parameter.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=args.lr, weight_decay=0.01)
    print(json.dumps({
        "pairs": len(rows),
        "eval_rows": len(eval_rows),
        "trainable_parameters": sum(parameter.numel() for parameter in trainable),
        "total_parameters": sum(parameter.numel() for parameter in model.parameters()),
        "threads": args.threads,
        "lr": args.lr,
        "temperature": args.temperature,
        "freeze_layers": args.freeze_layers,
        "distill_weight": args.distill_weight,
    }, indent=2), flush=True)
    baseline = evaluate(model, eval_rows, args.eval_limit)
    print(json.dumps({"baseline": baseline}, indent=2), flush=True)
    (OUT / "baseline_eval.json").write_text(json.dumps(baseline, indent=2))
    model.train()
    started = time.time()
    step = 0
    for epoch in range(args.epochs):
        for index in range(0, len(rows), args.batch):
            chunk, (q_ids, q_mask, p_ids, p_mask, n_ids, n_mask) = batch(rows, index, args.batch)
            query_vectors = embed(model, q_ids, q_mask)
            positive_vectors = embed(model, p_ids, p_mask)
            negative_vectors = embed(model, n_ids, n_mask)
            candidates = torch.cat([positive_vectors, negative_vectors], dim=0)
            logits = query_vectors @ candidates.T * args.temperature
            labels = torch.arange(len(chunk))
            contrastive = F.cross_entropy(logits, labels)
            distill = None
            if teacher_queries is not None:
                teacher_query = torch.tensor(np.stack([teacher_queries[row["query"]] for row in chunk]), dtype=torch.float32)
                teacher_positive = torch.tensor(np.stack([teacher_passages[row["positive"]] for row in chunk]), dtype=torch.float32)
                teacher_negative = torch.tensor(np.stack([
                    teacher_passages[negative]
                    for row in chunk for negative in row["hard_negatives"][:4]
                ]), dtype=torch.float32)
                distill = (1.0 - (query_vectors * teacher_query).sum(dim=1)).mean()
                distill = distill + (1.0 - (positive_vectors * teacher_positive).sum(dim=1)).mean()
                distill = distill + (1.0 - (negative_vectors * teacher_negative).sum(dim=1)).mean()
            loss = contrastive + (args.distill_weight * distill if distill is not None else 0.0)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            optimizer.step()
            step += 1
            if step % 20 == 0:
                elapsed = time.time() - started
                print(json.dumps({
                    "epoch": epoch + 1,
                    "step": step,
                    "loss": round(float(loss.detach()), 4),
                    "contrastive": round(float(contrastive.detach()), 4),
                    "distill": round(float(distill.detach()), 4) if distill is not None else None,
                    "seconds": round(elapsed, 1),
                    "pairs_per_second": round(step * args.batch / max(elapsed, 1), 2),
                }), flush=True)
    metrics = evaluate(model, eval_rows, args.eval_limit)
    print(json.dumps({"final": metrics, "baseline": baseline}, indent=2), flush=True)
    (OUT / "metrics.json").write_text(json.dumps({"baseline": baseline, "final": metrics, "pairs": len(rows), "epochs": args.epochs}, indent=2))
    model.save_pretrained(OUT)
    print(json.dumps({"saved": str(OUT), "metrics": metrics}, indent=2), flush=True)


if __name__ == "__main__":
    main()
