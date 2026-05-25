import type { EntryKind, FeedItem, HeartMood, JournalEntry, JournalEntryType } from "@/state/types";

export const tabs = ["Bible", "Today", "Journal", "Room"] as const;

export const roomTabs = [
  { value: "feed", label: "Feed" },
  { value: "prayer", label: "Prayer" },
  { value: "checkins", label: "Check-ins" },
  { value: "about", label: "About" },
] as const;

export const prayerStatuses = {
  open: "open",
  answered: "answered",
} as const;

export const prayerFilters = [
  { value: "open", label: "Open" },
  { value: "answered", label: "Answered" },
  { value: "all", label: "All" },
] as const;

export const postTypes: { value: EntryKind; label: string; composerLabel: string }[] = [
  { value: "reflection", label: "Reflection", composerLabel: "Reflection" },
  { value: "prayer_request", label: "Prayer request", composerLabel: "Prayer" },
  { value: "praise", label: "Praise", composerLabel: "Praise" },
  { value: "update", label: "Update", composerLabel: "Update" },
  { value: "scripture", label: "Scripture", composerLabel: "Scripture" },
];

export const composerPostTypes = postTypes.filter((type) => type.value !== "scripture");

export const journalEntryTypes: { value: JournalEntryType; label: string; icon: "edit-3" | "heart" | "check-circle" | "sun" | "book-open" }[] = [
  { value: "reflection", label: "Reflection", icon: "edit-3" },
  { value: "prayer", label: "Prayer", icon: "heart" },
  { value: "answered_prayer", label: "Answered prayer", icon: "check-circle" },
  { value: "heart_checkin", label: "Heart check-in", icon: "sun" },
  { value: "scripture_note", label: "Scripture note", icon: "book-open" },
];

export const heartMoods: { value: HeartMood; label: string; description: string; icon: "sun" | "heart" | "cloud" | "wind" | "trending-up" | "moon" }[] = [
  { value: "peaceful", label: "Peaceful", description: "Calm and at rest", icon: "sun" },
  { value: "grateful", label: "Grateful", description: "Thankful for God's goodness", icon: "heart" },
  { value: "heavy", label: "Heavy", description: "Carrying some burden", icon: "cloud" },
  { value: "anxious", label: "Anxious", description: "Needing God's peace", icon: "wind" },
  { value: "hopeful", label: "Hopeful", description: "Looking forward with trust", icon: "trending-up" },
  { value: "tired", label: "Tired", description: "Physically or emotionally worn", icon: "moon" },
];

export function journalEntryTypeFor(entry: Pick<JournalEntry, "journalType" | "entryKind" | "source">): JournalEntryType {
  if (entry.journalType) return entry.journalType;
  if (entry.source === "private_check_in") return "heart_checkin";
  if (entry.entryKind === "prayer_request") return "prayer";
  if (entry.entryKind === "praise") return "answered_prayer";
  if (entry.entryKind === "scripture") return "scripture_note";
  return "reflection";
}

export function journalEntryTypeLabel(entry: Pick<JournalEntry, "journalType" | "entryKind" | "source">) {
  const type = journalEntryTypeFor(entry);
  return journalEntryTypes.find((item) => item.value === type)?.label ?? "Reflection";
}

export function heartMoodLabel(value?: HeartMood) {
  return heartMoods.find((mood) => mood.value === value)?.label;
}

export const postTypeLabels = {
  reflection: "Reflection",
  prayer_request: "Prayer request",
  praise: "Praise",
  update: "Update",
  scripture: "Scripture",
} as const;

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
  scripture: "Reflect",
};

export const actionPastLabels: Record<EntryKind, string> = {
  reflection: "Encouraged",
  prayer_request: "Prayed",
  praise: "Amen",
  update: "Responded",
  scripture: "Reflected",
};

export function normalizeEntryKind(kind: EntryKind | "post" | undefined): EntryKind {
  if (kind === "prayer_request" || kind === "praise" || kind === "update" || kind === "scripture") return kind;
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
  if (normalized === "scripture") return "book-open" as const;
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
  if (kind === "scripture") return "Shared Scripture";
  return "Shared reflection";
}
