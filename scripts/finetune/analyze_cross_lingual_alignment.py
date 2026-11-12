#!/usr/bin/env python3
"""Measure English vs Swedish alignment to the same English passages.

For each locked benchmark story, both queries are compared with the correct
English verse passages. The English-Swedish gap isolates cross-lingual loss.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
CACHE = ROOT / "scripts/hybrid-search/.cache/finetune"
OLD = ASSETS / "multilingual-e5-small-int8.onnx"
NEW = Path(r"C:\Users\alexh\AppData\Local\Temp\opencode\koino-finetune-candidate-v5\model-finetuned-v5.onnx")
TOKENIZER = Tokenizer.from_file(str(ASSETS / "multilingual-e5-small.tokenizer"))
PAD, CLS, SEP = 1, 0, 2


def encode(session, texts, prefix, limit):
    rows = []
    for text in texts:
        ids = TOKENIZER.encode(f"{prefix}: {text}", add_special_tokens=False).ids[: limit - 2]
        rows.append([CLS, *ids, SEP])
    vectors = np.zeros((len(rows), 384), dtype=np.float32)
    for start in range(0, len(rows), 32):
        batch = rows[start:start + 32]
        width = max(len(row) for row in batch)
        ids = np.full((len(batch), width), PAD, dtype=np.int64)
        mask = np.zeros((len(batch), width), dtype=np.int64)
        for index, row in enumerate(batch):
            ids[index, :len(row)] = row
            mask[index, :len(row)] = 1
        hidden = session.run(["last_hidden_state"], {
            "input_ids": ids,
            "attention_mask": mask,
            "token_type_ids": np.zeros_like(ids),
        })[0]
        weights = mask[..., None].astype(np.float32)
        pooled = (hidden * weights).sum(axis=1) / np.clip(weights.sum(axis=1), 1, None)
        pooled /= np.linalg.norm(pooled, axis=1, keepdims=True)
        vectors[start:start + len(batch)] = pooled
    return vectors


def main():
    benchmark = json.loads((ROOT / "scripts/finetune/narrative-paraphrase-benchmark.json").read_text(encoding="utf-8"))
    documents = json.loads((ASSETS / ".cache/tokenized-documents.json").read_text(encoding="utf-8"))
    reader = sqlite3.connect(ROOT / "assets/bible/koino-bible-v2.db")
    books = {row[0]: row[1] for row in reader.execute("SELECT id,name FROM books")}
    reader.close()
    by_book = {}
    for item in documents:
        if item["translation_id"] == 1 and item["kind"] == "verse":
            by_book.setdefault((item["book"], item["chapter"]), []).append(item)
    story_passages = {}
    all_texts = []
    text_index = {}
    for entry in benchmark["queries"]:
        indexes = []
        for book_id, chapter, first, last in entry["references"]:
            book = books[book_id]
            for item in by_book.get((book, chapter), []):
                if first <= item["start_verse"] <= last:
                    text = item["embeddingText"]
                    if text not in text_index:
                        text_index[text] = len(all_texts)
                        all_texts.append(text)
                    if text_index[text] not in indexes:
                        indexes.append(text_index[text])
        story_passages[entry["id"]] = indexes
    # Deduplicate verse texts while preserving story mapping.
    passages = []
    seen = set()
    old_to_new = {}
    for index, text in enumerate(all_texts):
        key = text
        if key in seen:
            old_to_new[index] = passages.index(text)
        else:
            seen.add(key)
            old_to_new[index] = len(passages)
            passages.append(text)
    for story in story_passages:
        story_passages[story] = sorted({old_to_new[index] for index in story_passages[story]})
    print(json.dumps({"stories": len(story_passages), "passages": len(passages)}), flush=True)

    options = ort.SessionOptions()
    options.intra_op_num_threads = 8
    old_session = ort.InferenceSession(str(OLD), sess_options=options, providers=["CPUExecutionProvider"])
    new_session = ort.InferenceSession(str(NEW), sess_options=options, providers=["CPUExecutionProvider"])
    old_passages = encode(old_session, passages, "passage", 192)
    new_passages = encode(new_session, passages, "passage", 192)
    en_queries = [entry["en"] for entry in benchmark["queries"]]
    sv_queries = [entry["sv"] for entry in benchmark["queries"]]
    old_en = encode(old_session, en_queries, "query", 96)
    old_sv = encode(old_session, sv_queries, "query", 96)
    new_en = encode(new_session, en_queries, "query", 96)
    new_sv = encode(new_session, sv_queries, "query", 96)

    rows = []
    for index, entry in enumerate(benchmark["queries"]):
        ids = story_passages[entry["id"]]
        old_en_max = float(np.max(old_passages[ids] @ old_en[index]))
        old_sv_max = float(np.max(old_passages[ids] @ old_sv[index]))
        new_en_max = float(np.max(new_passages[ids] @ new_en[index]))
        new_sv_max = float(np.max(new_passages[ids] @ new_sv[index]))
        rows.append({
            "id": entry["id"],
            "story": entry["story"],
            "en": entry["en"],
            "sv": entry["sv"],
            "passages": len(ids),
            "oldEnMax": old_en_max,
            "oldSvMax": old_sv_max,
            "oldGap": old_en_max - old_sv_max,
            "newEnMax": new_en_max,
            "newSvMax": new_sv_max,
            "newGap": new_en_max - new_sv_max,
            "gapDelta": (new_en_max - new_sv_max) - (old_en_max - old_sv_max),
            "svDelta": new_sv_max - old_sv_max,
            "enDelta": new_en_max - old_en_max,
            "queryDriftEn": float(np.dot(old_en[index], new_en[index])),
            "queryDriftSv": float(np.dot(old_sv[index], new_sv[index])),
        })
    rows.sort(key=lambda row: row["gapDelta"], reverse=True)
    summary = {
        "stories": len(rows),
        "passages": len(passages),
        "old": {
            "meanEnMax": float(np.mean([row["oldEnMax"] for row in rows])),
            "meanSvMax": float(np.mean([row["oldSvMax"] for row in rows])),
            "meanGap": float(np.mean([row["oldGap"] for row in rows])),
        },
        "new": {
            "meanEnMax": float(np.mean([row["newEnMax"] for row in rows])),
            "meanSvMax": float(np.mean([row["newSvMax"] for row in rows])),
            "meanGap": float(np.mean([row["newGap"] for row in rows])),
        },
        "delta": {
            "meanEnMax": float(np.mean([row["enDelta"] for row in rows])),
            "meanSvMax": float(np.mean([row["svDelta"] for row in rows])),
            "meanGap": float(np.mean([row["gapDelta"] for row in rows])),
        },
        "queryDrift": {
            "en": float(np.mean([row["queryDriftEn"] for row in rows])),
            "sv": float(np.mean([row["queryDriftSv"] for row in rows])),
        },
        "passageDrift": float(np.mean(np.sum(old_passages * new_passages, axis=1))),
        "worstGapIncreases": rows[:12],
    }
    (CACHE / "cross-lingual-alignment-v5.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
