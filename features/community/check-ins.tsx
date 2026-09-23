import { Feather } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { feedItemKind } from "@/state/product";
import type { FeedItem, GroupImage, Id } from "@/state/types";
import {
  AppScreen,
  BodyText,
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
import { colors, platformShadow, radius, typography } from "@/ui/theme";
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
      <FocusedCommunityScreenIntro
        communityName={communityName}
        description={t("community.checkIns.pageDescription")}
        onBack={onBack}
        title={t("community.page.checkIns")}
      />
      {!feedLoading && !feedError && !checkedInToday ? (
        <Card>
          <SectionHeading>{t("community.checkIns.weeklyTitle")}</SectionHeading>
          <BodyText muted>{t("community.checkIns.weeklyDescription")}</BodyText>
          <PrimaryButton icon="edit-3" onPress={onCheckIn}>
            {t("community.checkIns.action")}
          </PrimaryButton>
        </Card>
      ) : null}
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
  ownsItem: boolean;
  reacted: boolean;
  reactedBy?: { name: string; image?: GroupImage }[];
  reactionCount: number;
}) {
  const { t } = useAppTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);
  const itemKind = feedItemKind(item);

  function openDeleteConfirmation() {
    if (!onDelete) return;
    suppressOpenRef.current = true;
    setMenuOpen(false);
    onDelete();
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

  const menu = ownsItem && onDelete && menuOpen ? (
    <View
      style={{
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: radius.md,
        borderWidth: 1,
        minWidth: 118,
        paddingVertical: 4,
        position: "absolute",
        right: 14,
        top: 54,
        zIndex: 40,
        ...platformShadow({
          boxShadow: "0 10px 24px rgba(11, 18, 32, 0.14)",
          elevation: 12,
          offset: { width: 0, height: 10 },
          opacity: 0.14,
          radius: 24,
        }),
      }}
    >
      <Pressable
        accessibilityLabel={t("common.delete")}
        accessibilityRole="button"
        onPressIn={(event) => event.stopPropagation()}
        onPress={(event) => {
          event.stopPropagation();
          openDeleteConfirmation();
        }}
        style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 }}
      >
        <Feather name="trash-2" size={14} color={colors.danger} />
        <Text style={[typography.label, { color: colors.danger }]}>{t("common.delete")}</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <CommunityFeedCard
      actions={
        <CommunityCardAction
          active={reacted}
          icon="heart"
          label={communityActionLabel(itemKind, reacted, t)}
          onPress={onReact}
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
      headerAccessory={menuButton}
      item={item}
      onOpen={() => {
        if (menuOpen || suppressOpenRef.current) {
          setMenuOpen(false);
          return;
        }
        onOpen();
      }}
      overlay={menu}
      responseSummary={
        reactedBy?.length ? (
          <CommunityCardResponseSummary
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
