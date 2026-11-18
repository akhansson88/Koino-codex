import { CommunityRemovalMenu } from "@/ui/community-removal-menu";
import { useRef, useState } from "react";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { prayerFilters } from "@/state/product";
import type { FeedItem, GroupImage, Id, Reply } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  ExpandableBodyText,
  SectionHeading,
  StatusPill,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import {
  communityActionLabel,
  communityDefaultFeedTitle,
  communityPrayerFilterLabel,
  communityPrayerMomentDisplayCopy,
  communityPrayerNoun,
} from "@/ui/community-copy";
import { LinkPreviewContent } from "@/ui/link-preview";
import { CommunityCardAction, CommunityCardResponseSummary, CommunityFeedCard } from "@/ui/post-card";
import { PrayerActivity, type PrayerActivityEntry } from "@/ui/prayer-activity";
import { formatRelativeTime } from "@/ui/relative-time";
import { Badge } from "@/ui/shadcn/badge";
import { Button } from "@/ui/shadcn/button";
import { Separator } from "@/ui/shadcn/separator";
import { SheetMenuGroup, SheetMenuItem } from "@/ui/sheet-menu";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { type PrayerFilter } from "@/features/community/types";
import { FocusedCommunityScreenIntro, FocusedScreenHeader } from "@/features/community/focused-header";
import {
  CommunityFilterChips,
  CommunityFeedOfflineState,
  CommunityFeedLoadingState,
  CommunityFeedErrorState,
  CommunityEarlierActivityAction,
} from "@/features/community/feed-components";
import { isPrayerMomentKind } from "@/features/community/feed-helpers";

