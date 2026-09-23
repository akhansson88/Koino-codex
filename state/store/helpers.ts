import { FirebaseError } from "firebase/app";
import {
  BibleHighlightColor,
  BibleHighlightPaletteColor,
  BibleVerse,
  Id,
  PrayerReaction,
  PrayerSession,
} from "@/state/types";
import { type CreatePostKind } from "@/state/store/types";

export function now() {
  return new Date().toISOString();
}

export function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function prayerReactionId(userId: Id, targetType: PrayerReaction["targetType"], targetId: Id) {
  return `${userId}_${targetType}_${targetId}`;
}

export function isMatchingPrayerReaction(
  reaction: PrayerReaction,
  userId: Id,
  targetType: PrayerReaction["targetType"],
  targetId: Id,
) {
  return reaction.userId === userId && reaction.targetType === targetType && reaction.targetId === targetId;
}

export function prayerSessionFromReaction(reaction: PrayerReaction, recipientUserId?: Id): PrayerSession {
  return {
    id: reaction.id,
    userId: reaction.userId,
    targetType: reaction.targetType,
    targetId: reaction.targetId,
    ...(recipientUserId ? { recipientUserId } : {}),
    startedAt: reaction.startedAt ?? reaction.createdAt,
    completedAt: reaction.completedAt ?? reaction.createdAt,
    status: "completed",
  };
}

export function inviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function asArray<T extends { id: string }>(value: unknown): T[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, T>).map(([key, item]) => ({ ...item, id: item.id ?? key }));
}

export function actionVerses(action: { verse?: BibleVerse; verses?: BibleVerse[] }) {
  if (action.verses?.length) return action.verses.slice(0, 5);
  return action.verse ? [action.verse] : [];
}

export function postSupportsTitle(kind: CreatePostKind) {
  return kind === "prayer_request" || kind === "prayer_moment" || kind === "update";
}

export function validPostContent(kind: CreatePostKind, body: string, verses: BibleVerse[]) {
  return kind === "scripture" ? verses.length > 0 : Boolean(body.trim());
}

export function bibleReferenceStorageId(verse: Pick<BibleVerse, "reference" | "translation">) {
  return `${verse.reference}_${verse.translation ?? "default"}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const defaultBibleHighlightColors: BibleHighlightPaletteColor[] = [
  { id: "default_yellow", hex: "#FFF200", label: "Yellow", createdAt: "", updatedAt: "" },
  { id: "default_green", hex: "#4DF06A", label: "Green", createdAt: "", updatedAt: "" },
  { id: "default_cyan", hex: "#09C6DF", label: "Cyan", createdAt: "", updatedAt: "" },
  { id: "default_peach", hex: "#FFC166", label: "Peach", createdAt: "", updatedAt: "" },
];

export function isBibleHighlightColor(value: unknown): value is BibleHighlightColor {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function normalizeHighlightColor(value: string) {
  return value.trim().toUpperCase();
}

export function highlightColorLabel(value: string) {
  return value.trim().toUpperCase();
}

export function authMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password did not match.";
    case "auth/weak-password":
      return "Use a password with at least 6 characters.";
    case "auth/expired-action-code":
      return "That reset link has expired. Request a new one from sign in.";
    case "auth/invalid-action-code":
      return "That reset link is invalid or has already been used. Request a new one from sign in.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a bit and try again.";
    case "auth/invalid-continue-uri":
    case "auth/unauthorized-continue-uri":
      return "The reset link URL needs to be authorized in Firebase.";
    case "auth/requires-recent-login":
      return "Please sign out and back in, then try changing your password again.";
    case "permission-denied":
      return "Firebase blocked that change. Check the database rules for this project.";
    default:
      return error.message;
  }
}
