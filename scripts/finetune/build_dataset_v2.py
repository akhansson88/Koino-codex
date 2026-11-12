#!/usr/bin/env python3
"""Build bilingual topic, narrative and entity retrieval pairs with hard negatives."""
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
OUT = ROOT / "scripts/hybrid-search/.cache/finetune"
STOP = set("a an the and or of to in for with on at by from is are was were be been being this that these those som och att det är en ett på i till av den de".split())
EN_TOPIC_TEMPLATES = (
    "What does the Bible say about {topic}?",
    "Bible verses about {topic}",
    "How should a Christian think about {topic}?",
    "What is {topic} according to Scripture?",
)
SV_TOPIC_TEMPLATES = (
    "Vad säger Bibeln om {topic}?",
    "Bibelverser om {topic}",
    "Hur ska en kristen tänka om {topic}?",
    "Vad är {topic} enligt Bibeln?",
)
EN_NARRATIVE_TEMPLATES = (
    "{title}",
    "Bible passage: {title}",
    "What happens in {title}?",
    "Which Scripture describes {title}?",
)
SV_NARRATIVE_TEMPLATES = (
    "{title}",
    "Bibeltext: {title}",
    "Vad handlar {title} om?",
    "Vilken bibeltext beskriver {title}?",
)
EN_ENTITY_TEMPLATES = (
    "What does the Bible say about {title}?",
    "What is {title} in the Bible?",
    "{title} in the Bible",
)
SV_ENTITY_TEMPLATES = (
    "Vad säger Bibeln om {title}?",
    "Vad är {title} i Bibeln?",
    "{title} i Bibeln",
)
GENERAL_TOPIC_WORDS = set(
    "pizza recipe recipes bitcoin crypto netflix football basketball soccer nba nfl tennis golf "
    "stock market mortgage loan resume cv javascript python excel windows laptop phone "
    "weather forecast travel flight hotel visa wedding birthday decoration diet calories "
    "workout marathon car tire engine faucet dishwasher ants carpet furniture".split()
)


def terms(text: str) -> list[str]:
    return [token for token in re.findall(r"[\w']+", text.lower()) if token not in STOP and len(token) > 1]


