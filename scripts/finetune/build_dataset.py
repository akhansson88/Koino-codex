#!/usr/bin/env python3
"""Build reproducible synthetic Bible retrieval pairs and BM25 hard negatives."""
from __future__ import annotations

import argparse
import json
import random
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEARCH_DB = ROOT / "assets/bible/search/koino-search-v1.db"
OUT = ROOT / "scripts/hybrid-search/.cache/finetune"
STOP = set("a an the and or of to in for with on at by from is are was were be been being this that these those".split())
TEMPLATES = (
    "What does the Bible say about {topic}?",
    "Bible verses about {topic}",
    "How should a Christian think about {topic}?",
    "What is {topic} according to Scripture?",
    "{topic} in the Bible",
)


def terms(text: str) -> list[str]:
    return [token for token in re.findall(r"[\w']+", text.lower()) if token not in STOP and len(token) > 1]


def embedding_text(row: sqlite3.Row) -> str:
    context = f"{row['book']} {row['chapter']} | {row['title']}" if row["book"] else row["title"]
    return "\n".join(part for part in (context, row["text"], row["keywords"]) if part)


def fts_expression(topic: str) -> str:
    tokens = terms(topic)
    return " OR ".join(f'"{token}"' for token in tokens[:8])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--topics", type=int, default=1600)
    parser.add_argument("--queries-per-topic", type=int, default=2)
    parser.add_argument("--positives", type=int, default=3)
    parser.add_argument("--negatives", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    rng = random.Random(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(SEARCH_DB)
    db.row_factory = sqlite3.Row
    topics = db.execute(
        """SELECT t.id,t.name,COUNT(*) AS n,MAX(td.weight) AS w
             FROM topics t
             JOIN topic_documents td ON td.topic_id=t.id
             JOIN documents d ON d.id=td.document_id
            WHERE d.translation_id=1 AND d.kind='verse'
            GROUP BY t.id HAVING n >= 3"""
    ).fetchall()
    rng.shuffle(topics)
    topics = topics[: args.topics]
    split = max(1, int(len(topics) * 0.9))
    train_topics, eval_topics = topics[:split], topics[split:]

    def top_documents(topic_id: int) -> list[sqlite3.Row]:
        return db.execute(
            """SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                 FROM topic_documents td JOIN documents d ON d.id=td.document_id
                WHERE td.topic_id=? AND d.translation_id=1 AND d.kind='verse'
                ORDER BY td.weight DESC, d.canonical_order LIMIT ?""",
            (topic_id, args.positives + 2),
        ).fetchall()

    def passage_for(verse_id: int) -> sqlite3.Row | None:
        return db.execute(
            """SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                 FROM document_verses dv JOIN documents d ON d.id=dv.document_id
                WHERE dv.verse_document_id=? AND d.translation_id=1 AND d.kind IN ('passage','window')
                ORDER BY CASE d.kind WHEN 'passage' THEN 0 ELSE 1 END LIMIT 1""",
            (verse_id,),
        ).fetchone()

    def hard_negatives(topic: str, positive_ids: set[int], count: int) -> list[sqlite3.Row]:
        expression = fts_expression(topic)
        if not expression:
            return []
        rows = db.execute(
            """SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                 FROM documents_en f JOIN documents d ON d.id=f.rowid
                WHERE documents_en MATCH ? AND d.translation_id=1 AND d.kind='verse'
                ORDER BY bm25(documents_en,1.4,1.0,0.7), d.canonical_order LIMIT 60""",
            (expression,),
        ).fetchall()
        return [row for row in rows if row["id"] not in positive_ids][:count]

    def make_rows(topic_rows: list[sqlite3.Row], per_topic: int, include_passage: bool) -> list[dict]:
        rows = []
        for topic in topic_rows:
            positives = top_documents(topic["id"])
            if len(positives) < 2:
                continue
            positive_ids = {row["id"] for row in positives}
            negatives = hard_negatives(topic["name"], positive_ids, args.negatives)
            if not negatives:
                continue
            templates = TEMPLATES[:per_topic]
            for template in templates:
                query = template.format(topic=topic["name"])
                for positive in positives[: args.positives]:
                    rows.append({
                        "query": query,
                        "positive": embedding_text(positive),
                        "positive_id": positive["id"],
                        "positive_reference": f"{positive['book']} {positive['chapter']}:{positive['start_verse']}",
                        "hard_negatives": [embedding_text(row) for row in negatives],
                        "topic": topic["name"],
                        "topic_id": topic["id"],
                    })
                if include_passage:
                    passage = passage_for(positives[0]["id"])
                    if passage is not None and passage["id"] not in positive_ids:
                        rows.append({
                            "query": query,
                            "positive": embedding_text(passage),
                            "positive_id": passage["id"],
                            "positive_reference": f"{passage['book']} {passage['chapter']}:{passage['start_verse']}-{passage['end_verse']}",
                            "hard_negatives": [embedding_text(row) for row in negatives],
                            "topic": topic["name"],
                            "topic_id": topic["id"],
                        })
        return rows

    train = make_rows(train_topics, args.queries_per_topic, True)
    eval_rows = make_rows(eval_topics, 1, True)
    rng.shuffle(train)
    with (OUT / "train.jsonl").open("w", encoding="utf-8") as handle:
        for row in train:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (OUT / "eval.json").open("w", encoding="utf-8") as handle:
        json.dump({"topics": len(eval_topics), "rows": eval_rows}, handle, ensure_ascii=False)
    recall = json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    gold = json.loads((ROOT / "scripts/hybrid-search/recall-gold.json").read_text(encoding="utf-8"))
    (OUT / "heldout_recall.json").write_text(json.dumps({"queries": recall, "gold": gold}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({
        "topics": len(topics),
        "train_topics": len(train_topics),
        "eval_topics": len(eval_topics),
        "train_pairs": len(train),
        "eval_pairs": len(eval_rows),
        "out": str(OUT),
    }, indent=2))


if __name__ == "__main__":
    main()
