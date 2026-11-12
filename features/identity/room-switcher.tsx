import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CommunityJoinForm, useCommunityJoinForm } from "@/features/community/join-form";
import { CommunityJoinRequests } from "@/features/community/join-requests";
import { useKoino } from "@/state/koino-store";
import type { Group, Id } from "@/state/types";
import { BodyText, BottomSheet, PrimaryButton, RoomImage, SecondaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount, communitySystemError } from "@/ui/community-copy";
import { colors, radius } from "@/ui/theme";
import { roomMemberCount } from "@/features/identity/room-helpers";

export function RoomSwitcherSheet({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const joinForm = useCommunityJoinForm(state.currentUserId, visible);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState("");
  const otherRooms = useMemo(() => state.groups.filter((item) => item.id !== state.currentGroupId), [state.currentGroupId, state.groups]);
  const canCreate = newGroupName.trim().length > 0;

  function closeSheet() {
    setError("");
    onClose();
  }

  async function handleCreateRoom() {
    if (!canCreate || joinForm.busy) return;
    setError("");
    try {
      await dispatch({ type: "createGroup", name: newGroupName });
      setNewGroupName("");
      closeSheet();
    } catch (problem) {
      setError(communitySystemError(problem instanceof Error ? problem.message : "", t));
    }
  }

  async function handleSwitchRoom(roomId: Id) {
    if (joinForm.busy) return;
    try {
      await dispatch({ type: "switchGroup", id: roomId });
      closeSheet();
    } catch (problem) {
      setError(communitySystemError(problem instanceof Error ? problem.message : "", t));
    }
  }

  return (
    <BottomSheet title={t("community.rooms.joinOrCreate")} visible={visible} onClose={closeSheet} dismissible={!joinForm.busy}>
      {!joinForm.receipt ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{t("community.rooms.other")}</Text>
          <View style={{ gap: 8 }}>
            {otherRooms.length === 0 ? (
              <BodyText muted>{t("community.rooms.noOther")}</BodyText>
            ) : (
              otherRooms.map((room) => (
                <Pressable accessibilityRole="button" disabled={joinForm.busy} key={room.id} onPress={() => handleSwitchRoom(room.id)}>
                  <RoomMiniRow room={room} memberCount={roomMemberCount(state.groupMemberCounts, room.id)} />
                </Pressable>
              ))
            )}
          </View>
        </View>
      ) : null}
      <CommunityJoinForm form={joinForm} />
      <CommunityJoinRequests userId={state.currentUserId} active={visible && !joinForm.receipt} />
      {!joinForm.receipt ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{t("community.rooms.createNew")}</Text>
          <TextInputField editable={!joinForm.busy} value={newGroupName} onChangeText={setNewGroupName} onSubmitEditing={handleCreateRoom} placeholder={t("community.rooms.newNamePlaceholder")} returnKeyType="done" />
          <SecondaryButton disabled={!canCreate || joinForm.busy} icon="plus" onPress={handleCreateRoom}>
            {t("community.rooms.createAction")}
          </SecondaryButton>
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, fontWeight: "800" }}>{error}</Text> : null}
      <SecondaryButton disabled={joinForm.busy} onPress={closeSheet}>{t(joinForm.receipt ? "common.done" : "common.cancel")}</SecondaryButton>
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
