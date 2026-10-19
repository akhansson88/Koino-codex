export const E5_MODEL_REVISION: string;
export const E5_DIMENSIONS: 384;
export const E5_MAX_TOKENS: 512;
export const E5_MODEL_FILE: string;
export const E5_TOKENIZER_FILE: string;
export const E5_TOKENIZER_CONFIG_FILE: string;
export type EmbeddingKind = "query" | "passage";
export type TextEncoder = {
  tokenCount(text: string, kind: EmbeddingKind): number;
  embed(text: string, kind: EmbeddingKind): Promise<Float32Array>;
  embedBatch(texts: string[], kind: EmbeddingKind): Promise<Float32Array[]>;
  dispose(): Promise<void>;
};
export function poolAndNormalize(
  hidden: ArrayLike<number>, attentionMask: ArrayLike<number | bigint>,
  batchSize: number, sequenceLength: number,
): Float32Array[];
export function createTextEncoder(options: {
  runtime: {
    Tensor: new (type: "int64", data: BigInt64Array, dims: number[]) => any;
    InferenceSession: { create(path: string, options: any): Promise<any> };
  };
  modelPath: string;
  tokenizerJson: object;
  tokenizerConfig: object;
  sessionOptions?: Record<string, unknown>;
  TokenizerClass?: new (json: object, config: object) => {
    encode(text: string, options: { add_special_tokens: boolean }): { ids: number[] };
  };
}): Promise<TextEncoder>;
