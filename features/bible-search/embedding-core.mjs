/** Shared on-device/build-time E5 encoding. Keep both pipelines byte-for-byte aligned. */
export const E5_MODEL_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
export const E5_DIMENSIONS = 384;
export const E5_MAX_TOKENS = 512;
export const E5_MODEL_FILE = "multilingual-e5-small-int8.onnx";
export const E5_TOKENIZER_FILE = "multilingual-e5-small.tokenizer";
export const E5_TOKENIZER_CONFIG_FILE = "multilingual-e5-small-config.tokenizer";

function prefixText(text, kind) {
  if (kind !== "query" && kind !== "passage") {
    throw new TypeError("Embedding kind must be query or passage.");
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new TypeError("Cannot embed empty text.");
  }
  // These prefixes stay English for every language, as required by multilingual E5.
  return `${kind}: ${text.trim()}`;
}

/** Mean-pool only unmasked tokens, then normalize to unit length. */
export function poolAndNormalize(hidden, attentionMask, batchSize, sequenceLength) {
  if (hidden.length !== batchSize * sequenceLength * E5_DIMENSIONS) {
    throw new Error("Unexpected E5 output shape; expected 384 dimensions per token.");
  }
  const embeddings = [];
  for (let row = 0; row < batchSize; row += 1) {
    const sums = new Float64Array(E5_DIMENSIONS);
    let count = 0;
    for (let token = 0; token < sequenceLength; token += 1) {
      if (!Number(attentionMask[row * sequenceLength + token])) continue;
      count += 1;
      const start = (row * sequenceLength + token) * E5_DIMENSIONS;
      for (let column = 0; column < E5_DIMENSIONS; column += 1) {
        sums[column] += hidden[start + column];
      }
    }
    if (!count) throw new Error("E5 attention mask has no tokens.");
    let squaredNorm = 0;
    for (let column = 0; column < E5_DIMENSIONS; column += 1) {
      sums[column] /= count;
      squaredNorm += sums[column] * sums[column];
    }
    const norm = Math.sqrt(squaredNorm);
    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error("E5 returned an invalid embedding.");
    }
    const embedding = new Float32Array(E5_DIMENSIONS);
    for (let column = 0; column < E5_DIMENSIONS; column += 1) {
      embedding[column] = sums[column] / norm;
    }
    embeddings.push(embedding);
  }
  return embeddings;
}

export async function createTextEncoder({
  runtime,
  modelPath,
  tokenizerJson,
  tokenizerConfig,
  sessionOptions = {},
  // Injection keeps contract tests independent of model downloads and native binaries.
  TokenizerClass,
}) {
  const Tokenizer = TokenizerClass ?? (await import("@huggingface/tokenizers")).Tokenizer;
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  const session = await runtime.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
    intraOpNumThreads: 2,
    ...sessionOptions,
  });
  let disposed = false;
  let pending = Promise.resolve();

  function rawIds(text, kind) {
    if (disposed) throw new Error("E5 encoder has been disposed.");
    return tokenizer.encode(prefixText(text, kind), { add_special_tokens: false }).ids;
  }

  async function runBatch(texts, kind) {
    if (!Array.isArray(texts)) throw new TypeError("Embedding input must be an array.");
    if (!texts.length) return [];
    if (disposed) throw new Error("E5 encoder has been disposed.");
    const rows = texts.map((text) => [0, ...rawIds(text, kind).slice(0, E5_MAX_TOKENS - 2), 2]);
    const sequenceLength = Math.max(...rows.map((row) => row.length));
    const cells = texts.length * sequenceLength;
    const ids = new BigInt64Array(cells).fill(1n); // XLM-R padding token, not model.config.pad_token_id.
    const mask = new BigInt64Array(cells);
    const types = new BigInt64Array(cells);
    rows.forEach((row, batch) => {
      row.forEach((id, token) => {
        ids[batch * sequenceLength + token] = BigInt(id);
        mask[batch * sequenceLength + token] = 1n;
      });
    });
    const shape = [rows.length, sequenceLength];
    const inputs = {
      input_ids: new runtime.Tensor("int64", ids, shape),
      attention_mask: new runtime.Tensor("int64", mask, shape),
      token_type_ids: new runtime.Tensor("int64", types, shape),
    };
    let outputs;
    try {
      outputs = await session.run(inputs, ["last_hidden_state"]);
      const output = outputs.last_hidden_state;
      if (
        !output || output.type !== "float32" || output.dims.length !== 3 ||
        output.dims[0] !== rows.length || output.dims[1] !== sequenceLength ||
        output.dims[2] !== E5_DIMENSIONS
      ) {
        throw new Error("E5 model output does not match the bundled search index.");
      }
      return poolAndNormalize(output.data, mask, rows.length, sequenceLength);
    } finally {
      Object.values(inputs).forEach((tensor) => tensor.dispose?.());
      if (outputs) Object.values(outputs).forEach((tensor) => tensor.dispose?.());
    }
  }

  function embedBatch(texts, kind) {
    // A single native session must not run overlapping query batches.
    const result = pending.then(() => runBatch(texts, kind));
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    tokenCount(text, kind) {
      return rawIds(text, kind).length + 2;
    },
    embedBatch,
    async embed(text, kind) {
      const result = await embedBatch([text], kind);
      return result[0];
    },
    async dispose() {
      disposed = true;
      await pending;
      await session.release?.();
    },
  };
}
