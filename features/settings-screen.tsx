import { useEffect, useMemo, useState } from "react";
import type { ComponentProps, PropsWithChildren } from "react";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { useKoino } from "@/state/koino-store";
import type { Group, Id } from "@/state/types";
import { Choice, Field, Screen } from "@/ui/components";
import { confirmAction } from "@/ui/confirm";
import { brandPalette, colors } from "@/ui/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];

const supportAmounts = [10, 25, 50] as const;

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

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

function roomMemberCount({
  counts,
  currentGroupId,
  currentMembershipCount,
  roomId,
}: {
  counts: Record<Id, number>;
  currentGroupId?: Id;
  currentMembershipCount: number;
  roomId: Id;
}) {
  const count = counts[roomId];
  if (typeof count === "number" && count > 0) return count;
  if (roomId === currentGroupId && currentMembershipCount > 0) return currentMembershipCount;
  return 1;
}

async function shareRoomInvite(room: Group) {
  const invitation = `Join ${room.name} on KOINO with room code ${room.inviteCode}.`;
  const clipboard =
    Platform.OS === "web"
      ? (globalThis as typeof globalThis & {
          navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
        }).navigator?.clipboard
      : undefined;

  if (clipboard?.writeText) {
    await clipboard.writeText(invitation);
    return "Invite copied.";
  }

  await Share.share({
    message: invitation,
    title: `Join ${room.name}`,
  });
  return "Invite ready to share.";
}

function SectionLabel({ children }: PropsWithChildren) {
  return (
    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0, textTransform: "uppercase" }}>
      {children}
    </Text>
  );
}

function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string;
  icon: FeatherName;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.elevated,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 38,
        justifyContent: "center",
        width: 38,
      }}
    >
      <Feather name={icon} size={18} color={tone === "danger" ? colors.danger : colors.ink} />
    </Pressable>
  );
}

