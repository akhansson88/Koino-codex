import { useRef, useState } from "react";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { prayerFilters } from "@/state/product";
import type { FeedItem, GroupImage, Id, Reply } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  ExpandableBodyText,
  PrimaryButton,
  SecondaryButton,
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
import { colors, platformShadow, radius, typography } from "@/ui/theme";
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
      <FocusedCommunityScreenIntro
        communityName={communityName}
        description={t("community.prayer.pageDescription")}
        onBack={onBack}
        title={t("community.page.prayer")}
      />
      <CommunityFilterChips
        value={filter}
        onChange={onFilter}
        options={prayerFilters.map((item) => ({ label: communityPrayerFilterLabel(item.value, t), value: item.value }))}
      />
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
        <BodyText muted style={{ flex: 1, minWidth: 140 }}>
          {feedLoading
            ? t("community.feed.loading")
            : feedError
              ? t("community.feed.unavailable")
              : t(prayerCountKey, { count: prayerPosts.length })}
        </BodyText>
        <PrimaryButton icon="heart" onPress={onCreatePrayer} style={{ minHeight: 44, paddingHorizontal: 14 }}>
          {t("community.prayer.share")}
        </PrimaryButton>
      </View>
      <SecondaryButton icon="users" onPress={onPrayForSomeone} style={{ minHeight: 44 }}>
        {t("community.prayer.prayForSomeone")}
      </SecondaryButton>
      {feedOffline && !feedError ? <CommunityFeedOfflineState /> : null}
      {feedLoading ? (
        <CommunityFeedLoadingState />
      ) : feedError ? (
        <CommunityFeedErrorState />
      ) : prayerPosts.length === 0 ? (
        <Card>
          <BodyText muted>
            {t(filter === "answered" ? "community.prayer.emptyAnswered" : "community.prayer.empty")}
          </BodyText>
        </Card>
      ) : (
        prayerPosts.map((item) => {
          const prayer = prayerState(item);
          return (
            <PrayerRequestCard
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
        <Avatar image={authorImage} name={authorName} size={58} tone="green" />
        <View style={{ alignItems: "center", gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{authorName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt, language)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31, textAlign: "center" }}>
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
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }}>
        <MaterialCommunityIcons name="hands-pray" size={20} color={colors.gold} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.prayer.made")}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
            {t("community.prayer.sharedTime", { time: formatRelativeTime(item.createdAt, language) })}
          </Text>
        </View>
        <PrayerMomentPill />
      </Card>
      {replies.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>{t("community.reply.heading")}</SectionHeading>
          <Card style={{ gap: 0, padding: 0 }}>
            {replies.map((reply, index) => (
              <View
                key={reply.id}
                style={{
                  borderBottomColor: colors.line,
                  borderBottomWidth: index === replies.length - 1 ? 0 : 1,
                  gap: 8,
                  padding: 14,
                }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <Avatar image={userImageById.get(reply.userId)} name={userById.get(reply.userId)} size={32} tone="pink" />
                  <View>
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                      {userById.get(reply.userId) ?? t("common.someone")}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
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
        <Pressable
          accessibilityLabel={t("community.reply.send")}
          accessibilityRole="button"
          disabled={!encouragementDraft.trim()}
          onPress={() => onSendEncouragement()}
          style={{ alignItems: "center", height: 48, justifyContent: "center", opacity: encouragementDraft.trim() ? 1 : 0.4, width: 48 }}
        >
          <Feather name="send" size={22} color={colors.gold} />
        </Pressable>
      </View>
      <PrayerActivity activity={activity} />
    </AppScreen>
  );
}

function PrayerMomentPill() {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        backgroundColor: colors.rhythmSoft,
        borderColor: colors.accentRhythm,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>{t("community.action.prayer.completed")}</Text>
    </View>
  );
}

export function PrayerRequestCard({
  authorImage,
  authorName,
  item,
  onDelete,
  onEdit,
  onOpen,
  onPray,
  ownsItem,
  prayed,
  prayedBy,
  prayerCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: Extract<FeedItem, { type: "post" }>;
  onDelete?: () => void;
  onEdit?: () => void;
  onOpen: () => void;
  onPray: () => void;
  ownsItem: boolean;
  prayed: boolean;
  prayedBy?: { name: string; image?: GroupImage }[];
  prayerCount: number;
}) {
  const { t } = useAppTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);
  const answered = Boolean(item.answeredAt);
  const prayerMoment = isPrayerMomentKind(item.kind);
  const displayCopy = communityPrayerMomentDisplayCopy(item, t);

  function runMenuAction(action: () => void) {
    suppressOpenRef.current = true;
    setMenuOpen(false);
    action();
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

  const menu = ownsItem && menuOpen ? (
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
      {onEdit ? (
        <Pressable
          accessibilityLabel={t("common.edit")}
          accessibilityRole="button"
          onPressIn={(event) => event.stopPropagation()}
          onPress={(event) => {
            event.stopPropagation();
            runMenuAction(onEdit);
          }}
          style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <Feather name="edit-2" size={14} color={colors.ink} />
          <Text style={[typography.label, { color: colors.ink }]}>{t("common.edit")}</Text>
        </Pressable>
      ) : null}
      {onDelete ? (
        <Pressable
          accessibilityLabel={t("common.delete")}
          accessibilityRole="button"
          onPressIn={(event) => event.stopPropagation()}
          onPress={(event) => {
            event.stopPropagation();
            runMenuAction(onDelete);
          }}
          style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <Feather name="trash-2" size={14} color={colors.danger} />
          <Text style={[typography.label, { color: colors.danger }]}>{t("common.delete")}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  return (
    <CommunityFeedCard
      actions={
        prayerMoment ? (
          <CommunityCardAction active icon="pray" label={t("community.action.prayer.completed")} tone="prayer" />
        ) : (
          <CommunityCardAction
            active={prayed}
            icon="pray"
            label={communityActionLabel("prayer_request", prayed, t)}
            onPress={onPray}
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
      headerAccessory={menuButton}
      onOpen={() => {
        if (menuOpen || suppressOpenRef.current) {
          setMenuOpen(false);
          return;
        }
        onOpen();
      }}
      overlay={menu}
      responseSummary={
        prayerMoment ? undefined : (
          <CommunityCardResponseSummary
            count={prayerCount}
            label={communityPrayerNoun(prayerCount, t)}
            showWhenEmpty
            users={prayedBy}
          />
        )
      }
      status={prayerMoment ? undefined : <StatusPill status={answered ? "answered" : "open"} />}
      style={{ zIndex: menuOpen ? 10 : 1 }}
    />
  );
}
