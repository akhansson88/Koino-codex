import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { activePrivateCheckIns } from "@/state/check-ins";
import {
  EntryVisibility,
  actionLabels,
  defaultFeedTitle as productDefaultFeedTitle,
  entryKindIcon,
  feedItemKind,
  feedItemLabel,
  normalizeEntryKind,
  visibility,
} from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, FeedItem, GroupImage } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  CurrentRoomHeader,
  ExpandableBodyText,
  HeartPromptCard,
  IconButton,
  PrimaryButton,
  RoomImage,
  SecondaryButton,
  SectionHeading,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { BibleVerseField, normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, platformShadow, radius } from "@/ui/theme";

type CheckInStep = "choose" | "details" | "thanks";

const FEED_BODY_PREVIEW_LINES = 3;

const moodOptions = [
  { value: 5, label: "Joyful", description: "Grateful and full of joy", icon: "sunny-outline" as const },
  { value: 4, label: "Peaceful", description: "Calm and at rest", icon: "leaf-outline" as const },
  { value: 3, label: "Okay", description: "Doing alright", icon: "happy-outline" as const },
  { value: 2, label: "Heavy", description: "Carrying some burden", icon: "cloud-outline" as const },
  { value: 1, label: "Struggling", description: "Finding today difficult", icon: "rainy-outline" as const },
];

function formatRelativeTime(value: string) {
  const created = Date.parse(value);
  if (Number.isNaN(created)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Today at ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function moodLabel(mood: number) {
  return moodOptions.find((option) => option.value === mood)?.label ?? (mood >= 4 ? "Peaceful" : mood <= 2 ? "Heavy" : "Okay");
}

function kindLabel(item: FeedItem) {
  return feedItemLabel(item);
}

function kindIcon(item: FeedItem) {
  if (item.type === "check_in") return "check-circle" as const;
  return entryKindIcon(item.kind);
}

function defaultTitle(item: FeedItem) {
  return productDefaultFeedTitle(item, moodLabel);
}

function FeedPostCard({
  authorImage,
  authorName,
  item,
  onDelete,
  onEdit,
  onOpen,
  onPray,
  onReply,
  ownsItem,
  prayed,
  prayerCount,
  replyCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: FeedItem;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  onPray: () => void;
  onReply: () => void;
  ownsItem: boolean;
  prayed: boolean;
  prayerCount: number;
  replyCount: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);
  const itemKind = feedItemKind(item);
  const isPrayer = item.type === "post" && itemKind === "prayer_request";
  const actionLabel = actionLabels[itemKind];

  function runMenuAction(action: () => void) {
    suppressOpenRef.current = true;
    setMenuOpen(false);
    action();
    setTimeout(() => {
      suppressOpenRef.current = false;
    }, 250);
  }

  return (
      <Card style={{ overflow: "visible", padding: 16, position: "relative", zIndex: menuOpen ? 10 : 1 }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10, zIndex: menuOpen ? 30 : 1 }}>
          <Avatar image={authorImage} name={authorName} size={42} tone={isPrayer ? "orange" : "green"} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{authorName}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            <Feather name={kindIcon(item)} size={13} color={colors.gold} />
            <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{kindLabel(item)}</Text>
          </View>
          {ownsItem ? (
            <View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post options"
                hitSlop={8}
                onPressIn={(event) => event.stopPropagation()}
                onPress={(event) => {
                  event.stopPropagation();
                  setMenuOpen((current) => !current);
                }}
                style={{ alignItems: "center", height: 28, justifyContent: "center", width: 28 }}
              >
                <Feather name="more-horizontal" size={20} color={colors.ink} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {ownsItem && menuOpen ? (
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
              top: 50,
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
              onPressIn={(event) => event.stopPropagation()}
              onPress={(event) => {
                event.stopPropagation();
                runMenuAction(onEdit);
              }}
              style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}
            >
              <Feather name="edit-2" size={14} color={colors.ink} />
              <Text style={{ color: colors.ink, fontWeight: "800" }}>Edit</Text>
            </Pressable>
            <Pressable
              onPressIn={(event) => event.stopPropagation()}
              onPress={(event) => {
                event.stopPropagation();
                runMenuAction(onDelete);
              }}
              style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}
            >
              <Feather name="trash-2" size={14} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: "800" }}>Delete</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            if (menuOpen || suppressOpenRef.current) {
              setMenuOpen(false);
              return;
            }
            onOpen();
          }}
          style={{ gap: 8 }}
        >
          <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 18, fontWeight: "900", lineHeight: 24 }}>
            {item.type === "post" ? item.title || defaultTitle(item) : defaultTitle(item)}
          </Text>
          <ExpandableBodyText collapsedLines={FEED_BODY_PREVIEW_LINES}>
            {item.body || "No words today, just presence."}
          </ExpandableBodyText>
        </Pressable>
        <LinkPreview text={item.body} />

        <VerseList verse={item.verse} verses={item.verses} compact />

        {isPrayer ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <PrimaryButton
              icon="heart"
              onPress={() => {
                onPray();
              }}
              style={{ flex: 1, minHeight: 50 }}
            >
              {prayed ? "Prayed" : "Pray"}
            </PrimaryButton>
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>{prayerCount} prayed</Text>
          </View>
        ) : (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 22 }}>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onPray();
              }}
              style={{ alignItems: "center", flexDirection: "row", gap: 7 }}
            >
              <Feather name="heart" size={22} color={prayed ? colors.gold : colors.ink} />
              <Text style={{ color: colors.muted, fontWeight: "700" }}>{actionLabel} {prayerCount}</Text>
            </Pressable>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onReply();
              }}
              style={{ alignItems: "center", flexDirection: "row", gap: 7 }}
            >
              <Feather name="message-circle" size={21} color={colors.ink} />
              <Text style={{ color: colors.muted, fontWeight: "700" }}>{replyCount}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Feather name="more-horizontal" size={19} color={colors.ink} />
          </View>
        )}
      </Card>
  );
}

