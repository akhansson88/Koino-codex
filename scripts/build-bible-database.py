#!/usr/bin/env python3
"""Build the read-only Bible SQLite asset used by the mobile app."""

from __future__ import annotations

import json
import os
import re
import sqlite3
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "assets" / "bible" / "koino-bible-v2.db"
TEMP_PATH = OUTPUT_PATH.with_suffix(".db.tmp")
TRANSLATIONS = (
    (1, "kjv", "KJV", PROJECT_ROOT / "assets" / "bible" / "kjv-verses-1769.json"),
    (
        2,
        "reformationsbibeln2026",
        "Reformationsbibeln 2026",
        PROJECT_ROOT / "assets" / "bible" / "reformationsbibeln.json",
    ),
)
CROSS_REFERENCES_PATH = (
    PROJECT_ROOT / "assets" / "bible" / "cross-references" / "cross_references.json"
)

BOOKS = (
    ("Genesis", "Gen"), ("Exodus", "Exod"), ("Leviticus", "Lev"),
    ("Numbers", "Num"), ("Deuteronomy", "Deut"), ("Joshua", "Josh"),
    ("Judges", "Judg"), ("Ruth", "Ruth"), ("1 Samuel", "1Sam"),
    ("2 Samuel", "2Sam"), ("1 Kings", "1Kgs"), ("2 Kings", "2Kgs"),
    ("1 Chronicles", "1Chr"), ("2 Chronicles", "2Chr"), ("Ezra", "Ezra"),
    ("Nehemiah", "Neh"), ("Esther", "Esth"), ("Job", "Job"),
    ("Psalms", "Ps"), ("Proverbs", "Prov"), ("Ecclesiastes", "Eccl"),
    ("Solomon's Song", "Song"), ("Isaiah", "Isa"), ("Jeremiah", "Jer"),
    ("Lamentations", "Lam"), ("Ezekiel", "Ezek"), ("Daniel", "Dan"),
    ("Hosea", "Hos"), ("Joel", "Joel"), ("Amos", "Amos"),
    ("Obadiah", "Obad"), ("Jonah", "Jonah"), ("Micah", "Mic"),
    ("Nahum", "Nah"), ("Habakkuk", "Hab"), ("Zephaniah", "Zeph"),
    ("Haggai", "Hag"), ("Zechariah", "Zech"), ("Malachi", "Mal"),
    ("Matthew", "Matt"), ("Mark", "Mark"), ("Luke", "Luke"),
    ("John", "John"), ("Acts", "Acts"), ("Romans", "Rom"),
    ("1 Corinthians", "1Cor"), ("2 Corinthians", "2Cor"),
    ("Galatians", "Gal"), ("Ephesians", "Eph"), ("Philippians", "Phil"),
    ("Colossians", "Col"), ("1 Thessalonians", "1Thess"),
    ("2 Thessalonians", "2Thess"), ("1 Timothy", "1Tim"),
    ("2 Timothy", "2Tim"), ("Titus", "Titus"), ("Philemon", "Phlm"),
    ("Hebrews", "Heb"), ("James", "Jas"), ("1 Peter", "1Pet"),
    ("2 Peter", "2Pet"), ("1 John", "1John"), ("2 John", "2John"),
    ("3 John", "3John"), ("Jude", "Jude"), ("Revelation", "Rev"),
)
BOOK_ORDER = {name: index for index, (name, _) in enumerate(BOOKS)}
BOOK_ID = {name: index + 1 for index, (name, _) in enumerate(BOOKS)}
BOOK_BY_OSIS = {osis: name for name, osis in BOOKS}
VERSE_REFERENCE = re.compile(r"^(.+) (\d+):(\d+)$")
OSIS_REFERENCE = re.compile(
    r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:-([1-3]?[A-Za-z]+)\.(\d+)\.(\d+))?$"
)


