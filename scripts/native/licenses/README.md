# Shipped search license sources

These files are tracked so generating offline credits never needs a network request.

- `e5-LICENSE.txt`: [Microsoft UniLM / E5 project license](https://github.com/microsoft/unilm/blob/master/LICENSE), copied 2026-10-19. The [multilingual E5 model card](https://huggingface.co/intfloat/multilingual-e5-small) declares MIT.
- `onnxruntime-LICENSE.txt` and `onnxruntime-ThirdPartyNotices.txt`: unmodified [ONNX Runtime 1.24.3](https://github.com/microsoft/onnxruntime/tree/v1.24.3) license and third-party notices.
- `tokenizers-LICENSE.txt`: unmodified Apache 2.0 license copied from the installed, pinned `@huggingface/tokenizers` 0.2.0 package.

`node scripts/generate-search-credits.mjs` combines these with the tracked data
attribution, Snowball BSD license and sqlite-vec MIT license. The generated JSON
is bundled with the shared search interface and read only when Search sources
is expanded. The original legal notices remain in English.
