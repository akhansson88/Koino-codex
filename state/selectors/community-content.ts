import { normalizeEntryKind } from "@/state/product";
import type { BibleVerse, CheckIn, EntryKind, FeedItem, Id, Post, PrayerReaction } from "@/state/types";

type CommunityPostItem = Extract<FeedItem, { type: "post" }>;
type CommunityCheckInItem = Extract<FeedItem, { type: "check_in" }>;

export type CommunityContentSelectorInput = {
  checkIns: readonly CheckIn[];
  groupId?: Id;
  posts: readonly Post[];
};

const renderablePostKinds = new Set<EntryKind | "post">([
  "post",
  "reflection",
  "prayer_request",
  "prayer_moment",
  "praise",
  "update",
  "scripture",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isBibleVerse(value: unknown): value is BibleVerse {
  if (!value || typeof value !== "object") return false;
  const verse = value as Partial<BibleVerse>;
  return isNonEmptyString(verse.reference) && isNonEmptyString(verse.text);
}

function hasRenderableScripture(value: Pick<Post | CheckIn, "verse" | "verses">) {
  if (value.verse !== undefined && !isBibleVerse(value.verse)) return false;
  if (value.verses !== undefined && (!Array.isArray(value.verses) || !value.verses.every(isBibleVerse))) return false;
  return true;
}

function isRenderableCheckIn(checkIn: CheckIn, groupId: Id) {
  return (
    checkIn.groupId === groupId &&
    checkIn.visibility === "group" &&
    isNonEmptyString(checkIn.id) &&
    isNonEmptyString(checkIn.userId) &&
    typeof checkIn.reflectionText === "string" &&
    typeof checkIn.readToday === "boolean" &&
    typeof checkIn.mood === "number" &&
    Number.isFinite(checkIn.mood) &&
    isValidTimestamp(checkIn.createdAt) &&
    hasRenderableScripture(checkIn)
  );
}

function isRenderablePost(post: Post, groupId: Id) {
  if (
    post.groupId !== groupId ||
    !isNonEmptyString(post.id) ||
    !isNonEmptyString(post.userId) ||
    (post.kind !== undefined && (typeof post.kind !== "string" || !renderablePostKinds.has(post.kind))) ||
    typeof post.body !== "string" ||
    (post.title !== undefined && typeof post.title !== "string") ||
    (post.images !== undefined && (!Array.isArray(post.images) || !post.images.every((image) => typeof image === "string"))) ||
    (post.answeredAt !== undefined && !isValidTimestamp(post.answeredAt)) ||
    (post.answeredMarkedAt !== undefined && !isValidTimestamp(post.answeredMarkedAt)) ||
    !isValidTimestamp(post.createdAt) ||
    !hasRenderableScripture(post)
  ) {
    return false;
  }

  const kind = normalizeEntryKind(post.kind);
  if (kind === "scripture") return Boolean(post.verse || post.verses?.length);
  return post.body.trim().length > 0;
}

function checkInFeedItem(checkIn: CheckIn): CommunityCheckInItem {
  return {
    type: "check_in",
    id: checkIn.id,
    userId: checkIn.userId,
    groupId: checkIn.groupId,
    body: checkIn.reflectionText,
    mood: checkIn.mood,
    readToday: checkIn.readToday,
    verse: checkIn.verse,
    verses: checkIn.verses,
    createdAt: checkIn.createdAt,
  };
}

function postFeedItem(post: Post): CommunityPostItem {
  return {
    type: "post",
    id: post.id,
    userId: post.userId,
    groupId: post.groupId,
    kind: post.kind ?? "post",
    title: post.title,
    body: post.body,
    verse: post.verse,
    verses: post.verses,
    images: post.images,
    answeredAt: post.answeredAt,
    answeredMarkedAt: post.answeredMarkedAt,
    createdAt: post.createdAt,
  };
}

function communityContentKey(item: FeedItem) {
  return `${item.type}:${item.id}`;
}

function compareCommunityContent(left: FeedItem, right: FeedItem) {
  const timestampDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  return timestampDifference || communityContentKey(left).localeCompare(communityContentKey(right));
}

export function selectCommunityContent({ checkIns, groupId, posts }: CommunityContentSelectorInput): FeedItem[] {
  if (!groupId) return [];

  const uniqueItems = new Map<string, FeedItem>();

  checkIns.forEach((checkIn) => {
    if (!isRenderableCheckIn(checkIn, groupId)) return;
    const item = checkInFeedItem(checkIn);
    uniqueItems.set(communityContentKey(item), item);
  });

  posts.forEach((post) => {
    if (!isRenderablePost(post, groupId) || normalizeEntryKind(post.kind) === "prayer_moment") return;
    const item = postFeedItem(post);
    uniqueItems.set(communityContentKey(item), item);
  });

  return [...uniqueItems.values()].sort(compareCommunityContent);
}

export function selectCommunityPostById(
  posts: readonly Post[],
  groupId: Id | undefined,
  postId: Id | undefined,
): CommunityPostItem | undefined {
  if (!groupId || !postId) return undefined;
  const post = posts.find((candidate) => candidate.groupId === groupId && candidate.id === postId);
  return post && isRenderablePost(post, groupId) ? postFeedItem(post) : undefined;
}

export function selectPrayerRequests(items: readonly FeedItem[]): CommunityPostItem[] {
  return items.filter(
    (item): item is CommunityPostItem => item.type === "post" && normalizeEntryKind(item.kind) === "prayer_request",
  );
}

export function selectOpenPrayerRequests(items: readonly FeedItem[]): CommunityPostItem[] {
  return selectPrayerRequests(items).filter((item) => !item.answeredAt);
}

function compareOldestCommunityContent(left: FeedItem, right: FeedItem) {
  const timestampDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return timestampDifference || communityContentKey(left).localeCompare(communityContentKey(right));
}

export function selectHomePrayerQueueIds(
  items: readonly FeedItem[],
  currentUserId: Id | undefined,
  prayerReactions: readonly PrayerReaction[],
): Id[] {
  if (!currentUserId) return [];

  const prayedRequestIds = new Set(
    prayerReactions
      .filter((reaction) => reaction.targetType === "post" && reaction.userId === currentUserId)
      .map((reaction) => reaction.targetId),
  );
  const eligibleRequests = selectOpenPrayerRequests(items).filter((item) => item.userId !== currentUserId);
  const unprayedRequests = eligibleRequests
    .filter((item) => !prayedRequestIds.has(item.id))
    .sort(compareOldestCommunityContent);
  const prayedRequests = eligibleRequests
    .filter((item) => prayedRequestIds.has(item.id))
    .sort(compareOldestCommunityContent);

  return [...unprayedRequests, ...prayedRequests].map((item) => item.id);
}

export function findNextHomePrayerQueueIndex(
  queueIds: readonly Id[],
  validRequestIds: ReadonlySet<Id>,
  startIndex: number,
) {
  for (let index = Math.max(0, startIndex); index < queueIds.length; index += 1) {
    if (validRequestIds.has(queueIds[index])) return index;
  }
  return queueIds.length;
}

export function selectLatestHomeCommunityItem(
  items: readonly FeedItem[],
  currentUserId: Id | undefined,
): FeedItem | undefined {
  if (!currentUserId) return items[0];
  return items.find((item) => item.userId !== currentUserId) ?? items[0];
}
