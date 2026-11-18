import { CommunityRemovalMenu } from "@/ui/community-removal-menu";
import { Feather } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { feedItemKind } from "@/state/product";
import type { FeedItem, GroupImage, Id } from "@/state/types";
import {
  AppScreen,
  BodyText,
  BottomSheet,
  Card,
  ExpandableBodyText,
  PrimaryButton,
  SectionHeading,
  VerseList,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityActionLabel, communityResponseNoun } from "@/ui/community-copy";
import { LinkPreviewContent } from "@/ui/link-preview";
import {
  CommunityCardAction,
  CommunityCardResponseSummary,
  CommunityCheckInMood,
  CommunityFeedCard,
} from "@/ui/post-card";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { SheetMenuGroup, SheetMenuItem } from "@/ui/sheet-menu";
import { FocusedCommunityScreenIntro } from "@/features/community/focused-header";
import {
  CommunityFeedOfflineState,
  CommunityFeedLoadingState,
  CommunityFeedErrorState,
  CommunityEarlierActivityAction,
} from "@/features/community/feed-components";

export function CommunityCheckInsScreen({
  checkIns,
  checkedInToday,
  communityName,
  currentUserId,
  feedError,
  feedLoading,
  feedOffline,
  hasMore,
  loadingMore,
  onBack,
  onCheckIn,
  onDelete,
  onOpenCheckIn,
  onReact,
  onLoadMore,
  reactionState,
  userById,
  userImageById,
}: {
  checkIns: Extract<FeedItem, { type: "check_in" }>[];
  checkedInToday: boolean;
  communityName: string;
  currentUserId?: Id;
  feedError?: string;
  feedLoading: boolean;
  feedOffline: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onBack: () => void;
  onCheckIn: () => void;
  onDelete: (item: Extract<FeedItem, { type: "check_in" }>) => void;
  onOpenCheckIn: (item: Extract<FeedItem, { type: "check_in" }>) => void;
  onReact: (item: FeedItem) => void;
  onLoadMore: () => Promise<void>;
  reactionState: (item: FeedItem) => {
    reacted: boolean;
    count: number;
    reactedBy: { name: string; image?: GroupImage }[];
  };
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const { t } = useAppTranslation();
  return (
    <AppScreen>
      <View style={{ gap: 12 }}>
        <FocusedCommunityScreenIntro
          communityName={communityName}
          description={t("community.checkIns.pageDescription")}
          onBack={onBack}
          title={t("community.page.checkIns")}
        />
        {!feedLoading && !feedError && !checkedInToday ? (
          <Card style={{ gap: 12 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: shadcn.brandSoft,
                  borderCurve: "continuous",
                  borderRadius: radius.lg,
                  height: 40,
                  justifyContent: "center",
                  width: 40,
                }}
              >
                <Feather name="sun" size={18} color={shadcn.brand} />
              </View>
              <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>
                {t("community.checkIns.weeklyTitle")}
              </Text>
            </View>
            <BodyText muted>{t("community.checkIns.weeklyDescription")}</BodyText>
            <PrimaryButton
              icon="edit-3"
              onPress={onCheckIn}
              style={{ alignSelf: "flex-start", minHeight: 44 }}
            >
              {t("community.checkIns.action")}
            </PrimaryButton>
          </Card>
        ) : null}
        {!feedLoading && !feedError && checkedInToday ? (
          <BodyText muted>{t("community.checkIns.completedToday")}</BodyText>
        ) : null}
      </View>
      <SectionHeading>{t("community.checkIns.recent")}</SectionHeading>
      {feedOffline && !feedError ? <CommunityFeedOfflineState /> : null}
      {feedLoading ? (
        <CommunityFeedLoadingState />
      ) : feedError ? (
        <CommunityFeedErrorState />
      ) : checkIns.length === 0 ? (
        <Card>
          <BodyText muted>{t("community.checkIns.empty")}</BodyText>
        </Card>
      ) : (
        checkIns.map((item) => {
          const reaction = reactionState(item);
          return (
            <CheckInCard
              key={item.id}
              authorImage={userImageById.get(item.userId)}
              authorName={userById.get(item.userId) ?? t("common.someone")}
              item={item}
              ownsItem={item.userId === currentUserId}
              onDelete={() => onDelete(item)}
              onOpen={() => onOpenCheckIn(item)}
              onReact={() => onReact(item)}
              reacted={reaction.reacted}
              reactedBy={reaction.reactedBy}
              reactionCount={reaction.count}
            />
          );
        })
      )}
      {hasMore && !feedLoading && !feedError ? (
        <CommunityEarlierActivityAction loading={loadingMore} onPress={onLoadMore} />
      ) : null}
    </AppScreen>
  );
}

export function CheckInCard({
  authorImage,
  authorName,
  item,
  onDelete,
  onOpen,
  onReact,
  overview = false,
  ownsItem,
  reacted,
  reactedBy,
  reactionCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: Extract<FeedItem, { type: "check_in" }>;
  onDelete?: () => void;
  onOpen: () => void;
  onReact: () => void;
  overview?: boolean;
  ownsItem: boolean;
  reacted: boolean;
  reactedBy?: { name: string; image?: GroupImage }[];
  reactionCount: number;
}) {
  const { t } = useAppTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);
  const pendingDelete = useRef<(() => void) | undefined>(undefined);
  const itemKind = feedItemKind(item);

  function openDeleteConfirmation() {
    if (!onDelete) return;
    suppressOpenRef.current = true;
    pendingDelete.current = onDelete;
    setMenuOpen(false);
  }

  function finishDeleteConfirmation() {
    const action = pendingDelete.current;
    pendingDelete.current = undefined;
    action?.();
    setTimeout(() => {
      suppressOpenRef.current = false;
    }, 250);
  }

  const menuButton = ownsItem && onDelete ? (
    <Pressable
      accessibilityLabel={t("community.card.checkInOptions")}
      accessibilityRole="button"
      hitSlop={4}
      onPressIn={(event) => event.stopPropagation()}
      onPress={(event) => {
        event.stopPropagation();
        setMenuOpen((current) => !current);
      }}
      style={{ alignItems: "center", flexShrink: 0, height: 44, justifyContent: "center", width: 44 }}
    >
      <Feather name="more-horizontal" size={19} color={colors.ink} />
    </Pressable>
  ) : null;

  const menu = ownsItem && onDelete ? (
    <BottomSheet
      title={t("community.card.checkInOptions")}
      visible={menuOpen}
      onClose={() => setMenuOpen(false)}
      onDismiss={finishDeleteConfirmation}
    >
      <SheetMenuGroup>
        <SheetMenuItem
          icon="trash-2"
          title={t("common.delete")}
          tone="danger"
          onPress={openDeleteConfirmation}
        />
      </SheetMenuGroup>
    </BottomSheet>
  ) : null;

  return (
    <CommunityFeedCard
      actions={
        <CommunityCardAction
          active={reacted}
          icon="heart"
          label={communityActionLabel(itemKind, reacted, t)}
          onPress={onReact}
          overview={overview || undefined}
          tone="check_in"
        />
      }
      attachment={
        <>
          <CommunityCheckInMood mood={item.mood} />
          <VerseList verse={item.verse} verses={item.verses} compact />
        </>
      }
      authorImage={authorImage}
      authorName={authorName}
      body={item.body}
      bodyContent={item.body.trim() ? (
        <LinkPreviewContent text={item.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <ExpandableBodyText actionMinHeight={44} collapsedLines={6} hiddenUrl={hiddenUrl}>{item.body}</ExpandableBodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      ) : undefined}
      headerAccessory={menuButton ?? <CommunityRemovalMenu groupId={item.groupId} targetType={"check_in"} targetId={item.id} authorId={item.userId} />}
      item={item}
      onOpen={() => {
        if (menuOpen || suppressOpenRef.current) {
          setMenuOpen(false);
          return;
        }
        onOpen();
      }}
      overlay={menu}
      overview={overview || undefined}
      responseSummary={
        (overview ? reactionCount > 0 : reactedBy?.length) ? (
          <CommunityCardResponseSummary
            compact={overview || undefined}
            count={reactionCount}
            label={communityResponseNoun(item, reactionCount, t)}
            users={reactedBy}
          />
        ) : undefined
      }
      style={{ zIndex: menuOpen ? 10 : 1 }}
    />
  );
}
