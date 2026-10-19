#!/usr/bin/env python3
"""Validate corpus coordinates, mapping exceptions, and a completed generated index."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sqlite3
import unittest

from versification import mapping

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reader = sqlite3.connect(f"file:{(ROOT / 'assets/bible/koino-bible-v2.db').as_posix()}?mode=ro",uri=True)
        cls.positions = {translation:{tuple(row) for row in cls.reader.execute("SELECT book_id,chapter,verse FROM verses WHERE translation_id=?",(translation,))}for translation in (1,2)}
        cls.mapping = mapping(cls.positions[1],cls.positions[2])

    def test_mapping_preserves_real_text_coordinates(self):
        self.assertEqual(self.mapping[19,3,3],{(19,3,4)})
        self.assertEqual(self.mapping[19,51,1],{(19,51,3)})
        self.assertEqual(self.mapping[19,13,1],{(19,13,1)})
        self.assertEqual(self.mapping[9,20,42],{(9,20,42),(9,20,43)})
        self.assertEqual(self.mapping[47,13,12],self.mapping[47,13,13])
        self.assertEqual(self.mapping[14,2,18],set())
        self.assertEqual(self.mapping[66,13,1],{(66,12,18),(66,13,1)})

    def test_mapping_coverage(self):
        union = set().union(*self.mapping.values())
        self.assertEqual(len(union),31104)
        self.assertEqual(len(self.positions[2]-union),66)
        self.assertTrue(union.issubset(self.positions[2]))

    def test_pinned_sources(self):
        lock=json.loads((ROOT / "scripts/hybrid-search/sources.lock.json").read_text(encoding="utf-8"))
        for source in lock["sources"]:
            self.assertEqual(hashlib.sha256((ROOT / source["path"]).read_bytes()).hexdigest(),source["sha256"],source["path"])

    @unittest.skipUnless((ASSETS / "koino-search-v1.db").exists(),"Run the complete search builder before testing generated SQLite")
    def test_generated_database(self):
        connection=sqlite3.connect(f"file:{(ASSETS / 'koino-search-v1.db').as_posix()}?mode=ro",uri=True)
        meta=dict(connection.execute("SELECT key,value FROM meta"))
        self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0],1)
        self.assertEqual(meta["dimensions"],"384")
        self.assertLessEqual(int(meta["maximum_document_tokens"]),512)
        for translation,count in [(1,31102),(2,31170)]:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM documents WHERE kind='verse' AND translation_id=?",(translation,)).fetchone()[0],count)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM topic_documents td LEFT JOIN documents d ON d.id=td.document_id WHERE d.id IS NULL").fetchone()[0],0)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM search_cross_references x JOIN documents s ON s.id=x.source_document_id JOIN documents t ON t.id=x.target_document_id WHERE s.translation_id!=t.translation_id OR s.kind!='verse' OR t.kind!='verse'").fetchone()[0],0)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM documents WHERE start_verse>end_verse OR translation_id NOT IN(1,2)").fetchone()[0],0)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM document_authority WHERE weight<=0").fetchone()[0],0)
        self.assertEqual(meta["correspondence_count"],"62210")
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM verse_correspondence").fetchone()[0],62210)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM verse_correspondence c JOIN documents s ON s.id=c.source_verse_id JOIN documents t ON t.id=c.target_verse_id WHERE s.kind!='verse' OR t.kind!='verse' OR s.translation_id=t.translation_id").fetchone()[0],0)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM verse_correspondence a LEFT JOIN verse_correspondence b ON b.source_verse_id=a.target_verse_id AND b.target_verse_id=a.source_verse_id WHERE b.source_verse_id IS NULL").fetchone()[0],0)
        def correspondence(translation,book,chapter,verse):
            source=connection.execute("SELECT id FROM documents WHERE kind='verse' AND translation_id=? AND book=? AND chapter=? AND start_verse=?",(translation,book,chapter,verse)).fetchone()[0]
            return set(connection.execute("SELECT t.translation_id,t.book,t.chapter,t.start_verse FROM verse_correspondence c JOIN documents t ON t.id=c.target_verse_id WHERE c.source_verse_id=?",(source,)))
        self.assertEqual(correspondence(1,"Psalms",3,3),{(2,"Psalms",3,4)})
        self.assertEqual(correspondence(2,"Psalms",3,4),{(1,"Psalms",3,3)})
        self.assertEqual(correspondence(1,"1 Samuel",20,42),{(2,"1 Samuel",20,42),(2,"1 Samuel",20,43)})
        self.assertEqual(correspondence(2,"2 Corinthians",13,12),{(1,"2 Corinthians",13,12),(1,"2 Corinthians",13,13)})
        self.assertEqual(correspondence(1,"2 Chronicles",2,18),set())
        self.assertEqual(correspondence(2,"Psalms",3,1),set())
        self.assertEqual(correspondence(1,"Revelation",13,1),{(2,"Revelation",12,18),(2,"Revelation",13,1)})
        manifest=json.loads((ASSETS / "search-manifest.json").read_text())
        self.assertEqual(manifest["counts"]["correspondences"],62210)
        self.assertEqual(manifest["mappingRevision"],meta["mapping_revision"])
        self.assertEqual(hashlib.sha256((ASSETS / "koino-search-v1.db").read_bytes()).hexdigest(),manifest["databaseSha256"])
        report=json.loads((ASSETS / "quantization-recall.json").read_text())
        if manifest["vectorType"]=="int8":
            for scores in report["languages"].values():
                self.assertLessEqual(scores["floatRecallAt10"]-scores["int8RecallAt10"],0.02)
                self.assertLessEqual(scores["floatHitRateAt10"]-scores["int8HitRateAt10"],0.02)


if __name__ == "__main__":
    unittest.main()
