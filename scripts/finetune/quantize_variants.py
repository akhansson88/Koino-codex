#!/usr/bin/env python3
"""Quantize the fp32 export with alternative dynamic-int8 settings and compare parity."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts/hybrid-search/.cache/finetune"
FP32 = OUT / "model-fp32.onnx"


def main():
    variants = {
        "default": (QuantType.QInt8, {}),
        "per_channel": (QuantType.QInt8, {"per_channel": True}),
        "per_channel_reduce": (QuantType.QInt8, {"per_channel": True, "reduce_range": True}),
        "uint8": (QuantType.QUInt8, {}),
        "uint8_per_channel": (QuantType.QUInt8, {"per_channel": True}),
        "uint8_per_channel_reduce": (QuantType.QUInt8, {"per_channel": True, "reduce_range": True}),
    }
    rows = []
    fp32 = ort.InferenceSession(str(FP32), providers=["CPUExecutionProvider"])
    for name, (weight_type, options) in variants.items():
        target = OUT / f"variant-{name}.onnx"
        try:
            quantize_dynamic(FP32, target, weight_type=weight_type, **options)
            session = ort.InferenceSession(str(target), providers=["CPUExecutionProvider"])
            # Use the same real tokenized samples as export_onnx.py.
            from tokenizers import Tokenizer
            tokenizer = Tokenizer.from_file(
                str(ROOT / "assets/bible/search/multilingual-e5-small.tokenizer")
            )
            texts = [
                "query: What does the Bible say about anxiety?",
                "query: Bible verses about forgiveness",
                "query: who was Moses",
                "passage: Philippians 4:6 Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.",
                "passage: Moses was the leader who brought Israel out of Egypt.",
            ]
            cosines = []
            for text in texts:
                ids = [0, *tokenizer.encode(text, add_special_tokens=False).ids[:190], 2]
                feeds = {
                    "input_ids": np.array([ids], dtype=np.int64),
                    "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
                    "token_type_ids": np.zeros((1, len(ids)), dtype=np.int64),
                }
                expected = fp32.run(["last_hidden_state"], feeds)[0]
                actual = session.run(["last_hidden_state"], feeds)[0]
                mask = feeds["attention_mask"][..., None].astype(np.float32)
                expected = (expected * mask).sum(axis=1) / mask.sum(axis=1)
                actual = (actual * mask).sum(axis=1) / mask.sum(axis=1)
                expected /= np.linalg.norm(expected, axis=1, keepdims=True)
                actual /= np.linalg.norm(actual, axis=1, keepdims=True)
                cosines.append(float(np.sum(expected * actual)))
            rows.append(
                {
                    "name": name,
                    "weight_type": weight_type.name,
                    "options": options,
                    "bytes": target.stat().st_size,
                    "min_parity": min(cosines),
                    "mean_parity": float(np.mean(cosines)),
                }
            )
        except Exception as error:
            rows.append({"name": name, "options": options, "error": str(error)})
        print(json.dumps(rows[-1]), flush=True)
    (OUT / "quantization-variants.json").write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
