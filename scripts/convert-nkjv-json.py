#!/usr/bin/env python3
"""Convert the thiagobodruk/bible NKJV JSON into KOINO's flat verse source.

Source: https://github.com/thiagobodruk/bible (807 stars, the most-starred
public Bible JSON repository that ships an NKJV file), json/en_nkjv.json.
The source is an array of 66 books in canonical order, each with chapters as
arrays of verse strings; KOINO stores a flat {"Genesis 1:1": "..."} map, the
same shape as kjv-verses-1769.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = PROJECT_ROOT / "assets" / "bible" / "nkjv-thiagobodruk.json"
OUTPUT_PATH = PROJECT_ROOT / "assets" / "bible" / "nkjv-verses.json"

BOOKS = (
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
    "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
    "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
    "Psalms", "Proverbs", "Ecclesiastes", "Solomon's Song", "Isaiah",
    "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
    "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
    "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
    "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
)


def main() -> None:
    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8-sig"))
    if not isinstance(source, list) or len(source) != len(BOOKS):
        raise ValueError(f"Expected {len(BOOKS)} books, found {len(source) if isinstance(source, list) else type(source)}")

    verses: dict[str, str] = {}
    flagged: list[tuple[str, str]] = []
    for index, book in enumerate(source):
        name = BOOKS[index]
        chapters = book.get("chapters")
        if not isinstance(chapters, list) or not chapters:
            raise ValueError(f"{name}: missing chapters")
        for chapter_number, chapter in enumerate(chapters, start=1):
            if not isinstance(chapter, list) or not chapter:
                raise ValueError(f"{name} {chapter_number}: missing verses")
            for verse_number, text in enumerate(chapter, start=1):
                if not isinstance(text, str) or not text.strip():
                    raise ValueError(f"{name} {chapter_number}:{verse_number}: empty text")
                key = f"{name} {chapter_number}:{verse_number}"
                if key in verses:
                    raise ValueError(f"Duplicate {key}")
                clean = " ".join(text.split())
                verses[key] = clean
                if "<" in clean or "&" in clean or "{" in clean or "[" in clean:
                    flagged.append((key, clean[:120]))

    expected = 31102
    if len(verses) != expected:
        raise ValueError(f"Expected {expected} verses, found {len(verses)}")

    OUTPUT_PATH.write_text(
        "{\n" + ",\n".join(json.dumps(key, ensure_ascii=False) + ":" + json.dumps(value, ensure_ascii=False) for key, value in verses.items()) + "\n}\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)}: {len(verses)} verses")
    if flagged:
        print(f"Markup-like text in {len(flagged)} verses (first 5):")
        for key, text in flagged[:5]:
            print(" ", key, "|", text)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise
