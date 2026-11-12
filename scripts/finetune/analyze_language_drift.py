#!/usr/bin/env python3
"""Measure English vs Swedish query drift between the shipped and candidate encoders."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
CANDIDATE = Path(r"C:\Users\alexh\AppData\Local\Temp\opencode\koino-finetune-candidate-v3\model-finetuned-v3.onnx")
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
PAD, CLS, SEP = 1, 0, 2


def encode(session, texts):
    rows = []
    for text in texts:
        ids = TOKENIZER.encode("query: " + text, add_special_tokens=False).ids[:94]
        rows.append([CLS, *ids, SEP])
    width = max(len(row) for row in rows)
    ids = np.full((len(rows), width), PAD, dtype=np.int64)
    mask = np.zeros((len(rows), width), dtype=np.int64)
    for index, row in enumerate(rows):
        ids[index, :len(row)] = row
        mask[index, :len(row)] = 1
    hidden = session.run(["last_hidden_state"], {
        "input_ids": ids,
        "attention_mask": mask,
        "token_type_ids": np.zeros_like(ids),
    })[0]
    weights = mask[..., None].astype(np.float32)
    pooled = (hidden * weights).sum(axis=1) / np.clip(weights.sum(axis=1), 1, None)
    return pooled / np.linalg.norm(pooled, axis=1, keepdims=True)


def main():
    pairs = json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    old = ort.InferenceSession(str(ASSETS / "multilingual-e5-small-int8.onnx"), providers=["CPUExecutionProvider"])
    new = ort.InferenceSession(str(CANDIDATE), providers=["CPUExecutionProvider"])
    for language in (0, 1):
        texts = [pair[language] for pair in pairs]
        before = encode(old, texts)
        after = encode(new, texts)
        cosines = np.sum(before * after, axis=1)
        order = np.argsort(cosines)
        print(json.dumps({
            "language": "en" if language == 0 else "sv",
            "count": len(texts),
            "mean": float(cosines.mean()),
            "min": float(cosines.min()),
            "p10": float(np.quantile(cosines, 0.1)),
            "median": float(np.median(cosines)),
            "max": float(cosines.max()),
            "lowest": [
                {"query": texts[index], "cosine": float(cosines[index])}
                for index in order[:8]
            ],
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
