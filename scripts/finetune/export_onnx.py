#!/usr/bin/env python3
"""Export the fine-tuned encoder to ONNX and dynamic int8, with parity checks."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from tokenizers import Tokenizer
from transformers import AutoModel

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
MODEL = ROOT / "scripts/hybrid-search/.cache/finetune/model"
OUT = ROOT / "scripts/hybrid-search/.cache/finetune"
FP32 = OUT / "model-fp32.onnx"
INT8 = OUT / "multilingual-e5-small-int8.onnx"
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
TEXTS = [
    "query: What does the Bible say about anxiety?",
    "query: Bible verses about forgiveness",
    "query: who was Moses",
    "passage: Philippians 4:6 Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.",
    "passage: Moses was the leader who brought Israel out of Egypt.",
]


def tokens(text: str, limit: int = 192):
    ids = [0, *TOKENIZER.encode(text, add_special_tokens=False).ids[: limit - 2], 2]
    width = len(ids)
    return (
        torch.tensor([ids], dtype=torch.long),
        torch.ones((1, width), dtype=torch.long),
        torch.zeros((1, width), dtype=torch.long),
    )


def pooled(hidden: np.ndarray, mask: np.ndarray):
    mask = mask[..., None].astype(np.float32)
    value = (hidden * mask).sum(axis=1) / np.clip(mask.sum(axis=1), 1, None)
    return value / np.linalg.norm(value, axis=1, keepdims=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    model = AutoModel.from_pretrained(MODEL, cache_dir=os.environ.get("HF_HOME"))
    model.eval()
    class Wrapper(torch.nn.Module):
        def __init__(self, inner):
            super().__init__()
            self.inner = inner
        def forward(self, input_ids, attention_mask, token_type_ids):
            return self.inner(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids).last_hidden_state
    wrapper = Wrapper(model)
    sample = tokens(TEXTS[0])
    torch.onnx.export(
        wrapper,
        sample,
        FP32,
        input_names=["input_ids", "attention_mask", "token_type_ids"],
        output_names=["last_hidden_state"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "sequence"},
            "attention_mask": {0: "batch", 1: "sequence"},
            "token_type_ids": {0: "batch", 1: "sequence"},
            "last_hidden_state": {0: "batch", 1: "sequence"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    quantize_dynamic(FP32, INT8, weight_type=QuantType.QUInt8, per_channel=True)
    session = ort.InferenceSession(str(INT8), providers=["CPUExecutionProvider"])
    fp32 = ort.InferenceSession(str(FP32), providers=["CPUExecutionProvider"])
    parity = []
    with torch.no_grad():
        for text in TEXTS:
            ids, mask, types = tokens(text)
            expected = model(input_ids=ids, attention_mask=mask, token_type_ids=types).last_hidden_state.numpy()
            expected = pooled(expected, mask.numpy())[0]
            feeds = {
                "input_ids": ids.numpy(),
                "attention_mask": mask.numpy(),
                "token_type_ids": types.numpy(),
            }
            int8_hidden = session.run(["last_hidden_state"], feeds)[0]
            fp32_hidden = fp32.run(["last_hidden_state"], feeds)[0]
            int8_vector = pooled(int8_hidden, mask.numpy())[0]
            fp32_vector = pooled(fp32_hidden, mask.numpy())[0]
            parity.append({
                "text": text[:80],
                "onnx_fp32_vs_torch": float(np.dot(expected, fp32_vector)),
                "int8_vs_fp32": float(np.dot(fp32_vector, int8_vector)),
                "int8_vs_torch": float(np.dot(expected, int8_vector)),
            })
    def digest(path):
        value = hashlib.sha256(path.read_bytes()).hexdigest()
        return {"bytes": path.stat().st_size, "sha256": value, "md5": hashlib.md5(path.read_bytes()).hexdigest()}
    manifest = {
        "base_model": "intfloat/multilingual-e5-small",
        "fine_tune": str(MODEL),
        "quantization": {"mode": "dynamic", "weight_type": "QUInt8", "per_channel": True, "reduce_range": False},
        "fp32": digest(FP32),
        "int8": digest(INT8),
        "parity": parity,
        "minimum_onnx_fp32_vs_torch": min(item["onnx_fp32_vs_torch"] for item in parity),
        "minimum_int8_vs_fp32": min(item["int8_vs_fp32"] for item in parity),
        "mean_int8_vs_fp32": sum(item["int8_vs_fp32"] for item in parity) / len(parity),
    }
    (OUT / "export-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
