import { feedItemKind, moodScaleValue, normalizeEntryKind } from "@/state/product";
import type { EntryKind, FeedItem, HeartMood } from "@/state/types";
import { translateMessage, type TranslationFunction, type TranslationKey } from "@/ui/localization";

const prayerMomentTemplateToken = "\u0000";

function englishPrayerMomentCopy(key: TranslationKey, values?: Record<string, string>) {
  return translateMessage("en", key, values);
}

function templateParts(template: string) {
  const tokenIndex = template.indexOf(prayerMomentTemplateToken);
  return tokenIndex < 0
    ? { prefix: template, suffix: "" }
    : {
        prefix: template.slice(0, tokenIndex),
        suffix: template.slice(tokenIndex + prayerMomentTemplateToken.length),
      };
}

export function communityPrayerMomentCanonicalCopy(recipientNameValue?: string, noteValue = "") {
  const recipientName = recipientNameValue?.trim();
  const note = noteValue.trim();
  const body = recipientName
    ? englishPrayerMomentCopy("community.prayer.generated.bodyForPerson", { name: recipientName })
    : englishPrayerMomentCopy("community.prayer.generated.body");

  return {
    body: note ? `${body}\n\n${englishPrayerMomentCopy("community.prayer.generated.about", { note })}` : body,
    title: recipientName
      ? englishPrayerMomentCopy("community.prayer.generated.titleForPerson", { name: recipientName })
      : englishPrayerMomentCopy("community.defaultTitle.prayerMoment"),
  };
}

export function communityPrayerMomentDisplayCopy(
  item: Pick<Extract<FeedItem, { type: "post" }>, "body" | "kind" | "title">,
  t: TranslationFunction,
) {
  const original = { body: item.body, title: item.title };
  if (normalizeEntryKind(item.kind) !== "prayer_moment") return original;

  const aboutTemplate = englishPrayerMomentCopy("community.prayer.generated.about", { note: prayerMomentTemplateToken });
  const { prefix: aboutPrefix, suffix: aboutSuffix } = templateParts(aboutTemplate);
  const aboutSeparator = `\n\n${aboutPrefix}`;
  const aboutIndex = item.body.indexOf(aboutSeparator);
  const canonicalBody = aboutIndex < 0 ? item.body : item.body.slice(0, aboutIndex);
  const note = aboutIndex < 0 ? undefined : item.body.slice(aboutIndex + aboutSeparator.length, aboutSuffix ? -aboutSuffix.length : undefined);
  if (aboutIndex >= 0 && aboutSuffix && !item.body.endsWith(aboutSuffix)) return original;

  const canonicalGenericBody = englishPrayerMomentCopy("community.prayer.generated.body");
  const canonicalGenericTitle = englishPrayerMomentCopy("community.defaultTitle.prayerMoment");
  let recipientName: string | undefined;

  if (canonicalBody === canonicalGenericBody && item.title === canonicalGenericTitle) {
    recipientName = undefined;
  } else {
    const recipientBodyTemplate = englishPrayerMomentCopy("community.prayer.generated.bodyForPerson", { name: prayerMomentTemplateToken });
    const { prefix, suffix } = templateParts(recipientBodyTemplate);
    if (!canonicalBody.startsWith(prefix) || !canonicalBody.endsWith(suffix)) return original;
    recipientName = canonicalBody.slice(prefix.length, suffix ? -suffix.length : undefined);
    if (!recipientName || item.title !== englishPrayerMomentCopy("community.prayer.generated.titleForPerson", { name: recipientName })) {
      return original;
    }
  }

  const localizedBody = recipientName
    ? t("community.prayer.generated.bodyForPerson", { name: recipientName })
    : t("community.prayer.generated.body");
  return {
    body: note === undefined ? localizedBody : `${localizedBody}\n\n${t("community.prayer.generated.about", { note })}`,
    title: recipientName
      ? t("community.prayer.generated.titleForPerson", { name: recipientName })
      : t("community.defaultTitle.prayerMoment"),
  };
}

export function communityEntryKindLabel(kind: EntryKind | "post" | undefined, t: TranslationFunction) {
  const normalized = normalizeEntryKind(kind);
  if (normalized === "prayer_request") return t("community.contentType.prayerRequest");
  if (normalized === "prayer_moment") return t("community.contentType.prayerMoment");
  if (normalized === "praise") return t("community.contentType.praise");
  if (normalized === "update") return t("community.contentType.update");
  if (normalized === "scripture") return t("community.contentType.scripture");
  return t("community.contentType.reflection");
}

export function communityFeedItemLabel(item: FeedItem, t: TranslationFunction) {
  if (item.type === "check_in") return t("community.contentType.checkIn");
  return communityEntryKindLabel(item.kind, t);
}

export function communityActionLabel(kind: EntryKind, completed: boolean, t: TranslationFunction) {
  if (kind === "prayer_request" || kind === "prayer_moment") {
    return t(completed ? "community.action.prayer.completed" : "community.action.prayer.default");
  }
  if (kind === "praise") return t(completed ? "community.action.praise.completed" : "community.action.praise.default");
  if (kind === "update") return t(completed ? "community.action.update.completed" : "community.action.update.default");
  if (kind === "scripture") return t(completed ? "community.action.scripture.completed" : "community.action.scripture.default");
  return t(completed ? "community.action.reflection.completed" : "community.action.reflection.default");
}

export function communityResponseNoun(item: FeedItem, count: number, t: TranslationFunction) {
  const itemKind = feedItemKind(item);
  if (itemKind === "reflection") {
    return t(count === 1 ? "community.response.encouragement.one" : "community.response.encouragement.other");
  }
  if (itemKind === "praise") return t(count === 1 ? "community.response.amen.one" : "community.response.amen.other");
  if (itemKind === "scripture") {
    return t(count === 1 ? "community.response.reflection.one" : "community.response.reflection.other");
  }
  return t(count === 1 ? "community.response.response.one" : "community.response.response.other");
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
  const kind = normalizeEntryKind(item.kind);
  if (kind === "prayer_request") return t("community.defaultTitle.prayerRequest");
  if (kind === "prayer_moment") return t("community.defaultTitle.prayerMoment");
  if (kind === "praise") return t("community.defaultTitle.praise");
  if (kind === "update") return t("community.defaultTitle.update");
  if (kind === "scripture") return t("community.defaultTitle.scripture");
  return t("community.defaultTitle.reflection");
}

export function communityRoomTabLabel(value: "recent" | "prayer" | "checkins" | "reflections", t: TranslationFunction) {
  if (value === "prayer") return t("community.tabs.prayer");
  if (value === "checkins") return t("community.tabs.checkIns");
  if (value === "reflections") return t("community.tabs.reflections");
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