function ActionButton({
  disabled = false,
  icon,
  label,
  onPress,
  style,
  variant = "primary",
}: {
  disabled?: boolean;
  icon?: FeatherName;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: "primary" | "outline" | "soft" | "danger";
}) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const backgroundColor = disabled
    ? colors.disabled
    : isPrimary
      ? colors.gold
      : isDanger
        ? colors.dangerSurface
        : variant === "soft"
          ? colors.accentSubtle
          : colors.paper;
  const borderColor = isPrimary ? colors.gold : isDanger ? colors.dangerBorder : colors.line;
  const textColor = disabled ? colors.disabledText : isPrimary ? brandPalette.deepNavy : isDanger ? colors.danger : colors.olive;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor,
          borderColor,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 8,
          justifyContent: "center",
          minHeight: 48,
          paddingHorizontal: 18,
          paddingVertical: 12,
        },
        style,
      ]}
    >
      {icon ? <Feather name={icon} size={17} color={textColor} /> : null}
      <Text style={{ color: textColor, fontSize: 15, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

function BottomSheet({
  children,
  onClose,
  title,
  visible,
}: PropsWithChildren<{ onClose: () => void; title: string; visible: boolean }>) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: "rgba(23, 28, 22, 0.48)", flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            accessibilityLabel="Close sheet"
            accessibilityRole="button"
            onPress={onClose}
            style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
          />
          <View
            style={{
              alignSelf: "center",
              backgroundColor: colors.paper,
              borderColor: colors.line,
              borderRadius: 8,
              borderWidth: 1,
              maxHeight: "88%",
              maxWidth: 560,
              overflow: "hidden",
              paddingTop: 10,
              shadowColor: brandPalette.deepNavy,
              shadowOffset: { width: 0, height: -12 },
              shadowOpacity: 0.18,
              shadowRadius: 30,
              width: "100%",
            }}
          >
            <View style={{ alignItems: "center", paddingBottom: 8 }}>
              <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 4, width: 44 }} />
            </View>
            <View
              style={{
                alignItems: "center",
                borderBottomColor: colors.line,
                borderBottomWidth: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                minHeight: 56,
                paddingHorizontal: 18,
              }}
            >
              <Text style={{ color: colors.ink, flex: 1, fontSize: 20, fontWeight: "800" }}>{title}</Text>
              <IconButton accessibilityLabel="Close" icon="x" onPress={onClose} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 28 }}>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RoomCard({
  activeText,
  inviteMessage,
  memberCount,
  onInvite,
  onJoin,
  onManage,
  room,
}: {
  activeText: string;
  inviteMessage: string;
  memberCount: number;
  onInvite: () => void;
  onJoin: () => void;
  onManage: () => void;
  room?: Group;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: 8,
        borderWidth: 1,
        gap: 18,
        padding: 18,
        shadowColor: brandPalette.deepNavy,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
      }}
    >
      {room ? (
        <>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 14 }}>
            <View style={{ flex: 1, gap: 7 }}>
              <Text numberOfLines={2} style={{ color: colors.olive, fontSize: 21, fontWeight: "900", lineHeight: 27 }}>
                {room.name}
              </Text>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
                <View style={{ backgroundColor: "#65A30D", borderRadius: 999, height: 8, width: 8 }} />
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>{activeText}</Text>
              </View>
              <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Room code:</Text>
                <Text selectable style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                  {room.inviteCode}
                </Text>
                <Feather name="copy" size={15} color={colors.muted} />
              </View>
            </View>
            <IconButton accessibilityLabel="Manage current room" icon="more-horizontal" onPress={onManage} />
          </View>
          <View style={{ gap: 10 }}>
            <ActionButton icon="user-plus" label="Invite" onPress={onInvite} />
            <ActionButton icon="settings" label="Manage room" onPress={onManage} variant="outline" />
          </View>
          {inviteMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{inviteMessage}</Text> : null}
        </>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.ink, fontSize: 21, fontWeight: "900" }}>No room selected</Text>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600", lineHeight: 22 }}>
              Join a room or create one for the people you pray with.
            </Text>
          </View>
          <ActionButton icon="plus" label="Join another room" onPress={onJoin} />
        </>
      )}
      {room && memberCount > 0 ? (
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{memberLabel(memberCount)} total</Text>
      ) : null}
    </View>
  );
}

function RoomRow({
  memberCount,
  onPress,
  room,
}: {
  memberCount: number;
  onPress: () => void;
  room: Group;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? colors.accentSubtle : colors.paper,
        borderBottomColor: colors.line,
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 58,
        paddingHorizontal: 14,
        paddingVertical: 11,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: "800" }}>
          {room.name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 }}>{memberLabel(memberCount)}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );
}

function JoinRoomRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? colors.accentSubtle : colors.paper,
        borderColor: colors.line,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 58,
        paddingHorizontal: 14,
      })}
    >
      <Feather name="plus" size={20} color={colors.ink} />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 15, fontWeight: "800" }}>Join another room</Text>
      <Feather name="chevron-down" size={18} color={colors.muted} />
    </Pressable>
  );
}

function SheetRow({
  description,
  disabled = false,
  icon,
  label,
  onPress,
  tone = "default",
}: {
  description: string;
  disabled?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  const textColor = tone === "danger" ? colors.danger : disabled ? colors.disabledText : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: colors.line,
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 14,
        minHeight: 70,
        paddingVertical: 12,
      }}
    >
      <Feather name={icon} size={20} color={textColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: textColor, fontSize: 15, fontWeight: "800" }}>{label}</Text>
        <Text style={{ color: disabled ? colors.disabledText : colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 18 }}>
          {description}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={disabled ? colors.disabledText : colors.muted} />
    </Pressable>
  );
}

