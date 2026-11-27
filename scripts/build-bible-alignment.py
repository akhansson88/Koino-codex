#!/usr/bin/env python3
"""Build the cross-translation verse alignment used by the split reader.

The alignment is structural, not word-for-word: translations follow the same
underlying text but split, merge, skip and number verses differently. A dynamic
programming pass over verse lengths finds those boundaries; the result is stored
as fractional links so the app can map "verse 4, 35% down" from one translation
to the exact place in another.

Usage:
    python scripts/build-bible-alignment.py <database.db>

The script is idempotent: it drops and recreates the alignment tables.
"""

from __future__ import annotations

import math
import re
import sqlite3
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

# The pivot every translation is aligned to. Version ids match translations.id.
PIVOT = 1  # KJV

# Translations that get their own direct links to and from the pivot.
TARGETS = (2, 3, 4)  # Reformationsbibeln 2026, SFB15, NKJV

# A psalm superscription is a separate verse in the Swedish translations and
# not a verse in KJV. It is always at the start and can be one or two verses.
PSALM_TITLE = re.compile(
    r"^(För körledaren|En psalm|En sång|En bön|En vishetspsalm|En klagopsalm|"
    r"Av David|Bön av|Davids psalm|En vallfartssång)"
)
PSALM_TITLE_CONTINUATION = re.compile(r"^(Av |när |efter |till |som |och )")

# DP weights. Tuned against the known problem chapters; see the test file.
MATCH_DIAGONAL_PENALTY = 0.55
MERGE_PENALTY = 0.40
SKIP_PENALTY = 0.90
CHAPTER_PENALTY = 0.0

WORD = re.compile(r"[A-Za-zÅÄÖåäöØøÆæ0-9]+")


@dataclass(frozen=True)
class Verse:
    translation: int
    chapter: int
    verse: int
    length: int
    text: str


def word_count(text: str) -> int:
    # NFKC keeps Swedish letters intact; counting words is language-independent.
    return len(WORD.findall(unicodedata.normalize("NFKC", text)))


def load_book(connection: sqlite3.Connection, translation: int, book: str) -> list[Verse]:
    rows = connection.execute(
        """
        SELECT v.chapter, v.verse, v.text
          FROM verses v
          JOIN books b ON b.id = v.book_id
         WHERE v.translation_id = ? AND b.name = ?
         ORDER BY v.chapter, v.verse
        """,
        (translation, book),
    ).fetchall()
    return [Verse(translation, chapter, verse, word_count(text), text) for chapter, verse, text in rows]


def length_distance(left: int, right: int) -> float:
    if left <= 0 or right <= 0:
        return 1.0
    return abs(left - right) / max(left, right)


def psalm_title_count(verses: list[Verse]) -> int:
    """How many leading verses of this psalm are a superscription.

    Only called for a chapter whose Swedish verse count differs from KJV, where
    the title is a separate verse. Most psalms have a one-verse title; Ps 51,
    52, 54 and 60 split it over two verses, and the second begins with a
    continuation such as "när ..." or "Av David ...".
    """
    if not verses or not PSALM_TITLE.match(verses[0].text):
        return 0
    count = 1
    if len(verses) > 1 and PSALM_TITLE_CONTINUATION.match(verses[1].text):
        count = 2
    return count


@dataclass
class Operation:
    kind: str  # match | merge | split | skipA | skipB
    a: list[Verse]
    b: list[Verse]


