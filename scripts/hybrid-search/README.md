# Rebuild offline bilingual search

Requirements: Node 24+, Python 3, the repository's npm dependencies, and network access for the first pinned source fetch. No hosted AI API, API key or paid service is used. The finished app uses only bundled assets.

Run from the repository root:

```powershell
node scripts/hybrid-search/run.mjs
```

Stop the development server before replacing an existing index on Windows: its asset watcher can hold the old database open and prevent the final atomic rename. If publication is blocked, close the reader and rerun; verified embeddings are reused.

This installs pinned build-only sqlite-vec `0.1.7a2` and Rust tokenizers `0.22.2` Python wheels when needed, verifies all locked source downloads, prepares the translation-specific corpus, and generates every E5 embedding using the same encoder as the app. Rust precomputes corpus token IDs; the builder checks 64 sampled documents plus bilingual Unicode, punctuation and long-passage fixtures against the app's JavaScript tokenizer before injecting the verified IDs into the shared encoder. Embedding cache keys include the actual token sequence and tokenizer configuration. The first build can take several hours on a laptop. A content-addressed SQLite cache commits after each embedding batch, so interrupted builds resume. Set `PYTHON` to choose another Python executable, or `SQLITE_VEC_EXTENSION` to a matching platform's sqlite-vec loadable extension. Build caches and the wheels are ignored by Git.

`fetch-sources.py --record-lock` is an explicit source update operation: review the resulting checksum/license/source diff. Normal builds reject changed upstream bytes, changed reader assets and unreviewed versification structures.

The builder preserves the reading database and creates a separate `assets/bible/search/koino-search-v1.db`. It includes all 62,272 native verses, bounded pericopes, overlapping four-verse windows, English Porter FTS, official Swedish Snowball FTS, topic associations and translation-correct cross-reference edges. Long passages split at native verse boundaries before 512 tokens. Model prefixes stay `query:` and `passage:` in both languages, with attention-mask mean pooling and L2 normalization.

Retrieval searches both language corpora and quotes the selected translation's own text. `verse_correspondence` projects foreign-language candidates through the audited versification map, in both directions, preserving split and merged verses. It does not guess identities for unmapped Swedish Psalm titles or the missing Swedish text for KJV 2 Chronicles 2:18. Database metadata and the manifest record the correspondence count and mapping revision so the app can reject stale assets.

Vector quantization is a separate decision from the already quantized ONNX model. The build compares SQLite unit int8 against float vectors using judged relevant-verse coverage and query hit rate on 40 English/Swedish query pairs, both selected translations. It accepts int8 only when neither query language loses more than 2 percentage points on either metric; otherwise it stores float32 vectors. The detailed result is saved in `quantization-recall.json`.

`search-manifest.json` records schema, source/encoder fingerprints, model revision, vector type, file sizes, SHA-256 and native-verifiable MD5. Source licenses and changes are recorded in `THIRD_PARTY_NOTICES.md`. The ordinary app startup never downloads sources or rebuilds the corpus.
