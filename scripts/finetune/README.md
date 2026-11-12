# Fine-tuned Bible embedding pipeline

This is a build-time research pipeline. Training never runs on the device; the
app ships only an accepted ONNX model and its rebuilt SQLite vector index.

## Decision (2026-11-12)

Fine-tuning is **paused before the MVP pilot**. Five candidates failed the
locked narrative, full-index, or hybrid zero-regression gates. Production stays
on the original upstream E5 model and index. A future revisit should use a
query-only adapter or an explicit old+new ensemble with a dedicated
Swedish-query ↔ English-passage objective, and must pass the locked benchmark
before any new index rebuild.

## Current status (2026-11-11)

Run 1 used English-only topic pairs, top-3 layers and lr 2e-5. It passed the
synthetic pool but failed the production-index gate, so it was **not shipped**
and the original model/index were restored:

| Metric | Production | Run 1 candidate | Delta |
|---|---:|---:|---:|
| Recall@10 | 0.5125 | 0.5250 | +0.0125 |
| Recall@20 | 0.5750 | 0.5625 | -0.0125 |
| MRR | 0.3783 | 0.3353 | -0.0431 |
| Swedish Recall@10 | 0.4000 | 0.3750 | -0.0250 |

Run 2 adds bilingual narrative/entity rows and uses a conservative recipe
(top-2 layers, lr 1e-5, temperature 10, QUInt8 per-channel quantization). It
passed the model gate and the fixed real-index proxy, but the full index still
regressed MRR and the app-level hybrid evaluation:

| Metric | Production | Run 2 candidate | Delta |
|---|---:|---:|---:|
| Full-index Recall@10 | 0.5125 | 0.6125 | +0.1000 |
| Full-index Recall@20 | 0.5750 | 0.6500 | +0.0750 |
| Full-index MRR | 0.3783 | 0.3607 | -0.0177 |
| Hybrid Recall@10 | 0.7250 | 0.7000 | -0.0250 |
| Hybrid Recall@20 | 0.8000 | 0.7375 | -0.0625 |
| Hybrid MRR | 0.5262 | 0.4823 | -0.0439 |

The proxy was too optimistic: it selected hard distractors from the old model
but did not reproduce the full corpus density or the lexical/topic fusion
behavior. Run 2 was **not shipped**; the original model, index, manifest,
prototypes and credits are restored. The model and index only improve recall at
the cost of top-rank precision.

The next attempt should add hard negatives mined from the shipped hybrid
ranking (not just BM25), consider distilling the old model's top-1 behavior, or
evaluate an explicit old+new ensemble before rebuilding. Do not lower the
acceptance gate or semantic floors to make a regressing candidate pass.

Run 3 adds embedding distillation from the shipped encoder
(`precompute_teacher.py`, weight 5) on top of the bilingual narrative/entity
data. It preserves the shipped cosine scale (proxy `meanTop` 0.811 vs 0.846)
and passes the model gate and proxy:

| Proxy metric | Production | Run 3 candidate | Delta |
|---|---:|---:|---:|
| Recall@10 | 0.5500 | 0.7000 | +0.1500 |
| Recall@20 | 0.6750 | 0.8750 | +0.2000 |
| MRR | 0.3778 | 0.4128 | +0.0350 |
| English MRR | 0.5131 | 0.5644 | +0.0513 |
| Swedish MRR | 0.2424 | 0.2611 | +0.0187 |

The full rebuild selected float32 vectors (the int8 quantization gate lost
more than two points on Swedish hit rate), but the candidate still failed both
release gates:

| Metric | Production | Run 3 candidate | Delta |
|---|---:|---:|---:|
| Full-index Recall@10 | 0.5125 | 0.4875 | -0.0250 |
| Full-index Recall@20 | 0.5750 | 0.6000 | +0.0250 |
| Full-index MRR | 0.3783 | 0.3317 | -0.0466 |
| Swedish R@10 | 0.4000 | 0.2750 | -0.1250 |
| Swedish MRR | 0.2441 | 0.1404 | -0.1037 |
| Hybrid Recall@10 | 0.7250 | 0.5125 | -0.2125 |
| Hybrid MRR | 0.5262 | 0.4040 | -0.1222 |

