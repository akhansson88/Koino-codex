#!/usr/bin/env python3
"""Convert Christian Mölk's SFB15 Logos personal-book Word file into KOINO's JSON source.

The source is a public download from christianmolk.se (SFB15.docx). Each paragraph
carries Logos personal-book milestones such as [[@BibleBIBEL82:Gen 1:1]]; verse
text is wrapped in {{field-on:bible}}/{{field-off:bible}}. Poetry continues on
following paragraphs without a milestone, so those lines append to the open verse.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import docx

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = PROJECT_ROOT / "assets" / "bible" / "SFB15.docx"
OUTPUT_PATH = PROJECT_ROOT / "assets" / "bible" / "sfb15.json"

BOOKS = (
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam",
    "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job",
    "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan",
    "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph",
    "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John", "Acts", "Rom",
    "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess",
    "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet",
    "1John", "2John", "3John", "Jude", "Rev",
)
BOOK_NUMBER = {osis: index + 1 for index, osis in enumerate(BOOKS)}

MILESTONE = re.compile(r"\[\[@BibleBIBEL82:([1-3]?[A-Za-z]+)(?: (\d+))?(?::(\d+))?\]\]")
FIELD = re.compile(r"\{\{field-(?:on|off):[^}]+\}\}")
LEADING_VERSE = re.compile(r"^\s*(\d+)\s*")
WHITESPACE = re.compile(r"\s+")


def clean(value: str) -> str:
    return WHITESPACE.sub(" ", FIELD.sub("", value)).strip()


def main() -> None:
    document = docx.Document(SOURCE_PATH)
    paragraphs = [(paragraph.style.name, paragraph.text) for paragraph in document.paragraphs]

    books: list[dict] = []
    book: dict | None = None
    chapter: dict | None = None
    verse: dict | None = None
    pending_subtitles: list[str] = []
    seen_books: dict[str, dict] = {}

    def close_chapter() -> None:
        nonlocal chapter, verse, pending_subtitles
        chapter = None
        verse = None
        pending_subtitles = []

    for style, text in paragraphs:
        if style == "Heading 1":
            match = MILESTONE.search(text)
            if not match or match.group(2) is not None:
                continue
            close_chapter()
            osis = match.group(1)
            number = BOOK_NUMBER[osis]
            name = clean(text[match.end():])
            book = {"number": number, "name": name, "abbreviation": osis, "chapters": []}
            books.append(book)
            seen_books[osis] = book
            continue

        if style == "Heading 2":
            match = MILESTONE.search(text)
            if not match or match.group(2) is None or match.group(3) is not None:
                continue
            if book is None:
                raise ValueError(f"Chapter before book: {text!r}")
            close_chapter()
            chapter = {"number": int(match.group(2)), "heading": None, "subtitles": [], "verses": []}
            book["chapters"].append(chapter)
            continue

        if style == "Heading 3":
            label = clean(text).lstrip("#").strip()
            if label:
                pending_subtitles.append(label)
            continue

        if style != "Normal" or ("BibleBIBEL82" not in text and "field-on:bible" not in text):
            continue

        parts = re.split(r"(\[\[@BibleBIBEL82:[^\]]+\]\])", text)
        for part in parts:
            milestone = MILESTONE.fullmatch(part)
            if milestone:
                osis, chapter_number, verse_number = milestone.group(1), milestone.group(2), milestone.group(3)
                if chapter_number is None:
                    continue
                if book is None or osis != BOOKS[(book["number"] - 1)]:
                    raise ValueError(f"Unexpected book milestone {part!r} in {book['name'] if book else 'none'}")
                chapter_number = int(chapter_number)
                if chapter is None or chapter["number"] != chapter_number:
                    close_chapter()
                    # Reuse an existing chapter when the doc links back to it.
                    chapter = next((item for item in book["chapters"] if item["number"] == chapter_number), None)
                    if chapter is None:
                        chapter = {"number": chapter_number, "heading": None, "subtitles": [], "verses": []}
                        book["chapters"].append(chapter)
                if verse_number is not None:
                    verse = {"number": int(verse_number), "text": ""}
                    chapter["verses"].append(verse)
                    for subtitle in pending_subtitles:
                        chapter["subtitles"].append({"before_verse": verse["number"], "text": subtitle})
                    pending_subtitles = []
                continue

            if verse is None:
                continue
            piece = clean(part)
            if not piece:
                continue
            if not verse["text"]:
                match = LEADING_VERSE.match(piece)
                if match:
                    if int(match.group(1)) != verse["number"]:
                        raise ValueError(
                            f"Verse number mismatch at {book['name']} {chapter['number']}:{verse['number']}: {piece[:60]!r}"
                        )
                    piece = piece[match.end():]
            if piece:
                verse["text"] = f"{verse['text']} {piece}".strip()

    for book in books:
        book["chapters"].sort(key=lambda item: item["number"])
        for chapter in book["chapters"]:
            chapter["verses"].sort(key=lambda item: item["number"])
            seen: set[int] = set()
            for item in chapter["verses"]:
                if item["number"] in seen:
                    raise ValueError(f"Duplicate verse {book['number']} {chapter['number']}:{item['number']}")
                seen.add(item["number"])
                if not item["text"]:
                    raise ValueError(f"Empty verse {book['name']} {chapter['number']}:{item['number']}")

    if len(books) != 66:
        raise ValueError(f"Expected 66 books, found {len(books)}")
    if len(seen_books) != 66:
        raise ValueError("Duplicate book milestones")

    chapter_total = sum(len(book["chapters"]) for book in books)
    verse_total = sum(len(chapter["verses"]) for book in books for chapter in book["chapters"])
    subtitle_total = sum(len(chapter["subtitles"]) for book in books for chapter in book["chapters"])
    if chapter_total != 1189:
        raise ValueError(f"Expected 1189 chapters, found {chapter_total}")

    payload = {
        "translation": "Svenska Folkbibeln 2015",
        "language": "sv",
        "source": {
            "document": "https://www.christianmolk.se/wp-content/uploads/2026/11/SFB15.docx",
            "page": "https://www.christianmolk.se/2022/10/svenska-folkbibeln-2015-till-logos-bible-software/",
            "format": "Logos Personal Book 2.0",
            "copyright": "Copyright © 2015 by Svenska Folkbibeln Foundation.",
        },
        "counts": {"books": len(books), "chapters": chapter_total, "verses": verse_total},
        "books": books,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)}: {len(books)} books, {chapter_total} chapters, {verse_total} verses, {subtitle_total} subtitles")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise
