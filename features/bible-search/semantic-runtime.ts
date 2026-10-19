import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { createTextEncoder, E5_DIMENSIONS, E5_MAX_TOKENS, E5_MODEL_REVISION, type TextEncoder } from "./embedding-core.mjs";

export type SemanticRuntimeStatus = {
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
  modelRevision: string;
};

let status: SemanticRuntimeStatus = { state: "idle", error: null, modelRevision: E5_MODEL_REVISION };
const listeners = new Set<(next: SemanticRuntimeStatus) => void>();
let initialization: Promise<TextEncoder> | null = null;
let activeEncoder: TextEncoder | null = null;
let generation = 0;
const queryCache = new Map<string, Float32Array>();
let queryTurn: Promise<void> = Promise.resolve();
const expectedAssets = {
  model: { file: "multilingual-e5-small-int8.onnx", bytes: 118054593, sha256: "4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c" },
  tokenizer: { file: "multilingual-e5-small.tokenizer", bytes: 17082730, sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39" },
  tokenizerConfig: { file: "multilingual-e5-small-config.tokenizer", bytes: 443, sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b" },
} as const;
type AssetMetadata = { file: string; bytes: number; sha256: string; md5: string };

function modelAssetMetadata(): Record<keyof typeof expectedAssets, AssetMetadata> {
  const manifest = require("../../assets/bible/search/search-manifest.json");
  if (
    manifest.schemaVersion !== 1 || manifest.modelRevision !== E5_MODEL_REVISION ||
    manifest.dimensions !== E5_DIMENSIONS || manifest.model?.maxTokens !== E5_MAX_TOKENS
  ) throw new Error("The AI model and bundled search index have different versions.");
  for (const key of Object.keys(expectedAssets) as (keyof typeof expectedAssets)[]) {
    const expected = expectedAssets[key];
    const actual = manifest.assets?.[key];
    if (
      actual?.file !== expected.file || actual.bytes !== expected.bytes ||
      actual.sha256?.toLowerCase() !== expected.sha256 || !/^[0-9a-f]{32}$/i.test(actual.md5 ?? "")
    ) throw new Error(`Invalid bundled AI search metadata for ${key}.`);
  }
  return manifest.assets;
}

export function getSemanticRuntimeStatus(): SemanticRuntimeStatus {
  return status;
}

export function subscribeSemanticRuntime(listener: (next: SemanticRuntimeStatus) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setStatus(state: SemanticRuntimeStatus["state"], error: string | null = null) {
  status = { state, error, modelRevision: E5_MODEL_REVISION };
  listeners.forEach((listener) => listener(status));
}

async function afterFirstPaint() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)));
  });
}

async function localAsset(moduleId: number, expected: AssetMetadata): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("The bundled AI search asset is unavailable.");
  const info = await FileSystem.getInfoAsync(asset.localUri, { md5: true });
  if (!info.exists || info.isDirectory || info.size !== expected.bytes) {
    throw new Error(`The bundled AI search asset ${asset.name} has an invalid size.`);
  }
  // Metro's asset hash is MD5. Compare natively so the 118 MB model never enters
  // the JavaScript heap just to verify integrity.
  if (
    info.md5?.toLowerCase() !== expected.md5.toLowerCase() ||
    (asset.hash && info.md5?.toLowerCase() !== asset.hash.toLowerCase())
  ) {
    throw new Error(`The bundled AI search asset ${asset.name} failed its integrity check.`);
  }
  return asset.localUri;
}

function getEncoder(): Promise<TextEncoder> {
  if (initialization) return initialization;
  const currentGeneration = generation;
  setStatus("loading");
  const pending = (async () => {
    await afterFirstPaint();
    const assets = modelAssetMetadata();
    const [modelUri, tokenizerUri, configUri] = await Promise.all([
      localAsset(require("../../assets/bible/search/multilingual-e5-small-int8.onnx"), assets.model),
      localAsset(require("../../assets/bible/search/multilingual-e5-small.tokenizer"), assets.tokenizer),
      localAsset(require("../../assets/bible/search/multilingual-e5-small-config.tokenizer"), assets.tokenizerConfig),
    ]);
    const [tokenizerText, configText, runtime] = await Promise.all([
      FileSystem.readAsStringAsync(tokenizerUri),
      FileSystem.readAsStringAsync(configUri),
      import("onnxruntime-react-native"),
    ]);
    // JSON is deliberately parsed here, after search has painted. Requiring the
    // tokenizer as a JSON module would parse it during application startup.
    const encoder = await createTextEncoder({
      runtime,
      modelPath: decodeURIComponent(modelUri.replace(/^file:\/\//, "")),
      tokenizerJson: JSON.parse(tokenizerText),
      tokenizerConfig: JSON.parse(configText),
    });
    if (generation !== currentGeneration) {
      await encoder.dispose();
      throw new Error("AI search preparation was reset.");
    }
    activeEncoder = encoder;
    setStatus("ready");
    return encoder;
  })();
  initialization = pending.catch((error: unknown) => {
    if (generation === currentGeneration) {
      initialization = null;
      setStatus("error", error instanceof Error ? error.message : "AI search could not start.");
    }
    throw error;
  });
  return initialization;
}

/** Call after the visible search screen mounts, never from the Home startup path. */
export async function prepareSemanticRuntime(): Promise<void> {
  await getEncoder();
}

function abortIfNeeded(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Search cancelled"); error.name = "AbortError"; throw error;
}

export async function embedQuery(text: string, signal?: AbortSignal): Promise<Float32Array> {
  abortIfNeeded(signal);
  const key = text.trim();
  if (!key) throw new Error("Cannot search for empty text.");
  const cached = queryCache.get(key);
  if (cached) return cached;
  // Canceled waiting queries must not enter the native inference queue.
  const result = queryTurn.then(async () => {
    abortIfNeeded(signal);
    const previous = queryCache.get(key);
    if (previous) return previous;
    const encoder = await getEncoder();
    abortIfNeeded(signal);
    const currentGeneration = generation;
    const vector = await encoder.embed(key, "query");
    if (generation !== currentGeneration) throw new Error("AI search was reset.");
    if (vector.length !== E5_DIMENSIONS) throw new Error("AI search returned an invalid embedding.");
    queryCache.set(key, vector);
    if (queryCache.size > 64) queryCache.delete(queryCache.keys().next().value!);
    abortIfNeeded(signal);
    return vector;
  });
  queryTurn = result.then(() => undefined, () => undefined);
  return result;
}

export async function resetSemanticRuntime(): Promise<void> {
  generation += 1;
  const previous = activeEncoder;
  activeEncoder = null;
  initialization = null;
  queryCache.clear();
  setStatus("idle");
  await previous?.dispose();
}

export const semanticModelMetadata = Object.freeze({
  repository: "Xenova/multilingual-e5-small",
  revision: E5_MODEL_REVISION,
  dimensions: E5_DIMENSIONS,
  maxTokens: E5_MAX_TOKENS,
  inputTypes: "int64" as const,
  output: "last_hidden_state" as const,
  pooling: "attention-masked-mean-l2" as const,
  assets: expectedAssets,
});