English pure semantic retrieval improved (`MRR 0.5126→0.5229`), but Swedish
collapsed and the app-level fusion regressed more. Run 3 was **not shipped**;
the original model, index, manifest, prototypes and credits are restored.
Artifacts are retained in `koino-finetune-candidate-v3` outside the repo.

### Diagnosis of the train/proxy/full-index mismatch

`analyze_language_drift.py` shows the candidate stayed close to the shipped
encoder for both languages:

```text
English query drift: mean cosine 0.9796, min 0.9689
Swedish query drift: mean cosine 0.9791, min 0.9690
```

The regression is not a Swedish-only embedding drift. It is a document-kind
bias: the candidate was trained mostly with passage/window positives, while the
index evaluation is verse-centric. Top-1 document kinds:

| Evaluation | Verse | Passage | Window |
|---|---:|---:|---:|
| Shipped, English | 39 | 0 | 1 |
| Run 3, English | 1 | 19 | 20 |
| Shipped, Swedish | 29 | 3 | 7 |
| Run 3, Swedish | 0 | 40 | 0 |

The candidate learned to prefer long passage/window documents. The fixed proxy
did not catch this because its 9,551 hard distractors were selected with the
**old** model, whose top results are mostly verses; the new passage favorites
were largely absent from the 15,000-document pool. The small training eval pool
has the same blind spot.

The next iteration must:

1. Use **verse documents as positives** for narrative and entity rows (or add
   balanced verse and passage positives), not just the containing passage.
2. Mine hard negatives with the **candidate** model as well as the shipped model,
   so the proxy includes the candidate's new high-scoring distractors.
3. Evaluate the candidate-aware proxy and the full index; do not treat the
   old-model-only proxy as a release gate.
4. Keep the bilingual query set and the zero-regression index/hybrid gates.

Run 4 implements those fixes. `build_dataset_v4.py` generated 4,154 rows with
verse-only positives (1,236 topic, 2,028 narrative, 890 entity). Candidate-aware
mining with the shipped model and Run 3 added 16,616 hard negatives:

```text
verses:    5,386
windows:   4,690
passages:  6,540
```

That hard-negative mix is deliberate: the previous candidate's new passage and
window favorites are now explicit negatives. The proxy pool also includes top
documents from both encoders, and the proxy reports top-1/top-5 document kinds
to catch a recurrence of the passage bias.

Run 4 proxy result (candidate-aware pool):

| Metric | Production | Run 4 candidate | Delta |
|---|---:|---:|---:|
| Recall@10 | 0.5500 | 0.6250 | +0.0750 |
| Recall@20 | 0.6750 | 0.6875 | +0.0125 |
| MRR | 0.3778 | 0.4323 | +0.0545 |
| English MRR | 0.5131 | 0.4747 | -0.0384 |
| Swedish MRR | 0.2424 | 0.3899 | +0.1475 |

The passage bias is fixed: top-1 documents are 79 verses, 1 passage, 0 windows
(Run 3 was 40/40 passages on Swedish). English MRR still dipped, and the full
index confirmed a regression:

| Metric | Production | Run 4 candidate | Delta |
|---|---:|---:|---:|
| Full-index Recall@10 | 0.5125 | 0.4750 | -0.0375 |
| Full-index Recall@20 | 0.5750 | 0.5750 | 0.0000 |
| Full-index MRR | 0.3783 | 0.3473 | -0.0310 |
| English MRR | 0.5126 | 0.4703 | -0.0423 |
| Swedish R@10 | 0.4000 | 0.3250 | -0.0750 |
| Swedish MRR | 0.2441 | 0.2244 | -0.0197 |

Run 4 was **not shipped**; production is restored and the artifacts are
retained in `koino-finetune-candidate-v4`. Per-query regression reports are in
`english-regressions-v4.json` and `swedish-regressions-v4.json`.

