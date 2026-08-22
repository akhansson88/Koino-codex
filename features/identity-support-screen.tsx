import type { ComponentProps, PropsWithChildren } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Animated, Easing, Image, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKoino } from "@/state/koino-store";
import type { Group, Id, Membership } from "@/state/types";
import {
  AppHeader,
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  PrimaryButton,
  RoomImage,
  SecondaryButton,
  TextInputField,
} from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount, communitySystemError } from "@/ui/community-copy";
import type { TranslationFunction } from "@/ui/localization";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { colors, platformShadow, radius, typography } from "@/ui/theme";
import { SupportKoinoCard } from "@/features/donation-flow-screen";

type FeatherName = ComponentProps<typeof Feather>["name"];
type IdentitySheet = "profile" | "language" | "account" | "help" | "security" | "privacy" | "terms";
type IdentityPresentation = "screen" | "sheet";
type RoomSheet = "members" | "notifications" | "rename" | "transfer";

function roomMemberCount(counts: Record<Id, number>, roomId?: Id, fallback = 1) {
  if (!roomId) return fallback;
  return counts[roomId] || fallback;
}

async function shareRoomInvite(room: Group, t: TranslationFunction) {
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

async function selectedImageSize(asset: ImagePicker.ImagePickerAsset) {
  if (asset.width > 0 && asset.height > 0) {
    return { height: asset.height, width: asset.width };
  }

  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    Image.getSize(
      asset.uri,
      (width, height) => resolve({ height, width }),
      () => reject(new Error("Could not read that image.")),
    );
  });
}

