# Offline search data and model notices

The shipped search results quote the app's existing KJV and Reformationsbibeln assets. Search indexing does not replace either translation. Reformationsbibeln source metadata says 2016; the application's translation identifier and display label remain `reformationsbibeln2026` / Reformationsbibeln 2026.

## OpenBible.info topical associations and cross-references

Source: https://www.openbible.info/topics/ and https://www.openbible.info/labs/cross-references/ .
License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/ .

Topical data snapshot: generated 2026-10-12, downloaded 2026-10-18 from https://a.openbible.info/data/topic-votes.txt . The cross-reference snapshot is the app's previously packaged OpenBible.info data dated 2026-05-18.

Changes by Koino: positive vote filtering, conversion of votes to logarithmic ranking weights, translation-specific reference mapping, retention of the 24 strongest outgoing cross-reference neighbors, compilation into a local SQLite index and topic-name embeddings. Scripture text is obtained from the app's own translations; ESV quotations are not redistributed from the topical website.

## Berean Standard Bible section headings

Source: https://berean.bible/downloads.htm and https://bereanbible.com/bsb_usfm.zip .
Terms: https://berean.bible/terms.htm . The Berean Bible text was dedicated to the public domain on April 30, 2023. All uses and adaptations are freely permitted.

The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee. Koino uses section headings and coordinates as English search metadata for its KJV text. It does not add the BSB as a Bible translation.

## Multilingual E5-small

Model: https://huggingface.co/intfloat/multilingual-e5-small .
Technical report: https://arxiv.org/abs/2402.05672 .
Authors: Liang Wang, Nan Yang, Xiaolong Huang, Linjun Yang, Rangan Majumder, Furu Wei.
The upstream model declares the MIT license. Converted generic ONNX assets: https://huggingface.co/Xenova/multilingual-e5-small , revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`. Complete file checksums and upstream revision are recorded in `scripts/hybrid-search/sources.lock.json`.

MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Swedish Snowball stemmer

Official generated JavaScript source from https://snowballstem.org/ , downloaded 2026-10-18. The generated source and base runtime are vendored in `scripts/hybrid-search/vendor/`, with exact upstream SHA-256 hashes in `sources.lock.json`. The complete BSD-3-Clause notice accompanies those files in `vendor/LICENSE.txt` and must accompany binary distributions.

## Koino narrative metadata and versification mapping

Koino-authored descriptive labels are recorded with Scripture references in `narrative-labels.json`. They annotate corpus content rather than overriding results for specific queries. The custom KJV/Reformationsbibeln mapping is pinned to the actual packaged text hashes; unsupported mappings are omitted. Sixty-six native Swedish Psalm title verses remain independently searchable without an English verse counterpart. The absent Swedish 2 Chronicles 2:18 is never replaced with a neighboring verse.