English had 11 rank regressions, 8 improvements and 21 unchanged. The largest
losses were narrative/paraphrase queries, for example:

- `Jesus teaches his disciples how to pray`: rank 1 -> 5
- `Jesus gives orders to angels`: 1 -> 2
- `A borrowed iron tool is lost in the water`: 1 -> 2
- `Forgive someone who has wronged me`: 1 -> 2
- `People meet heavenly messengers`: 3 -> outside top 20
- `The Holy Spirit tells people what to do`: 5 -> outside top 20
- `Jesus shines on a mountain`: 10 -> outside top 20
- `God calls a child in the night`: 11 -> outside top 20

Swedish had 7 regressions, 9 improvements and 24 unchanged. The pattern is the
same: verse-level document behavior is correct, but some narrative paraphrases
lost top-rank precision. This points to the exact-title narrative rows and
candidate-aware negatives overfitting lexical distinctions, not to the old
passage/window bias. No Run 5 is started automatically; the next step is to
analyze these query families and change the narrative query generation before
another training run.

The query-validity instruction threshold was calibrated to `0.05` and the
positive anchors now include `ber`, `forlata` and `generously`. Explicit anchor
matching now reads raw query tokens, because ranking noise removes `bible`;
this fixes `how to study the bible` without lowering the threshold. The expanded
suite passes 64 valid and 87 invalid English/Swedish queries with zero
misclassifications against both the restored production model and Run 5.

## Run 5 preparation gate

Training is deliberately paused. The next run must pass data review before any
training or rebuild.

The independent narrative benchmark is locked at
`narrative-paraphrase-benchmark.json`:

```text
30 stories
60 bilingual queries
34 whole-passage reference spans
sha256 60732615a27ca8218e2f3bd632c12cef605410151d1cfa4a29a05730ae39a325
0 overlap with the fixed 80-query gold
```

Production baseline on the independent benchmark:

| Language | Recall@1 | Recall@5 | Recall@10 | Recall@20 | MRR |
|---|---:|---:|---:|---:|---:|
| English | 0.3000 | 0.5667 | 0.6667 | 0.7333 | 0.4099 |
| Swedish | 0.1667 | 0.3667 | 0.4000 | 0.4333 | 0.2263 |
| Both | 0.2333 | 0.4667 | 0.5333 | 0.5833 | 0.3181 |

The Run 4 training set fails `review_training_data.mjs`:

```text
verse-only positives:          pass
duplicate pairs:               pass
benchmark query overlap:       pass
same-section negatives:        3,039  FAIL
benchmark reference overlap:   60     FAIL
exact section-title queries:   1,014  FAIL (24.4% > 10%)
```

The same-section negatives are likely alternative correct answers: 1,234 rows
contain at least one negative from the positive's own section. The next dataset
must:

- exclude all negatives from the positive's section; allow every verse in a
  narrative section as a correct answer,
- exclude the benchmark stories and reference spans from training,
- replace exact section titles with natural paraphrase questions,
- keep verse-only positives,
- pass `review_training_data.mjs` before training starts.

The prepared Run 5 data is in `.cache/finetune/v5/` and passes every check:

```text
rows: 2,412
sources: topic 1,214 | entity 874 | narrative paraphrase 324
languages: English 1,206 | Swedish 1,206
negatives: 9,648
  verses:    2,748
  passages:  4,041
  windows:   2,859
verse-only positives:          pass
no duplicate pairs:            pass
no same-section negatives:     pass
no benchmark query overlap:    pass
no benchmark reference overlap: pass
exact section-title queries:   0
```

The narrative portion is now 54 stories and 324 narrative rows, spread evenly
across English and Swedish. The expanded seed is disjoint from the locked
benchmark and from the fixed 80-query gold.

Run 5 was trained on this reviewed data. Topic-dev improved at R@5/R@10 but
R@1/MRR were slightly lower:

```text
baseline: R@1 0.1333  R@5 0.5000  R@10 0.6083  MRR 0.2827
final:    R@1 0.1250  R@5 0.5333  R@10 0.6417  MRR 0.2779
```

