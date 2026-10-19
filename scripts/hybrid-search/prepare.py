#!/usr/bin/env python3
"""Prepare deterministic bilingual search documents from immutable source assets."""
from __future__ import annotations

import bisect
import argparse
from collections import defaultdict
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import zipfile

from versification import mapping, MAPPING_REVISION

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
CACHE = ASSETS / ".cache"
USFM_BOOKS = "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split()


def clean(value):
    return " ".join(re.sub(r"[\[\]*#]", "", value).split())


def english_sections():
    sections = defaultdict(dict)
    with zipfile.ZipFile(ASSETS / "sources/bsb_usfm.zip") as archive:
        for name in sorted(archive.namelist()):
            code = Path(name).stem
            if code not in USFM_BOOKS:
                continue
            book = USFM_BOOKS.index(code) + 1
            text = archive.read(name).decode("utf-8-sig")
            # Footnotes and cross-references contain reference/verse-like markers.
            text = re.sub(r"\\(?:f|x) .*?\\(?:f|x)\*", "", text, flags=re.S)
            chapter = 0
            pending = []
            for marker in re.finditer(r"\\c\s+(\d+)|\\s[1-5]?\s+([^\r\n]+)|\\v\s+(\d+)(?:-\d+)?", text):
                if marker[1]:
                    chapter = int(marker[1])
                elif marker[2]:
                    pending.append(clean(re.sub(r"\\[a-z0-9]+\*?", "", marker[2])))
                elif pending and chapter:
                    key = (book, chapter)
                    sections[key][int(marker[3])] = " · ".join(dict.fromkeys(pending))
                    pending = []
    return sections