def align(a: list[Verse], b: list[Verse]) -> list[Operation]:
    """Align two verse sequences with 1:1, 1:2, 2:1, 1:0 and 0:1 moves."""
    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return [Operation("skipA", [verse], []) for verse in a] + [Operation("skipB", [], [verse]) for verse in b]

    INF = math.inf
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    back: list[list[tuple[str, int, int] | None]] = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0

    def chapter_cost(left: Verse, right: Verse) -> float:
        return 0.0 if left.chapter == right.chapter else CHAPTER_PENALTY

    for i in range(n + 1):
        for j in range(m + 1):
            current = dp[i][j]
            if current == INF:
                continue
            if i < n and j < m:
                expected = i * m / n if n else 0
                diagonal = 0.0 if abs(j - expected) < 1.01 else MATCH_DIAGONAL_PENALTY
                cost = current + length_distance(a[i].length, b[j].length) + diagonal + chapter_cost(a[i], b[j])
                if cost < dp[i + 1][j + 1]:
                    dp[i + 1][j + 1] = cost
                    back[i + 1][j + 1] = ("match", i, j)
            if i < n:
                cost = current + SKIP_PENALTY
                if cost < dp[i + 1][j]:
                    dp[i + 1][j] = cost
                    back[i + 1][j] = ("skipA", i, j)
            if j < m:
                cost = current + SKIP_PENALTY
                if cost < dp[i][j + 1]:
                    dp[i][j + 1] = cost
                    back[i][j + 1] = ("skipB", i, j)
            if i < n and j + 1 < m:
                cost = current + length_distance(a[i].length, b[j].length + b[j + 1].length) + MERGE_PENALTY + chapter_cost(a[i], b[j])
                if cost < dp[i + 1][j + 2]:
                    dp[i + 1][j + 2] = cost
                    back[i + 1][j + 2] = ("merge", i, j)
            if i + 1 < n and j < m:
                cost = current + length_distance(a[i].length + a[i + 1].length, b[j].length) + MERGE_PENALTY + chapter_cost(a[i], b[j])
                if cost < dp[i + 2][j + 1]:
                    dp[i + 2][j + 1] = cost
                    back[i + 2][j + 1] = ("split", i, j)

    operations: list[Operation] = []
    i, j = n, m
    while i > 0 or j > 0:
        step = back[i][j]
        if step is None:
            raise RuntimeError(f"alignment has no predecessor at {i},{j}")
        kind, previous_i, previous_j = step
        if kind == "match":
            operations.append(Operation(kind, [a[previous_i]], [b[previous_j]]))
        elif kind == "skipA":
            operations.append(Operation(kind, [a[previous_i]], []))
        elif kind == "skipB":
            operations.append(Operation(kind, [], [b[previous_j]]))
        elif kind == "merge":
            operations.append(Operation(kind, [a[previous_i]], [b[previous_j], b[previous_j + 1]]))
        elif kind == "split":
            operations.append(Operation(kind, [a[previous_i], a[previous_i + 1]], [b[previous_j]]))
        else:  # pragma: no cover - defensive
            raise RuntimeError(kind)
        i, j = previous_i, previous_j
    operations.reverse()
    return operations


def links_for_operation(operation: Operation) -> list[tuple[Verse, Verse, float, float, float, float, float]]:
    """Return (source, target, source_start, source_end, target_start, target_end, confidence)."""
    source = operation.a
    target = operation.b
    if operation.kind == "match" and source and target:
        confidence = 1.0 - length_distance(source[0].length, target[0].length)
        return [(source[0], target[0], 0.0, 1.0, 0.0, 1.0, confidence)]
    if operation.kind == "merge" and len(source) == 1 and len(target) == 2:
        first = target[0].length
        second = target[1].length
        total = max(1, first + second)
        split = first / total
        confidence = 1.0 - length_distance(source[0].length, first + second)
        return [
            (source[0], target[0], 0.0, split, 0.0, 1.0, confidence),
            (source[0], target[1], split, 1.0, 0.0, 1.0, confidence),
        ]
    if operation.kind == "split" and len(source) == 2 and len(target) == 1:
        first = source[0].length
        second = source[1].length
        total = max(1, first + second)
        split = first / total
        confidence = 1.0 - length_distance(first + second, target[0].length)
        return [
            (source[0], target[0], 0.0, 1.0, 0.0, split, confidence),
            (source[1], target[0], 0.0, 1.0, split, 1.0, confidence),
        ]
    return []


def nearest_target(source: Verse, target_verses: list[Verse]) -> Verse | None:
    """Fallback for a verse with no counterpart (a title, or an omitted verse)."""
    same_chapter = [verse for verse in target_verses if verse.chapter == source.chapter]
    if not same_chapter:
        return None
    following = [verse for verse in same_chapter if verse.verse >= source.verse]
    if following:
        return following[0]
    return same_chapter[-1]


