import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useKoino } from "@/state/koino-store";
import type { Membership } from "@/state/types";
import { AppHeader, AppScreen, BodyText, BottomSheet, Card, PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { confirmAction } from "@/ui/confirm";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { colors } from "@/ui/theme";
import { type RoomSheet } from "@/features/identity/types";
import { roomMemberCount, shareRoomInvite, selectedImageSize } from "@/features/identity/room-helpers";
import { RoomHeaderCard, JoinSwitchCard } from "@/features/identity/room-cards";
import { SettingsSection, SettingsRow } from "@/features/identity/settings-components";
import { MemberList } from "@/features/identity/members";
import { RoomSwitcherSheet } from "@/features/identity/room-switcher";

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
              <SettingsRow icon="lock" title={t("common.encryption")} onPress={() => router.push("/encryption" as never)} />
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
                value={t(state.notificationPreferences.pushEnabled ? "notifications.preferences.enabled" : "notifications.preferences.disabled")}
                onPress={() => router.push("/notification-settings" as never)}
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