export function CommunityPrayerScreen({
  communityName,
  feedError,
  feedLoading,
  feedOffline,
  hasMore,
  loadingMore,
  filter,
  onBack,
  onCreatePrayer,
  onDeletePrayer,
  onEditPrayer,
  onFilter,
  onOpenPrayer,
  onPray,
  onPrayForSomeone,
  onLoadMore,
  prayerPosts,
  prayerState,
  currentUserId,
  userById,
  userImageById,
}: {
  communityName: string;
  feedError?: string;
  feedLoading: boolean;
  feedOffline: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  filter: PrayerFilter;
  onBack: () => void;
  onCreatePrayer: () => void;
  onDeletePrayer: (item: Extract<FeedItem, { type: "post" }>) => void;
  onEditPrayer: (item: Extract<FeedItem, { type: "post" }>) => void;
  onFilter: (filter: PrayerFilter) => void;
  onOpenPrayer: (item: Extract<FeedItem, { type: "post" }>) => void;
  onPray: (item: FeedItem) => void;
  onPrayForSomeone: () => void;
  onLoadMore: () => Promise<void>;
  prayerPosts: Extract<FeedItem, { type: "post" }>[];
  prayerState: (item: FeedItem) => { prayed: boolean; count: number; prayedBy: { name: string; image?: GroupImage }[] };
  currentUserId?: Id;
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const { t } = useAppTranslation();
  const prayerCountKey =
    filter === "open"
      ? prayerPosts.length === 1
        ? "community.prayer.count.open.one"
        : "community.prayer.count.open.other"
      : filter === "answered"
        ? prayerPosts.length === 1
          ? "community.prayer.count.answered.one"
          : "community.prayer.count.answered.other"
        : prayerPosts.length === 1
          ? "community.prayer.count.total.one"
          : "community.prayer.count.total.other";

  return (
    <AppScreen>
      <View style={{ gap: 12 }}>
        <FocusedCommunityScreenIntro
          communityName={communityName}
          description={t("community.prayer.pageDescription")}
          onBack={onBack}
          title={t("community.page.prayer")}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button icon="users" onPress={onPrayForSomeone} style={{ flex: 1 }} variant="outline">
            {t("community.prayer.prayForSomeone")}
          </Button>
          <Button icon="plus" onPress={onCreatePrayer} style={{ flex: 1 }}>
            {t("community.prayer.share")}
          </Button>
        </View>
        <View style={{ gap: 6 }}>
          <CommunityFilterChips
            value={filter}
            onChange={onFilter}
            options={prayerFilters.map((item) => ({ label: communityPrayerFilterLabel(item.value, t), value: item.value }))}
          />
          <BodyText muted>
            {feedLoading
              ? t("community.feed.loading")
              : feedError
                ? t("community.feed.unavailable")
                : t(prayerCountKey, { count: prayerPosts.length })}
          </BodyText>
        </View>
      </View>
      {feedOffline && !feedError ? <CommunityFeedOfflineState /> : null}
      {feedLoading ? (
        <CommunityFeedLoadingState />
      ) : feedError ? (
        <CommunityFeedErrorState />
      ) : prayerPosts.length === 0 ? (
        <Card>
          <BodyText muted>
            {t(filter === "open" ? "community.prayer.emptyOpen" : filter === "answered" ? "community.prayer.emptyAnswered" : "community.prayer.empty")}
          </BodyText>
        </Card>
      ) : (
        prayerPosts.map((item) => {
          const prayer = prayerState(item);
          return (
            <PrayerRequestCard
              focused
              key={item.id}
              authorImage={userImageById.get(item.userId)}
              authorName={userById.get(item.userId) ?? t("common.someone")}
              item={item}
              ownsItem={item.userId === currentUserId}
              prayed={prayer.prayed}
              prayedBy={prayer.prayedBy}
              prayerCount={prayer.count}
              onOpen={() => onOpenPrayer(item)}
              onPray={() => onPray(item)}
              onEdit={() => onEditPrayer(item)}
              onDelete={() => onDeletePrayer(item)}
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

export function CommunityPrayerMomentDetailScreen({
  activity,
  authorImage,
  authorName,
  encouragementDraft,
  item,
  onBack,
  onChangeEncouragement,
  onSendEncouragement,
  replies,
  userById,
  userImageById,
}: {
  activity: PrayerActivityEntry[];
  authorImage?: GroupImage;
  authorName: string;
  encouragementDraft: string;
  item: Extract<FeedItem, { type: "post" }>;
  onBack: () => void;
  onChangeEncouragement: (value: string) => void;
  onSendEncouragement: (body?: string, replyId?: string) => Promise<void>;
  replies: Reply[];
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const { language, t } = useAppTranslation();
  const displayCopy = communityPrayerMomentDisplayCopy(item, t);

  return (
    <AppScreen topInset={false}>
      <FocusedScreenHeader onBack={onBack} title={t("community.page.prayer")} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar image={authorImage} name={authorName} size={56} tone="green" />
        <View style={{ alignItems: "center", gap: 2 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{authorName}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{formatRelativeTime(item.createdAt, language)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={[typography.heading, { color: colors.ink, textAlign: "center" }]}>
          {displayCopy.title || communityDefaultFeedTitle(item, t)}
        </Text>
        <LinkPreviewContent text={displayCopy.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <BodyText hiddenUrl={hiddenUrl} style={{ fontSize: 16, lineHeight: 24, textAlign: "center" }}>
                {displayCopy.body || t("community.card.noWords")}
              </BodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      </View>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: shadcn.secondary,
            borderCurve: "continuous",
            borderRadius: radius.md,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <MaterialCommunityIcons name="hands-pray" size={19} color={colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.prayer.made")}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>
            {t("community.prayer.sharedTime", { time: formatRelativeTime(item.createdAt, language) })}
          </Text>
        </View>
        <PrayerMomentPill />
      </Card>
      {replies.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>{t("community.reply.heading")}</SectionHeading>
          <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
            {replies.map((reply, index) => (
              <View key={reply.id}>
                <View style={{ gap: 8, padding: 14 }}>
                  <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                    <Avatar image={userImageById.get(reply.userId)} name={userById.get(reply.userId)} size={30} tone="pink" />
                    <View>
                      <Text style={[typography.cardTitle, { color: colors.ink, fontSize: 14, lineHeight: 19 }]}>
                        {userById.get(reply.userId) ?? t("common.someone")}
                      </Text>
                      <Text style={[typography.caption, { color: colors.muted }]}>
                        {formatRelativeTime(reply.createdAt, language)}
                      </Text>
                    </View>
                  </View>
                  <LinkPreviewContent text={reply.body}>
                    {({ hiddenUrl, preview }) => (
                      <>
                        <BodyText hiddenUrl={hiddenUrl}>{reply.body}</BodyText>
                        {preview}
                      </>
                    )}
                  </LinkPreviewContent>
                </View>
                {index < replies.length - 1 ? <Separator style={{ marginHorizontal: 14 }} /> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <TextInputField
          value={encouragementDraft}
          onChangeText={(value) => onChangeEncouragement(value.slice(0, 500))}
          onSubmitEditing={() => onSendEncouragement()}
          placeholder={t("community.reply.encouragementPlaceholder")}
          returnKeyType="send"
          style={{ flex: 1 }}
        />
        <Button
          accessibilityLabel={t("community.reply.send")}
          disabled={!encouragementDraft.trim()}
          icon="send"
          onPress={() => onSendEncouragement()}
          size="icon"
        />
      </View>
      <PrayerActivity activity={activity} />
    </AppScreen>
  );
}

function PrayerMomentPill() {
  const { t } = useAppTranslation();
  return <Badge variant="success">{t("community.action.prayer.completed")}</Badge>;
}

export function PrayerRequestCard({
  authorImage,
  authorName,
  focused = false,
  item,
  onDelete,
  onEdit,
  onOpen,
  onPray,
  overview = false,
  ownsItem,
  prayed,
  prayedBy,
  prayerCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  focused?: boolean;
  item: Extract<FeedItem, { type: "post" }>;
  onDelete?: () => void;
  onEdit?: () => void;
  onOpen: () => void;
  onPray: () => void;
  overview?: boolean;
  ownsItem: boolean;
  prayed: boolean;
  prayedBy?: { name: string; image?: GroupImage }[];
  prayerCount: number;
}) {
  const { t } = useAppTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);
  const pendingMenuAction = useRef<(() => void) | undefined>(undefined);
  const prayerStatus = item.answeredAt ? "answered" : "open";
  const prayerStatusLabel = t(`shared.status.${prayerStatus}`);
  const prayerMoment = isPrayerMomentKind(item.kind);
  const displayCopy = communityPrayerMomentDisplayCopy(item, t);

  function runMenuAction(action: () => void) {
    suppressOpenRef.current = true;
    pendingMenuAction.current = action;
    setMenuOpen(false);
  }

  function finishMenuAction() {
    const action = pendingMenuAction.current;
    pendingMenuAction.current = undefined;
    action?.();
    setTimeout(() => {
      suppressOpenRef.current = false;
    }, 250);
  }

  const menuButton = ownsItem && (onEdit || onDelete) ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("community.card.postOptions")}
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

  const menu = ownsItem && (onEdit || onDelete) ? (
    <BottomSheet
      title={t("community.card.postOptions")}
      visible={menuOpen}
      onClose={() => setMenuOpen(false)}
      onDismiss={finishMenuAction}
    >
      <SheetMenuGroup>
        {onEdit ? (
          <SheetMenuItem
            icon="edit-2"
            title={t("common.edit")}
            onPress={() => runMenuAction(onEdit)}
          />
        ) : null}
        {onDelete ? (
          <SheetMenuItem
            icon="trash-2"
            showDivider={Boolean(onEdit)}
            title={t("common.delete")}
            tone="danger"
            onPress={() => runMenuAction(onDelete)}
          />
        ) : null}
      </SheetMenuGroup>
    </BottomSheet>
  ) : null;

  return (
    <CommunityFeedCard
      actions={
        prayerMoment ? (
          <CommunityCardAction
            active
            icon="pray"
            label={t("community.action.prayer.completed")}
            overview={overview || undefined}
            tone="prayer"
          />
        ) : focused && !prayed ? (
          <CommunityCardAction
            accessibilityLabel={t("community.prayer.prayForRequest", { name: authorName })}
            icon="pray"
            label={communityActionLabel("prayer_request", false, t)}
            onPress={onPray}
            overview={overview || undefined}
            tone="prayer"
          />
        ) : (
          <CommunityCardAction
            accessibilityLabel={focused ? t("community.prayer.prayAgainForRequest", { name: authorName }) : undefined}
            active={prayed}
            icon="pray"
            label={communityActionLabel("prayer_request", prayed, t)}
            onPress={onPray}
            overview={overview || undefined}
            tone="prayer"
          />
        )
      }
      attachment={<VerseList verse={item.verse} verses={item.verses} compact />}
      authorImage={authorImage}
      authorName={authorName}
      body={displayCopy.body}
      bodyContent={
        <LinkPreviewContent text={displayCopy.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <ExpandableBodyText actionMinHeight={44} collapsedLines={6} hiddenUrl={hiddenUrl}>
                {displayCopy.body || t("community.card.noWords")}
              </ExpandableBodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      }
      bodyFallback={t("community.card.noWords")}
      item={item}
      headerAccessory={menuButton ?? <CommunityRemovalMenu groupId={item.groupId} targetType={"post"} targetId={item.id} authorId={item.userId} />}
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
        prayerMoment || (overview && prayerCount === 0) ? undefined : (
          <CommunityCardResponseSummary
            compact={overview || undefined}
            count={prayerCount}
            label={communityPrayerNoun(prayerCount, t)}
            showWhenEmpty={!overview}
            users={prayedBy}
          />
        )
      }
      status={prayerMoment ? undefined : overview ? (
        <Text
          accessibilityLabel={`${t("community.prayer.status.label")}. ${prayerStatusLabel}`}
          style={[typography.caption, { color: colors.textSecondary, flexShrink: 1 }]}
        >
          {prayerStatusLabel}
        </Text>
      ) : <StatusPill status={prayerStatus} />}
      style={{ zIndex: menuOpen ? 10 : 1 }}
    />
  );
}
