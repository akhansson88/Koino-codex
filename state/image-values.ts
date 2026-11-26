import type { GroupImage } from "@/state/types";

// Only a real, loadable URL may become an Image source. Records written before
// the plaintext model can still hold a retired encrypted object in `url`
// (ciphertext, key, context); handing that to native code crashed Android, so
// anything that is not a string URL is treated as "no image".
const displayableSchemes = /^(data:image\/|https?:\/\/|file:\/\/|content:\/\/|blob:)/i;

export function displayableImageUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const url = (value as { url?: unknown }).url;
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  return trimmed && displayableSchemes.test(trimmed) ? trimmed : undefined;
}

export function displayableImage<T extends GroupImage>(value: unknown): T | undefined {
  if (!value || typeof value !== "object") return undefined;
  const url = displayableImageUrl(value);
  return url ? ({ ...(value as T), url }) : undefined;
}
