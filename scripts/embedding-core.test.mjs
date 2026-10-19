import assert from "node:assert/strict";
import test from "node:test";
import { createTextEncoder, poolAndNormalize } from "../features/bible-search/embedding-core.mjs";

test("mean pooling excludes padding and normalizes every row independently", () => {
  const hidden = new Float32Array(2 * 2 * 384);
  hidden[0] = 3;
  hidden[1] = 4;
  hidden[384] = 1000; // This token is padding and must not affect the result.
  hidden[768 + 2] = 1;
  hidden[1152 + 2] = 3;
  const [first, second] = poolAndNormalize(hidden, [1, 0, 1, 1], 2, 2);
  assert.ok(Math.abs(first[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(first[1] - 0.8) < 1e-6);
  assert.equal(second[2], 1);
  assert.throws(() => poolAndNormalize(hidden, [0, 0, 1, 1], 2, 2), /no tokens/);
  assert.throws(() => poolAndNormalize(new Float32Array(384), [1], 1, 1), /invalid embedding/);
});

test("encoder prefixes both languages, preserves special tokens and masks batch padding", async () => {
  const prefixed = [];
  const inputsSeen = [];
  let disposedTensors = 0;
  let sessionReleased = false;
  class Tokenizer {
    encode(text, options) {
      prefixed.push(text);
      assert.equal(options.add_special_tokens, false);
      return { ids: text.includes("long") ? new Array(700).fill(9) : [5, 6] };
    }
  }
  class Tensor {
    constructor(type, data, dims) { Object.assign(this, { type, data, dims }); }
    dispose() { disposedTensors += 1; }
  }
  const runtime = {
    Tensor,
    InferenceSession: {
      async create(_path, options) {
        assert.deepEqual(options.executionProviders, ["cpu"]);
        return {
          async run(inputs) {
            inputsSeen.push(inputs);
            const [batch, sequence] = inputs.input_ids.dims;
            const data = new Float32Array(batch * sequence * 384);
            for (let cell = 0; cell < batch * sequence; cell += 1) data[cell * 384] = 1;
            return { last_hidden_state: new Tensor("float32", data, [batch, sequence, 384]) };
          },
          async release() { sessionReleased = true; },
        };
      },
    },
  };
  const encoder = await createTextEncoder({ runtime, modelPath: "model", tokenizerJson: {}, tokenizerConfig: {}, TokenizerClass: Tokenizer });
  const vectors = await encoder.embedBatch(["förlåtelse", "long input"], "query");
  assert.equal(vectors.length, 2);
  assert.equal(vectors[0].length, 384);
  assert.equal(vectors[0][0], 1);
  assert.deepEqual(prefixed, ["query: förlåtelse", "query: long input"]);
  assert.deepEqual(inputsSeen[0].input_ids.dims, [2, 512]);
  assert.equal(inputsSeen[0].input_ids.data[0], 0n);
  assert.equal(inputsSeen[0].input_ids.data[3], 2n);
  assert.equal(inputsSeen[0].input_ids.data[4], 1n);
  assert.equal(inputsSeen[0].attention_mask.data[4], 0n);
  assert.equal(inputsSeen[0].input_ids.data[1023], 2n);
  assert.ok(inputsSeen[0].token_type_ids.data.every((value) => value === 0n));
  assert.equal(encoder.tokenCount("long passage", "passage"), 702);
  const embed = encoder.embed; // Consumers may destructure the helper.
  await embed("forgiveness", "passage");
  assert.equal(prefixed.at(-1), "passage: forgiveness");
  assert.equal(disposedTensors, 8);
  await encoder.dispose();
  assert.equal(sessionReleased, true);
  await assert.rejects(encoder.embed("faith", "query"), /disposed/);
});