function IdentityRouteSheet({ children, onDismiss }: PropsWithChildren<{ onDismiss: () => void }>) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const entrance = useRef(new Animated.Value(1)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const exitDistance = height + 64;
  const topGap = Math.max(insets.top + 26, 58);
  const sheetWidth = width >= 760 ? Math.min(width - 48, 680) : "100%";

  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    Animated.timing(entrance, {
      duration: 240,
      easing: Easing.in(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start(() => onDismiss());
  }, [entrance, onDismiss]);

  useEffect(() => {
    Animated.timing(entrance, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => dragY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 86 || gesture.vy > 0.85) {
            dismiss();
            return;
          }

          Animated.spring(dragY, {
            damping: 24,
            mass: 0.8,
            stiffness: 220,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            damping: 24,
            mass: 0.8,
            stiffness: 220,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onStartShouldSetPanResponder: () => false,
      }),
    [dismiss, dragY],
  );
  const translateY = Animated.add(
    entrance.interpolate({
      inputRange: [0, 1],
      outputRange: [0, exitDistance],
    }),
    dragY,
  );

  return (
    <View style={{ backgroundColor: "rgba(11, 18, 32, 0.24)", flex: 1 }}>
      <Pressable
        accessibilityLabel={t("identity.close")}
        accessibilityRole="button"
        onPress={dismiss}
        style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
        style={{ flex: 1, justifyContent: "flex-end", paddingTop: topGap }}
      >
        <Animated.View
          style={{
            alignSelf: "center",
            backgroundColor: colors.cream,
            borderTopLeftRadius: 36,
            borderTopRightRadius: 36,
            height: "100%",
            overflow: "hidden",
            transform: [{ translateY }],
            width: sheetWidth,
            ...platformShadow({
              boxShadow: "0 -22px 54px rgba(11, 18, 32, 0.24)",
              elevation: 22,
              offset: { width: 0, height: -16 },
              opacity: 0.22,
              radius: 34,
            }),
          }}
        >
          <View {...panResponder.panHandlers} style={{ gap: 18, paddingBottom: 12, paddingHorizontal: 22, paddingTop: 12 }}>
            <View style={{ alignItems: "center" }}>
              <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 4, width: 48 }} />
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.paper,
                  borderColor: colors.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  height: 36,
                  justifyContent: "center",
                  width: 36,
                }}
              >
                <Feather name="user" size={17} color={colors.ink} />
              </View>
              <Text style={{ color: colors.ink, flex: 1, fontSize: 25, fontWeight: "900", lineHeight: 31 }}>{t("identity.title")}</Text>
              <Pressable
                accessibilityLabel={t("identity.close")}
                accessibilityRole="button"
                hitSlop={8}
                onPress={dismiss}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: colors.paper,
                  borderColor: "rgba(255,255,255,0.7)",
                  borderRadius: 999,
                  borderWidth: 1,
                  height: 58,
                  justifyContent: "center",
                  opacity: pressed ? 0.72 : 1,
                  width: 58,
                  ...platformShadow({
                    boxShadow: "0 12px 28px rgba(11, 18, 32, 0.16)",
                    elevation: 10,
                    offset: { width: 0, height: 10 },
                    opacity: 0.16,
                    radius: 24,
                  }),
                })}
              >
                <Feather name="x" size={34} color={colors.ink} />
              </Pressable>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={{
              gap: 16,
              paddingBottom: Math.max(36, insets.bottom + 24),
              paddingHorizontal: 18,
              paddingTop: 4,
            }}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function IdentitySupportScreen({ presentation = "screen" }: { presentation?: IdentityPresentation } = {}) {
  const { state, dispatch } = useKoino();
  const { language, setLanguage, t } = useAppTranslation();
  const [activeSheet, setActiveSheet] = useState<IdentitySheet>();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [avatarCropSource, setAvatarCropSource] = useState<RoomImageCropSource>();
  const [avatarMessage, setAvatarMessage] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, state.memberships.length || 1) : 0;
  const themeLabel = t(state.theme === "dark" ? "identity.appearance.night" : "identity.appearance.light");

  function openAvatarCropper(source: RoomImageCropSource) {
    if (Platform.OS === "web") {
      setAvatarCropSource(source);
      return;
    }

    setActiveSheet(undefined);
    setTimeout(() => setAvatarCropSource(source), Platform.OS === "ios" ? 500 : 250);
  }

  async function handleChooseAvatar() {
    setAvatarMessage("");

    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setAvatarMessage(t("identity.avatar.permission"));
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 1,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setAvatarMessage(t("identity.avatar.readError"));
        return;
      }

      const size = await selectedImageSize(asset);
      openAvatarCropper({ ...size, uri: asset.uri });
    } catch {
      setAvatarMessage(t("identity.avatar.openError"));
    }
  }

  async function handleSaveAvatar(localUri: string) {
    await dispatch({ type: "uploadUserAvatar", localUri });
    setAvatarCropSource(undefined);
    setAvatarMessage(t("identity.avatar.updated"));
  }

  function handleDeleteAvatar() {
    if (!user?.image) return;
    confirmAction({
      title: t("identity.avatar.deleteTitle"),
      message: t("identity.avatar.deleteBody"),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteUserAvatar" })
          .then(() => setAvatarMessage(t("identity.avatar.deleted")))
          .catch(() => setAvatarMessage(t("identity.avatar.deleteError")));
      },
    });
  }

  async function handleSendPasswordReset() {
    if (!state.authEmail) {
      setSecurityMessage(t("identity.security.noEmail"));
      return;
    }

    try {
      await dispatch({ type: "requestPasswordReset", email: state.authEmail });
      setSecurityMessage(t("identity.security.resetSent"));
    } catch {
      setSecurityMessage(t("identity.security.error"));
    }
  }

  const content = (
    <>
      {presentation === "screen" ? (
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>{t("identity.title")}</Text>
          <BodyText muted>{t("identity.description")}</BodyText>
        </View>
      ) : null}

      <SettingsSection label={t("identity.section.identity")}>
        <SettingsRow icon="user" title={t("identity.profile.title")} subtitle={t("identity.profile.subtitle")} onPress={() => setActiveSheet("profile")} />
        <SettingsRow
          icon="sun"
          title={t("identity.appearance.title")}
          subtitle={t("identity.appearance.subtitle")}
          value={themeLabel}
          onPress={() => dispatch({ type: "setTheme", theme: state.theme === "dark" ? "light" : "dark" })}
          showDivider
        />
        <SettingsRow
          icon="globe"
          title={t("settings.language.title")}
          subtitle={t("settings.language.subtitle")}
          value={language === "en" ? t("settings.language.option.english") : t("settings.language.option.swedish")}
          onPress={() => setActiveSheet("language")}
          showDivider
        />
        <SettingsRow
          icon="settings"
          title={t("identity.account.title")}
          subtitle={t("identity.account.subtitle")}
          onPress={() => setActiveSheet("account")}
          showDivider
        />
      </SettingsSection>

      <View style={{ gap: 10 }}>
        <SectionLabel>{t("community.page.community")}</SectionLabel>
        <RoomSummaryCard group={group} memberCount={memberCount} onDetails={() => router.push("/room-details" as never)} />
        <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          <SettingsRow
            icon="repeat"
            title={t("community.rooms.joinOrCreate")}
            subtitle={t("community.identity.joinOrCreateBody")}
            onPress={() => setSwitcherVisible(true)}
          />
        </Card>
      </View>

      <SettingsSection label={t("identity.section.supportTrust")}>
        <SettingsRow icon="message-circle" title={t("identity.help.title")} subtitle={t("identity.help.subtitle")} onPress={() => setActiveSheet("help")} />
        <SettingsRow
          icon="lock"
          title={t("identity.security.title")}
          subtitle={t("identity.security.subtitle")}
          onPress={() => setActiveSheet("security")}
          showDivider
        />
        <SettingsRow icon="shield" title={t("identity.privacy.title")} subtitle={t("identity.privacy.subtitle")} onPress={() => setActiveSheet("privacy")} showDivider />
        <SettingsRow
          icon="file-text"
          title={t("identity.terms.title")}
          subtitle={t("identity.terms.subtitle")}
          onPress={() => setActiveSheet("terms")}
          showDivider
        />
      </SettingsSection>

      <SupportKoinoCard onPress={() => router.replace("/donation-amount" as never)} />
    </>
  );

  return (
    <>
      {presentation === "sheet" ? (
        <IdentityRouteSheet onDismiss={() => router.back()}>{content}</IdentityRouteSheet>
      ) : (
        <AppScreen>
          <AppHeader showBack onBack={() => router.back()} />
          {content}
        </AppScreen>
      )}

      <BottomSheet title={t("identity.profile.title")} visible={activeSheet === "profile"} onClose={() => setActiveSheet(undefined)}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={86} tone="pink" />
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{user?.name ?? t("identity.profile.fallback")}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{state.authEmail ?? t("identity.profile.signedIn")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SecondaryButton icon="image" onPress={handleChooseAvatar} style={{ flex: 1 }}>
            {t(user?.image ? "identity.profile.changeImage" : "identity.profile.chooseImage")}
          </SecondaryButton>
          {user?.image ? (
            <SecondaryButton icon="trash-2" onPress={handleDeleteAvatar} style={{ flex: 1 }} tone="danger">
              {t("common.delete")}
            </SecondaryButton>
          ) : null}
        </View>
        {avatarMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{avatarMessage}</Text> : null}
      </BottomSheet>

      <BottomSheet
        title={t("settings.language.sheetTitle")}
        visible={activeSheet === "language"}
        onClose={() => setActiveSheet(undefined)}
      >
        <BodyText muted>{t("settings.language.description")}</BodyText>
        <SettingsSection label={t("settings.language.options")}>
          <SettingsRow
            icon="globe"
            title={t("settings.language.option.english")}
            value={language === "en" ? t("settings.language.selected") : undefined}
            onPress={() => setLanguage("en")}
          />
          <SettingsRow
            icon="globe"
            title={t("settings.language.option.swedish")}
            value={language === "sv" ? t("settings.language.selected") : undefined}
            onPress={() => setLanguage("sv")}
            showDivider
          />
        </SettingsSection>
      </BottomSheet>

      <BottomSheet title={t("identity.account.title")} visible={activeSheet === "account"} onClose={() => setActiveSheet(undefined)}>
        <InfoLine label={t("identity.account.email")} value={state.authEmail ?? t("identity.account.noEmail")} />
        <InfoLine label={t("identity.account.notifications")} value={t("identity.account.communityPrayerUpdates")} />
        <SecondaryButton
          icon="log-out"
          onPress={() => {
            setActiveSheet(undefined);
            dispatch({ type: "signOut" });
          }}
        >
          {t("common.logOut")}
        </SecondaryButton>
      </BottomSheet>

      <InfoSheet
        title={t("identity.help.title")}
        visible={activeSheet === "help"}
        onClose={() => setActiveSheet(undefined)}
        body={t("identity.help.body")}
      />

      <BottomSheet title={t("identity.security.title")} visible={activeSheet === "security"} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>{t("identity.security.body")}</BodyText>
        <PrimaryButton icon="mail" onPress={handleSendPasswordReset}>
          {t("identity.security.sendReset")}
        </PrimaryButton>
        {securityMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{securityMessage}</Text> : null}
      </BottomSheet>

      <InfoSheet
        title={t("identity.privacy.title")}
        visible={activeSheet === "privacy"}
        onClose={() => setActiveSheet(undefined)}
        body={t("identity.privacy.body")}
      />

      <InfoSheet
        title={t("identity.terms.title")}
        visible={activeSheet === "terms"}
        onClose={() => setActiveSheet(undefined)}
        body={t("identity.terms.body")}
      />

      <RoomSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
      <RoomImageCropper
        source={avatarCropSource}
        title={t("identity.profile.cropImage")}
        visible={Boolean(avatarCropSource)}
        onCancel={() => setAvatarCropSource(undefined)}
        onSave={handleSaveAvatar}
      />
    </>
  );
}

