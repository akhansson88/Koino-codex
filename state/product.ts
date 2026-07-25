import type { EntryKind, FeedItem, HeartMood, JournalEntry, JournalEntryType } from "@/state/types";

export const tabs = ["Bible", "Today", "Me", "Community"] as const;

export const roomTabs = [
  { value: "recent", label: "Recent" },
  { value: "prayer", label: "Prayer" },
  { value: "checkins", label: "Check-ins" },
  { value: "reflections", label: "Reflections" },
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

export const postTypes: { value: Exclude<EntryKind, "prayer_moment">; label: string; composerLabel: string }[] = [
  { value: "reflection", label: "Reflection", composerLabel: "Reflection" },
  { value: "prayer_request", label: "Prayer request", composerLabel: "Prayer" },
  { value: "praise", label: "Praise", composerLabel: "Praise" },
  { value: "update", label: "Update", composerLabel: "Update" },
  { value: "scripture", label: "Scripture", composerLabel: "Scripture" },
];

export const composerPostTypes = postTypes;

export const journalEntryTypes: { value: JournalEntryType; label: string; icon: "edit-3" | "heart" | "check-circle" | "sun" | "book-open" }[] = [
  { value: "reflection", label: "Reflection", icon: "edit-3" },
  { value: "prayer", label: "Prayer", icon: "heart" },
  { value: "answered_prayer", label: "Answered prayer", icon: "check-circle" },
  { value: "heart_checkin", label: "Heart check-in", icon: "sun" },
  { value: "scripture_note", label: "Scripture note", icon: "book-open" },
];

export const heartMoods: { value: HeartMood; label: string; description: string; icon: "feather" | "sun" | "cloud" | "cloud-rain" | "star" | "moon" }[] = [
  { value: "peaceful", label: "Peaceful", description: "Calm and at rest", icon: "feather" },
  { value: "grateful", label: "Grateful", description: "Grateful and full of joy", icon: "sun" },
  { value: "heavy", label: "Heavy", description: "Carrying some burden", icon: "cloud" },
  { value: "anxious", label: "Anxious", description: "Worried or overwhelmed", icon: "cloud-rain" },
  { value: "hopeful", label: "Hopeful", description: "Expectant and encouraged", icon: "star" },
  { value: "tired", label: "Tired", description: "Drained and needing rest", icon: "moon" },
];

export function journalEntryTypeFor(entry: Pick<JournalEntry, "journalType" | "entryKind" | "source">): JournalEntryType {
  if (entry.journalType) return entry.journalType;
  if (entry.source === "private_check_in") return "heart_checkin";
  if (entry.entryKind === "prayer_request" || entry.entryKind === "prayer_moment") return "prayer";
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

export const moodOptions = [
  { value: 5, label: "Joyful", description: "Grateful and full of joy", icon: "sun" as const },
  { value: 4, label: "Peaceful", description: "Calm and at rest", icon: "feather" as const },
  { value: 3, label: "Okay", description: "Doing alright", icon: "circle" as const },
  { value: 2, label: "Heavy", description: "Carrying some burden", icon: "cloud" as const },
  { value: 1, label: "Struggling", description: "Finding today difficult", icon: "cloud-rain" as const },
];

export function moodScaleValue(mood: number) {
  if (mood >= 5) return 5;
  if (mood === 4) return 4;
  if (mood === 2) return 2;
  if (mood <= 1) return 1;
  return 3;
}

export function moodOptionForValue(mood: number) {
  return moodOptions.find((option) => option.value === moodScaleValue(mood)) ?? moodOptions[2];
}

export function moodLabel(mood: number) {
  return moodOptionForValue(mood).label;
}

export const postTypeLabels: Record<EntryKind, string> = {
  reflection: "Reflection",
  prayer_request: "Prayer request",
  prayer_moment: "Prayer made",
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
  prayer_moment: "Pray",
  praise: "Amen",
  update: "Respond",
  scripture: "Reflect",
};

export const actionPastLabels: Record<EntryKind, string> = {
  reflection: "Encouraged",
  prayer_request: "Prayed",
  prayer_moment: "Prayed",
  praise: "Amen",
  update: "Responded",
  scripture: "Reflected",
};

export function normalizeEntryKind(kind: EntryKind | "post" | undefined): EntryKind {
  if (kind === "prayer_request" || kind === "prayer_moment" || kind === "praise" || kind === "update" || kind === "scripture") return kind;
  return "reflection";
}

export function entryKindLabel(kind: EntryKind | "post" | undefined) {
  return postTypeLabels[normalizeEntryKind(kind)];
}

export function entryKindComposerLabel(kind: EntryKind) {
  return postTypes.find((item) => item.value === kind)?.composerLabel ?? postTypeLabels[kind];
}

export function entryKindIcon(kind: EntryKind | "post" | undefined) {
  const normalized = normalizeEntryKind(kind);
  if (normalized === "prayer_request" || normalized === "prayer_moment") return "heart" as const;
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
  if (kind === "prayer_moment") return "Prayer made";
  if (kind === "praise") return "Grateful for a new day";
  if (kind === "update") return "A small update";
  if (kind === "scripture") return "Shared Scripture";
  return "Shared reflection";
}
