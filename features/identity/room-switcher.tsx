import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
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
