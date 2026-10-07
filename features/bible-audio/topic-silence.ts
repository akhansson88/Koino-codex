import * as FileSystem from "expo-file-system/legacy";

// 8-bit mono PCM silence is small, universally playable, and needs no native module.
const SAMPLE_RATE = 8000;
const pending = new Map<number, Promise<string>>();
export function silenceWavBase64(seconds: number): string {
  const samples = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const word = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  word(0, "RIFF"); view.setUint32(4, 36 + samples, true); word(8, "WAVE"); word(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE, true);
  view.setUint16(32, 1, true); view.setUint16(34, 8, true); word(36, "data"); view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    chunk += alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63]
      + (i + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : "=") + (i + 2 < bytes.length ? alphabet[value & 63] : "=");
    if (chunk.length >= 16384) { chunks.push(chunk); chunk = ""; }
  }
  chunks.push(chunk);
  return chunks.join("");
}
/** Duration is scaled by narration rate by the caller, keeping wall-clock pauses exact. */
export function ensureTopicSilence(seconds: number): Promise<string> {
  const duration = Math.round(seconds * SAMPLE_RATE) / SAMPLE_RATE;
  const existing = pending.get(duration);
  if (existing) return existing;
  const work = (async () => {
    const directory = `${FileSystem.cacheDirectory}bible-audio/silence/`;
    const uri = `${directory}pcm8-${Math.round(duration * SAMPLE_RATE)}.wav`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || !info.size) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      await FileSystem.writeAsStringAsync(uri, silenceWavBase64(duration), { encoding: "base64" as FileSystem.EncodingType });
    }
    return uri;
  })().finally(() => { pending.delete(duration); });
  pending.set(duration, work);
  return work;
}
