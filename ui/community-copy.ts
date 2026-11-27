import { moodScaleValue, normalizeEntryKind } from "@/state/product";
import type { EntryKind, FeedItem, HeartMood } from "@/state/types";
import { translateMessage, type TranslationFunction, type TranslationKey } from "@/ui/localization";

// Legacy prayer-moment posts are rendered as ordinary posts.
export function communityPrayerMomentDisplayCopy(
  item: Pick<Extract<FeedItem, { type: "post" }>, "body" | "kind" | "title">,
  _t: TranslationFunction,
) {
  return { body: item.body, title: item.title };
}

export function communityEntryKindLabel(kind: EntryKind | "post" | undefined, t: TranslationFunction) {
  return normalizeEntryKind(kind) === "prayer_request"
    ? t("community.contentType.prayerRequest")
    : t("community.contentType.post");
}

export function communityFeedItemLabel(item: FeedItem, t: TranslationFunction) {
  if (item.type === "check_in") return t("community.contentType.checkIn");
  return communityEntryKindLabel(item.kind, t);
}

export function communityActionLabel(kind: EntryKind, completed: boolean, t: TranslationFunction) {
  if (normalizeEntryKind(kind) === "prayer_request") {
    return t(completed ? "community.action.prayer.completed" : "community.action.prayer.default");
  }
  return t(completed ? "community.like.completed" : "community.like.default");
}

export function communityPrayerNoun(count: number, t: TranslationFunction) {
  return t(count === 1 ? "community.response.prayer.one" : "community.response.prayer.other");
}

export function communityMemberCount(count: number, t: TranslationFunction) {
  return t(count === 1 ? "community.members.count.one" : "community.members.count.other", { count });
}

export function communityMoodScaleLabel(mood: number, t: TranslationFunction) {
  const value = moodScaleValue(mood);
  if (value === 5) return t("community.checkIn.moodScale.joyful");
  if (value === 4) return t("community.checkIn.moodScale.peaceful");
  if (value === 2) return t("community.checkIn.moodScale.heavy");
  if (value === 1) return t("community.checkIn.moodScale.struggling");
  return t("community.checkIn.moodScale.okay");
}

export function communityMoodScaleDescription(mood: number, t: TranslationFunction) {
  const value = moodScaleValue(mood);
  if (value === 5) return t("community.checkIn.moodScale.joyfulDescription");
  if (value === 4) return t("community.checkIn.moodScale.peacefulDescription");
  if (value === 2) return t("community.checkIn.moodScale.heavyDescription");
  if (value === 1) return t("community.checkIn.moodScale.strugglingDescription");
  return t("community.checkIn.moodScale.okayDescription");
}

export function communityHeartMoodCopy(mood: HeartMood, t: TranslationFunction) {
  if (mood === "peaceful") {
    return { label: t("community.checkIn.mood.peaceful.label"), description: t("community.checkIn.mood.peaceful.description") };
  }
  if (mood === "grateful") {
    return { label: t("community.checkIn.mood.grateful.label"), description: t("community.checkIn.mood.grateful.description") };
  }
  if (mood === "heavy") {
    return { label: t("community.checkIn.mood.heavy.label"), description: t("community.checkIn.mood.heavy.description") };
  }
  if (mood === "anxious") {
    return { label: t("community.checkIn.mood.anxious.label"), description: t("community.checkIn.mood.anxious.description") };
  }
  if (mood === "hopeful") {
    return { label: t("community.checkIn.mood.hopeful.label"), description: t("community.checkIn.mood.hopeful.description") };
  }
  return { label: t("community.checkIn.mood.tired.label"), description: t("community.checkIn.mood.tired.description") };
}

export function communityDefaultFeedTitle(item: FeedItem, t: TranslationFunction) {
  if (item.type === "check_in") return communityMoodScaleLabel(item.mood, t);
  return normalizeEntryKind(item.kind) === "prayer_request"
    ? t("community.defaultTitle.prayerRequest")
    : t("community.defaultTitle.post");
}

export function communityRoomTabLabel(value: "recent" | "prayer" | "checkins", t: TranslationFunction) {
  if (value === "prayer") return t("community.tabs.prayer");
  if (value === "checkins") return t("community.tabs.checkIns");
  return t("community.tabs.recent");
}

export function communityPrayerFilterLabel(value: "all" | "answered" | "open", t: TranslationFunction) {
  if (value === "answered") return t("community.prayer.filter.answered");
  if (value === "all") return t("community.prayer.filter.all");
  return t("community.prayer.filter.open");
}

export function communitySystemError(message: string, t: TranslationFunction) {
  if (message === "Enter a community invite code.") return t("community.error.inviteCodeRequired");
  if (message === "No community exists for that invite code.") return t("community.error.inviteNotFound");
  if (message === "Only the community host can transfer ownership.") return t("community.error.hostTransferOnly");
  if (message === "Choose another current member of this community.") return t("community.error.memberTransferInvalid");
  if (message === "Only the community host can change the community image.") return t("community.error.hostImageChangeOnly");
  if (message === "Only the community host can delete the community image.") return t("community.error.hostImageDeleteOnly");
  if (message === "Prayer completion could not be saved.") return t("community.error.prayerCompletion");
  if (message === "Firebase blocked that change. Check the database rules for this project.") return t("community.error.permissionDenied");
  return t("community.error.generic");
}