export function HomeScreen() {
  const { state, dispatch } = useKoino();
  const params = useLocalSearchParams<{ checkIn?: string; compose?: string }>();
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInStep, setCheckInStep] = useState<CheckInStep>("choose");
  const [mood, setMood] = useState(4);
  const [checkInText, setCheckInText] = useState("");
  const [checkInVerses, setCheckInVerses] = useState<BibleVerse[]>([]);
  const [shareCheckIn, setShareCheckIn] = useState(true);
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerKind, setComposerKind] = useState<EntryKind>("reflection");
  const [composerVisibility, setComposerVisibility] = useState<EntryVisibility>(visibility.private);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerVerses, setComposerVerses] = useState<BibleVerse[]>([]);
  const [editingItem, setEditingItem] = useState<FeedItem | undefined>();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const lastComposeParamRef = useRef<string | undefined>(undefined);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const todayKey = localDayKey(new Date());
  const todaysCheckIn = [...state.checkIns, ...activePrivateCheckIns(state.privateCheckIns, state.journalEntries)].some(
    (item) => item.userId === state.currentUserId && item.groupId === state.currentGroupId && localDayKey(item.createdAt) === todayKey,
  );
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);
  const feedItems = useMemo<FeedItem[]>(() => {
    const checkIns: FeedItem[] = state.checkIns
      .filter((item) => item.groupId === state.currentGroupId && item.visibility === "group")
      .map((item) => ({
        type: "check_in",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        body: item.reflectionText,
        mood: item.mood,
        readToday: item.readToday,
        verse: item.verse,
        verses: item.verses,
        createdAt: item.createdAt,
      }));
    const posts: FeedItem[] = state.posts
      .filter((item) => item.groupId === state.currentGroupId)
      .map((item) => ({
        type: "post",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        kind: item.kind,
        title: item.title,
        body: item.body,
        verse: item.verse,
        verses: item.verses,
        images: item.images,
        answeredAt: item.answeredAt,
        answeredMarkedAt: item.answeredMarkedAt,
        createdAt: item.createdAt,
      }));
    return [...checkIns, ...posts]
      .filter((item) => {
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [state.checkIns, state.currentGroupId, state.posts]);
  const recentActivity = feedItems.slice(0, 2);
  const openPrayer = feedItems.find((item) => item.type === "post" && normalizeEntryKind(item.kind) === "prayer_request");

  function resetCheckIn() {
    setCheckInStep("choose");
    setMood(4);
    setCheckInText("");
    setCheckInVerses([]);
    setShareCheckIn(true);
  }

  function openComposer(kind: EntryKind, item?: FeedItem, defaultVisibility: EntryVisibility = visibility.private) {
    setComposerKind(kind);
    setComposerVisibility(defaultVisibility);
    setEditingItem(item);
    setComposerTitle(item?.type === "post" ? item.title ?? "" : "");
    setComposerBody(item?.body ?? "");
    setComposerVerses(normalizeBibleVerses(item?.verse, item?.verses));
    setComposerVisible(true);
  }

  useEffect(() => {
    if (!params.checkIn) return;
    resetCheckIn();
    setCheckInVisible(true);
  }, [params.checkIn]);

  useEffect(() => {
    if (!params.compose || params.compose === lastComposeParamRef.current) return;
    lastComposeParamRef.current = params.compose;
    openComposer("reflection");
  }, [params.compose]);

  async function submitComposer() {
    if (!composerBody.trim()) return;
    if (editingItem?.type === "post") {
      await dispatch({ type: "editPost", id: editingItem.id, kind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    } else if (composerVisibility === visibility.private) {
      await dispatch({ type: "createJournalEntry", entryKind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses, shareWithGroup: false });
    } else {
      await dispatch({ type: "createPost", kind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    }
    setComposerVisible(false);
    setEditingItem(undefined);
    setComposerTitle("");
    setComposerBody("");
    setComposerVerses([]);
    setComposerKind("reflection");
  }

  function itemPrayerState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const reactions = state.prayerReactions.filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id);
    const prayedByUserIds = [...new Set(reactions.map((reaction) => reaction.userId))];
    return {
      prayed: reactions.some((reaction) => reaction.userId === state.currentUserId),
      count: prayedByUserIds.length,
      targetType,
      prayedBy: prayedByUserIds.map((userId) => userById.get(userId) ?? "Someone"),
    };
  }

  function itemReplies(item: FeedItem) {
    const targetType = item.type === "post" ? "post" : "check_in";
    return state.replies
      .filter((reply) => reply.targetType === targetType && reply.targetId === item.id)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  function deleteItem(item: FeedItem) {
    confirmAction({
      title: `Delete ${kindLabel(item).toLowerCase()}?`,
      message: "This will remove it from the shared room.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => dispatch({ type: item.type === "post" ? "deletePost" : "deleteCheckIn", id: item.id }),
    });
  }

  return (
    <AppScreen topInset={false}>
      <CurrentRoomHeader />

      <HeartPromptCard
        image={user?.image}
        name={user?.name ?? state.authEmail ?? "K"}
        subtitle={todaysCheckIn ? "Share, reflect or ask for prayer..." : "Take a moment to check in..."}
        onPress={() => {
          resetCheckIn();
          setCheckInVisible(true);
        }}
        onCreate={() => openComposer("reflection")}
      />

      <View style={{ gap: 10 }}>
        <SectionHeading>Today rhythm</SectionHeading>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <RhythmAction icon="plus" label="Check in" onPress={() => setCheckInVisible(true)} />
          <RhythmAction icon="heart" label="Pray for someone" onPress={() => {
            if (openPrayer) {
              const prayer = itemPrayerState(openPrayer);
              setPrayerTarget({ targetType: prayer.targetType, targetId: openPrayer.id, body: openPrayer.body });
            }
          }} />
          <RhythmAction icon="edit-3" label="Write reflection" onPress={() => openComposer("reflection")} />
          <RhythmAction icon="book-open" label="Read Scripture" onPress={() => router.push("/(tabs)/bible" as never)} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading>{openPrayer ? "Someone to pray for" : "Open prayer"}</SectionHeading>
        <Card>
          {openPrayer ? (
            <>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>
                {openPrayer.type === "post" ? openPrayer.title || defaultTitle(openPrayer) : defaultTitle(openPrayer)}
              </Text>
              <BodyText muted numberOfLines={2}>{openPrayer.body}</BodyText>
              <LinkPreview text={openPrayer.body} />
              <PrimaryButton icon="heart" onPress={() => {
                const prayer = itemPrayerState(openPrayer);
                setPrayerTarget({ targetType: prayer.targetType, targetId: openPrayer.id, body: openPrayer.body });
              }}>
                Pray
              </PrimaryButton>
            </>
          ) : (
            <BodyText muted>No open prayer requests right now.</BodyText>
          )}
        </Card>
      </View>

      {state.authError ? (
        <Card>
          <BodyText muted>{state.authError}</BodyText>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeading>Recent room activity</SectionHeading>
      {recentActivity.length === 0 ? (
          <Card>
            <BodyText muted>This room is quiet right now. Start with a check-in or a small reflection.</BodyText>
          </Card>
      ) : (
        recentActivity.map((item) => {
          const authorName = userById.get(item.userId) ?? "Someone";
          const authorImage = userImageById.get(item.userId);
          const prayer = itemPrayerState(item);
          const replies = itemReplies(item);
          return (
            <FeedPostCard
              key={`${item.type}-${item.id}`}
              authorImage={authorImage}
              authorName={authorName}
              item={item}
              ownsItem={item.userId === state.currentUserId}
              prayed={prayer.prayed}
              prayerCount={prayer.count}
              replyCount={replies.length}
              onOpen={() => router.push(`/feed/${item.type}/${item.id}` as never)}
              onEdit={() => {
                if (item.type === "post") openComposer(normalizeEntryKind(item.kind), item, visibility.room);
              }}
              onDelete={() => deleteItem(item)}
              onReply={() => router.push(`/feed/${item.type}/${item.id}` as never)}
              onPray={() => {
                if (prayer.prayed) {
                  dispatch({ type: "unpray", targetType: prayer.targetType, targetId: item.id });
                } else {
                  setPrayerTarget({ targetType: prayer.targetType, targetId: item.id, body: item.body });
                }
              }}
            />
          );
        })
      )}
      </View>

      <CheckInModal
        visible={checkInVisible}
        step={checkInStep}
        mood={mood}
        note={checkInText}
        verses={checkInVerses}
        roomName={group?.name ?? "Test Room"}
        roomImage={group?.image}
        share={shareCheckIn}
        onClose={() => setCheckInVisible(false)}
        onMood={(value) => {
          setMood(value);
          setCheckInStep("details");
        }}
        onNote={setCheckInText}
        onVerses={setCheckInVerses}
        onShare={setShareCheckIn}
        onBack={() => setCheckInStep("choose")}
        onSubmit={async () => {
          await dispatch({
            type: "submitCheckIn",
            mood,
            readToday: true,
            reflectionText: checkInText,
            visibility: shareCheckIn ? "group" : "private",
            verse: primaryBibleVerse(checkInVerses),
            verses: checkInVerses,
          });
          setCheckInStep("thanks");
        }}
        onDone={() => {
          setCheckInVisible(false);
          resetCheckIn();
        }}
      />

      <SharedComposer
        visible={composerVisible}
        context="today"
        kind={composerKind}
        entryVisibility={composerVisibility}
        title={composerTitle}
        body={composerBody}
        verses={composerVerses}
        editing={Boolean(editingItem)}
        onKind={setComposerKind}
        onVisibility={setComposerVisibility}
        onTitle={setComposerTitle}
        onBody={setComposerBody}
        onVerses={setComposerVerses}
        roomName={group?.name}
        roomImage={group?.image}
        onClose={() => {
          setComposerVisible(false);
          setEditingItem(undefined);
        }}
        onSubmit={submitComposer}
      />

      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
          if (prayerTarget) {
            dispatch({ type: "finishPrayer", targetType: prayerTarget.targetType, targetId: prayerTarget.targetId, status, startedAt });
          }
          setPrayerTarget(undefined);
        }}
      />
    </AppScreen>
  );
}

function RhythmAction({ icon, label, onPress }: { icon: ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: 58, padding: 12 }}>
        <Feather name={icon} size={18} color={colors.olive} />
        <Text style={{ color: colors.ink, flex: 1, fontSize: 14, fontWeight: "900" }}>{label}</Text>
      </Card>
    </Pressable>
  );
}

function CheckInModal({
  visible,
  step,
  mood,
  note,
  verses,
  roomName,
  roomImage,
  share,
  onBack,
  onClose,
  onDone,
  onMood,
  onNote,
  onShare,
  onSubmit,
  onVerses,
}: {
  visible: boolean;
  step: CheckInStep;
  mood: number;
  note: string;
  verses: BibleVerse[];
  roomName: string;
  roomImage?: GroupImage;
  share: boolean;
  onBack: () => void;
  onClose: () => void;
  onDone: () => void;
  onMood: (value: number) => void;
  onNote: (value: string) => void;
  onShare: (value: boolean) => void;
  onSubmit: () => void;
  onVerses: (verses: BibleVerse[]) => void;
}) {
  const selectedMood = moodOptions.find((option) => option.value === mood) ?? moodOptions[1];
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        {step !== "thanks" ? (
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={step === "choose" ? onClose : onBack} />
            {step === "details" ? <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Save</Text> : <View style={{ width: 38 }} />}
          </View>
        ) : null}

        {step === "choose" ? (
          <>
            <View style={{ gap: 7 }}>
              <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>How's your heart today?</Text>
              <BodyText muted>Take a moment to check in with God and with yourself.</BodyText>
            </View>
            <View style={{ gap: 10 }}>
              {moodOptions.map((option) => (
                <Pressable accessibilityRole="button" key={option.value} onPress={() => onMood(option.value)}>
                  <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, padding: 14 }}>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.accentSubtle,
                        borderRadius: 999,
                        height: 40,
                        justifyContent: "center",
                        width: 40,
                      }}
                    >
                      <Ionicons name={option.icon} size={22} color={colors.olive} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{option.label}</Text>
                      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>{option.description}</Text>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
            <SecondaryButton onPress={onClose}>Skip</SecondaryButton>
          </>
        ) : null}

        {step === "details" ? (
          <>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.accentSubtle,
                  borderRadius: 999,
                  height: 52,
                  justifyContent: "center",
                  width: 52,
                }}
              >
                <Ionicons name={selectedMood.icon} size={26} color={colors.olive} />
              </View>
              <View>
                <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>{selectedMood.label}</Text>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{selectedMood.description}</Text>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <SectionHeading>Add a thought (optional)</SectionHeading>
              <TextInputField multiline maxLength={350} value={note} onChangeText={onNote} placeholder="Thankful for a quiet morning and time with God." />
              <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{note.length}/350</Text>
            </View>
            <BibleVerseField verses={verses} onChange={onVerses} />
            <View style={{ gap: 8 }}>
              <SectionHeading>Share with</SectionHeading>
              <Pressable accessibilityRole="button" onPress={() => onShare(!share)}>
                <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                  <RoomImage image={share ? roomImage : undefined} name={share ? roomName : "Private journal"} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{share ? roomName : "Private journal"}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{share ? "Shared with your room" : "Only you can see this"}</Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.muted} />
                </Card>
              </Pressable>
            </View>
            <PrimaryButton icon="send" onPress={onSubmit}>
              Post check-in
            </PrimaryButton>
          </>
        ) : null}

        {step === "thanks" ? (
          <View style={{ alignItems: "center", flex: 1, gap: 20, justifyContent: "center", minHeight: 560 }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.accentSubtle,
                borderRadius: 999,
                height: 96,
                justifyContent: "center",
                width: 96,
              }}
            >
              <Feather name="feather" size={46} color={colors.gold} />
            </View>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>Thank you!</Text>
              <BodyText muted style={{ textAlign: "center" }}>
                Your check-in has been shared with {roomName}.
              </BodyText>
            </View>
            <PrimaryButton onPress={onDone} style={{ alignSelf: "stretch" }}>
              View in journal
            </PrimaryButton>
            <SecondaryButton onPress={onDone} style={{ alignSelf: "stretch" }}>
              Done
            </SecondaryButton>
          </View>
        ) : null}
      </AppScreen>
    </Modal>
  );
}