Locked narrative benchmark with whole-passage gold:

| Language | R@1 | R@5 | R@10 | R@20 | MRR |
|---|---:|---:|---:|---:|---:|
| Production EN | 0.3000 | 0.5667 | 0.6667 | 0.7333 | 0.4099 |
| Run 5 EN | 0.3000 | 0.6667 | 0.7333 | 0.7667 | 0.4614 |
| Production SV | 0.1667 | 0.3667 | 0.4000 | 0.4333 | 0.2263 |
| Run 5 SV | 0.0667 | 0.3000 | 0.3000 | 0.4000 | 0.1541 |
| Production both | 0.2333 | 0.4667 | 0.5333 | 0.5833 | 0.3181 |
| Run 5 both | 0.1833 | 0.4833 | 0.5167 | 0.5833 | 0.3078 |

English narrative improved, but Swedish narrative R@1/MRR regressed. The fixed
80-query full index also failed the strict gate:

```text
overall R@10 0.5125 -> 0.5250
overall R@20 0.5750 -> 0.5750
overall MRR  0.3783 -> 0.3767
English MRR  0.5126 -> 0.4882
Swedish MRR  0.2441 -> 0.2653
```

App-level hybrid failed more strongly:

```text
production: R@10 0.7250, R@20 0.8000, MRR 0.5262
Run 5:      R@10 0.5125, R@20 0.5500, MRR 0.4108
```

Run 5 was **not shipped**. Production is restored, and the artifacts are in
`koino-finetune-candidate-v5`. No Run 6 is started automatically.

The dominant remaining failure is Swedish narrative first-hit precision:
`Feeding the Four Thousand` rank 1→5, `Ten Virgins` 3→11, `Stephen` 1→outside
top 20, `Peter denies Jesus` 14→outside top 20, and `Paul in Rome` 3→20.
English narrative improved, while the fixed 80 English MRR lost ground on
`Forgive someone who has wronged me`, `Jesus teaches his disciples how to pray`,
`Jesus gives orders to angels`, `The Holy Spirit tells people what to do`, and
`God calls a child in the night`.

### Cross-lingual alignment diagnosis

`analyze_cross_lingual_alignment.py` compared both queries with the same 386
correct English verse passages from the locked benchmark:

| Measure | Shipped | Run 5 | Delta |
|---|---:|---:|---:|
| English query → English passage max | 0.8480 | 0.8008 | -0.0472 |
| Swedish query → English passage max | 0.7894 | 0.7249 | -0.0645 |
| English–Swedish gap | 0.0586 | 0.0759 | **+0.0173** |
| Query drift EN | — | 0.9829 | — |
| Query drift SV | — | 0.9771 | — |
| Passage drift | — | 0.9861 | — |

Both languages moved, but the English passage space moved farther toward
English queries than toward Swedish queries. Swedish query drift is not larger
than English query drift, so this is not a Swedish tokenizer/query problem. It
is a loss of English-passage ↔ Swedish-query alignment.

12 of 30 stories retained an English top-3 result while the Swedish query
regressed or stayed outside the top 5. Worst alignment gaps:
`The Great Commission`, `The Temptation of Jesus`, `Esther Pleads for Her
People`, `The Road to Emmaus`, `Josiah Renews the Covenant`, `The Stoning of
Stephen`, `The Ascension`, `Gethsemane`, `The Parable of the Talents`, and
`The Last Supper`.

### Investment decision

Full-encoder fine-tuning is **not justified before the MVP pilot**. Five
candidates have failed the release gates, and the latest failure is specifically
a cross-lingual alignment regression that the current bilingual contrastive
setup did not fix. Production remains on the upstream encoder and index.

If semantic search is revisited later, the next experiment should be a
query-only adapter or an explicit old+new ensemble with a dedicated
Swedish-query ↔ English-passage objective, validated on the locked benchmark
before any index rebuild. It should not be another full-encoder fine-tune on the
same data shape.


## 1. Environment

Use a dedicated Python environment; the runtime app does not depend on it.

