import { Platform, Share } from "react-native";
import { normalizeEntryKind } from "@/state/product";
import type { EntryKind, FeedItem, Group, Id } from "@/state/types";
import type { TranslationFunction } from "@/ui/localization";
import { type RoomDetailTab } from "@/features/community/types";

export const COMMUNITY_RECENT_DAYS = 30;

const COMMUNITY_RECENT_ITEM_LIMIT = 20;

export const COMMUNITY_EARLIER_PAGE_SIZE = 20;

export const FIREBASE_COMMUNITY_REVEAL_RESERVE = 50;

export const COMMUNITY_FEED_TIMER_MAX_DELAY = 2_147_000_000;

export function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isPrayerFeedKind(kind: EntryKind | "post" | undefined) {
  const normalized = normalizeEntryKind(kind);
  return normalized === "prayer_request" || normalized === "prayer_moment";
}

export function isPrayerMomentKind(kind: EntryKind | "post" | undefined) {
  return normalizeEntryKind(kind) === "prayer_moment";
}

export function roomMemberCount(counts: Record<Id, number>, roomId?: Id, fallback = 1) {
  if (!roomId) return fallback;
  return counts[roomId] || fallback;
}

export async function shareRoomInvite(room: Group, t: TranslationFunction) {
  const invitation = t("community.rooms.invitation", { code: room.inviteCode, name: room.name });
  const clipboard =
    Platform.OS === "web"
      ? (globalThis as typeof globalThis & { navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } } }).navigator?.clipboard
      : undefined;

  if (clipboard?.writeText) {
    await clipboard.writeText(invitation);
    return t("community.rooms.inviteCopied");
  }

  await Share.share({ message: invitation, title: t("community.rooms.joinNamed", { name: room.name }) });
  return t("community.rooms.inviteReady");
}

export function communityFeedItemKey(item: FeedItem) {
  return `${item.type}:${item.id}`;
}

export function filterCommunityFeedItems(items: FeedItem[], detailTab: RoomDetailTab) {
  if (detailTab === "prayer") {
    return items.filter((item) => item.type === "post" && isPrayerFeedKind(item.kind));
  }
  if (detailTab === "checkins") {
    return items.filter((item) => item.type === "check_in");
  }
  if (detailTab === "reflections") {
    return items.filter((item) => item.type === "post" && normalizeEntryKind(item.kind) === "reflection");
  }
  return items;
}

export function partitionCommunityFeed(items: FeedItem[], now = Date.now()) {
  const cutoff = now - COMMUNITY_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const recent: FeedItem[] = [];
  const earlier: FeedItem[] = [];

  for (const item of items) {
    const createdAt = Date.parse(item.createdAt);
    if (Number.isFinite(createdAt) && createdAt >= cutoff && recent.length < COMMUNITY_RECENT_ITEM_LIMIT) {
      recent.push(item);
    } else {
      earlier.push(item);
    }
  }

  return { earlier, recent };
}

export function communityFeedEndpointBody(detailTab: RoomDetailTab, communityName: string, variant: "caught-up" | "no-recent", t: TranslationFunction) {
  if (variant === "no-recent") {
    if (detailTab === "prayer") return t("community.feed.noRecentPrayer", { name: communityName });
    if (detailTab === "checkins") return t("community.feed.noRecentCheckIns", { name: communityName });
    if (detailTab === "reflections") return t("community.feed.noRecentReflections", { name: communityName });
    return t("community.feed.noRecent", { name: communityName });
  }

  if (detailTab === "prayer") return t("community.feed.caughtUpPrayer", { name: communityName });
  if (detailTab === "checkins") return t("community.feed.caughtUpCheckIns", { name: communityName });
  if (detailTab === "reflections") return t("community.feed.caughtUpReflections", { name: communityName });
  return t("community.feed.caughtUp", { name: communityName });
}
