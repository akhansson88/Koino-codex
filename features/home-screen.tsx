import { useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import type { ImageSourcePropType, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { useKoino } from "@/state/koino-store";
import { FeedItem, Post } from "@/state/types";
import { Body, Card, Choice, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { confirmAction } from "@/ui/confirm";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { colors } from "@/ui/theme";

const moodOptions: { value: number; label: string; image: ImageSourcePropType }[] = [
  { value: 1, label: "Struggling", image: require("../emoji1-transparent.png") },
  { value: 2, label: "Okay", image: require("../emoji2-transparent.png") },
  { value: 3, label: "Good", image: require("../emoji3-transparent.png") },
  { value: 4, label: "Great", image: require("../emoji4-transparent.png") },
];
const MAX_POST_BODY_LENGTH = 500;
const MAX_POST_IMAGES = 6;
const DAILY_SHARED_POST_FRICTION_THRESHOLD = 3;
const DAILY_SHARED_POST_FRICTION_MESSAGE =
  "KOINO is built for a calm rhythm and meaningful sharing. If it's important, feel free to share it - otherwise, you can keep it private.";
type FeedFilter = "all" | "my_reflections" | "my_prayer_requests";
type ComposerKind = "reflection" | "prayer_request";
type ImageGalleryState = { images: string[]; index: number };

function formatJoinedDay(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const created = Date.parse(value);
  if (Number.isNaN(created)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatJoinedDay(value);
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function moodLabel(mood: number) {
  return moodOptions.find((option) => option.value === mood)?.label ?? moodOptions[moodOptions.length - 1].label;
}

function normalizePostKind(kind: Post["kind"]): ComposerKind {
  return kind === "prayer_request" ? "prayer_request" : "reflection";
}

function showDailyPostFriction(onShareAnyway: () => void, onKeepPrivate?: () => void) {
  confirmAction({
    title: "A calm rhythm",
    message: DAILY_SHARED_POST_FRICTION_MESSAGE,
    cancelText: "Keep private",
    confirmText: "Share anyway",
    onCancel: onKeepPrivate,
    onConfirm: onShareAnyway,
  });
}

function FeedActionButton({
  label,
  iconName,
  emoji,
  selected = false,
  disabled = false,
  onPress,
}: {
  label: string;
  iconName?: ComponentProps<typeof Feather>["name"];
  emoji?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.accentSubtle : colors.elevated,
        borderColor: selected ? colors.moss : colors.line,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 54,
        minWidth: 132,
        paddingHorizontal: 18,
        paddingVertical: 13,
      }}
    >
      {emoji ? (
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      ) : iconName ? (
        <Feather name={iconName} size={20} color={selected ? colors.moss : colors.ink} />
      ) : null}
      <Text style={{ color: disabled ? colors.disabledText : colors.ink, fontSize: 16, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function FeedTypeBadge({
  iconName,
  label,
  tone,
}: {
  iconName: ComponentProps<typeof Feather>["name"];
  label: string;
  tone: "moss" | "rose" | "gold";
}) {
  const tint = tone === "moss" ? colors.moss : tone === "rose" ? colors.rose : colors.gold;
  const backgroundColor = tone === "moss" ? colors.mossSurface : colors.roseSurface;

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor,
        borderColor: tone === "moss" ? colors.moss : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Feather name={iconName} size={14} color={tint} />
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "900" }}>{label}</Text>
    </View>
  );
}

const composerPalette = {
  panel: colors.paper,
  surface: colors.input,
  line: colors.line,
  text: colors.ink,
  muted: colors.muted,
  prayer: colors.gold,
  prayerSoft: colors.roseSurface,
  reflection: colors.moss,
  reflectionSoft: colors.mossSurface,
  submit: colors.olive,
  disabled: colors.disabled,
  onAccent: colors.onAccent,
};

function ComposerKindButton({
  kind,
  selected,
  onPress,
}: {
  kind: ComposerKind;
  selected: boolean;
  onPress: () => void;
}) {
  const isPrayer = kind === "prayer_request";
  const accent = isPrayer ? composerPalette.prayer : composerPalette.reflection;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? (isPrayer ? composerPalette.prayerSoft : composerPalette.reflectionSoft) : composerPalette.surface,
        borderColor: selected ? accent : composerPalette.line,
        borderRadius: 14,
        borderWidth: selected ? 2 : 1,
        flex: 1,
        gap: 12,
        justifyContent: "center",
        minHeight: 112,
        minWidth: 136,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 30 }}>{isPrayer ? "\u{1F64F}" : "\u{1F33F}"}</Text>
      <Text style={{ color: accent, fontSize: 18, fontWeight: "900", textAlign: "center" }}>
        {isPrayer ? "Prayer request" : "Reflection"}
      </Text>
    </Pressable>
  );
}

function ComposerImages({
  images,
  onRemove,
  onOpen,
}: {
  images: string[];
  onRemove: (index: number) => void;
  onOpen: (index: number) => void;
}) {
  if (images.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {images.map((image, index) => (
        <Pressable
          accessibilityLabel={`Open selected image ${index + 1}`}
          accessibilityRole="imagebutton"
          key={`${index}-${image.slice(0, 24)}`}
          onPress={() => onOpen(index)}
          style={{
            borderColor: composerPalette.line,
            borderRadius: 14,
            borderWidth: 1,
            height: 86,
            overflow: "hidden",
            width: 86,
          }}
        >
          <Image source={{ uri: image }} style={{ height: "100%", width: "100%" }} />
          <Pressable
            accessibilityLabel={`Remove selected image ${index + 1}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onRemove(index)}
            style={{
              alignItems: "center",
              backgroundColor: "rgba(36,38,43,0.78)",
              borderRadius: 999,
              height: 26,
              justifyContent: "center",
              position: "absolute",
              right: 6,
              top: 6,
              width: 26,
            }}
          >
            <Feather name="x" size={15} color={composerPalette.surface} />
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function PostImages({ images, onOpen }: { images?: string[]; onOpen: (index: number) => void }) {
  if (!images?.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {images.map((image, index) => (
        <Pressable
          accessibilityLabel={`Open post image ${index + 1}`}
          accessibilityRole="imagebutton"
          key={`${index}-${image.slice(0, 24)}`}
          onPress={() => onOpen(index)}
          style={{
            backgroundColor: colors.input,
            borderColor: colors.line,
            borderRadius: 14,
            borderWidth: 1,
            height: images.length === 1 ? 190 : 132,
            overflow: "hidden",
            width: images.length === 1 ? 260 : 132,
          }}
        >
          <Image source={{ uri: image }} style={{ height: "100%", width: "100%" }} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function CreatePostModal({
  visible,
  kind,
  body,
  images,
  onKindChange,
  onBodyChange,
  onImagesChange,
  onClose,
  onSubmit,
  onPreviewImage,
}: {
  visible: boolean;
  kind: ComposerKind;
  body: string;
  images: string[];
  onKindChange: (kind: ComposerKind) => void;
  onBodyChange: (body: string) => void;
  onImagesChange: (images: string[]) => void;
  onClose: () => void;
  onSubmit: () => void;
  onPreviewImage: (index: number) => void;
}) {
  const canSubmit = body.trim().length > 0 || images.length > 0;
  const isPrayer = kind === "prayer_request";

  async function pickImages() {
    const remainingSlots = MAX_POST_IMAGES - images.length;
    if (remainingSlots <= 0) {
      Alert.alert("Image limit reached", `You can add up to ${MAX_POST_IMAGES} images to a post.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photos permission needed", "Allow photo access to add images to your post.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      base64: true,
      mediaTypes: ["images"],
      orderedSelection: true,
      quality: 0.55,
      selectionLimit: remainingSlots,
    });

    if (result.canceled) return;

    const selectedImages = result.assets
      .map((asset) => (asset.base64 ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}` : asset.uri))
      .filter(Boolean)
      .slice(0, remainingSlots);

    onImagesChange([...images, ...selectedImages].slice(0, MAX_POST_IMAGES));
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: "rgba(0,0,0,0.45)", flex: 1, justifyContent: "center", padding: 18 }}>
        <View
          style={{
            alignSelf: "center",
            backgroundColor: composerPalette.panel,
            borderColor: composerPalette.line,
            borderRadius: 18,
            borderWidth: 1,
            maxWidth: 540,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <View
            style={{
              alignItems: "center",
              borderBottomColor: composerPalette.line,
              borderBottomWidth: 1,
              flexDirection: "row",
              justifyContent: "center",
              minHeight: 70,
              paddingHorizontal: 18,
            }}
          >
            <Pressable
              accessibilityLabel="Close create post"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={{ alignItems: "center", height: 38, justifyContent: "center", left: 12, position: "absolute", width: 38 }}
            >
              <Feather name="x" size={26} color={composerPalette.text} />
            </Pressable>
            <Text style={{ color: composerPalette.text, fontSize: 20, fontWeight: "900" }}>Create post</Text>
          </View>

          <View style={{ gap: 20, padding: 22 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <ComposerKindButton kind="reflection" selected={kind === "reflection"} onPress={() => onKindChange("reflection")} />
              <ComposerKindButton kind="prayer_request" selected={kind === "prayer_request"} onPress={() => onKindChange("prayer_request")} />
            </View>

            <View style={{ position: "relative" }}>
              <Field
                multiline
                maxLength={MAX_POST_BODY_LENGTH}
                onChangeText={(value) => onBodyChange(value.slice(0, MAX_POST_BODY_LENGTH))}
                placeholder={isPrayer ? "What would you like your group to pray for?" : "What would you like to reflect on?"}
                placeholderTextColor={composerPalette.muted}
                style={{
                  backgroundColor: composerPalette.surface,
                  borderColor: composerPalette.line,
                  color: composerPalette.text,
                  fontSize: 20,
                  lineHeight: 30,
                  minHeight: 220,
                  paddingBottom: 58,
                }}
                value={body}
              />
              <Pressable
                accessibilityLabel="Add images"
                accessibilityRole="button"
                hitSlop={10}
                onPress={pickImages}
                style={{ alignItems: "center", bottom: 16, height: 36, justifyContent: "center", left: 14, position: "absolute", width: 36 }}
              >
                <Feather name="image" size={24} color={composerPalette.text} />
              </Pressable>
              <Text style={{ bottom: 22, color: composerPalette.text, fontSize: 16, fontWeight: "700", position: "absolute", right: 18 }}>
                {body.length}/{MAX_POST_BODY_LENGTH}
              </Text>
            </View>

            <ComposerImages
              images={images}
              onOpen={onPreviewImage}
              onRemove={(index) => onImagesChange(images.filter((_, imageIndex) => imageIndex !== index))}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={{
                alignItems: "center",
                backgroundColor: canSubmit ? composerPalette.submit : composerPalette.disabled,
                borderRadius: 12,
                flexDirection: "row",
                gap: 10,
                justifyContent: "center",
                minHeight: 58,
                paddingHorizontal: 18,
              }}
            >
              <Feather name={isPrayer ? "heart" : "book-open"} size={21} color={canSubmit ? composerPalette.onAccent : colors.disabledText} />
              <Text style={{ color: canSubmit ? composerPalette.onAccent : colors.disabledText, fontSize: 20, fontWeight: "900" }}>
                {isPrayer ? "Ask for prayer" : "Share reflection"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ImageGalleryModal({ gallery, onClose }: { gallery?: ImageGalleryState; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(gallery?.index ?? 0);

  useEffect(() => {
    setPage(gallery?.index ?? 0);
  }, [gallery?.index, gallery?.images]);

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  return (
    <Modal animationType="fade" visible={Boolean(gallery)} onRequestClose={onClose}>
      <View style={{ backgroundColor: "#050505", flex: 1 }}>
        {gallery ? (
          <>
            <ScrollView
              horizontal
              key={`${gallery.index}-${gallery.images.length}-${gallery.images[0]?.slice(0, 24)}`}
              onMomentumScrollEnd={handleScrollEnd}
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: width * gallery.index, y: 0 }}
            >
              {gallery.images.map((image, index) => (
                <View key={`${index}-${image.slice(0, 24)}`} style={{ alignItems: "center", height, justifyContent: "center", width }}>
                  <Image source={{ uri: image }} style={{ height: "100%", resizeMode: "contain", width: "100%" }} />
                </View>
              ))}
            </ScrollView>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                left: 0,
                paddingHorizontal: 18,
                paddingTop: 18,
                position: "absolute",
                right: 0,
                top: 0,
              }}
            >
              <Pressable
                accessibilityLabel="Close image"
                accessibilityRole="button"
                hitSlop={10}
                onPress={onClose}
                style={{
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  height: 42,
                  justifyContent: "center",
                  width: 42,
                }}
              >
                <Feather name="x" size={24} color={colors.white} />
              </Pressable>
              <Text style={{ color: colors.white, fontSize: 15, fontWeight: "900" }}>
                {page + 1}/{gallery.images.length}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

export function HomeScreen() {
  const { state, dispatch } = useKoino();
  const [mood, setMood] = useState(3);
  const [readToday, setReadToday] = useState(true);
  const [reflectionText, setReflectionText] = useState("");
  const [visibility, setVisibility] = useState<"private" | "group">("group");
  const [postBody, setPostBody] = useState("");
  const [postKind, setPostKind] = useState<ComposerKind>("reflection");
  const [postImages, setPostImages] = useState<string[]>([]);
  const [composerVisible, setComposerVisible] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyComposerKey, setReplyComposerKey] = useState<string>();
  const [openMenuKey, setOpenMenuKey] = useState<string>();
  const [imageGallery, setImageGallery] = useState<ImageGalleryState>();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const groupMembers = useMemo(
    () =>
      state.memberships
        .filter((membership) => membership.groupId === state.currentGroupId)
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
          if (a.userId === state.currentUserId) return -1;
          if (b.userId === state.currentUserId) return 1;
          return a.userName.localeCompare(b.userName);
        }),
    [state.currentGroupId, state.currentUserId, state.memberships],
  );
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const feedItems = useMemo<FeedItem[]>(() => {
    const sharedCheckIns: FeedItem[] = state.checkIns
      .filter((item) => item.groupId === state.currentGroupId && item.visibility === "group")
      .map((item) => ({
        type: "check_in",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        body: item.reflectionText,
        mood: item.mood,
        readToday: item.readToday,
        createdAt: item.createdAt,
      }));
    const posts: FeedItem[] = state.posts
      .filter((item) => item.groupId === state.currentGroupId)
      .map((item) => ({
        type: "post",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        kind: normalizePostKind(item.kind ?? "reflection"),
        body: item.body,
        images: item.images,
        answeredAt: item.answeredAt,
        answeredMarkedAt: item.answeredMarkedAt,
        createdAt: item.createdAt,
      }));
    return [...sharedCheckIns, ...posts]
      .filter((item) => {
        if (feedFilter === "my_reflections") {
          return item.type === "post" && item.userId === state.currentUserId && normalizePostKind(item.kind) === "reflection";
        }
        if (feedFilter === "my_prayer_requests") {
          return item.type === "post" && item.userId === state.currentUserId && item.kind === "prayer_request";
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [feedFilter, state.checkIns, state.currentGroupId, state.currentUserId, state.posts]);
  const todaysCheckIn = useMemo(() => {
    const todayKey = localDayKey(new Date());
    return [...state.checkIns, ...state.privateCheckIns].find(
      (item) =>
        item.userId === state.currentUserId &&
        item.groupId === state.currentGroupId &&
        localDayKey(item.createdAt) === todayKey,
    );
  }, [state.checkIns, state.currentGroupId, state.currentUserId, state.privateCheckIns]);
  const sharedPostsToday = useMemo(() => {
    const todayKey = localDayKey(new Date());
    const sharedCheckIns = state.checkIns.filter(
      (item) =>
        item.userId === state.currentUserId &&
        item.groupId === state.currentGroupId &&
        item.visibility === "group" &&
        localDayKey(item.createdAt) === todayKey,
    );
    const posts = state.posts.filter(
      (item) =>
        item.userId === state.currentUserId &&
        item.groupId === state.currentGroupId &&
        localDayKey(item.createdAt) === todayKey,
    );
    return sharedCheckIns.length + posts.length;
  }, [state.checkIns, state.currentGroupId, state.currentUserId, state.posts]);
  const shouldShowDailyPostFriction = sharedPostsToday >= DAILY_SHARED_POST_FRICTION_THRESHOLD;

  function submitCheckIn(nextVisibility = visibility) {
    dispatch({ type: "submitCheckIn", mood, readToday, reflectionText, visibility: nextVisibility });
    setReflectionText("");
    setMood(3);
    setReadToday(true);
  }

  function handleSubmitCheckIn() {
    if (visibility === "group" && shouldShowDailyPostFriction) {
      showDailyPostFriction(() => submitCheckIn("group"), () => submitCheckIn("private"));
      return;
    }

    submitCheckIn();
  }

  function submitPost() {
    dispatch({ type: "createPost", body: postBody, kind: postKind, images: postImages });
    setPostBody("");
    setPostImages([]);
    setPostKind("reflection");
    setComposerVisible(false);
  }

  function handleSubmitPost() {
    if (shouldShowDailyPostFriction) {
      showDailyPostFriction(submitPost);
      return;
    }

    submitPost();
  }

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card tone="moss">
          <Text selectable style={{ color: colors.olive, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 }}>
            SMALL GROUP
          </Text>
          <SectionTitle>{group?.name ?? "Your group"}</SectionTitle>
          <Body muted>Invite code: {group?.inviteCode ?? "..."}</Body>
        </Card>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <SectionTitle>Group members</SectionTitle>
            <View
              style={{
                backgroundColor: colors.accentSubtle,
                borderColor: colors.moss,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text selectable style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>
                {groupMembers.length} {groupMembers.length === 1 ? "member" : "members"}
              </Text>
            </View>
          </View>
          {groupMembers.length === 0 ? (
            <Body muted>No members are visible for this group yet.</Body>
          ) : (
            <View style={{ gap: 10 }}>
              {groupMembers.map((member) => {
                const memberName = member.userName || userById.get(member.userId) || "Someone";
                const isCurrentUser = member.userId === state.currentUserId;

                return (
                  <View
                    key={member.id}
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.elevated,
                      borderColor: colors.line,
                      borderCurve: "continuous",
                      borderRadius: 18,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: 12,
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: member.role === "owner" ? colors.olive : colors.roseSurface,
                        borderRadius: 999,
                        height: 44,
                        justifyContent: "center",
                        width: 44,
                      }}
                    >
                      <Text
                        selectable
                        style={{
                          color: member.role === "owner" ? colors.onAccent : colors.clay,
                          fontSize: 15,
                          fontWeight: "900",
                        }}
                      >
                        {initials(memberName) || "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text selectable style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>
                        {memberName}
                        {isCurrentUser ? " (you)" : ""}
                      </Text>
                      <Body muted>Joined {formatJoinedDay(member.createdAt)}</Body>
                    </View>
                    <Text
                      selectable
                      style={{
                        color: member.role === "owner" ? colors.olive : colors.muted,
                        fontSize: 13,
                        fontWeight: "900",
                        textTransform: "capitalize",
                      }}
                    >
                      {member.role}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {todaysCheckIn ? (
          <Card tone="moss">
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.olive,
                  borderRadius: 999,
                  height: 42,
                  justifyContent: "center",
                  width: 42,
                }}
              >
                <Feather name="check" size={22} color={colors.onAccent} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <SectionTitle>Check-in posted</SectionTitle>
                <Body muted>
                  You&apos;ve already posted today&apos;s {todaysCheckIn.visibility === "private" ? "private " : ""}check-in.
                </Body>
              </View>
            </View>
          </Card>
        ) : (
          <Card>
            <SectionTitle>Daily check-in</SectionTitle>
            <Body muted>A gentle entry point, not a productivity score.</Body>
            <Body>Have you read the Bible today?</Body>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Choice label="Yes" selected={readToday} onPress={() => setReadToday(true)} />
              <Choice label="Not yet" selected={!readToday} onPress={() => setReadToday(false)} />
            </View>
            <View
              style={{
                alignSelf: "stretch",
                gap: 18,
                width: "100%",
              }}
            >
              <SectionTitle>How&apos;s your heart?</SectionTitle>
              <View style={{ alignSelf: "stretch", flexDirection: "row", width: "100%" }}>
                {moodOptions.map((option) => {
                  const selected = mood === option.value;

                  return (
                    <Pressable
                      accessibilityLabel={`Mood ${option.value}: ${option.label}`}
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => setMood(option.value)}
                      style={{
                        alignItems: "center",
                        borderColor: selected ? "rgba(245, 243, 240, 0.72)" : "transparent",
                        borderRadius: 18,
                        borderWidth: 1,
                        flex: 1,
                        gap: 8,
                        minWidth: 0,
                        paddingVertical: 6,
                      }}
                    >
                      <View
                        style={{
                          alignSelf: "stretch",
                          aspectRatio: 1,
                          overflow: "hidden",
                          paddingHorizontal: 3,
                          width: "100%",
                        }}
                      >
                        <Image
                          source={option.image}
                          style={{
                            height: "100%",
                            objectFit: "contain",
                            width: "100%",
                          }}
                        />
                      </View>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={{ color: selected ? colors.ink : colors.muted, fontSize: 13, fontWeight: "800", textAlign: "center", width: "100%" }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Field
              multiline
              value={reflectionText}
              onChangeText={setReflectionText}
              placeholder="Optional reflection. A sentence is enough."
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Choice label="Share with group" selected={visibility === "group"} onPress={() => setVisibility("group")} />
              <Choice label="Save privately" selected={visibility === "private"} onPress={() => setVisibility("private")} />
            </View>
            <PillButton onPress={handleSubmitCheckIn}>
              Submit check-in
            </PillButton>
          </Card>
        )}

        <Card>
          <SectionTitle>Share with group</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <FeedActionButton
              iconName="book-open"
              label="Create reflection"
              onPress={() => {
                setPostBody("");
                setPostImages([]);
                setPostKind("reflection");
                setComposerVisible(true);
              }}
            />
            <FeedActionButton
              iconName="heart"
              label="Create prayer request"
              onPress={() => {
                setPostBody("");
                setPostImages([]);
                setPostKind("prayer_request");
                setComposerVisible(true);
              }}
            />
          </View>
        </Card>

        <View style={{ gap: 12 }}>
          <SectionTitle>Group feed</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Choice label="All" selected={feedFilter === "all"} onPress={() => setFeedFilter("all")} />
            <Choice label="My reflections" selected={feedFilter === "my_reflections"} onPress={() => setFeedFilter("my_reflections")} />
            <Choice
              label="My prayer requests"
              selected={feedFilter === "my_prayer_requests"}
              onPress={() => setFeedFilter("my_prayer_requests")}
            />
          </View>
          {state.authError ? (
            <Card>
              <Body muted>{state.authError}</Body>
            </Card>
          ) : null}
          {feedItems.length === 0 ? (
            <Card>
              <Body muted>No shared items match this feed yet. This room can stay quiet until someone is ready.</Body>
            </Card>
          ) : (
            feedItems.map((item) => {
              const targetType = item.type === "post" ? "post" : "check_in";
              const itemKey = `${targetType}:${item.id}`;
              const replies = state.replies.filter((reply) => reply.targetType === targetType && reply.targetId === item.id);
              const isPost = item.type === "post";
              const isPrayerRequest = item.type === "post" && item.kind === "prayer_request";
              const isReflection = item.type === "post" && item.kind === "reflection";
              const itemImages = item.type === "post" ? item.images ?? [] : [];
              const prayed = state.prayerReactions.some(
                (reaction) => reaction.userId === state.currentUserId && reaction.targetType === targetType && reaction.targetId === item.id,
              );
              const prayerCount = new Set(
                state.prayerReactions
                  .filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id)
                  .map((reaction) => reaction.userId),
              ).size;
              const prayerCountLabel = prayerCount === 1 ? "1 person prayed" : `${prayerCount} people prayed`;
              const ownsItem = item.userId === state.currentUserId;
              const authorName = userById.get(item.userId) ?? "Someone";
              const replyComposerOpen = replyComposerKey === itemKey;
              const itemLabel = item.type === "check_in" ? "check-in" : isPrayerRequest ? "prayer request" : "reflection";
              const menuOpen = openMenuKey === itemKey;

              return (
                <Card
                  key={`${item.type}-${item.id}`}
                  style={{
                    elevation: menuOpen ? 24 : 0,
                    position: "relative",
                    zIndex: menuOpen ? 1000 : 0,
                  }}
                >
                  <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.accentSubtle,
                        borderColor: colors.line,
                        borderRadius: 999,
                        borderWidth: 1,
                        height: 52,
                        justifyContent: "center",
                        width: 52,
                      }}
                    >
                      <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>{initials(authorName) || "?"}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3, paddingRight: ownsItem ? 10 : 0 }}>
                      <Text selectable style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>
                        {authorName}
                      </Text>
                      <Text selectable style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>
                        {formatRelativeTime(item.createdAt)}
                        {item.type === "check_in" ? ` - Mood ${item.mood} (${moodLabel(item.mood)})` : ""}
                      </Text>
                    </View>
                    {ownsItem ? (
                      <View
                        style={{
                          elevation: menuOpen ? 25 : 0,
                          position: "relative",
                          zIndex: menuOpen ? 1001 : 1,
                        }}
                      >
                        <Pressable
                          accessibilityLabel="Post options"
                          accessibilityRole="button"
                          hitSlop={10}
                          onPress={() => setOpenMenuKey((current) => (current === itemKey ? undefined : itemKey))}
                          style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}
                        >
                          <Feather name="more-horizontal" size={24} color={colors.ink} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>

                  {menuOpen ? (
                    <View
                      style={{
                        backgroundColor: colors.elevated,
                        borderColor: colors.line,
                        borderRadius: 12,
                        borderWidth: 1,
                        elevation: 26,
                        minWidth: 132,
                        paddingVertical: 6,
                        position: "absolute",
                        right: 18,
                        top: 56,
                        zIndex: 1002,
                      }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setOpenMenuKey(undefined);
                          confirmAction({
                            title: `Delete ${itemLabel}?`,
                            message: "This will remove it from the group feed.",
                            confirmText: "Delete",
                            destructive: true,
                            onConfirm: () =>
                              dispatch({
                                type: item.type === "check_in" ? "deleteCheckIn" : "deletePost",
                                id: item.id,
                              }),
                          });
                        }}
                        style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}
                      >
                        <Feather name="trash-2" size={16} color={colors.danger} />
                        <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>Delete</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {item.type === "check_in" ? (
                      <FeedTypeBadge iconName="check-circle" label="Check-in" tone="moss" />
                    ) : isPrayerRequest ? (
                      <FeedTypeBadge iconName="heart" label="Prayer request" tone="rose" />
                    ) : isReflection ? (
                      <FeedTypeBadge iconName="book-open" label="Reflection" tone="moss" />
                    ) : null}
                    {item.type === "check_in" ? (
                      <FeedTypeBadge iconName={item.readToday ? "book-open" : "clock"} label={item.readToday ? "Read today" : "Not yet today"} tone="gold" />
                    ) : null}
                    {isPrayerRequest && item.answeredAt ? (
                      <FeedTypeBadge iconName="check-circle" label={"Answered by God's grace."} tone="moss" />
                    ) : null}
                  </View>

                  {item.body || itemImages.length === 0 ? (
                    <Text selectable style={{ color: colors.ink, fontSize: 22, fontWeight: "500", lineHeight: 34 }}>
                      {item.body || "No words today, just presence."}
                    </Text>
                  ) : null}

                  {isPost ? <PostImages images={itemImages} onOpen={(index) => setImageGallery({ images: itemImages, index })} /> : null}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                    <FeedActionButton
                      emoji={prayed ? "\u{1F64F}" : "\u{1F64F}"}
                      label={prayed ? "Prayed" : "Pray"}
                      selected={prayed}
                      onPress={() => {
                        if (prayed) {
                          dispatch({ type: "unpray", targetType, targetId: item.id });
                          return;
                        }
                        setPrayerTarget({ targetType, targetId: item.id, body: item.body });
                      }}
                    />
                    <FeedActionButton
                      iconName="message-circle"
                      label="Reply"
                      selected={replyComposerOpen}
                      onPress={() => setReplyComposerKey((current) => (current === itemKey ? undefined : itemKey))}
                    />
                  </View>

                  {prayerCount > 0 ? (
                    <Text selectable style={{ color: colors.muted, fontSize: 14, fontWeight: "800" }}>
                      {prayerCountLabel}
                    </Text>
                  ) : null}

                  {isPrayerRequest && ownsItem ? (
                    <PillButton
                      variant="secondary"
                      onPress={() => {
                        dispatch(item.answeredAt ? { type: "unmarkPrayerAnswered", id: item.id } : { type: "markPrayerAnswered", id: item.id });
                      }}
                    >
                      {item.answeredAt ? "Unmark answered" : "Mark answered"}
                    </PillButton>
                  ) : null}

                  {replies.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {replies.map((reply) => (
                        <View key={reply.id} style={{ borderLeftColor: colors.moss, borderLeftWidth: 3, paddingLeft: 10 }}>
                          <Body>
                            {userById.get(reply.userId) ?? "Someone"}: {reply.body}
                          </Body>
                          {reply.userId === state.currentUserId ? (
                            <Pressable
                              onPress={() => {
                                confirmAction({
                                  title: "Delete reply?",
                                  message: "This comment will be removed from the group feed.",
                                  confirmText: "Delete",
                                  destructive: true,
                                  onConfirm: () => dispatch({ type: "deleteReply", id: reply.id }),
                                });
                              }}
                              style={{ alignSelf: "flex-start", paddingVertical: 6 }}
                            >
                              <Text style={{ color: colors.clay, fontWeight: "900" }}>Delete</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {replyComposerOpen ? (
                    <View style={{ gap: 10 }}>
                      <Field
                        value={replyDrafts[itemKey] ?? ""}
                        onChangeText={(value) => setReplyDrafts((drafts) => ({ ...drafts, [itemKey]: value.slice(0, 500) }))}
                        placeholder="Short supportive reply"
                      />
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                        <PillButton
                          disabled={!replyDrafts[itemKey]?.trim()}
                          onPress={() => {
                            dispatch({ type: "createReply", targetType, targetId: item.id, body: replyDrafts[itemKey] ?? "" });
                            setReplyDrafts((drafts) => ({ ...drafts, [itemKey]: "" }));
                            setReplyComposerKey(undefined);
                          }}
                        >
                          Send reply
                        </PillButton>
                        <PillButton variant="ghost" onPress={() => setReplyComposerKey(undefined)}>
                          Cancel
                        </PillButton>
                      </View>
                    </View>
                  ) : null}

                  <Text selectable style={{ color: colors.muted, fontSize: 15, fontWeight: "800" }}>
                    {replies.length} {replies.length === 1 ? "reply" : "replies"}
                  </Text>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>

      <CreatePostModal
        visible={composerVisible}
        kind={postKind}
        body={postBody}
        images={postImages}
        onKindChange={setPostKind}
        onBodyChange={setPostBody}
        onImagesChange={setPostImages}
        onClose={() => setComposerVisible(false)}
        onPreviewImage={(index) => setImageGallery({ images: postImages, index })}
        onSubmit={handleSubmitPost}
      />

      <ImageGalleryModal gallery={imageGallery} onClose={() => setImageGallery(undefined)} />

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
    </Screen>
  );
}

