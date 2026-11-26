import type { AudioClip } from "@/state/types";

/** A prayer request or a shared audio prayer. */
export const AUDIO_PRAYER_MAX_MS = 3 * 60_000;
/** A private journal recording. */
export const AUDIO_JOURNAL_MAX_MS = 5 * 60_000;
/** A voice prayer sent to someone after praying for them. */
export const AUDIO_REPLY_MAX_MS = 60_000;
export const AUDIO_MIN_MS = 1_000;
export const AUDIO_MAX_BYTES = 1_572_864;
export const AUDIO_MIME = "audio/mp4" as const;
export const AUDIO_BITRATE = 32_000;
export const AUDIO_SAMPLE_RATE = 24_000;
export const AUDIO_PEAK_COUNT = 48;
export const AUDIO_LEVEL_SAMPLE_MS = 60;

export type AudioPurpose = "prayer" | "journal" | "reply";
export type AudioScope = "user" | "group";

export const audioPurposeConfig: Record<AudioPurpose, {
  maxMs: number;
  titleKey: string;
  limitKey: string;
}> = {
  prayer: {
    maxMs: AUDIO_PRAYER_MAX_MS,
    titleKey: "audio.record.title.prayer",
    limitKey: "audio.record.limit.prayer",
  },
  journal: {
    maxMs: AUDIO_JOURNAL_MAX_MS,
    titleKey: "audio.record.title.journal",
    limitKey: "audio.record.limit.journal",
  },
  reply: {
    maxMs: AUDIO_REPLY_MAX_MS,
    titleKey: "audio.record.title.reply",
    limitKey: "audio.record.limit.reply",
  },
};

export function maxAudioMsFor(purpose: AudioPurpose) {
  return audioPurposeConfig[purpose].maxMs;
}

export function newAudioClipId() {
  return `clip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function audioPathFor(scope: AudioScope, ownerId: string, clipId: string) {
  return `audio/${scope === "user" ? "users" : "groups"}/${ownerId}/${clipId}.m4a`;
}

const audioPathPattern = /^audio\/(users|groups)\/[A-Za-z0-9_-]{1,128}\/clip_[a-z0-9]{6,40}\.m4a$/;
const clipIdPattern = /^clip_[a-z0-9]{6,40}$/;

export function isAudioPath(value: string) {
  return audioPathPattern.test(value);
}

export function isAudioClipId(value: string) {
  return clipIdPattern.test(value);
}

export function audioScopeForPath(path: string): AudioScope | undefined {
  const match = /^audio\/(users|groups)\//.exec(path);
  if (!match) return undefined;
  return match[1] === "users" ? "user" : "group";
}

export function isAudioClip(value: unknown): value is AudioClip {
  if (!value || typeof value !== "object") return false;
  const clip = value as Record<string, unknown>;
  return typeof clip.id === "string" && isAudioClipId(clip.id)
    && typeof clip.path === "string" && isAudioPath(clip.path)
    && typeof clip.durationMs === "number" && Number.isFinite(clip.durationMs)
    && clip.durationMs >= AUDIO_MIN_MS && clip.durationMs <= AUDIO_JOURNAL_MAX_MS
    && typeof clip.bytes === "number" && Number.isFinite(clip.bytes)
    && clip.bytes > 0 && clip.bytes <= AUDIO_MAX_BYTES
    && clip.mime === AUDIO_MIME
    && typeof clip.peaks === "string" && /^[a-f0-9]{96}$/.test(clip.peaks)
    && typeof clip.createdAt === "string";
}

/** Keeps only a real, complete clip so legacy or malformed records never crash a card. */
export function displayableAudio(value: unknown): AudioClip | undefined {
  return isAudioClip(value) ? value : undefined;
}

const DB_FLOOR = -55;

export function levelFromMetering(metering: number | undefined) {
  const value = Number.isFinite(metering) ? metering! : DB_FLOOR;
  const normalized = Math.max(0, Math.min(1, (value - DB_FLOOR) / -DB_FLOOR));
  return Math.pow(normalized, 0.7);
}

export function smoothLevel(previous: number, next: number) {
  const factor = next > previous ? 0.55 : 0.14;
  return previous + (next - previous) * factor;
}

export function waveformTaper(index: number, count: number) {
  if (count <= 1) return 1;
  return 0.55 + 0.45 * Math.sin((Math.PI * index) / (count - 1));
}

/** Turns the metering history into 48 persisted peak values (one byte each). */
export function peaksFromLevels(levels: number[], buckets = AUDIO_PEAK_COUNT) {
  const size = Math.max(1, Math.ceil(levels.length / buckets));
  return Array.from({ length: buckets }, (_, index) => {
    const slice = levels.slice(index * size, (index + 1) * size);
    const peak = slice.length ? Math.max(...slice) : 0;
    return Math.round(Math.max(0, Math.min(1, peak)) * 255)
      .toString(16)
      .padStart(2, "0");
  }).join("");
}

export function neutralPeaks(buckets = AUDIO_PEAK_COUNT) {
  return Array.from({ length: buckets }, () => "00").join("");
}

/** Returns 48 heights between 0 and 1, or undefined when the clip has no usable peaks. */
export function heightsFromPeaks(peaks: string | undefined, buckets = AUDIO_PEAK_COUNT): number[] | undefined {
  if (!peaks || !/^[a-f0-9]{96}$/.test(peaks)) return undefined;
  const values: number[] = [];
  for (let index = 0; index < buckets; index += 1) {
    values.push(parseInt(peaks.slice(index * 2, index * 2 + 2), 16) / 255);
  }
  return values;
}

export function formatAudioTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

export function formatAudioDuration(durationMs: number) {
  return formatAudioTime(durationMs / 1000);
}

export function audioDurationSeconds(durationMs: number) {
  return Math.max(0.001, durationMs / 1000);
}

/** Rough size for UI copy; actual size is always read from the file. */
export function estimatedAudioBytes(durationMs: number, bitRate = AUDIO_BITRATE) {
  return Math.round((durationMs / 1000) * (bitRate / 8));
}
