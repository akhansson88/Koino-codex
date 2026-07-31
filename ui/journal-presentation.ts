import { heartMoods, journalEntryTypeFor, moodOptionForValue } from "@/state/product";
import type { JournalEntry, JournalEntryType } from "@/state/types";
import { communityHeartMoodCopy, communityMoodScaleLabel } from "@/ui/community-copy";
import type { TranslationFunction, TranslationKey } from "@/ui/localization";

export type JournalPresentationIcon =
  | "book-open"
  | "check-circle"
  | "circle"
  | "cloud"
  | "cloud-rain"
  | "edit-3"
  | "feather"
  | "heart"
  | "moon"
  | "star"
  | "sun";

const typeLabelKeys: Record<JournalEntryType, TranslationKey> = {
  reflection: "me.journey.type.reflection",
  prayer: "me.journey.type.prayer",
  answered_prayer: "me.journey.type.praise",
  heart_checkin: "me.journey.type.checkIn",
  scripture_note: "me.journey.type.reflection",
};

function sameDisplayText(first?: string, second?: string) {
  if (!first || !second) return false;
  return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();
}

export function journalEntryPresentation(entry: JournalEntry, t: TranslationFunction) {
  const journalType = entry.entryKind === "update" ? "heart_checkin" : journalEntryTypeFor(entry);
  const exactMood = entry.heartMood ? heartMoods.find((item) => item.value === entry.heartMood) : undefined;
  const numericMood = typeof entry.mood === "number" ? moodOptionForValue(entry.mood) : undefined;
  const moodLabel = entry.heartMood
    ? communityHeartMoodCopy(entry.heartMood, t).label
    : typeof entry.mood === "number"
      ? communityMoodScaleLabel(entry.mood, t)
      : undefined;
  const moodIcon = exactMood?.icon ?? numericMood?.icon ?? "circle";
  let title = entry.title?.trim() || undefined;
  let body = entry.body.trim() || undefined;

  if (journalType === "heart_checkin") {
    if (sameDisplayText(title, moodLabel)) title = undefined;
    if (sameDisplayText(body, moodLabel) || sameDisplayText(body, title)) body = undefined;
  }

  const typeIcon: JournalPresentationIcon =
    journalType === "heart_checkin"
      ? moodIcon
      : journalType === "scripture_note"
        ? "book-open"
        : journalType === "answered_prayer"
          ? "check-circle"
          : journalType === "prayer"
            ? "heart"
            : "edit-3";

  return {
    body,
    journalType,
    moodIcon: moodIcon as JournalPresentationIcon,
    moodLabel,
    title,
    typeIcon,
    typeLabel: t(typeLabelKeys[journalType]),
  };
}
