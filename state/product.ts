import type { EntryKind, FeedItem } from "@/state/types";

export const tabs = ["Bible", "Today", "Journal", "Room"] as const;

export const postTypes: { value: EntryKind; label: string; composerLabel: string }[] = [
  { value: "reflection", label: "Reflection", composerLabel: "Reflection" },
  { value: "prayer_request", label: "Prayer request", composerLabel: "Prayer" },
  { value: "praise", label: "Praise", composerLabel: "Praise" },
  { value: "update", label: "Update", composerLabel: "Update" },
];

export const futurePostTypes = ["scripture"] as const;

export const visibility = {
  private: "private",
  room: "room",
} as const;

export type EntryVisibility = (typeof visibility)[keyof typeof visibility];

export const actionLabels: Record<EntryKind, string> = {
  reflection: "Encourage",
  prayer_request: "Pray",
  praise: "Amen",
  update: "Respond",
};

export const actionPastLabels: Record<EntryKind, string> = {
  reflection: "Encouraged",
  prayer_request: "Prayed",
  praise: "Amen",
  update: "Responded",
};

export function normalizeEntryKind(kind: EntryKind | "post" | undefined): EntryKind {
  if (kind === "prayer_request" || kind === "praise" || kind === "update") return kind;
  return "reflection";
}

export function entryKindLabel(kind: EntryKind | "post" | undefined) {
  return postTypes.find((item) => item.value === normalizeEntryKind(kind))?.label ?? "Reflection";
}

export function entryKindComposerLabel(kind: EntryKind) {
  return postTypes.find((item) => item.value === kind)?.composerLabel ?? "Reflection";
}

export function entryKindIcon(kind: EntryKind | "post" | undefined) {
  const normalized = normalizeEntryKind(kind);
  if (normalized === "prayer_request") return "heart" as const;
  if (normalized === "praise") return "star" as const;
  if (normalized === "update") return "send" as const;
  return "edit-3" as const;
}

export function feedItemKind(item: FeedItem): EntryKind {
  if (item.type === "check_in") return "reflection";
  return normalizeEntryKind(item.kind);
}

export function feedItemLabel(item: FeedItem) {
  if (item.type === "check_in") return "Check-in";
  return entryKindLabel(item.kind);
}

export function defaultFeedTitle(item: FeedItem, moodLabel: (mood: number) => string) {
  if (item.type === "check_in") return moodLabel(item.mood);
  const kind = normalizeEntryKind(item.kind);
  if (kind === "prayer_request") return "Please pray";
  if (kind === "praise") return "Grateful for a new day";
  if (kind === "update") return "A small update";
  return "Shared reflection";
}