export function RoomDetailsScreen() {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const [activeSheet, setActiveSheet] = useState<RoomSheet>();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [roomMessage, setRoomMessage] = useState("");
  const [roomImageCropSource, setRoomImageCropSource] = useState<RoomImageCropSource>();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const [roomName, setRoomName] = useState(group?.name ?? "");
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, state.memberships.length || 1) : 0;
  const transferableMemberships = useMemo(
    () => state.memberships.filter((membership) => membership.userId !== state.currentUserId && membership.role !== "owner"),
    [state.currentUserId, state.memberships],
  );

  async function handleInvite() {
    if (!group) return;
    try {
      setInviteMessage(await shareRoomInvite(group, t));
    } catch {
      setInviteMessage(t("community.rooms.inviteFallback"));
    }
  }

  async function handleRenameRoom() {
    if (!group || !ownsGroup || !roomName.trim() || roomName.trim() === group.name) return;
    await dispatch({ type: "updateGroup", id: group.id, name: roomName });
    setActiveSheet(undefined);
    setRoomMessage(t("community.roomDetails.nameUpdated"));
  }

  async function handleChooseRoomImage() {
    if (!group || !ownsGroup) return;
    setRoomMessage("");

    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setRoomMessage(t("community.management.imagePermission"));
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 1,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setRoomMessage(t("community.management.imageReadError"));
        return;
      }

      const size = await selectedImageSize(asset);
      setRoomImageCropSource({ ...size, uri: asset.uri });
    } catch {
      setRoomMessage(t("community.management.imageOpenError"));
    }
  }

  async function handleSaveRoomImage(localUri: string) {
    if (!group || !ownsGroup) return;
    await dispatch({ type: "uploadGroupImage", id: group.id, localUri });
    setRoomImageCropSource(undefined);
    setRoomMessage(t("community.management.imageUpdated"));
  }

  function handleDeleteRoomImage() {
    if (!group?.image || !ownsGroup) return;
    confirmAction({
      title: t("community.management.deleteImageTitle"),
      message: t("community.management.deleteImageBody"),
      confirmText: t("common.delete"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteGroupImage", id: group.id })
          .then(() => setRoomMessage(t("community.management.imageDeleted")))
          .catch(() => setRoomMessage(t("community.management.imageDeleteError")));
      },
    });
  }

  function handleLeaveRoom() {
    if (!group) return;
    if (ownsGroup) {
      setRoomMessage(t("community.roomDetails.hostLeaveBlocked"));
      return;
    }

    confirmAction({
      title: t("community.management.leaveTitle"),
      message: t("community.management.leaveBody", { name: group.name }),
      confirmText: t("community.management.leave"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "leaveGroup", id: group.id }).then(() => router.replace("/identity" as never));
      },
    });
  }

  function handleRemoveMember(membership: Membership) {
    if (!group || !ownsGroup || membership.role === "owner" || membership.userId === state.currentUserId) return;

    confirmAction({
      title: t("community.management.removeMemberTitle"),
      message: t("community.management.removeMemberBody", { community: group.name, name: membership.userName }),
      confirmText: t("community.management.removeMember"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "removeGroupMember", groupId: group.id, userId: membership.userId })
          .then(() => setRoomMessage(t("community.management.removeMemberSuccess", { name: membership.userName })))
          .catch(() => setRoomMessage(t("community.management.removeMemberError")));
      },
    });
  }

  function handleTransferOwnership(membership: Membership) {
    if (!group || !ownsGroup || membership.role === "owner" || membership.userId === state.currentUserId) return;

    setActiveSheet(undefined);
    confirmAction({
      title: t("community.management.transferTitle"),
      message: t("community.management.transferBody", { community: group.name, name: membership.userName }),
      confirmText: t("community.management.transfer"),
      onConfirm: () => {
        void dispatch({ type: "transferGroupOwnership", groupId: group.id, userId: membership.userId })
          .then(() => setRoomMessage(t("community.management.transferSuccess", { name: membership.userName })))
          .catch(() => setRoomMessage(t("community.management.transferError")));
      },
    });
  }

  function handleDeleteRoom() {
    if (!group || !ownsGroup) return;
    confirmAction({
      title: t("community.management.deleteTitle"),
      message: t("community.management.deleteBody"),
      confirmText: t("common.delete"),
      destructive: true,
      onConfirm: () => dispatch({ type: "deleteGroup", id: group.id }),
    });
  }

  return (
    <>
      <AppScreen>
        <AppHeader showBack onBack={() => router.back()} />

        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>{t("community.roomDetails.title")}</Text>
          <BodyText muted>{t("community.roomDetails.subtitle")}</BodyText>
        </View>

        {group ? (
          <>
            <RoomHeaderCard group={group} memberCount={memberCount} inviteMessage={inviteMessage} onInvite={handleInvite} />

            <SettingsSection label={t("community.page.community")}>
              <SettingsRow
                icon="image"
                title={t(group.image ? "community.management.changeImage" : "community.management.addImage")}
                subtitle={t(ownsGroup ? "community.management.imageOwnerHint" : "community.management.ownerOnlyChange")}
                onPress={ownsGroup ? handleChooseRoomImage : undefined}
              />
              {ownsGroup && group.image ? (
                <SettingsRow
                  icon="trash-2"
                  title={t("community.management.deleteImage")}
                  subtitle={t("community.management.deleteImageHint")}
                  tone="danger"
                  onPress={handleDeleteRoomImage}
                  showDivider
                />
              ) : null}
            </SettingsSection>

            {roomMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{roomMessage}</Text> : null}

            <SettingsSection label={t("community.management.settingsTitle")}>
              <SettingsRow icon="users" title={t("community.members.title")} onPress={() => setActiveSheet("members")} />
              <SettingsRow
                icon="edit-2"
                title={t("community.management.namePlaceholder")}
                value={group.name}
                onPress={() => {
                  setRoomName(group.name);
                  setActiveSheet("rename");
                }}
                showDivider
              />
              <SettingsRow
                icon="bell"
                title={t("community.roomDetails.notifications")}
                value={t("community.roomDetails.allActivity")}
                onPress={() => setActiveSheet("notifications")}
                showDivider
              />
            </SettingsSection>

            {ownsGroup ? (
              <SettingsSection label={t("community.roomDetails.ownerSettings")}>
                <SettingsRow
                  icon="user-check"
                  title={t("community.management.transfer")}
                  subtitle={t("community.management.transferHint")}
                  onPress={() => setActiveSheet("transfer")}
                />
                <SettingsRow
                  icon="trash-2"
                  title={t("community.management.delete")}
                  subtitle={t("community.management.deleteHint")}
                  tone="danger"
                  onPress={handleDeleteRoom}
                  showDivider
                />
              </SettingsSection>
            ) : (
              <SettingsSection label={t("community.roomDetails.membership")}>
                <SettingsRow
                  icon="log-out"
                  title={t("community.management.leaveHint")}
                  tone="danger"
                  onPress={handleLeaveRoom}
                />
              </SettingsSection>
            )}

            <JoinSwitchCard onBrowse={() => setSwitcherVisible(true)} />
          </>
        ) : (
          <>
            <Card>
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>{t("community.rooms.noneSelected")}</Text>
              <BodyText muted>{t("community.rooms.noneSelectedBody")}</BodyText>
              <PrimaryButton icon="plus" onPress={() => setSwitcherVisible(true)}>
                {t("community.rooms.joinOrCreate")}
              </PrimaryButton>
            </Card>
          </>
        )}
      </AppScreen>

      <BottomSheet title={t("community.members.title")} visible={activeSheet === "members"} onClose={() => setActiveSheet(undefined)}>
        <MemberList currentUserId={state.currentUserId} memberships={state.memberships} onRemove={ownsGroup ? handleRemoveMember : undefined} onTransfer={ownsGroup ? handleTransferOwnership : undefined} />
      </BottomSheet>

      <BottomSheet title={t("community.management.rename")} visible={activeSheet === "rename"} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>
          {t(ownsGroup ? "community.roomDetails.renameOwnerBody" : "community.roomDetails.renameMemberBody")}
        </BodyText>
        <TextInputField
          editable={ownsGroup}
          value={roomName}
          onChangeText={setRoomName}
          onSubmitEditing={handleRenameRoom}
          placeholder={t("community.management.namePlaceholder")}
          returnKeyType="done"
        />
        <PrimaryButton disabled={!ownsGroup || !group || !roomName.trim() || roomName.trim() === group.name} icon="check" onPress={handleRenameRoom}>
          {t("community.management.rename")}
        </PrimaryButton>
      </BottomSheet>

      <InfoSheet
        title={t("community.roomDetails.notifications")}
        visible={activeSheet === "notifications"}
        onClose={() => setActiveSheet(undefined)}
        body={t("community.roomDetails.notificationsBody")}
        doneLabel={t("community.checkIn.done")}
      />

      <BottomSheet title={t("community.management.transfer")} visible={activeSheet === "transfer"} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>{t("community.management.transferChoose")}</BodyText>
        {transferableMemberships.length > 0 ? (
          <MemberList currentUserId={state.currentUserId} memberships={transferableMemberships} onTransfer={handleTransferOwnership} />
        ) : (
          <BodyText muted>{t("community.management.transferEmpty")}</BodyText>
        )}
      </BottomSheet>

      <RoomSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
      <RoomImageCropper
        source={roomImageCropSource}
        title={t("community.management.cropImage")}
        visible={Boolean(roomImageCropSource)}
        onCancel={() => setRoomImageCropSource(undefined)}
        onSave={handleSaveRoomImage}
      />
    </>
  );
}