def clean_text(value: str) -> str:
    return " ".join(value.replace("#", "").split())


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;
        CREATE TABLE translations (
          id INTEGER PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL
        );
        CREATE TABLE books (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          osis TEXT NOT NULL UNIQUE,
          canonical_order INTEGER NOT NULL UNIQUE
        );
        CREATE TABLE verses (
          id INTEGER PRIMARY KEY,
          translation_id INTEGER NOT NULL REFERENCES translations(id),
          book_id INTEGER NOT NULL REFERENCES books(id),
          chapter INTEGER NOT NULL,
          verse INTEGER NOT NULL,
          text TEXT NOT NULL,
          canonical_order INTEGER NOT NULL,
          UNIQUE (translation_id, book_id, chapter, verse)
        );
        CREATE INDEX verses_chapter_idx
          ON verses (translation_id, book_id, chapter, verse);
        CREATE TABLE chapters (
          id INTEGER PRIMARY KEY,
          translation_id INTEGER NOT NULL REFERENCES translations(id),
          book_id INTEGER NOT NULL REFERENCES books(id),
          chapter INTEGER NOT NULL,
          heading TEXT,
          UNIQUE (translation_id, book_id, chapter)
        );
        CREATE INDEX chapters_lookup_idx
          ON chapters (translation_id, book_id, chapter);
        CREATE TABLE chapter_subtitles (
          id INTEGER PRIMARY KEY,
          chapter_id INTEGER NOT NULL REFERENCES chapters(id),
          before_verse INTEGER NOT NULL,
          text TEXT NOT NULL,
          display_order INTEGER NOT NULL
        );
        CREATE INDEX chapter_subtitles_chapter_idx
          ON chapter_subtitles (chapter_id, before_verse, display_order);
        CREATE TABLE verse_footnotes (
          id INTEGER PRIMARY KEY,
          verse_id INTEGER NOT NULL REFERENCES verses(id),
          marker TEXT NOT NULL,
          text TEXT NOT NULL,
          display_order INTEGER NOT NULL,
          UNIQUE (verse_id, marker)
        );
        CREATE INDEX verse_footnotes_verse_idx
          ON verse_footnotes (verse_id, display_order);
        CREATE VIRTUAL TABLE verse_search USING fts5(
          text,
          content='verses',
          content_rowid='id',
          tokenize='unicode61 remove_diacritics 2'
        );
        CREATE TABLE cross_references (
          id INTEGER PRIMARY KEY,
          source_book_id INTEGER NOT NULL REFERENCES books(id),
          source_chapter INTEGER NOT NULL,
          source_verse INTEGER NOT NULL,
          target_book_id INTEGER NOT NULL REFERENCES books(id),
          target_chapter INTEGER NOT NULL,
          target_verse INTEGER NOT NULL,
          target_end_book_id INTEGER REFERENCES books(id),
          target_end_chapter INTEGER,
          target_end_verse INTEGER,
          votes INTEGER NOT NULL
        );
        CREATE INDEX cross_references_source_idx
          ON cross_references (source_book_id, source_chapter, source_verse, votes DESC);
        """
    )


def insert_verses(connection: sqlite3.Connection) -> None:
    connection.executemany(
        "INSERT INTO books (id, name, osis, canonical_order) VALUES (?, ?, ?, ?)",
        ((index + 1, name, osis, index) for index, (name, osis) in enumerate(BOOKS)),
    )
    next_verse_id = 1
    next_chapter_id = 1
    next_subtitle_id = 1
    next_footnote_id = 1
    for translation_id, translation_code, label, source_path in TRANSLATIONS:
        connection.execute(
            "INSERT INTO translations (id, code, label) VALUES (?, ?, ?)",
            (translation_id, translation_code, label),
        )
        with source_path.open(encoding="utf-8") as source_file:
            source = json.load(source_file)

        verse_rows = []
        chapter_rows = []
        subtitle_rows = []
        footnote_rows = []
        if isinstance(source.get("books") if isinstance(source, dict) else None, list):
            source_books = source["books"]
            if len(source_books) != len(BOOKS):
                raise ValueError(f"{source_path.name}: expected {len(BOOKS)} books, found {len(source_books)}")

            for source_book in source_books:
                book_number = int(source_book["number"])
                if not 1 <= book_number <= len(BOOKS):
                    raise ValueError(f"{source_path.name}: invalid book number {book_number}")
                book, _ = BOOKS[book_number - 1]
                book_id = BOOK_ID[book]
                for source_chapter in source_book.get("chapters", []):
                    chapter = int(source_chapter["number"])
                    chapter_id = next_chapter_id
                    next_chapter_id += 1
                    heading = clean_text(source_chapter.get("heading", "")) or None
                    chapter_rows.append((chapter_id, translation_id, book_id, chapter, heading))

                    for display_order, subtitle in enumerate(source_chapter.get("subtitles", [])):
                        subtitle_rows.append(
                            (
                                next_subtitle_id,
                                chapter_id,
                                int(subtitle["before_verse"]),
                                clean_text(subtitle["text"]),
                                display_order,
                            )
                        )
                        next_subtitle_id += 1

                    for source_verse in source_chapter.get("verses", []):
                        verse = int(source_verse["number"])
                        verse_id = next_verse_id
                        next_verse_id += 1
                        canonical_order = (book_number - 1) * 1_000_000 + chapter * 1_000 + verse
                        verse_rows.append(
                            (
                                verse_id,
                                translation_id,
                                book_id,
                                chapter,
                                verse,
                                clean_text(source_verse["text"]),
                                canonical_order,
                            )
                        )
                        for display_order, footnote in enumerate(source_verse.get("footnotes", [])):
                            footnote_rows.append(
                                (
                                    next_footnote_id,
                                    verse_id,
                                    footnote["marker"].strip(),
                                    clean_text(footnote["text"]),
                                    display_order,
                                )
                            )
                            next_footnote_id += 1
        else:
            seen_chapters = set()
            for reference, text in source.items():
                match = VERSE_REFERENCE.match(reference)
                if match is None or match.group(1) not in BOOK_ORDER:
                    continue
                book = match.group(1)
                chapter = int(match.group(2))
                verse = int(match.group(3))
                book_order = BOOK_ORDER[book]
                canonical_order = book_order * 1_000_000 + chapter * 1_000 + verse
                verse_rows.append(
                    (
                        next_verse_id,
                        translation_id,
                        BOOK_ID[book],
                        chapter,
                        verse,
                        clean_text(text),
                        canonical_order,
                    )
                )
                next_verse_id += 1
                seen_chapters.add((BOOK_ID[book], chapter))

            for book_id, chapter in sorted(seen_chapters):
                chapter_rows.append((next_chapter_id, translation_id, book_id, chapter, None))
                next_chapter_id += 1

        connection.executemany(
            """
            INSERT INTO verses
              (id, translation_id, book_id, chapter, verse, text, canonical_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            verse_rows,
        )
        connection.executemany(
            "INSERT INTO chapters (id, translation_id, book_id, chapter, heading) VALUES (?, ?, ?, ?, ?)",
            chapter_rows,
        )
        connection.executemany(
            """
            INSERT INTO chapter_subtitles
              (id, chapter_id, before_verse, text, display_order)
            VALUES (?, ?, ?, ?, ?)
            """,
            subtitle_rows,
        )
        connection.executemany(
            """
            INSERT INTO verse_footnotes
              (id, verse_id, marker, text, display_order)
            VALUES (?, ?, ?, ?, ?)
            """,
            footnote_rows,
        )

    connection.execute(
        "INSERT INTO verse_search (rowid, text) SELECT id, text FROM verses"
    )


