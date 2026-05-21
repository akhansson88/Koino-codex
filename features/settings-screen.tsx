import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Platform, Pressable, Share, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import type { Group, Id } from "@/state/types";
import {
  AppScreen,
  BodyText,
  BottomSheet,
  Card,
  PrimaryButton,
  RoomImage,
  Row,
  SecondaryButton,
  SectionHeading,
  TextInputField,
} from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { colors } from "@/ui/theme";

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

function roomMemberCount(counts: Record<Id, number>, roomId?: Id, fallback = 1) {
  if (!roomId) return fallback;
  return counts[roomId] || fallback;
}

async function shareRoomInvite(room: Group) {
  const invitation = `Join ${room.name} on KOINO with room code ${room.inviteCode}.`;
  const clipboard =
    Platform.OS === "web"
      ? (globalThis as typeof globalThis & { navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } } }).navigator?.clipboard
      : undefined;

  if (clipboard?.writeText) {
    await clipboard.writeText(invitation);
    return "Invite copied.";
  }

  await Share.share({ message: invitation, title: `Join ${room.name}` });
  return "Invite ready to share.";
}

export function SettingsScreen() {
  const { state, dispatch } = useKoino();
  const [joinSheetVisible, setJoinSheetVisible] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [currentGroupName, setCurrentGroupName] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const otherRooms = useMemo(() => state.groups.filter((item) => item.id !== state.currentGroupId), [state.currentGroupId, state.groups]);
  const memberCount = roomMemberCount(state.groupMemberCounts, group?.id, state.memberships.length || 4);
  const canJoin = joinInviteCode.trim().length >= 3;
  const canCreate = newGroupName.trim().length > 0;
  const canRename = Boolean(ownsGroup && group && currentGroupName.trim() && currentGroupName.trim() !== group.name);

  async function handleInvite() {
    if (!group) return;
    try {
      setInviteMessage(await shareRoomInvite(group));
    } catch {
      setInviteMessage("Room code is selectable if sharing is unavailable.");
    }
  }

  async function handleJoinRoom() {
    if (!canJoin) return;
    await dispatch({ type: "joinGroup", inviteCode: joinInviteCode });
    setJoinInviteCode("");
    setJoinSheetVisible(false);
  }

  async function handleCreateRoom() {
    if (!canCreate) return;
    await dispatch({ type: "createGroup", name: newGroupName });
    setNewGroupName("");
    setJoinSheetVisible(false);
  }

  async function handleRenameRoom() {
    if (!group || !canRename) return;
    await dispatch({ type: "updateGroup", id: group.id, name: currentGroupName });
    setManageSheetVisible(false);
  }

  function handleLeaveRoom() {
    if (!group) return;
    setManageSheetVisible(false);
    confirmAction({
      title: "Leave room?",
      message: `You will leave ${group.name}, but your account will stay signed in.`,
      confirmText: "Leave",
      destructive: true,
      onConfirm: () => dispatch({ type: "leaveGroup", id: group.id }),
    });
  }

  function handleDeleteRoom() {
    if (!group) return;
    setManageSheetVisible(false);
    confirmAction({
      title: "Delete room?",
      message: "This removes the room, shared check-ins, reflections, replies, and prayers.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => dispatch({ type: "deleteGroup", id: group.id }),
    });
  }

  return (
    <AppScreen>
      <View style={{ gap: 8, paddingTop: 64 }}>
        <Text style={{ color: colors.ink, fontSize: 30, fontWeight: "900", lineHeight: 36 }}>Community</Text>
        <BodyText muted>Your small group. Real connection. Shared faith.</BodyText>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading>Your room</SectionHeading>
        <Card style={{ gap: 18, padding: 20 }}>
          {group ? (
            <>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 18 }}>
                <RoomImage name={group.name} size={76} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{group.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>{memberLabel(memberCount)}</Text>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      backgroundColor: colors.accentSubtle,
                      borderRadius: 999,
                      marginTop: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>Current room</Text>
                  </View>
                </View>
              </View>
              <View style={{ backgroundColor: colors.line, height: 1 }} />
              <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Room code</Text>
                  <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                    <Text selectable style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>
                      {group.inviteCode}
                    </Text>
                    <Feather name="copy" size={16} color={colors.muted} />
                  </View>
                </View>
                <PrimaryButton icon="share-2" onPress={handleInvite} style={{ minHeight: 48 }}>
                  Invite
                </PrimaryButton>
              </View>
              {inviteMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{inviteMessage}</Text> : null}
            </>
          ) : (
            <>
              <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "900" }}>No room selected</Text>
              <BodyText muted>Join or create a room for the people you pray with.</BodyText>
              <PrimaryButton icon="plus" onPress={() => setJoinSheetVisible(true)}>
                Join another room
              </PrimaryButton>
            </>
          )}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading>Other rooms</SectionHeading>
        <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          {otherRooms.length === 0 ? (
            <BodyText muted style={{ padding: 16 }}>No other rooms yet.</BodyText>
          ) : (
            otherRooms.map((room, index) => (
              <Pressable
                accessibilityRole="button"
                key={room.id}
                onPress={() => dispatch({ type: "switchGroup", id: room.id })}
                style={{
                  alignItems: "center",
                  borderBottomColor: colors.line,
                  borderBottomWidth: index === otherRooms.length - 1 ? 0 : 1,
                  flexDirection: "row",
                  gap: 12,
                  padding: 14,
                }}
              >
                <RoomImage name={room.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{room.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{memberLabel(roomMemberCount(state.groupMemberCounts, room.id))}</Text>
                </View>
                <Feather name="chevron-right" size={19} color={colors.muted} />
              </Pressable>
            ))
          )}
        </Card>
        <Card style={{ gap: 0, padding: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => setJoinSheetVisible(true)} style={{ paddingHorizontal: 16 }}>
            <Row icon="user-plus">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Join another room</Text>
            </Row>
          </Pressable>
        </Card>
        <Card style={{ gap: 0, padding: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => setJoinSheetVisible(true)} style={{ paddingHorizontal: 16 }}>
            <Row icon="plus">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Create a new room</Text>
            </Row>
          </Pressable>
        </Card>
      </View>

      {group ? (
        <SecondaryButton
          icon="settings"
          onPress={() => {
            setCurrentGroupName(group.name);
            setManageSheetVisible(true);
          }}
        >
          Manage room
        </SecondaryButton>
      ) : null}

      <BottomSheet title="Join another room" visible={joinSheetVisible} onClose={() => setJoinSheetVisible(false)}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Enter a room code</Text>
          <TextInputField autoCapitalize="characters" autoCorrect={false} value={joinInviteCode} onChangeText={(value) => setJoinInviteCode(value.toUpperCase())} placeholder="Room code" />
          <PrimaryButton disabled={!canJoin} onPress={handleJoinRoom}>
            Join by code
          </PrimaryButton>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "900" }}>or</Text>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Create a new room</Text>
          <TextInputField value={newGroupName} onChangeText={setNewGroupName} placeholder="New room name" />
          <PrimaryButton disabled={!canCreate} onPress={handleCreateRoom}>
            Create new room
          </PrimaryButton>
        </View>
        {state.authError ? <Text style={{ color: colors.danger, fontWeight: "800" }}>{state.authError}</Text> : null}
        <SecondaryButton onPress={() => setJoinSheetVisible(false)}>Cancel</SecondaryButton>
      </BottomSheet>

      <BottomSheet title="Manage room" visible={manageSheetVisible && Boolean(group)} onClose={() => setManageSheetVisible(false)}>
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="edit-2" onPress={ownsGroup ? handleRenameRoom : undefined}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Rename room</Text>
              <TextInputField value={currentGroupName} onChangeText={setCurrentGroupName} placeholder="Room name" style={{ marginTop: 8 }} />
              {ownsGroup ? <Text style={{ color: canRename ? colors.gold : colors.muted, fontSize: 12, fontWeight: "700" }}>Tap row to save the name of your room</Text> : null}
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="user" onPress={() => undefined}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Transfer ownership</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Hand over ownership to another member</Text>
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={handleLeaveRoom} disabled={ownsGroup} style={{ opacity: ownsGroup ? 0.45 : 1, paddingHorizontal: 14 }}>
            <Row icon="log-out">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Leave room</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Leave this room</Text>
            </Row>
          </Pressable>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={handleDeleteRoom} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
            <Row icon="trash-2" tone="danger">
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>Delete room</Text>
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Permanently delete this room</Text>
            </Row>
          </Pressable>
        </Card>
        <SecondaryButton onPress={() => setManageSheetVisible(false)}>Cancel</SecondaryButton>
      </BottomSheet>
    </AppScreen>
  );
}
