import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useKoino } from "@/state/koino-store";
import type { Membership } from "@/state/types";
import { AppHeader, AppScreen, BodyText, BottomSheet, Card, PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { confirmAction } from "@/ui/confirm";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { colors, typography } from "@/ui/theme";
import { type RoomSheet } from "@/features/identity/types";
import { roomMemberCount, shareRoomInvite, selectedImageSize } from "@/features/identity/room-helpers";
import { RoomHeaderCard, JoinSwitchCard } from "@/features/identity/room-cards";
import { SettingsSection, SettingsRow } from "@/features/identity/settings-components";
import { MemberList } from "@/features/identity/members";
import { RoomSwitcherSheet } from "@/features/identity/room-switcher";
import { canViewGroupStatistics, groupRoleFor } from "@/features/community/roles";

export function RoomDetailsScreen() {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const [activeSheet, setActiveSheet] = useState<RoomSheet>();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const inviteRevision = useRef(0);
  useLayoutEffect(() => {
    setInviteMessage("");
    return () => { inviteRevision.current++; };
  }, [state.currentGroupId, state.currentUserId]);
  const [roomMessage, setRoomMessage] = useState("");
  const [leaderMessage, setLeaderMessage] = useState("");
  const [roomImageCropSource, setRoomImageCropSource] = useState<RoomImageCropSource>();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const currentMembership = state.memberships.find((membership) => membership.userId === state.currentUserId);
  const role = groupRoleFor(group, currentMembership, state.currentUserId);
  const ownsGroup = role === "owner";
  const canSeeStatistics = canViewGroupStatistics(role);
  const [roomName, setRoomName] = useState(group?.name ?? "");
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, state.memberships.length || 1) : 0;
  const leaders = useMemo(
    () => state.memberships.filter((membership) => membership.role === "leader"),
    [state.memberships],
  );
  const leaderCandidates = useMemo(
    () => state.memberships.filter((membership) => membership.role === "member" && membership.userId !== state.currentUserId),
    [state.currentUserId, state.memberships],
  );
  const transferableMemberships = useMemo(
    () => state.memberships.filter((membership) => membership.userId !== state.currentUserId && membership.role !== "owner"),
    [state.currentUserId, state.memberships],
  );

  async function handleInvite() {
    if (!group) return;
    const revision = ++inviteRevision.current;
    setInviteMessage("");
    try {
      const message = await shareRoomInvite(group, t);
      if (revision === inviteRevision.current) setInviteMessage(message);
    } catch {
      if (revision === inviteRevision.current) setInviteMessage(t("community.rooms.inviteFallback"));
    }
  }

  function openSwitcher() {
    inviteRevision.current++;
    setInviteMessage("");
    setSwitcherVisible(true);
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

  function handleAppointLeader(membership: Membership) {
    if (!group || !ownsGroup || membership.role !== "member") return;
    setLeaderMessage("");
    void dispatch({ type: "appointGroupLeader", groupId: group.id, userId: membership.userId })
      .then(() => setLeaderMessage(t("community.leaders.appointed", { name: membership.userName })))
      .catch(() => setLeaderMessage(t("community.leaders.appointError")));
  }

  function handleRemoveLeader(membership: Membership) {
    if (!group || !ownsGroup || membership.role !== "leader") return;

    confirmAction({
      title: t("community.leaders.removeTitle"),
      message: t("community.leaders.removeBody", { name: membership.userName }),
      confirmText: t("community.leaders.remove"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "removeGroupLeader", groupId: group.id, userId: membership.userId })
          .then(() => setLeaderMessage(t("community.leaders.removed", { name: membership.userName })))
          .catch(() => setLeaderMessage(t("community.leaders.removeError")));
      },
    });
  }

  function openLeadersSheet() {
    setLeaderMessage("");
    setActiveSheet("leaders");
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
          <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("community.roomDetails.title")}</Text>
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

            {roomMessage ? <Text style={[typography.caption, { color: colors.muted }]}>{roomMessage}</Text> : null}

            <SettingsSection label={t("community.management.settingsTitle")}>
              {ownsGroup ? <SettingsRow icon="user-check" title={t("community.rooms.requestsTitle")} onPress={() => router.push("/members" as never)} /> : null}
              <SettingsRow icon="users" title={t("community.members.title")} onPress={() => setActiveSheet("members")} />
              {canSeeStatistics ? (
                <SettingsRow
                  icon="bar-chart-2"
                  title={t("community.statistics.title")}
                  subtitle={t("community.statistics.entrySubtitle")}
                  onPress={() => router.push("/community-statistics" as never)}
                  showDivider
                />
              ) : null}
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
                  icon="award"
                  title={t("community.leaders.title")}
                  subtitle={t("community.leaders.manageHint")}
                  value={leaders.length > 0 ? String(leaders.length) : undefined}
                  onPress={openLeadersSheet}
                />
                <SettingsRow
                  icon="user-check"
                  title={t("community.management.transfer")}
                  subtitle={t("community.management.transferHint")}
                  onPress={() => setActiveSheet("transfer")}
                  showDivider
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

            <JoinSwitchCard onBrowse={openSwitcher} />
          </>
        ) : (
          <>
            <Card>
              <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.rooms.noneSelected")}</Text>
              <BodyText muted>{t("community.rooms.noneSelectedBody")}</BodyText>
              <PrimaryButton icon="plus" onPress={openSwitcher}>
                {t("community.rooms.joinOrCreate")}
              </PrimaryButton>
            </Card>
          </>
        )}
      </AppScreen>

      <BottomSheet title={t("community.members.title")} visible={activeSheet === "members"} onClose={() => setActiveSheet(undefined)}>
        <MemberList currentUserId={state.currentUserId} memberships={state.memberships} onRemove={ownsGroup ? handleRemoveMember : undefined} onTransfer={ownsGroup ? handleTransferOwnership : undefined} />
      </BottomSheet>

      <BottomSheet title={t("community.leaders.title")} visible={activeSheet === "leaders"} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>{t("community.leaders.body")}</BodyText>
        {leaderMessage ? <Text style={[typography.caption, { color: colors.muted }]}>{leaderMessage}</Text> : null}
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.leaders.current")}</Text>
        {leaders.length > 0 ? (
          <MemberList
            currentUserId={state.currentUserId}
            memberships={leaders}
            onRemoveLeader={ownsGroup ? handleRemoveLeader : undefined}
          />
        ) : (
          <BodyText muted>{t("community.leaders.empty")}</BodyText>
        )}
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.leaders.addTitle")}</Text>
        {leaderCandidates.length > 0 ? (
          <MemberList
            currentUserId={state.currentUserId}
            memberships={leaderCandidates}
            onAppointLeader={ownsGroup ? handleAppointLeader : undefined}
          />
        ) : (
          <BodyText muted>{t("community.leaders.addEmpty")}</BodyText>
        )}
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