def parse_osis_position(value: str):
    parts = value.split(".")
    if len(parts) != 3 or parts[0] not in BOOK_BY_OSIS:
        return None
    try:
        return BOOK_ID[BOOK_BY_OSIS[parts[0]]], int(parts[1]), int(parts[2])
    except ValueError:
        return None


def insert_cross_references(connection: sqlite3.Connection) -> None:
    with CROSS_REFERENCES_PATH.open(encoding="utf-8") as source_file:
        source = json.load(source_file)

    rows = []
    next_id = 1
    for source_reference, references in source.get("references", {}).items():
        source_position = parse_osis_position(source_reference)
        if source_position is None:
            continue
        for reference in references:
            target = OSIS_REFERENCE.match(reference.get("verse", ""))
            if target is None:
                continue
            target_book = BOOK_BY_OSIS.get(target.group(1))
            target_end_book = BOOK_BY_OSIS.get(target.group(4)) if target.group(4) else None
            if target_book is None or (target.group(4) and target_end_book is None):
                continue
            rows.append(
                (
                    next_id,
                    *source_position,
                    BOOK_ID[target_book],
                    int(target.group(2)),
                    int(target.group(3)),
                    BOOK_ID[target_end_book] if target_end_book else None,
                    int(target.group(5)) if target.group(5) else None,
                    int(target.group(6)) if target.group(6) else None,
                    int(reference.get("votes", 0)),
                )
            )
            next_id += 1
            if len(rows) >= 10_000:
                connection.executemany(
                    """
                    INSERT INTO cross_references (
                      id, source_book_id, source_chapter, source_verse,
                      target_book_id, target_chapter, target_verse,
                      target_end_book_id, target_end_chapter, target_end_verse,
                      votes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )
                rows.clear()

    if rows:
        connection.executemany(
            """
            INSERT INTO cross_references (
              id, source_book_id, source_chapter, source_verse,
              target_book_id, target_chapter, target_verse,
              target_end_book_id, target_end_chapter, target_end_verse,
              votes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEMP_PATH.unlink(missing_ok=True)
    connection = sqlite3.connect(TEMP_PATH)
    try:
        create_schema(connection)
        insert_verses(connection)
        insert_cross_references(connection)
        connection.execute("PRAGMA user_version = 2")
        connection.execute("ANALYZE")
        connection.execute("PRAGMA optimize")
        connection.commit()
    finally:
        connection.close()

    os.replace(TEMP_PATH, OUTPUT_PATH)
    print(f"Built {OUTPUT_PATH.relative_to(PROJECT_ROOT)} ({OUTPUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        TEMP_PATH.unlink(missing_ok=True)
        raise
