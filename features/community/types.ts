import type { prayerFilters, roomTabs } from "@/state/product";
import type { FeedItem, GroupImage, Id } from "@/state/types";

export type RoomView = "rooms" | "detail" | "prayer" | "prayerMomentDetail" | "checkins" | "members";

export type RoomDetailTab = (typeof roomTabs)[number]["value"];

export type PrayerFilter = (typeof prayerFilters)[number]["value"];

export type TransitionDirection = "forward" | "back";

export type ComposerContext = "journal" | "room";

export type CommunityMember = { id: Id; image?: GroupImage; name: string; role: "owner" | "member" };

export type CommunityPrayerAssignment = { groupId: Id; memberId: Id; weekEndsAt: string; weekStartsAt: string };

export type CommunityFeedRevealState = Record<Id, Partial<Record<RoomDetailTab, number>>>;

export type CommunityFeedRow =
  | { type: "item"; item: FeedItem }
  | { type: "endpoint" | "earlierDivider" | "earlierEnd" };