def write_json(name, value):
    (CACHE / name).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--documents-only", action="store_true", help="Rebuild document text/metadata using existing graph and topic intermediates")
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    expected_sources={"kjv-verses-1769.json":"43fbd2fd6a7aebaf62c0c828a85072336143c1fe8233a4856a12db1d5e5df470","reformationsbibeln.json":"f9ef298d5610dc93d7ac925640a79967a00a8cc0bbe8a6f0825912c661ac679d"}
    for name,expected in expected_sources.items():
        if hashlib.sha256((ROOT / "assets/bible" / name).read_bytes()).hexdigest()!=expected:
            raise ValueError(f"Review the custom versification mapping before using changed source {name}")
    connection = sqlite3.connect(f"file:{(ROOT / 'assets/bible/koino-bible-v2.db').as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    rows = [dict(row) for row in connection.execute("SELECT v.*,b.name AS book,b.osis FROM verses v JOIN books b ON b.id=v.book_id ORDER BY v.id")]
    by_position = {translation: {} for translation in (1,2)}
    chapters = defaultdict(list)
    for row in rows:
        by_position[row["translation_id"]][row["book_id"],row["chapter"],row["verse"]] = row
        chapters[row["translation_id"],row["book_id"],row["chapter"]].append(row)
    verse_map = mapping(set(by_position[1]), set(by_position[2]))
    write_json("versification.json",{":".join(map(str,key)):[list(value)for value in sorted(values)]for key,values in sorted(verse_map.items())})
    labels_by_verse = defaultdict(list)
    labels_source = json.loads((ASSETS / "narrative-labels.json").read_text(encoding="utf-8"))
    for label in labels_source["labels"]:
        for book, chapter, first, last in label["references"]:
            for verse in range(first,last+1):
                position = (book,chapter,verse)
                if position not in by_position[1]:
                    raise ValueError(f"Invalid narrative metadata reference {position}")
                labels_by_verse[by_position[1][position]["id"]].append(label["en"])
                for target in verse_map[position]:
                    labels_by_verse[by_position[2][target]["id"]].append(label["sv"])
    english = english_sections()
    swedish = defaultdict(dict)
    for row in connection.execute("SELECT c.book_id,c.chapter,s.before_verse,s.text FROM chapter_subtitles s JOIN chapters c ON c.id=s.chapter_id WHERE c.translation_id=2 ORDER BY c.book_id,c.chapter,s.before_verse,s.display_order"):
        swedish[row["book_id"],row["chapter"]][row["before_verse"]] = clean(row["text"])
    for row in connection.execute("SELECT book_id,chapter,heading FROM chapters WHERE translation_id=2 AND heading IS NOT NULL"):
        swedish[row["book_id"],row["chapter"]].setdefault(1, clean(row["heading"]))
    documents = []
    passages = []
    windows = []
    for (translation, book_id, chapter), verses in sorted(chapters.items()):
        sections = dict((english if translation == 1 else swedish).get((book_id,chapter), {}))
        existing_numbers = {verse["verse"] for verse in verses}
        sections = {number:title for number,title in sections.items() if number in existing_numbers}
        sections.setdefault(1, "")
        boundaries = sorted(sections)

        def document(members, kind, title):
            return {"translation_id":translation,"book":members[0]["book"],"chapter":chapter,
                    "start_verse":members[0]["verse"],"end_verse":members[-1]["verse"],"kind":kind,
                    "title":title,"text":" ".join(clean(verse["text"]) for verse in members),"keywords":"; ".join(dict.fromkeys(label for verse in members for label in labels_by_verse.get(verse["id"],[]))),
                    "canonical_order":members[0]["canonical_order"],"members":[{"id":verse["id"],"verse":verse["verse"],"text":clean(verse["text"])}for verse in members]}

        for verse in verses:
            title = sections[boundaries[bisect.bisect_right(boundaries, verse["verse"])-1]]
            item = document([verse], "verse", title)
            item["id"] = verse["id"]
            documents.append(item)
        for index, boundary in enumerate(boundaries):
            end = boundaries[index+1] if index+1 < len(boundaries) else math.inf
            members = [verse for verse in verses if boundary <= verse["verse"] < end]
            if len(members) > 1:
                passages.append(document(members, "passage", sections[boundary]))
        start = 0
        while start < len(verses):
            members = verses[start:start+4]
            if len(members)>1:
                title = sections[boundaries[bisect.bisect_right(boundaries,members[0]["verse"])-1]]
                windows.append(document(members, "window", title))
            if start + 4 >= len(verses):
                break
            start += 2
    documents.sort(key=lambda item:item["id"])
    documents.extend(passages)
    documents.extend(windows)

    if args.documents_only:
        write_json("documents.json",documents)
        write_json("verse-labels.json",{str(key):"; ".join(dict.fromkeys(values)) for key,values in labels_by_verse.items()})
        print(f"Prepared {len(documents):,} document candidates",flush=True)
        return

    topics = []
    topic_ids = {}
    links = {}
    skipped_topics = 0
    with (ASSETS / "sources/topic-votes.txt").open(encoding="utf-8-sig", newline="") as source:
        reader = csv.reader(source, delimiter="\t")
        topic_header = next(reader)
        for data in reader:
            if len(data)<4:
                continue
            name, first, last, vote_string = data[:4]
            votes = int(vote_string)
            if votes <= 0:
                continue
            if name not in topic_ids:
                topic_ids[name] = len(topics)+1
                topics.append({"id":len(topics)+1,"name":name})
            first_int = int(first)
            last_int = int(last or first)
            begin = (first_int//1_000_000,first_int//1_000%1000,first_int%1000)
            end = (last_int//1_000_000,last_int//1_000%1000,last_int%1000)
            # All range members are resolved from actual KJV rows, then mapped individually.
            candidates = position_range(begin, end, by_position[1])
            for position in candidates:
                kjv = by_position[1][position]
                pairs = [(1,position)] + [(2,target) for target in sorted(verse_map[position])]
                for translation, target in pairs:
                    row = by_position[translation].get(target)
                    if row:
                        key = (topic_ids[name],row["id"])
                        links[key] = max(links.get(key,0),math.log1p(votes))
    valid_topics = {topic for topic, document in links}
    topics = [topic for topic in topics if topic["id"] in valid_topics]

    osis_book = {row["osis"]:row["book_id"] for row in rows}
    crossrefs = defaultdict(dict)
    for row in connection.execute("SELECT * FROM cross_references WHERE votes>0 ORDER BY votes DESC,id"):
        source = (row["source_book_id"],row["source_chapter"],row["source_verse"])
        if source not in by_position[1]:
            continue
        begin = (row["target_book_id"],row["target_chapter"],row["target_verse"])
        end = (row["target_end_book_id"] or begin[0], row["target_end_chapter"] or begin[1], row["target_end_verse"] or begin[2])
        for target in position_range(begin,end,by_position[1]):
            for translation in (1,2):
                sources = {source} if translation==1 else verse_map[source]
                targets = {target} if translation==1 else verse_map[target]
                for source_position in sources:
                    source_row = by_position[translation][source_position]
                    for target_position in targets:
                        target_row = by_position[translation][target_position]
                        if source_row["id"] != target_row["id"]:
                            edges = crossrefs[source_row["id"]]
                            edges[target_row["id"]] = max(edges.get(target_row["id"],0),math.log1p(row["votes"]))
    edge_rows = [(source,target,weight) for source, targets in sorted(crossrefs.items()) for target,weight in sorted(targets.items(),key=lambda pair:(-pair[1],pair[0]))[:24]]
    metadata = {"mappingRevision":MAPPING_REVISION,"topicSourceHeader":topic_header,
                "verseCount":len(rows),"passageCount":len(passages),"windowCount":len(windows),
                "topicCount":len(topics),"topicLinkCount":len(links),"crossReferenceCount":len(edge_rows),
                "readerSha256":hashlib.sha256((ROOT / "assets/bible/koino-bible-v2.db").read_bytes()).hexdigest(),
                "sourceHashes":{name:hashlib.sha256((ROOT / f"assets/bible/{name}").read_bytes()).hexdigest()for name in ["kjv-verses-1769.json","reformationsbibeln.json"]}}
    write_json("documents.json",documents)
    write_json("topics.json",topics)
    write_json("topic-links.json",[(topic,doc,weight)for (topic,doc),weight in sorted(links.items())])
    write_json("crossrefs.json",edge_rows)
    write_json("prepared-meta.json",metadata)
    write_json("verse-labels.json",{str(key):"; ".join(dict.fromkeys(values)) for key,values in labels_by_verse.items()})
    print(json.dumps(metadata,indent=2),flush=True)


_position_cache = {}
def position_range(begin, end, positions):
    cache_key = id(positions)
    if cache_key not in _position_cache:
        _position_cache[cache_key] = sorted(positions)
    ordered = _position_cache[cache_key]
    return ordered[bisect.bisect_left(ordered,begin):bisect.bisect_right(ordered,end)]


if __name__ == "__main__":
    main()
