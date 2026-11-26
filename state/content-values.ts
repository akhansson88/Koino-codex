import { isAudioClip } from "@/state/audio";
import type { CheckIn, JournalEntry, Post, Reply } from "@/state/types";

// Records written before the plaintext model still hold an encrypted object in
// their text fields. A ciphertext object passed to a Text child crashes React
// Native, so only records whose text is real text are kept in state. The
// encrypted originals cannot be read without the old device vault and stay in
// the database untouched.
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string";
}

function textOrMissing(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || record[key] === null || typeof record[key] === "string";
}

function audioOrMissing(record: Record<string, unknown>) {
  return record.audio === undefined || record.audio === null || isAudioClip(record.audio);
}

export function isPlaintextJournalEntry(value: unknown): value is JournalEntry {
  if (!isRecord(value)) return false;
  return hasText(value, "id") && hasText(value, "userId") && hasText(value, "body")
    && hasText(value, "createdAt") && textOrMissing(value, "title") && audioOrMissing(value);
}

export function isPlaintextCheckIn(value: unknown): value is CheckIn {
  if (!isRecord(value)) return false;
  return hasText(value, "id") && hasText(value, "userId") && hasText(value, "reflectionText")
    && hasText(value, "createdAt") && typeof value.mood === "number";
}

export function isPlaintextPost(value: unknown): value is Post {
  if (!isRecord(value)) return false;
  return hasText(value, "id") && hasText(value, "userId") && hasText(value, "body")
    && hasText(value, "createdAt") && hasText(value, "kind") && textOrMissing(value, "title") && audioOrMissing(value);
}

export function isPlaintextReply(value: unknown): value is Reply {
  if (!isRecord(value)) return false;
  return hasText(value, "id") && hasText(value, "userId") && hasText(value, "body")
    && hasText(value, "createdAt") && audioOrMissing(value);
}