function SettingsSection({ children, label }: PropsWithChildren<{ label: string }>) {
  return (
    <View style={{ gap: 10 }}>
      <SectionLabel>{label}</SectionLabel>
      <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>{children}</Card>
    </View>
  );
}

function SectionLabel({ children }: PropsWithChildren) {
  return (
    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" }}>
      {children}
    </Text>
  );
}

function SettingsRow({
  icon,
  onPress,
  showDivider = false,
  subtitle,
  title,
  tone = "default",
  value,
}: {
  icon: FeatherName;
  onPress?: () => void;
  showDivider?: boolean;
  subtitle?: string;
  title: string;
  tone?: "default" | "danger";
  value?: string;
}) {
  const content = (
    <>
      {showDivider ? <View style={{ backgroundColor: colors.line, height: 1, marginLeft: 60 }} /> : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: tone === "danger" ? colors.dangerSurface : colors.accentSubtle,
            borderColor: tone === "danger" ? colors.dangerBorder : colors.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather name={icon} size={17} color={tone === "danger" ? colors.danger : colors.olive} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: tone === "danger" ? colors.danger : colors.ink, fontSize: 15, fontWeight: "900" }}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 }}>{subtitle}</Text> : null}
        </View>
        {value ? (
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, fontWeight: "800", maxWidth: 112 }}>
            {value}
          </Text>
        ) : null}
        {onPress ? <Feather name="chevron-right" size={18} color={colors.muted} /> : null}
      </View>
    </>
  );

  if (!onPress) return <View>{content}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      {content}
    </Pressable>
  );
}