def build_directed_links(
    source: list[Verse],
    target: list[Verse],
    operations: list[Operation],
    *,
    title_verses: set[tuple[int, int]] | None = None,
) -> list[tuple]:
    rows: list[tuple] = []
    target_by_key = {(verse.chapter, verse.verse): verse for verse in target}

    for operation in operations:
        for source_verse, target_verse, source_start, source_end, target_start, target_end, confidence in links_for_operation(operation):
            rows.append((
                source_verse,
                target_verse,
                source_start,
                source_end,
                target_start,
                target_end,
                confidence,
                False,
                False,
            ))
        # A verse only one side has: point it at the nearest verse of the other
        # side, zero-width, and mark the result approximate.
        if operation.kind in ("skipA", "skipB"):
            source_verse = operation.a[0] if operation.a else None
            target_verse = operation.b[0] if operation.b else None
            if source_verse and target_verse is None:
                fallback = nearest_target(source_verse, target)
                if fallback:
                    rows.append((source_verse, fallback, 0.0, 1.0, 0.0, 0.0, 0.0, True, False))
            elif target_verse and source_verse is None:
                fallback = nearest_target(target_verse, source)
                if fallback:
                    rows.append((fallback, target_verse, 0.0, 0.0, 0.0, 1.0, 0.0, True, False))

    # Titles are not part of the DP input; attach each one to the first content
    # verse of the psalm so scrolling to a title still lands on the psalm.
    if title_verses:
        content_by_chapter: dict[int, Verse] = {}
        for verse in target:
            content_by_chapter.setdefault(verse.chapter, verse)
        for chapter, verse_number in sorted(title_verses):
            source_verse = next((verse for verse in source if verse.chapter == chapter and verse.verse == verse_number), None)
            target_verse = content_by_chapter.get(chapter)
            if source_verse and target_verse:
                rows.append((source_verse, target_verse, 0.0, 1.0, 0.0, 0.0, 0.0, True, False))

    # Every verse must resolve. Add a clamped same-number fallback for anything
    # still missing (defensive; the DP normally covers every verse).
    covered = {(row[0].chapter, row[0].verse) for row in rows}
    for source_verse in source:
        if (source_verse.chapter, source_verse.verse) in covered:
            continue
        target_verse = target_by_key.get((source_verse.chapter, source_verse.verse)) or nearest_target(source_verse, target)
        if target_verse:
            rows.append((source_verse, target_verse, 0.0, 1.0, 0.0, 0.0, 0.0, True, False))

    return rows


def invert_rows(rows: list[tuple]) -> list[tuple]:
    inverted = []
    for source_verse, target_verse, source_start, source_end, target_start, target_end, confidence, approximate, cross_chapter in rows:
        inverted.append((
            target_verse,
            source_verse,
            target_start,
            target_end,
            source_start,
            source_end,
            confidence,
            approximate,
            cross_chapter or source_verse.chapter != target_verse.chapter,
        ))
    return inverted