```powershell
python -m venv C:\path\to\koino-finetune
& C:\path\to\koino-finetune\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
& C:\path\to\koino-finetune\Scripts\python.exe -m pip install transformers onnx onnxruntime numpy tokenizers
$env:HF_HOME = "C:\path\to\hf-cache"
```

The scripts use `intfloat/multilingual-e5-small` and the app's bundled tokenizer
JSON, so training and device inference use the same special-token IDs and
`query:` / `passage:` prefixes.

## 2. Dataset

The current dataset builder mixes English/Swedish topic questions with
bilingual narrative titles and dictionary entity questions:

```powershell
& C:\path\to\koino-finetune\Scripts\python.exe scripts/finetune/build_dataset_v2.py
```

Defaults produce about 4,400 train pairs and 560 held-out topic pairs:

- 1,900 topic rows from 400 held-out topic names (English + Swedish templates)
- 1,638 rows from narrative section titles, including Swedish title -> English passage
- 876 rows from dictionary entity titles (`Who was ...?` / `Vad säger Bibeln om ...?`)
- two BM25 hard negatives per row, excluding the positive range and all held-out
  gold ranges
- zero exact overlap with the 80 bilingual real-index query strings

The first English-only topic dataset remains in `build_dataset.py` for
comparison. The positive text uses the same
`book chapter | section\ntext\nkeywords` format as the index.

## 3. Train

To anchor the candidate to the shipped top-1 geometry, precompute the shipped
encoder's embeddings for the training texts and pass them to the trainer:

```powershell
& C:\path\to\koino-finetune\Scripts\python.exe scripts/finetune/precompute_teacher.py `
  --model assets/bible/search/multilingual-e5-small-int8.onnx `
  --train scripts/hybrid-search/.cache/finetune/train.jsonl `
  --output scripts/hybrid-search/.cache/finetune/teacher-vectors-v2.npz
& C:\path\to\koino-finetune\Scripts\python.exe scripts/finetune/train_e5.py `
  --pairs 4414 --epochs 1 --batch 16 --lr 1e-5 --temperature 10 --freeze-layers 10 `
  --teacher-vectors scripts/hybrid-search/.cache/finetune/teacher-vectors-v2.npz `
  --distill-weight 5
```

The default freezes embeddings and the lower 10 of 12 encoder layers (top two
trainable), reports held-out Recall@1/5/10 and MRR before and after, and records
the contrastive and distillation losses. Checkpoints and metrics are written to
`.cache/finetune/model/`.

## 4. Export and model gate

```powershell
& C:\path\to\koino-finetune\Scripts\python.exe scripts/finetune/export_onnx.py
& C:\path\to\koino-finetune\Scripts\python.exe scripts/finetune/eval_onnx.py
```

This writes a dynamic-axes fp32 ONNX graph and a per-channel dynamic QUInt8
model. `eval_onnx.py` compares PyTorch, ONNX fp32 and ONNX int8 on the held-out
topic pool and writes `onnx-eval.json`.

Then run the fixed real-index proxy. It keeps all gold documents, adds 9,551
hard distractors selected from the shipped index, and fills to 15,000 documents:

```powershell
node scripts/finetune/select_proxy_docs.mjs
& C:\path\to\koino-finetune\Scripts\python.exe scripts/finetune/proxy_eval.py `
  --model assets/bible/search/multilingual-e5-small-int8.onnx `
  --output scripts/hybrid-search/.cache/finetune/proxy-production.json
& C:\path\to\koino-finetune\Scripts\python.exe scripts/finetune/proxy_eval.py `
  --model scripts/hybrid-search/.cache/finetune/multilingual-e5-small-int8.onnx `
  --output scripts/hybrid-search/.cache/finetune/proxy-candidate.json
node scripts/finetune/compare_proxy.mjs
node scripts/finetune/accept_model.mjs
```