function RoomSummaryCard({ group, memberCount, onDetails }: { group?: Group; memberCount: number; onDetails: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 14, padding: 16 }}>
      {group ? (
        <>
          <Pressable accessibilityRole="button" onPress={onDetails} style={{ alignItems: "center", flexDirection: "row", gap: 13 }}>
            <RoomImage image={group.image} name={group.name} size={58} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>
                {group.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{communityMemberCount(memberCount, t)}</Text>
            </View>
            <Feather name="chevron-right" size={19} color={colors.muted} />
          </Pressable>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{t("community.rooms.code")}</Text>
            <RoomCodeCopy code={group.inviteCode} fontSize={14} iconSize={15} />
          </View>
          <SecondaryButton icon="info" onPress={onDetails}>
            {t("community.rooms.open")}
          </SecondaryButton>
        </>
      ) : (
        <>
          <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>{t("community.rooms.noneSelected")}</Text>
          <BodyText muted>{t("community.rooms.noneSelectedBody")}</BodyText>
        </>
      )}
    </Card>
  );
}

function RoomHeaderCard({
  group,
  inviteMessage,
  memberCount,
  onInvite,
}: {
  group: Group;
  inviteMessage: string;
  memberCount: number;
  onInvite: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 16, padding: 18 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <RoomImage image={group.image} name={group.name} size={70} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 21, fontWeight: "900", lineHeight: 25 }}>
            {group.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{communityMemberCount(memberCount, t)}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: colors.line, height: 1 }} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{t("community.rooms.code")}</Text>
        <RoomCodeCopy code={group.inviteCode} />
      </View>
      <PrimaryButton icon="share-2" onPress={onInvite}>
        {t("community.members.invite")}
      </PrimaryButton>
      {inviteMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{inviteMessage}</Text> : null}
    </Card>
  );
}

