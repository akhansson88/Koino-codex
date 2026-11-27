import type { EntryKind, FeedItem, HeartMood, JournalEntry, JournalEntryType, PostKind } from "@/state/types";

export const tabs = ["Bible", "Today", "Me", "Community"] as const;

export const roomTabs = [
  { value: "recent", label: "Recent" },
  { value: "prayer", label: "Prayer" },
  { value: "checkins", label: "Check-ins" },
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

// The two post types a member can choose. Everything else is a legacy value.
export const communityPostTypes: { value: PostKind; label: string; composerLabel: string }[] = [
  { value: "post", label: "Post", composerLabel: "Post" },
  { value: "prayer_request", label: "Prayer request", composerLabel: "Prayer" },
];

export const postTypes = communityPostTypes;

export const composerPostTypes = communityPostTypes;

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

export const postTypeLabels: Record<PostKind, string> = {
  post: "Post",
  prayer_request: "Prayer request",
};

export const visibility = {
  private: "private",
  room: "room",
} as const;

export type EntryVisibility = (typeof visibility)[keyof typeof visibility];

// Legacy values stay readable but always render and behave as a normal post.
export function normalizePostKind(kind: EntryKind | "post" | undefined | null): PostKind {
  return kind === "prayer_request" ? "prayer_request" : "post";
}

export const normalizeEntryKind = normalizePostKind;

export function entryKindLabel(kind: EntryKind | "post" | undefined) {
  return postTypeLabels[normalizePostKind(kind)];
}

export function entryKindComposerLabel(kind: EntryKind | "post" | undefined) {
  return postTypes.find((item) => item.value === normalizePostKind(kind))?.composerLabel ?? postTypeLabels[normalizePostKind(kind)];
}

export function entryKindIcon(kind: EntryKind | "post" | undefined) {
  return normalizePostKind(kind) === "prayer_request" ? ("heart" as const) : ("edit-3" as const);
}

export function feedItemKind(item: FeedItem): PostKind {
  if (item.type === "check_in") return "post";
  return normalizePostKind(item.kind);
}

export function feedItemLabel(item: FeedItem) {
  if (item.type === "check_in") return "Check-in";
  const kind = normalizePostKind(item.kind);
  return kind === "prayer_request" ? "Prayer request" : "Post";
}

export function defaultFeedTitle(item: FeedItem, moodLabel: (mood: number) => string) {
  if (item.type === "check_in") return moodLabel(item.mood);
  if (normalizePostKind(item.kind) === "prayer_request") return "Please pray";
  return "Shared post";
}
