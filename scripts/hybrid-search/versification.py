"""Audited sparse mapping for Koino's exact KJV and Reformationsbibeln assets.

This is intentionally not a generic English-to-Hebrew versification converter.
The Swedish source combines several traditions and lacks 2 Chronicles 2:18.
One-to-many and many-to-one correspondences are retained, never clamped.
"""
from __future__ import annotations

MAPPING_REVISION = "koino-kjv-rfb-2026-10-18-v1"
PSALM_ONE = (3,4,5,6,7,8,9,12,18,19,20,21,22,30,31,34,36,38,39,40,41,42,44,45,46,47,48,49,53,55,56,57,58,59,61,62,63,64,65,67,68,69,70,75,76,77,80,81,83,84,85,88,89,92,102,108,140,142)
PSALM_TWO = (51,52,54,60)


def mapping(kjv_positions: set[tuple[int, int, int]], swedish_positions: set[tuple[int, int, int]]):
    result = {position: {position} for position in kjv_positions}

    def span(book, chapter, first, last, target_chapter, target_first):
        for verse in range(first, last + 1):
            result[book, chapter, verse] = {(book, target_chapter, target_first + verse - first)}

    def one(book, chapter, verse, targets):
        result[book, chapter, verse] = {(book, target_chapter, target_verse) for target_chapter, target_verse in targets}

    span(4,12,16,16,13,1); span(4,13,1,33,13,2)
    span(4,29,40,40,30,1); span(4,30,1,16,30,2)
    one(9,20,42,[(20,42),(20,43)]); span(9,23,29,29,24,1); span(9,24,1,22,24,2)
    one(11,22,43,[(22,43),(22,44)]); span(11,22,44,53,22,45)
    one(14,2,18,[])
    span(18,38,39,41,39,1); span(18,39,1,30,39,4)
    span(18,40,1,5,39,34); span(18,40,6,24,40,1)
    span(18,41,1,9,40,20); span(18,41,10,34,41,1)
    for chapter in PSALM_ONE + PSALM_TWO:
        last = max(verse for book, ch, verse in kjv_positions if book == 19 and ch == chapter)
        span(19, chapter, 1, last, chapter, 3 if chapter in PSALM_TWO else 2)
    span(21,5,1,1,4,17); span(21,5,2,20,5,1)
    span(21,6,12,12,7,1); span(21,7,1,29,7,2)
    span(22,6,1,1,5,17); span(22,6,2,13,6,1)
    span(27,4,1,3,3,31); span(27,4,4,37,4,1)
    span(28,13,16,16,14,1); span(28,14,1,9,14,2)
    span(32,1,17,17,2,1); span(32,2,1,10,2,2)
    span(37,1,15,15,2,1); span(37,2,1,23,2,2)
    one(47,13,12,[(13,12)]); one(47,13,13,[(13,12)]); one(47,13,14,[(13,13)])
    one(64,1,14,[(1,14),(1,15)])
    one(66,13,1,[(12,18),(13,1)])

    invalid = [(source, target) for source, targets in result.items() for target in targets if target not in swedish_positions]
    if invalid:
        raise ValueError(f"Versification source changed: invalid targets {invalid[:5]}")
    mapped = set().union(*result.values())
    missing = swedish_positions - mapped
    if len(kjv_positions) != 31102 or len(swedish_positions) != 31170:
        raise ValueError("Versification mapping must be reviewed after changing the source corpus")
    if [source for source, targets in result.items() if not targets] != [(14,2,18)]:
        raise ValueError("Unexpected unmapped KJV verse")
    if len(missing) != 66 or any(book != 19 or verse > 2 for book, chapter, verse in missing):
        raise ValueError("Unexpected unmapped Swedish verses; expected only 66 Psalm title verses")
    return result