function JoinSwitchCard({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>{t("community.rooms.joinOrCreate")}</Text>
        <BodyText muted>{t("community.identity.joinOrCreateBody")}</BodyText>
      </View>
      <SecondaryButton icon="users" onPress={onBrowse}>
        {t("community.rooms.joinOrCreate")}
      </SecondaryButton>
    </Card>
  );
}

function RoomSwitcherSheet({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [message, setMessage] = useState("");
  const otherRooms = useMemo(() => state.groups.filter((item) => item.id !== state.currentGroupId), [state.currentGroupId, state.groups]);
  const canJoin = joinInviteCode.trim().length >= 3;
  const canCreate = newGroupName.trim().length > 0;

  async function handleJoinRoom() {
    if (!canJoin) return;
    await dispatch({ type: "joinGroup", inviteCode: joinInviteCode });
    setJoinInviteCode("");
    setMessage(t("community.rooms.joined"));
    onClose();
  }

  async function handleCreateRoom() {
    if (!canCreate) return;
    await dispatch({ type: "createGroup", name: newGroupName });
    setNewGroupName("");
    setMessage(t("community.rooms.created"));
    onClose();
  }

  async function handleSwitchRoom(roomId: Id) {
    await dispatch({ type: "switchGroup", id: roomId });
    setMessage(t("community.rooms.switched"));
    onClose();
  }

  return (
    <BottomSheet title={t("community.rooms.joinOrCreate")} visible={visible} onClose={onClose}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{t("community.rooms.other")}</Text>
        <View style={{ gap: 8 }}>
          {otherRooms.length === 0 ? (
            <BodyText muted>{t("community.rooms.noOther")}</BodyText>
          ) : (
            otherRooms.map((room) => (
              <Pressable accessibilityRole="button" key={room.id} onPress={() => handleSwitchRoom(room.id)}>
                <RoomMiniRow room={room} memberCount={roomMemberCount(state.groupMemberCounts, room.id)} />
              </Pressable>
            ))
          )}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{t("community.rooms.enterCode")}</Text>
        <TextInputField
          autoCapitalize="characters"
          autoCorrect={false}
          value={joinInviteCode}
          onChangeText={(value) => setJoinInviteCode(value.toUpperCase())}
          onSubmitEditing={handleJoinRoom}
          placeholder={t("community.rooms.code")}
          returnKeyType="join"
        />
        <PrimaryButton disabled={!canJoin} icon="log-in" onPress={handleJoinRoom}>
          {t("community.rooms.joinByCode")}
        </PrimaryButton>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{t("community.rooms.createNew")}</Text>
        <TextInputField value={newGroupName} onChangeText={setNewGroupName} onSubmitEditing={handleCreateRoom} placeholder={t("community.rooms.newNamePlaceholder")} returnKeyType="done" />
        <SecondaryButton disabled={!canCreate} icon="plus" onPress={handleCreateRoom}>
          {t("community.rooms.createAction")}
        </SecondaryButton>
      </View>
      {message || state.authError ? (
        <Text style={{ color: state.authError ? colors.danger : colors.muted, fontSize: 13, fontWeight: "800" }}>
          {state.authError ? communitySystemError(state.authError, t) : message}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

function RoomMiniRow({ memberCount, room }: { memberCount: number; room: Group }) {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.input,
        borderColor: colors.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 64,
        padding: 10,
      }}
    >
      <RoomImage image={room.image} name={room.name} size={42} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
          {room.name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{communityMemberCount(memberCount, t)}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.muted} />
    </View>
  );
}

function MemberList({
  currentUserId,
  memberships,
  onRemove,
  onTransfer,
}: {
  currentUserId?: Id;
  memberships: Membership[];
  onRemove?: (membership: Membership) => void;
  onTransfer?: (membership: Membership) => void;
}) {
  const { t } = useAppTranslation();
  if (memberships.length === 0) {
    return <BodyText muted>{t("community.members.empty")}</BodyText>;
  }

  return (
    <View style={{ gap: 8 }}>
      {memberships.map((membership) => (
        <View key={membership.id}>
          <RoomMemberRow currentUserId={currentUserId} membership={membership} onRemove={onRemove} onTransfer={onTransfer} />
        </View>
      ))}
    </View>
  );
}

function RoomMemberRow({
  currentUserId,
  membership,
  onRemove,
  onTransfer,
}: {
  currentUserId?: Id;
  membership: Membership;
  onRemove?: (membership: Membership) => void;
  onTransfer?: (membership: Membership) => void;
}) {
  const { t } = useAppTranslation();
  const canRemove = Boolean(onRemove && membership.role !== "owner" && membership.userId !== currentUserId);
  const canTransfer = Boolean(onTransfer && membership.role !== "owner" && membership.userId !== currentUserId);

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.input,
        borderColor: colors.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 10,
      }}
    >
      <Avatar image={membership.image} name={membership.userName} size={38} tone={membership.role === "owner" ? "orange" : "green"} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{membership.userName}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
          {t(membership.role === "owner" ? "community.members.role.host" : "community.members.role.member")}
        </Text>
      </View>
      {canTransfer ? (
        <Pressable
          accessibilityLabel={t("community.management.transferTo", { name: membership.userName })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onTransfer?.(membership)}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: colors.mossSurface,
            borderColor: colors.moss,
            borderRadius: 999,
            borderWidth: 1,
            height: 36,
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
            width: 36,
          })}
        >
          <Feather name="user-check" size={17} color={colors.olive} />
        </Pressable>
      ) : null}
      {canRemove ? (
        <Pressable
          accessibilityLabel={t("community.management.removeMemberFrom", { name: membership.userName })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onRemove?.(membership)}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: colors.dangerSurface,
            borderColor: colors.dangerBorder,
            borderRadius: 999,
            borderWidth: 1,
            height: 36,
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
            width: 36,
          })}
        >
          <Feather name="user-x" size={17} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ backgroundColor: colors.input, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, gap: 4, padding: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

function InfoSheet({
  body,
  doneLabel,
  onClose,
  title,
  visible,
}: {
  body: string;
  doneLabel?: string;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <BottomSheet title={title} visible={visible} onClose={onClose}>
      <BodyText muted>{body}</BodyText>
      <SecondaryButton onPress={onClose}>{doneLabel ?? t("common.done")}</SecondaryButton>
    </BottomSheet>
  );
}