def create_tables(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        DROP TABLE IF EXISTS verse_links;
        CREATE TABLE verse_links (
          id INTEGER PRIMARY KEY,
          source_translation_id INTEGER NOT NULL,
          target_translation_id INTEGER NOT NULL,
          book_id INTEGER NOT NULL,
          source_chapter INTEGER NOT NULL,
          source_verse INTEGER NOT NULL,
          target_chapter INTEGER NOT NULL,
          target_verse INTEGER NOT NULL,
          source_start REAL NOT NULL,
          source_end REAL NOT NULL,
          target_start REAL NOT NULL,
          target_end REAL NOT NULL,
          confidence REAL NOT NULL,
          approximate INTEGER NOT NULL,
          cross_chapter INTEGER NOT NULL
        );
        CREATE INDEX verse_links_lookup
          ON verse_links (source_translation_id, book_id, source_chapter, source_verse, source_start);
        CREATE INDEX verse_links_reverse
          ON verse_links (target_translation_id, book_id, target_chapter, target_verse);
        """
    )


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: build-bible-alignment.py <database.db>")
    path = Path(sys.argv[1])
    if not path.exists():
        raise SystemExit(f"database not found: {path}")

    connection = sqlite3.connect(path)
    try:
        create_tables(connection)
        books = [row[0] for row in connection.execute("SELECT name FROM books ORDER BY canonical_order")]
        book_ids = {row[1]: row[0] for row in connection.execute("SELECT id, name FROM books")}
        translations = {row[0] for row in connection.execute("SELECT id FROM translations")}
        missing = [translation for translation in (PIVOT, *TARGETS) if translation not in translations]
        if missing:
            raise SystemExit(f"missing translations: {missing}")

        insert_rows: list[tuple] = []
        for book in books:
            pivot = load_book(connection, PIVOT, book)
            for target_id in TARGETS:
                target = load_book(connection, target_id, book)
                if not pivot or not target:
                    continue
                if book == "Psalms":
                    # Work chapter by chapter: only a chapter whose count differs
                    # can have a separate title verse. In Ps 23 the title is part
                    # of verse 1 in both translations and must not be removed.
                    pivot_by_chapter: dict[int, list[Verse]] = {}
                    target_by_chapter: dict[int, list[Verse]] = {}
                    for verse in pivot:
                        pivot_by_chapter.setdefault(verse.chapter, []).append(verse)
                    for verse in target:
                        target_by_chapter.setdefault(verse.chapter, []).append(verse)
                    rows = []
                    for chapter in sorted(target_by_chapter):
                        target_chapter = target_by_chapter[chapter]
                        pivot_chapter = pivot_by_chapter.get(chapter, [])
                        if not pivot_chapter:
                            continue
                        if len(target_chapter) == len(pivot_chapter):
                            rows.extend(build_directed_links(target_chapter, pivot_chapter, align(target_chapter, pivot_chapter)))
                            continue
                        title_count = psalm_title_count(target_chapter)
                        remaining = target_chapter[title_count:]
                        rows.extend(build_directed_links(remaining, pivot_chapter, align(remaining, pivot_chapter)))
                        for title_verse in target_chapter[:title_count]:
                            rows.append((title_verse, pivot_chapter[0], 0.0, 1.0, 0.0, 0.0, 0.0, True, False))
                elif book == "Revelation":
                    # Revelation 12:18 in Swedish is the first half of KJV 13:1,
                    # so this book needs one alignment across chapter borders.
                    rows = build_directed_links(target, pivot, align(target, pivot))
                else:
                    # Per chapter. A book-wide pass can drift at a chapter
                    # boundary (Ezra 1 -> 2) even when the counts agree.
                    pivot_by_chapter = {}
                    target_by_chapter = {}
                    for verse in pivot:
                        pivot_by_chapter.setdefault(verse.chapter, []).append(verse)
                    for verse in target:
                        target_by_chapter.setdefault(verse.chapter, []).append(verse)
                    rows = []
                    for chapter in sorted(target_by_chapter):
                        target_chapter = target_by_chapter[chapter]
                        pivot_chapter = pivot_by_chapter.get(chapter, [])
                        if not pivot_chapter:
                            continue
                        if len(target_chapter) == len(pivot_chapter):
                            for target_verse, pivot_verse in zip(target_chapter, pivot_chapter):
                                confidence = 1.0 - length_distance(target_verse.length, pivot_verse.length)
                                rows.append((target_verse, pivot_verse, 0.0, 1.0, 0.0, 1.0, confidence, False, False))
                        else:
                            rows.extend(build_directed_links(target_chapter, pivot_chapter, align(target_chapter, pivot_chapter)))
                # Titles are one-way: the pivot has no title verse to map back
                # to. Invert only the content rows so KJV Ps 3:1 -> SFB15 3:2,
                # never back to the title at 3:1.
                reverse_rows = list(rows)
                if book == "Psalms":
                    reverse_rows = [row for row in rows if not (row[2] == 0.0 and row[3] == 1.0 and row[4] == 0.0 and row[5] == 0.0)]

                # Forward links (target -> pivot).
                for row in rows:
                    source_verse, target_verse, source_start, source_end, target_start, target_end, confidence, approximate, _ = row
                    insert_rows.append((
                        target_id,
                        PIVOT,
                        book_ids[book],
                        source_verse.chapter,
                        source_verse.verse,
                        target_verse.chapter,
                        target_verse.verse,
                        source_start,
                        source_end,
                        target_start,
                        target_end,
                        confidence,
                        1 if approximate else 0,
                        1 if source_verse.chapter != target_verse.chapter else 0,
                    ))
                # Reverse links (pivot -> target).
                for row in invert_rows(reverse_rows):
                    source_verse, target_verse, source_start, source_end, target_start, target_end, confidence, approximate, cross_chapter = row
                    insert_rows.append((
                        PIVOT,
                        target_id,
                        book_ids[book],
                        source_verse.chapter,
                        source_verse.verse,
                        target_verse.chapter,
                        target_verse.verse,
                        source_start,
                        source_end,
                        target_start,
                        target_end,
                        confidence,
                        1 if approximate else 0,
                        1 if cross_chapter else 0,
                    ))

                if len(insert_rows) >= 20_000:
                    connection.executemany(
                        """
                        INSERT INTO verse_links (
                          source_translation_id, target_translation_id, book_id,
                          source_chapter, source_verse, target_chapter, target_verse,
                          source_start, source_end, target_start, target_end,
                          confidence, approximate, cross_chapter
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        insert_rows,
                    )
                    insert_rows.clear()

        if insert_rows:
            connection.executemany(
                """
                INSERT INTO verse_links (
                  source_translation_id, target_translation_id, book_id,
                  source_chapter, source_verse, target_chapter, target_verse,
                  source_start, source_end, target_start, target_end,
                  confidence, approximate, cross_chapter
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                insert_rows,
            )

        connection.execute("ANALYZE")
        connection.commit()
        count = connection.execute("SELECT COUNT(*) FROM verse_links").fetchone()[0]
        print(f"Built {count:,} verse links in {path.name}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