`accept_model.mjs` requires ONNX fp32 to match PyTorch retrieval, int8 to stay
within 2 Recall@10 points and 0.005 MRR of fp32, and the candidate to improve
Recall@10, Recall@20 and MRR over the production model on the fixed real-index
proxy. Cosine parity is diagnostic (`mean >= 0.98`, `minimum >= 0.95`); dynamic
QUInt8 is not expected to reach the 0.99 single-vector parity of a float graph.

Run 2 real-index proxy:

| Metric | Production | Run 2 candidate | Delta |
|---|---:|---:|---:|
| Recall@10 | 0.5500 | 0.7625 | +0.2125 |
| Recall@20 | 0.6750 | 0.8625 | +0.1875 |
| MRR | 0.3778 | 0.4442 | +0.0664 |
| English MRR | 0.5131 | 0.5415 | +0.0284 |
| Swedish MRR | 0.2424 | 0.3468 | +0.1044 |

## 5. Install and rebuild

```powershell
node scripts/finetune/apply_model.mjs
npm run bible:search:prototypes
npm run bible:search:build
npm run bible:search:suggestions
npm run validate:hybrid-search
```

`apply_model.mjs` updates `E5_MODEL_REVISION`, the semantic-runtime expected
model size/hash, and marks the pinned model in `sources.lock.json` as a
local-only fine-tuned artifact with its upstream base/converted revisions.
`bible:search:prototypes` MUST be rerun for every model: the query-validity
classifier stores embeddings and the app rejects prototypes whose
`modelRevision` does not match the active encoder. The build script re-embeds
every verse, passage and window with the new model and regenerates
`search-manifest.json` and `quantization-recall.json`. Do not reuse the old
index: vectors from different model weights are not comparable. The build is
resumable and revision-keyed, so interrupted embeddings are reused.

After the build, evaluate the packaged index and compare it with the baseline
captured before the model change:

```powershell
node scripts/finetune/evaluate_index.mjs assets/bible/search/multilingual-e5-small-int8.onnx `
  scripts/hybrid-search/.cache/finetune/index-after.json
node scripts/finetune/compare_index.mjs `
  scripts/hybrid-search/.cache/finetune/index-baseline.json `
  scripts/hybrid-search/.cache/finetune/index-after.json
```

`compare_index.mjs` defaults to a zero-regression gate on Recall@10, Recall@20
and MRR, overall and per query language. If it fails, restore the model/index
backups rather than shipping the new vectors.

A fine-tuned encoder can have a very different cosine scale, so the semantic
floors must be calibrated from held-out data before running app validation:
`set_semantic_floors.mjs` updates the SQLite metadata and refreshes the
content-addressed database descriptor in `search-manifest.json`. The app-level
gate uses the actual lexical + topic + semantic fusion:

```powershell
node scripts/finetune/evaluate_hybrid.mjs --model assets/bible/search/multilingual-e5-small-int8.onnx `
  --database assets/bible/search/koino-search-v1.db --output scripts/hybrid-search/.cache/finetune/hybrid-new.json `
  --min 0.25 --only 0.36 --floor 0.25 --margin 0.05
node scripts/finetune/evaluate_hybrid.mjs --model <old-model> --database <old-index> `
  --output scripts/hybrid-search/.cache/finetune/hybrid-old.json `
  --min 0.72 --only 0.84 --floor 0.78 --margin 0.05
```

Compare the two `summary` objects and require no regression in Recall@10,
Recall@20 or MRR before shipping.

## Evaluation gates

- Real-index proxy: candidate must not regress Recall@10, Recall@20 or MRR,
  overall or per query language.
- `accept_model.mjs`: ONNX fp32 matches PyTorch; int8 retrieval is within the
  frozen tolerances and improves on production.
- Full index: `compare_index.mjs` zero-regression gate.
- App-level hybrid: `evaluate_hybrid.mjs` zero-regression gate over the same
  80 bilingual queries.
- `quantization-recall.json`: int8 may lose at most 2 percentage points versus
  float32 on judged recall and hit rate.
- `npm run validate:hybrid-search`: all 154 scenarios must pass.
- Device smoke test: natural-language anxiety query, `Moses`, `baptism`,
  `best pizza recipe`, and the Old Testament/book scopes.