export function SettingsScreen() {
  const { state, dispatch } = useKoino();
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [currentGroupName, setCurrentGroupName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [joinSheetVisible, setJoinSheetVisible] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const resolvedAmount = amount === 0 ? Number(customAmount) : amount;
  const otherRooms = useMemo(() => state.groups.filter((item) => item.id !== state.currentGroupId), [state.currentGroupId, state.groups]);
  const currentMemberCount = group
    ? roomMemberCount({
        counts: state.groupMemberCounts,
        currentGroupId: state.currentGroupId,
        currentMembershipCount: state.memberships.length,
        roomId: group.id,
      })
    : 0;
  const activeTodayCount = useMemo(() => {
    if (!group) return 0;

    const today = localDayKey(new Date());
    const activeUserIds = new Set<string>();
    state.checkIns
      .filter((item) => item.groupId === group.id && localDayKey(item.createdAt) === today)
      .forEach((item) => activeUserIds.add(item.userId));
    state.posts
      .filter((item) => item.groupId === group.id && localDayKey(item.createdAt) === today)
      .forEach((item) => activeUserIds.add(item.userId));
    return activeUserIds.size;
  }, [group, state.checkIns, state.posts]);
  const activeText = activeTodayCount > 0 ? `${memberLabel(activeTodayCount)} active today` : `${memberLabel(currentMemberCount)} in room`;
  const canJoin = joinInviteCode.trim().length >= 3;
  const canCreate = newGroupName.trim().length > 0;
  const canRename = Boolean(ownsGroup && group && currentGroupName.trim() && currentGroupName.trim() !== group.name);
  const avatarInitials = initials(user?.name ?? state.authEmail ?? "K");

  useEffect(() => {
    setCurrentGroupName(group?.name ?? "");
    setInviteMessage("");
  }, [group?.name]);

  async function handleInvite() {
    if (!group) return;

    try {
      const message = await shareRoomInvite(group);
      setInviteMessage(message);
    } catch {
      setInviteMessage("Room code is selectable if sharing is unavailable.");
    }
  }

  async function handleJoinRoom() {
    if (!canJoin) return;

    try {
      await dispatch({ type: "joinGroup", inviteCode: joinInviteCode });
      setJoinInviteCode("");
      setJoinSheetVisible(false);
    } catch {
      return;
    }
  }

  async function handleCreateRoom() {
    if (!canCreate) return;

    try {
      await dispatch({ type: "createGroup", name: newGroupName });
      setNewGroupName("");
      setJoinSheetVisible(false);
    } catch {
      return;
    }
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
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 22, padding: 18, paddingBottom: 118 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontSize: 30, fontWeight: "900", lineHeight: 36 }}>Community</Text>
          <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600", lineHeight: 22 }}>
            Rooms for the people you pray with.
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Your current room</SectionLabel>
          <RoomCard
            activeText={activeText}
            inviteMessage={inviteMessage}
            memberCount={currentMemberCount}
            onInvite={handleInvite}
            onJoin={() => setJoinSheetVisible(true)}
            onManage={() => setManageSheetVisible(true)}
            room={group}
          />
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Other rooms</SectionLabel>
          {otherRooms.length > 0 ? (
            <View
              style={{
                backgroundColor: colors.paper,
                borderColor: colors.line,
                borderRadius: 8,
                borderWidth: 1,
                overflow: "hidden",
              }}
            >
              {otherRooms.map((room) => (
                <RoomRow
                  key={room.id}
                  memberCount={roomMemberCount({
                    counts: state.groupMemberCounts,
                    currentGroupId: state.currentGroupId,
                    currentMembershipCount: state.memberships.length,
                    roomId: room.id,
                  })}
                  onPress={() => dispatch({ type: "switchGroup", id: room.id })}
                  room={room}
                />
              ))}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: colors.paper,
                borderColor: colors.line,
                borderRadius: 8,
                borderWidth: 1,
                padding: 16,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>No other rooms yet.</Text>
            </View>
          )}
          <JoinRoomRow onPress={() => setJoinSheetVisible(true)} />
        </View>

        <View
          style={{
            backgroundColor: colors.paper,
            borderColor: colors.line,
            borderRadius: 8,
            borderWidth: 1,
            gap: 16,
            padding: 16,
          }}
        >
          <View style={{ gap: 8 }}>
            <SectionLabel>Support KOINO</SectionLabel>
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "600", lineHeight: 21 }}>
              KOINO is supported by voluntary giving. Payments happen securely outside the app.
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {supportAmounts.map((value) => (
              <Choice key={value} label={`${value} kr`} selected={amount === value} onPress={() => setAmount(value)} />
            ))}
            <Choice label="Custom" selected={amount === 0} onPress={() => setAmount(0)} />
          </View>
          {amount === 0 ? (
            <Field
              keyboardType="number-pad"
              onChangeText={(value) => setCustomAmount(value.replace(/[^0-9]/g, ""))}
              placeholder="Custom amount in SEK"
              value={customAmount}
            />
          ) : null}
          <ActionButton
            disabled={!resolvedAmount || resolvedAmount < 1}
            icon="arrow-right"
            label="Continue externally"
            onPress={() => {
              dispatch({ type: "createSupportIntent", amount: resolvedAmount });
              Linking.openURL("https://example.com/koino-support").catch(() => undefined);
            }}
          />
          {state.supportIntents[0] ? (
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>
              Latest support: {state.supportIntents[0].amount} SEK confirmed.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <BottomSheet title="Join another room" visible={joinSheetVisible} onClose={() => setJoinSheetVisible(false)}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Enter a room code</Text>
          <Field
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(value) => setJoinInviteCode(value.toUpperCase())}
            placeholder="Room code"
            value={joinInviteCode}
          />
          <ActionButton disabled={!canJoin} label="Join by code" onPress={handleJoinRoom} />
        </View>

        <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 4 }}>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>or</Text>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Create a new room</Text>
          <Field onChangeText={setNewGroupName} placeholder="New room name" value={newGroupName} />
          <ActionButton disabled={!canCreate} label="Create new room" onPress={handleCreateRoom} variant="soft" />
        </View>

        {state.authError ? <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "700" }}>{state.authError}</Text> : null}
      </BottomSheet>

      <BottomSheet title="Manage room" visible={manageSheetVisible && Boolean(group)} onClose={() => setManageSheetVisible(false)}>
        {group ? (
          <>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.accentSubtle,
                  borderColor: colors.gold,
                  borderRadius: 999,
                  borderWidth: 1,
                  height: 44,
                  justifyContent: "center",
                  width: 44,
                }}
              >
                <Text style={{ color: colors.olive, fontSize: 16, fontWeight: "900" }}>{avatarInitials || "K"}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>
                  {group.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>
                  {ownsGroup ? "Created by you" : `${memberLabel(currentMemberCount)} in room`}
                </Text>
              </View>
            </View>

            {ownsGroup ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Rename room</Text>
                <Field onChangeText={setCurrentGroupName} placeholder="Room name" value={currentGroupName} />
                <ActionButton disabled={!canRename} icon="edit-2" label="Save room name" onPress={handleRenameRoom} />
              </View>
            ) : (
              <SheetRow
                description="Only the room owner can rename this room."
                disabled
                icon="edit-2"
                label="Rename room"
                onPress={() => undefined}
              />
            )}

            <SheetRow description="Send the room code to someone new." icon="user-plus" label="Invite people" onPress={handleInvite} />
            {inviteMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{inviteMessage}</Text> : null}

            {!ownsGroup ? (
              <SheetRow description="Leave this room." icon="log-out" label="Leave room" onPress={handleLeaveRoom} />
            ) : null}

            {ownsGroup ? (
              <SheetRow
                description="Permanently delete this room."
                icon="trash-2"
                label="Delete room"
                onPress={handleDeleteRoom}
                tone="danger"
              />
            ) : null}

            {state.authError ? <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "700" }}>{state.authError}</Text> : null}
          </>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
