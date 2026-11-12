#!/usr/bin/env python3
"""Build the Run 5 data shape without training.

- verse positives only
- natural narrative paraphrases, never exact section titles
- whole-section reference ranges
- same-section documents are never hard negatives
- locked benchmark stories are excluded
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
OUT = ROOT / "scripts/hybrid-search/.cache/finetune/v5"
STOP = set("a an the and or of to in for with on at by from is are was were be been being this that these those som och att det är en ett på i till av den de".split())
EN_TOPIC = ("What does the Bible say about {topic}?", "Bible verses about {topic}")
SV_TOPIC = ("Vad säger Bibeln om {topic}?", "Bibelverser om {topic}")
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


def overlaps(ranges, book, chapter, first, last):
    return any(rb == book and rc == chapter and rf <= last and rl >= first for rb, rc, rf, rl in ranges)


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
    parser.add_argument("--entities", type=int, default=600)
    parser.add_argument("--negatives", type=int, default=2)
    parser.add_argument("--seed", type=int, default=45)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    book_names, longest_books = load_books()
    gold, heldout_queries = load_gold(book_names)
    benchmark = json.loads((ROOT / "scripts/finetune/narrative-paraphrase-benchmark.json").read_text(encoding="utf-8"))
    benchmark_refs = {(book_names[book_id], chapter, first, last)
                      for entry in benchmark["queries"] for book_id, chapter, first, last in entry["references"]}
    benchmark_queries = {query.lower() for entry in benchmark["queries"] for query in (entry["en"], entry["sv"])}
    paraphrases = json.loads((ROOT / "scripts/finetune/narrative-paraphrase-training.json").read_text(encoding="utf-8"))["stories"]
    documents = json.loads((CACHE / "tokenized-documents.json").read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in documents}
    verses_by_chapter = {}
    passages_by_chapter = {}
    for item in documents:
        if item["translation_id"] != 1:
            continue
        if item["kind"] == "verse":
            verses_by_chapter.setdefault((item["book"], item["chapter"]), []).append(item)
        elif item["kind"] == "passage":
            passages_by_chapter.setdefault((item["book"], item["chapter"]), []).append(item)
    for values in verses_by_chapter.values():
        values.sort(key=lambda item: item["start_verse"])
    for values in passages_by_chapter.values():
        values.sort(key=lambda item: (item["start_verse"], item["end_verse"]))

    def section_for(book, chapter, verse):
        candidates = [item for item in passages_by_chapter.get((book, chapter), [])
                      if item["start_verse"] <= verse <= item["end_verse"]]
        candidates.sort(key=lambda item: (item["end_verse"] - item["start_verse"], item["start_verse"]))
        if candidates:
            item = candidates[0]
            return (item["book"], item["chapter"], item["start_verse"], item["end_verse"])
        return (book, chapter, verse, verse)

    def section_verses(ranges, translation_id, limit):
        result = []
        for book, chapter, first, last in ranges:
            values = [item for item in verses_by_chapter.get((book, chapter), [])
                      if first <= item["start_verse"] <= last] if translation_id == 1 else []
            if translation_id == 2:
                values = []
                for item in documents:
                    if item["translation_id"] == 2 and item["kind"] == "verse" and item["book"] == book and item["chapter"] == chapter and first <= item["start_verse"] <= last:
                        values.append(item)
            if not values:
                continue
            picks = [values[0], values[len(values) // 2], values[-1]]
            for item in picks:
                if item["id"] not in {row["id"] for row in result}:
                    result.append(item)
                if len(result) >= limit:
                    return result
        return result[:limit]

    search = sqlite3.connect(SEARCH_DB)
    search.row_factory = sqlite3.Row
    study = sqlite3.connect(STUDY_DB)
    study.row_factory = sqlite3.Row

    def negative_rows(query, language, ranges, positive, count):
        expression = fts_expression(query)
        table = "documents_en" if language == "en" else "documents_sv"
        if not expression:
            return []
        rows = search.execute(
            f"""SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                  FROM {table} f JOIN documents d ON d.id=f.rowid
                 WHERE {table} MATCH ? AND d.translation_id=1 AND d.kind IN ('verse','passage','window')
                 ORDER BY bm25({table},1.4,1.0,0.7), d.canonical_order LIMIT 120""",
            (expression,),
        ).fetchall()
        selected, seen = [], set()
        for row in rows:
            if row["book"] == positive["book"] and row["chapter"] == positive["chapter"] and row["title"] == positive["title"]:
                continue
            if overlaps(ranges, row["book"], row["chapter"], row["start_verse"], row["end_verse"]):
                continue
            if overlaps(gold, row["book"], row["chapter"], row["start_verse"], row["end_verse"]):
                continue
            text = row["text"].strip()
            if text in seen:
                continue
            seen.add(text)
            selected.append(row)
            if len(selected) >= count:
                break
        return selected

    def add_row(rows, queries, positive, language, source, label, ranges, negative_query=None):
        if overlaps(benchmark_refs, positive["book"], positive["chapter"], positive["start_verse"], positive["end_verse"]):
            return
        if positive["translation_id"] == 1 and overlaps(gold, positive["book"], positive["chapter"], positive["start_verse"], positive["end_verse"]):
            return
        for query in queries:
            query = re.sub(r"\s+", " ", query).strip()
            if not query or query.lower() in heldout_queries or query.lower() in benchmark_queries:
                continue
            negatives = negative_rows(negative_query or query, language, ranges, positive, args.negatives)
            if not negatives:
                continue
            rows.append({
                "query": query,
                "positive": positive["embeddingText"],
                "positive_id": positive["id"],
                "positive_reference": reference(positive),
                "hard_negatives": [embedding_text(item) for item in negatives],
                "reference_ranges": [[book, chapter, first, last] for book, chapter, first, last in ranges],
                "topic": label,
                "topic_id": positive["id"],
                "source": source,
            })

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
                    ranges = [section_for(positive["book"], positive["chapter"], positive["start_verse"])]
                    add_row(result, queries, positive, "en", "topic", name, ranges, negative_query=name)
        return result

    training = topic_rows(train_topics)
    evaluation = topic_rows(eval_topics)
    print(json.dumps({"topic_train": len(training), "topic_eval": len(evaluation)}), flush=True)

    # Natural narrative paraphrases. Every verse in the whole section is valid.
    for story in paraphrases:
        ranges = []
        for book_id, chapter, first, last in story["references"]:
            book = book_names[book_id]
            ranges.append((book, chapter, first, last))
        if any(overlaps(benchmark_refs, book, chapter, first, last) for book, chapter, first, last in ranges):
            continue
        en_verses = section_verses(ranges, 1, 3)
        sv_verses = section_verses(ranges, 2, 2)
        for positive in en_verses:
            add_row(training, [story["en"]], positive, "en", "narrative_paraphrase", story["id"], ranges)
            add_row(training, [story["sv"]], positive, "en", "narrative_paraphrase", story["id"], ranges, negative_query=story["en"])
        for positive in sv_verses:
            add_row(training, [story["en"]], positive, "sv", "narrative_paraphrase", story["id"], ranges, negative_query=story["sv"])
            add_row(training, [story["sv"]], positive, "sv", "narrative_paraphrase", story["id"], ranges)
    print(json.dumps({"after_narrative": len(training)}), flush=True)

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
            candidates = [item for item in verses_by_chapter.get((book, chapter), []) if first <= item["start_verse"] <= last]
            if candidates:
                candidate = candidates[0]
                if not overlaps(gold, candidate["book"], candidate["chapter"], candidate["start_verse"], candidate["end_verse"]):
                    positive = candidate
                    break
        if positive is None:
            continue
        title = row["title"].strip()
        ranges = [section_for(positive["book"], positive["chapter"], positive["start_verse"])]
        add_row(training, [EN_ENTITY[0].format(title=title), SV_ENTITY[0].format(title=title)], positive, "en", "entity", title, ranges, negative_query=title)
        used += 1
    print(json.dumps({"entity_train": len(training), "entities": used}), flush=True)

    rng.shuffle(training)
    with (args.output / "train.jsonl").open("w", encoding="utf-8") as handle:
        for row in training:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (args.output / "eval.json").open("w", encoding="utf-8") as handle:
        json.dump({"topics": len(eval_topics), "rows": evaluation}, handle, ensure_ascii=False)
    print(json.dumps({"train_pairs": len(training), "eval_pairs": len(evaluation), "used_entities": used, "out": str(args.output)}, indent=2), flush=True)
    study.close()
    search.close()


if __name__ == "__main__":
    main()
