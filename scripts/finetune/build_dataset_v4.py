#!/usr/bin/env python3
"""Build verse-balanced bilingual retrieval pairs.

Narrative/entity positives are verse documents, not containing passages. The
full-index evaluation is verse-centric; using passages as positives taught the
previous candidate to prefer long passage/window documents.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEARCH_DB = ROOT / "assets/bible/search/koino-search-v1.db"
READER_DB = ROOT / "assets/bible/koino-bible-v2.db"
STUDY_DB = ROOT / "assets/bible/study/koino-study-v1.db"
CACHE = ROOT / "assets/bible/search/.cache"
OUT = ROOT / "scripts/hybrid-search/.cache/finetune/v4"
STOP = set("a an the and or of to in for with on at by from is are was were be been being this that these those som och att det är en ett på i till av den de".split())
EN_TOPIC = ("What does the Bible say about {topic}?", "Bible verses about {topic}")
SV_TOPIC = ("Vad säger Bibeln om {topic}?", "Bibelverser om {topic}")
EN_NARRATIVE = ("{title}", "Bible passage: {title}")
SV_NARRATIVE = ("{title}", "Bibeltext: {title}")
EN_ENTITY = ("What does the Bible say about {title}?", "{title} in the Bible")
SV_ENTITY = ("Vad säger Bibeln om {title}?", "{title} i Bibeln")
GENERAL_TOPIC_WORDS = set(
    "pizza recipe recipes bitcoin crypto netflix football basketball soccer nba nfl tennis golf "
    "stock market mortgage loan resume cv javascript python excel windows laptop phone "
    "weather forecast travel flight hotel visa wedding birthday decoration diet calories "
    "workout marathon car tire engine faucet dishwasher ants carpet furniture".split()
)


def terms(text: str) -> list[str]:
    return [token for token in re.findall(r"[\w']+", text.lower()) if token not in STOP and len(token) > 1]


def embedding_text(row: dict) -> str:
    context = f"{row['book']} {row['chapter']} | {row['title']}" if row["book"] else row["title"]
    return "\n".join(part for part in (context, row["text"], row["keywords"]) if part)


def reference(row: dict) -> str:
    return f"{row['book']} {row['chapter']}:{row['start_verse']}-{row['end_verse']}"


def fts_expression(text: str) -> str:
    return " OR ".join(f'"{token}"' for token in terms(text)[:8])


def load_books():
    connection = sqlite3.connect(READER_DB)
    try:
        rows = connection.execute("SELECT id,name FROM books ORDER BY id").fetchall()
    finally:
        connection.close()
    return {row[0]: row[1] for row in rows}, sorted((row[1] for row in rows), key=len, reverse=True)


def load_gold(book_names):
    gold = json.loads((ROOT / "scripts/hybrid-search/recall-gold.json").read_text(encoding="utf-8"))
    queries = json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    intervals = set()
    for item in gold:
        for book_id, chapter, first, last in item:
            intervals.add((book_names[book_id], chapter, first, last))
    return intervals, {query.lower() for pair in queries for query in pair}


def overlaps(gold, book, chapter, first, last):
    return any(gb == book and gc == chapter and gf <= last and gl >= first for gb, gc, gf, gl in gold)


def parse_reference(ref: str, longest_books):
    value = ref.strip().rstrip(".")
    for book in longest_books:
        if value == book:
            return book, 1, 1, 999
        if value.startswith(book + " "):
            match = re.match(r"^(\d+)(?::(\d+)(?:-(\d+))?)?$", value[len(book) + 1:].strip())
            if not match:
                return None
            chapter = int(match.group(1))
            first = int(match.group(2) or 1)
            last = int(match.group(3) or first)
            return book, chapter, min(first, last), max(first, last)
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-topics", type=int, default=400)
    parser.add_argument("--eval-topics", type=int, default=120)
    parser.add_argument("--narrative", type=int, default=520)
    parser.add_argument("--entities", type=int, default=600)
    parser.add_argument("--negatives", type=int, default=2)
    parser.add_argument("--seed", type=int, default=44)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    book_names, longest_books = load_books()
    gold, heldout_queries = load_gold(book_names)
    documents = json.loads((CACHE / "tokenized-documents.json").read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in documents}
    verse_by_position = {}
    verses_by_range = {}
    for item in documents:
        if item["kind"] != "verse":
            continue
        verse_by_position[(item["book"], item["chapter"], item["start_verse"], item["translation_id"])] = item
        verses_by_range.setdefault((item["book"], item["chapter"], item["translation_id"]), []).append(item)
    for key in verses_by_range:
        verses_by_range[key].sort(key=lambda item: item["start_verse"])

    search = sqlite3.connect(SEARCH_DB)
    search.row_factory = sqlite3.Row
    study = sqlite3.connect(STUDY_DB)
    study.row_factory = sqlite3.Row

    def negative_rows(query, language, positive, count):
        expression = fts_expression(query)
        table = "documents_en" if language == "en" else "documents_sv"
        if not expression:
            return []
        rows = search.execute(
            f"""SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                  FROM {table} f JOIN documents d ON d.id=f.rowid
                 WHERE {table} MATCH ? AND d.translation_id=1 AND d.kind IN ('verse','passage','window')
                 ORDER BY bm25({table},1.4,1.0,0.7), d.canonical_order LIMIT 100""",
            (expression,),
        ).fetchall()
        selected, seen = [], set()
        for row in rows:
            if row["id"] in seen:
                continue
            if row["book"] == positive["book"] and row["chapter"] == positive["chapter"] and \
                    row["start_verse"] <= positive["end_verse"] and row["end_verse"] >= positive["start_verse"]:
                continue
            if overlaps(gold, row["book"], row["chapter"], row["start_verse"], row["end_verse"]):
                continue
            text = row["text"].strip()
            if text == positive["text"].strip() or text in seen:
                continue
            seen.add(text)
            selected.append(row)
            if len(selected) >= count:
                break
        return selected

    def add_row(rows, queries, positive: dict, language: str, source: str, label: str, negative_query=None):
        if positive["translation_id"] == 1 and overlaps(gold, positive["book"], positive["chapter"], positive["start_verse"], positive["end_verse"]):
            return
        for query in queries:
            query = re.sub(r"\s+", " ", query).strip()
            if not query or query.lower() in heldout_queries:
                continue
            negatives = negative_rows(negative_query or query, language, positive, args.negatives)
            if not negatives:
                continue
            rows.append({
                "query": query,
                "positive": positive["embeddingText"],
                "positive_id": positive["id"],
                "positive_reference": reference(positive),
                "hard_negatives": [embedding_text(item) for item in negatives],
                "topic": label,
                "topic_id": positive["id"],
                "source": source,
            })

    def first_verse_for(book, chapter, first, last, translation_id):
        candidates = [item for item in verses_by_range.get((book, chapter, translation_id), [])
                      if first <= item["start_verse"] <= last]
        return candidates[0] if candidates else None

    # Topics: two top verse documents, no passage positives.
    topics = search.execute(
        """SELECT t.id,t.name,COUNT(*) AS n FROM topics t
             JOIN topic_documents td ON td.topic_id=t.id
             JOIN documents d ON d.id=td.document_id
            WHERE d.translation_id=1 AND d.kind='verse'
            GROUP BY t.id HAVING n >= 3"""
    ).fetchall()
    rng.shuffle(topics)
    train_topics = topics[:args.train_topics]
    eval_topics = topics[args.train_topics:args.train_topics + args.eval_topics]

    def topic_rows(selected):
        result = []
        for topic in selected:
            name = topic["name"].strip()
            if any(word in GENERAL_TOPIC_WORDS for word in terms(name)):
                continue
            rows = search.execute(
                """SELECT d.id FROM topic_documents td JOIN documents d ON d.id=td.document_id
                    WHERE td.topic_id=? AND d.translation_id=1 AND d.kind='verse'
                    ORDER BY td.weight DESC,d.canonical_order LIMIT 2""",
                (topic["id"],),
            ).fetchall()
            queries = [EN_TOPIC[0].format(topic=name), SV_TOPIC[0].format(topic=name)]
            for row in rows:
                positive = by_id.get(row["id"])
                if positive:
                    add_row(result, queries, positive, "en", "topic", name, negative_query=name)
        return result

    training = topic_rows(train_topics)
    evaluation = topic_rows(eval_topics)
    print(json.dumps({"topic_train": len(training), "topic_eval": len(evaluation)}), flush=True)

    # Narrative: first verse in each passage/section, English and Swedish queries.
    passage_positions = {
        (item["book"], item["chapter"], item["start_verse"])
        for item in documents
        if item["kind"] == "passage" and item["translation_id"] == 1
    }
    positions = [
        (book, chapter, first, 1) for (book, chapter, first) in passage_positions
        if (book, chapter, first, 2) in verse_by_position
    ]
    rng.shuffle(positions)
    for book, chapter, first, _ in positions[: args.narrative]:
        english_title = verse_by_position[(book, chapter, first, 1)]["title"].strip()
        swedish_title = verse_by_position[(book, chapter, first, 2)]["title"].strip()
        if len(english_title) < 4 or len(swedish_title) < 4:
            continue
        en_verse = verse_by_position[(book, chapter, first, 1)]
        sv_verse = verse_by_position[(book, chapter, first, 2)]
        add_row(training, [EN_NARRATIVE[0].format(title=english_title), EN_NARRATIVE[1].format(title=english_title)], en_verse, "en", "narrative", english_title)
        add_row(training, [SV_NARRATIVE[0].format(title=swedish_title), SV_NARRATIVE[1].format(title=swedish_title)], en_verse, "en", "narrative", swedish_title, negative_query=english_title)
        add_row(training, [EN_NARRATIVE[1].format(title=english_title)], sv_verse, "sv", "narrative", english_title, negative_query=swedish_title)
        add_row(training, [SV_NARRATIVE[1].format(title=swedish_title)], sv_verse, "sv", "narrative", swedish_title)
    print(json.dumps({"narrative_train": len(training)}), flush=True)

    # Entity: referenced verse itself, not the surrounding passage.
    entities = study.execute("SELECT title,refs FROM entries WHERE kind='dictionary' AND length(title) BETWEEN 3 AND 48 ORDER BY title").fetchall()
    rng.shuffle(entities)
    used = 0
    for row in entities:
        if used >= args.entities:
            break
        positive = None
        for ref in [part.strip() for part in row["refs"].split(";") if part.strip()][:6]:
            parsed = parse_reference(ref, longest_books)
            if not parsed:
                continue
            book, chapter, first, last = parsed
            candidate = first_verse_for(book, chapter, first, last, 1)
            if candidate and not overlaps(gold, candidate["book"], candidate["chapter"], candidate["start_verse"], candidate["end_verse"]):
                positive = candidate
                break
        if positive is None:
            continue
        title = row["title"].strip()
        add_row(training, [EN_ENTITY[0].format(title=title), SV_ENTITY[0].format(title=title)], positive, "en", "entity", title, negative_query=title)
        used += 1
    print(json.dumps({"entity_train": len(training), "entities": used}), flush=True)

    rng.shuffle(training)
    with (args.output / "train.jsonl").open("w", encoding="utf-8") as handle:
        for row in training:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (args.output / "eval.json").open("w", encoding="utf-8") as handle:
        json.dump({"topics": len(eval_topics), "rows": evaluation}, handle, ensure_ascii=False)
    print(json.dumps({
        "train_pairs": len(training),
        "eval_pairs": len(evaluation),
        "used_entities": used,
        "out": str(args.output),
    }, indent=2), flush=True)
    study.close()
    search.close()


if __name__ == "__main__":
    main()
