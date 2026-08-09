import { ungzip } from "pako";
import {
  compressedCrossReferences,
  compressedKjvVerses,
  compressedReformationsbibelnVerses,
  compressedSv1917Verses,
} from "./.generated/bible-data";

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((value.length * 3) / 4 - padding);
  let outputIndex = 0;

  for (let index = 0; index < value.length; index += 4) {
    const first = base64Alphabet.indexOf(value[index]);
    const second = base64Alphabet.indexOf(value[index + 1]);
    const third = value[index + 2] === "=" ? 0 : base64Alphabet.indexOf(value[index + 2]);
    const fourth = value[index + 3] === "=" ? 0 : base64Alphabet.indexOf(value[index + 3]);
    const block = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputIndex < bytes.length) bytes[outputIndex++] = (block >> 16) & 0xff;
    if (outputIndex < bytes.length) bytes[outputIndex++] = (block >> 8) & 0xff;
    if (outputIndex < bytes.length) bytes[outputIndex++] = block & 0xff;
  }

  return bytes;
}

function parseCompressedJson<T>(value: string): T {
  return JSON.parse(ungzip(decodeBase64(value), { toText: true })) as T;
}

export const kjvVerseMap = parseCompressedJson<Record<string, string>>(compressedKjvVerses);
export const reformationsbibelnVerseMap = parseCompressedJson<Record<string, string>>(compressedReformationsbibelnVerses);
export const sv1917VerseMap = parseCompressedJson<Record<string, string>>(compressedSv1917Verses);
export const crossReferenceMap = parseCompressedJson<{
  references: Record<string, Array<{ verse: string; votes: number }>>;
}>(compressedCrossReferences);