def clean_query(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def embedding_text(row: sqlite3.Row | dict) -> str:
    context = f"{row['book']} {row['chapter']} | {row['title']}" if row["book"] else row["title"]
    return "\n".join(part for part in (context, row["text"], row["keywords"]) if part)


def reference(row: sqlite3.Row | dict) -> str:
    return f"{row['book']} {row['chapter']}:{row['start_verse']}-{row['end_verse']}"


def fts_expression(text: str) -> str:
    tokens = terms(text)
    return " OR ".join(f'"{token}"' for token in tokens[:8])


def load_books() -> tuple[dict[int, str], list[str]]:
    connection = sqlite3.connect(READER_DB)
    try:
        rows = connection.execute("SELECT id,name FROM books ORDER BY id").fetchall()
    finally:
        connection.close()
    names = {row[0]: row[1] for row in rows}
    return names, sorted((row[1] for row in rows), key=len, reverse=True)


def load_gold(book_names: dict[int, str]) -> tuple[set[tuple[str, int, int, int]], set[str]]:
    gold = json.loads((ROOT / "scripts/hybrid-search/recall-gold.json").read_text(encoding="utf-8"))
    queries = json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    intervals = set()
    for item in gold:
        for book_id, chapter, first, last in item:
            intervals.add((book_names[book_id], chapter, first, last))
    heldout = {query.lower() for pair in queries for query in pair}
    return intervals, heldout


def overlaps(gold: set[tuple[str, int, int, int]], book: str, chapter: int, first: int, last: int) -> bool:
    return any(g_book == book and g_chapter == chapter and g_first <= last and g_last >= first
               for g_book, g_chapter, g_first, g_last in gold)


def parse_reference(ref: str, book_names: list[str]) -> tuple[str, int, int, int] | None:
    value = ref.strip().rstrip(".")
    for book in book_names:
        if value == book:
            return book, 1, 1, 999
        if value.startswith(book + " "):
            rest = value[len(book) + 1:].strip()
            match = re.match(r"^(\d+)(?::(\d+)(?:-(\d+))?)?$", rest)
            if not match:
                return None
            chapter = int(match.group(1))
            first = int(match.group(2) or 1)
            last = int(match.group(3) or first)
            return book, chapter, min(first, last), max(first, last)
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-topics", type=int, default=400)
    parser.add_argument("--eval-topics", type=int, default=120)
    parser.add_argument("--narrative", type=int, default=520)
    parser.add_argument("--entities", type=int, default=600)
    parser.add_argument("--negatives", type=int, default=2)
    parser.add_argument("--seed", type=int, default=43)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    book_names, longest_books = load_books()
    gold, heldout_queries = load_gold(book_names)
    documents = json.loads((CACHE / "tokenized-documents.json").read_text(encoding="utf-8"))
    document_by_id = {item["id"]: item for item in documents}
    passages_by_position: dict[tuple[str, int, int], dict[int, dict]] = {}
    for item in documents:
        if item["kind"] != "passage":
            continue
        passages_by_position.setdefault((item["book"], item["chapter"], item["start_verse"]), {})[item["translation_id"]] = item

    search = sqlite3.connect(SEARCH_DB)
    search.row_factory = sqlite3.Row
    study = sqlite3.connect(STUDY_DB)
    study.row_factory = sqlite3.Row

    def negative_rows(query: str, language: str, positive_ids: set[int], count: int) -> list[sqlite3.Row]:
        expression = fts_expression(query)
        table = "documents_en" if language == "en" else "documents_sv"
        if not expression:
            return []
        rows = search.execute(
            f"""SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                  FROM {table} f JOIN documents d ON d.id=f.rowid
                 WHERE {table} MATCH ? AND d.translation_id=1 AND d.kind IN ('passage','window','verse')
                 ORDER BY bm25({table},1.4,1.0,0.7), d.canonical_order LIMIT 80""",
            (expression,),
        ).fetchall()
        selected = []
        seen = set()
        for row in rows:
            text_key = row["text"].strip()
            if row["id"] in positive_ids or text_key in seen:
                continue
            if overlaps(gold, row["book"], row["chapter"], row["start_verse"], row["end_verse"]):
                continue
            seen.add(text_key)
            selected.append(row)
            if len(selected) >= count:
                break
        return selected

    def row_embedding(row: sqlite3.Row | dict) -> str:
        if isinstance(row, dict) and row.get("embeddingText"):
            return row["embeddingText"]
        return embedding_text(row)

    def add_row(
        rows: list[dict],
        queries: list[str],
        positive: sqlite3.Row | dict,
        language: str,
        source: str,
        label: str,
        negative_language: str | None = None,
        negative_query: str | None = None,
    ) -> None:
        translation_id = positive.get("translation_id", 1) if isinstance(positive, dict) else 1
        if translation_id == 1 and overlaps(gold, positive["book"], positive["chapter"], positive["start_verse"], positive["end_verse"]):
            return
        positive_text = row_embedding(positive)
        for query in queries:
            query = clean_query(query)
            if not query or query.lower() in heldout_queries:
                continue
            negatives = negative_rows(negative_query or query, negative_language or language, {positive["id"]}, args.negatives + 8)
            negative_texts = []
            for item in negatives:
                if item["book"] == positive["book"] and item["chapter"] == positive["chapter"] and \
                        item["start_verse"] <= positive["end_verse"] and item["end_verse"] >= positive["start_verse"]:
                    continue
                text = embedding_text(item)
                if text == positive_text or text in negative_texts:
                    continue
                negative_texts.append(text)
                if len(negative_texts) >= args.negatives:
                    break
            if not negative_texts:
                continue
            rows.append({
                "query": query,
                "positive": positive_text,
                "positive_id": positive["id"],
                "positive_reference": reference(positive),
                "hard_negatives": negative_texts,
                "topic": label,
                "topic_id": positive["id"],
                "source": source,
            })

    def top_documents(topic_id: int, count: int) -> list[sqlite3.Row]:
        return search.execute(
            """SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                 FROM topic_documents td JOIN documents d ON d.id=td.document_id
                WHERE td.topic_id=? AND d.translation_id=1 AND d.kind='verse'
                ORDER BY td.weight DESC, d.canonical_order LIMIT ?""",
            (topic_id, count),
        ).fetchall()

    def passage_for(verse_id: int) -> sqlite3.Row | None:
        return search.execute(
            """SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                 FROM document_verses dv JOIN documents d ON d.id=dv.document_id
                WHERE dv.verse_document_id=? AND d.translation_id=1 AND d.kind IN ('passage','window')
                ORDER BY CASE d.kind WHEN 'passage' THEN 0 ELSE 1 END LIMIT 1""",
            (verse_id,),
        ).fetchone()

    topics = search.execute(
        """SELECT t.id,t.name,COUNT(*) AS n
             FROM topics t JOIN topic_documents td ON td.topic_id=t.id
             JOIN documents d ON d.id=td.document_id
            WHERE d.translation_id=1 AND d.kind='verse'
            GROUP BY t.id HAVING n >= 3"""
    ).fetchall()
    rng.shuffle(topics)
    train_topics = topics[: args.train_topics]
    eval_topics = topics[args.train_topics:args.train_topics + args.eval_topics]

    def topic_rows(selected: list[sqlite3.Row], eval_mode: bool) -> list[dict]:
        result = []
        for topic in selected:
            topic_name = topic["name"].strip()
            if any(word in GENERAL_TOPIC_WORDS for word in terms(topic_name)):
                continue
            positives = top_documents(topic["id"], 3)
            if len(positives) < 2:
                continue
            queries = [template.format(topic=topic_name) for template in (EN_TOPIC_TEMPLATES[0], SV_TOPIC_TEMPLATES[0])]
            for positive in positives[:2]:
                add_row(result, queries, positive, "en", "topic", topic_name, negative_query=topic_name)
            passage = passage_for(positives[0]["id"])
            if passage is not None:
                add_row(result, queries, passage, "en", "topic", topic_name, negative_query=topic_name)
        return result

    training = topic_rows(train_topics, False)
    evaluation = topic_rows(eval_topics, True)
    print(json.dumps({"topic_train": len(training), "topic_eval": len(evaluation)}), flush=True)

    # Narrative title pairs: same-language and cross-language title -> passage.
    narrative_positions = [
        position for position, translations in passages_by_position.items()
        if 1 in translations and 2 in translations
        and translations[1]["title"].strip() and translations[2]["title"].strip()
        and len(translations[1]["title"]) >= 4 and len(translations[2]["title"]) >= 4
    ]
    rng.shuffle(narrative_positions)
    for position in narrative_positions[: args.narrative]:
        english = passages_by_position[position][1]
        swedish = passages_by_position[position][2]
        en_title = english["title"].strip()
        sv_title = swedish["title"].strip()
        en_queries = [template.format(title=en_title) for template in EN_NARRATIVE_TEMPLATES[:2]]
        sv_queries = [template.format(title=sv_title) for template in SV_NARRATIVE_TEMPLATES[:2]]
        add_row(training, en_queries, english, "en", "narrative", en_title)
        add_row(training, sv_queries, english, "en", "narrative", sv_title, negative_query=en_title)
        add_row(training, [EN_NARRATIVE_TEMPLATES[1].format(title=en_title)], swedish, "sv", "narrative", en_title, negative_query=sv_title)
        add_row(training, [SV_NARRATIVE_TEMPLATES[1].format(title=sv_title)], swedish, "sv", "narrative", sv_title)
    print(json.dumps({"narrative_train": len(training)}), flush=True)

    # Entity pairs from the bundled dictionary. Use the first resolvable refs.
    entity_rows = study.execute(
        "SELECT title,refs FROM entries WHERE kind='dictionary' AND length(title) BETWEEN 3 AND 48 ORDER BY title"
    ).fetchall()
    rng.shuffle(entity_rows)
    used_entities = 0
    for row in entity_rows:
        if used_entities >= args.entities:
            break
        title = row["title"].strip()
        title_key = title.lower()
        best = None
        best_score = -1
        for ref in [part.strip() for part in row["refs"].split(";") if part.strip()][:6]:
            parsed = parse_reference(ref, longest_books)
            if not parsed:
                continue
            book, chapter, first, last = parsed
            candidate = search.execute(
                """SELECT d.id,d.book,d.chapter,d.start_verse,d.end_verse,d.kind,d.title,d.text,d.keywords,d.canonical_order
                     FROM documents d
                    WHERE d.translation_id=1 AND d.kind IN ('passage','window') AND d.book=? AND d.chapter=?
                      AND d.start_verse<=? AND d.end_verse>=?
                    ORDER BY CASE d.kind WHEN 'passage' THEN 0 ELSE 1 END,
                             ABS(d.start_verse-?) LIMIT 1""",
                (book, chapter, last, first, first),
            ).fetchone()
            if not candidate or overlaps(gold, candidate["book"], candidate["chapter"], candidate["start_verse"], candidate["end_verse"]):
                continue
            score = (3 if title_key in candidate["text"].lower() else 0) + \
                    (2 if candidate["book"].lower() == title_key else 0) + \
                    (1 if title_key in (candidate["title"] or "").lower() else 0)
            if score > best_score:
                best, best_score = candidate, score
            if score >= 5:
                break
        if best is None:
            continue
        queries = [template.format(title=title) for template in (EN_ENTITY_TEMPLATES[0], SV_ENTITY_TEMPLATES[0])]
        add_row(training, queries, best, "en", "entity", title, negative_query=title)
        used_entities += 1
    print(json.dumps({"entity_train": len(training), "entities": used_entities}), flush=True)

    # Add entity/material pairs to the synthetic evaluation only if they are
    # deliberately generated from held-out narrative titles, not the real index
    # query fixtures.
    rng.shuffle(training)
    max_pairs = args.train_topics * 14
    if len(training) > max_pairs:
        training = training[:max_pairs]
    with (args.output / "train.jsonl").open("w", encoding="utf-8") as handle:
        for row in training:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (args.output / "eval.json").open("w", encoding="utf-8") as handle:
        json.dump({"topics": len(eval_topics), "rows": evaluation}, handle, ensure_ascii=False)
    recall = json.loads((ROOT / "scripts/hybrid-search/recall-queries.json").read_text(encoding="utf-8"))
    recall_gold = json.loads((ROOT / "scripts/hybrid-search/recall-gold.json").read_text(encoding="utf-8"))
    (args.output / "heldout_recall.json").write_text(
        json.dumps({"queries": recall, "gold": recall_gold}, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({
        "topics": len(topics),
        "train_topics": len(train_topics),
        "eval_topics": len(eval_topics),
        "train_pairs": len(training),
        "eval_pairs": len(evaluation),
        "narrative_positions": len(narrative_positions),
        "entity_rows": used_entities,
        "out": str(args.output),
    }, indent=2), flush=True)
    study.close()
    search.close()


if __name__ == "__main__":
    main()
