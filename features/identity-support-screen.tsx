import type { ComponentProps, PropsWithChildren } from "react";
import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image, Platform, Pressable, Share, Text, View } from "react-native";
import { router } from "expo-router";

import { useKoino } from "@/state/koino-store";
import type { Group, Id, Membership } from "@/state/types";
import {
  AppHeader,
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  FilterChips,
  PrimaryButton,
  RoomImage,
  SecondaryButton,
  TextInputField,
} from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { openLinkInApp } from "@/ui/open-link";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { colors, radius } from "@/ui/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];
type IdentitySheet = "profile" | "account" | "help" | "security" | "privacy" | "terms";
type RoomSheet = "members" | "rename" | "notifications";

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

function roomMemberCount(counts: Record<Id, number>, roomId?: Id, fallback = 1) {
  if (!roomId) return fallback;
  return counts[roomId] || fallback;
}

async function shareRoomInvite(room: Group) {
  const invitation = `Join ${room.name} on KOINO with community code ${room.inviteCode}.`;
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

export function IdentitySupportScreen() {
  const { state, dispatch } = useKoino();
  const [activeSheet, setActiveSheet] = useState<IdentitySheet>();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [amount, setAmount] = useState("50");
  const [avatarCropSource, setAvatarCropSource] = useState<RoomImageCropSource>();
  const [avatarMessage, setAvatarMessage] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, state.memberships.length || 1) : 0;
  const themeLabel = state.theme === "dark" ? "Night" : "Light";

  async function handleChooseAvatar() {
    setAvatarMessage("");

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAvatarMessage("Photo library permission is needed to choose a profile image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 1,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setAvatarMessage("Could not read that image.");
        return;
      }

      const size = await selectedImageSize(asset);
      setAvatarCropSource({ ...size, uri: asset.uri });
    } catch {
      setAvatarMessage("Could not open that image.");
    }
  }

  async function handleSaveAvatar(localUri: string) {
    await dispatch({ type: "uploadUserAvatar", localUri });
    setAvatarCropSource(undefined);
    setAvatarMessage("Profile image updated.");
  }

  function handleDeleteAvatar() {
    if (!user?.image) return;
    confirmAction({
      title: "Delete profile image?",
      message: "Your profile will return to its initials avatar.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteUserAvatar" })
          .then(() => setAvatarMessage("Profile image deleted."))
          .catch(() => setAvatarMessage("Could not delete the profile image."));
      },
    });
  }

  async function handleSendPasswordReset() {
    if (!state.authEmail) {
      setSecurityMessage("No email is connected to this account.");
      return;
    }

    try {
      await dispatch({ type: "requestPasswordReset", email: state.authEmail });
      setSecurityMessage("Password reset link sent.");
    } catch {
      setSecurityMessage("Could not send a reset link right now.");
    }
  }

  function handleGive() {
    const resolvedAmount = Number(amount === "custom" ? "50" : amount);
    void dispatch({ type: "createSupportIntent", amount: resolvedAmount });
    openLinkInApp("https://example.com/koino-support").catch(() => undefined);
  }

  return (
    <>
      <AppScreen>
        <AppHeader showBack onBack={() => router.back()} />

        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>Identity & Support</Text>
          <BodyText muted>Manage your profile, community, privacy, and help.</BodyText>
        </View>

        <SettingsSection label="Identity">
          <SettingsRow icon="user" title="Profile" subtitle="View and edit your profile" onPress={() => setActiveSheet("profile")} />
          <SettingsRow
            icon="sun"
            title="Appearance"
            subtitle="Theme, light or dark mode"
            value={themeLabel}
            onPress={() => dispatch({ type: "setTheme", theme: state.theme === "dark" ? "light" : "dark" })}
            showDivider
          />
          <SettingsRow
            icon="settings"
            title="Account options"
            subtitle="Email, notifications, and account settings"
            onPress={() => setActiveSheet("account")}
            showDivider
          />
        </SettingsSection>

        <View style={{ gap: 10 }}>
          <SectionLabel>Community</SectionLabel>
          <RoomSummaryCard group={group} memberCount={memberCount} onDetails={() => router.push("/room-details" as never)} />
          <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
            <SettingsRow
              icon="repeat"
              title="Switch or join community"
              subtitle="Join another community or create a new one"
              onPress={() => setSwitcherVisible(true)}
            />
          </Card>
        </View>

        <SettingsSection label="Support & Trust">
          <SettingsRow icon="message-circle" title="Help & contact" subtitle="FAQ, support, and contact" onPress={() => setActiveSheet("help")} />
          <SettingsRow
            icon="lock"
            title="Password & security"
            subtitle="Manage login and security"
            onPress={() => setActiveSheet("security")}
            showDivider
          />
          <SettingsRow icon="shield" title="Privacy" subtitle="Manage your data and privacy" onPress={() => setActiveSheet("privacy")} showDivider />
          <SettingsRow
            icon="file-text"
            title="Terms & policies"
            subtitle="Read our terms and privacy policy"
            onPress={() => setActiveSheet("terms")}
            showDivider
          />
        </SettingsSection>

        <GivingCard amount={amount} onAmount={setAmount} onGive={handleGive} />
      </AppScreen>

      <BottomSheet title="Profile" visible={activeSheet === "profile"} onClose={() => setActiveSheet(undefined)}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={86} tone="pink" />
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{user?.name ?? "Your profile"}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{state.authEmail ?? "Signed in to KOINO"}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SecondaryButton icon="image" onPress={handleChooseAvatar} style={{ flex: 1 }}>
            {user?.image ? "Change image" : "Choose image"}
          </SecondaryButton>
          {user?.image ? (
            <SecondaryButton icon="trash-2" onPress={handleDeleteAvatar} style={{ flex: 1 }} tone="danger">
              Delete
            </SecondaryButton>
          ) : null}
        </View>
        {avatarMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{avatarMessage}</Text> : null}
      </BottomSheet>

      <BottomSheet title="Account options" visible={activeSheet === "account"} onClose={() => setActiveSheet(undefined)}>
        <InfoLine label="Email" value={state.authEmail ?? "No email connected"} />
        <InfoLine label="Notifications" value="Community and prayer updates" />
        <SecondaryButton
          icon="log-out"
          onPress={() => {
            setActiveSheet(undefined);
            dispatch({ type: "signOut" });
          }}
        >
          Log out
        </SecondaryButton>
      </BottomSheet>

      <InfoSheet
        title="Help & contact"
        visible={activeSheet === "help"}
        onClose={() => setActiveSheet(undefined)}
        body="Help is here for account questions, community invitations, prayer rhythms, and anything that makes KOINO harder to use."
      />

      <BottomSheet title="Password & security" visible={activeSheet === "security"} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>Password reset links are sent to your account email.</BodyText>
        <PrimaryButton icon="mail" onPress={handleSendPasswordReset}>
          Send reset link
        </PrimaryButton>
        {securityMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{securityMessage}</Text> : null}
      </BottomSheet>

      <InfoSheet
        title="Privacy"
        visible={activeSheet === "privacy"}
        onClose={() => setActiveSheet(undefined)}
        body="Your journal is private by default. Shared reflections and prayers stay connected to the community you choose."
      />

      <InfoSheet
        title="Terms & policies"
        visible={activeSheet === "terms"}
        onClose={() => setActiveSheet(undefined)}
        body="Terms and privacy policy links can be connected here when the published policy pages are ready."
      />

      <RoomSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
      <RoomImageCropper
        source={avatarCropSource}
        title="Crop profile image"
        visible={Boolean(avatarCropSource)}
        onCancel={() => setAvatarCropSource(undefined)}
        onSave={handleSaveAvatar}
      />
    </>
  );
}

export function RoomDetailsScreen() {
  const { state, dispatch } = useKoino();
  const [activeSheet, setActiveSheet] = useState<RoomSheet>();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [roomMessage, setRoomMessage] = useState("");
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const [roomName, setRoomName] = useState(group?.name ?? "");
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, state.memberships.length || 1) : 0;

  async function handleInvite() {
    if (!group) return;
    try {
      setInviteMessage(await shareRoomInvite(group));
    } catch {
      setInviteMessage("Community code is selectable if sharing is unavailable.");
    }
  }

  async function handleRenameRoom() {
    if (!group || !ownsGroup || !roomName.trim() || roomName.trim() === group.name) return;
    await dispatch({ type: "updateGroup", id: group.id, name: roomName });
    setActiveSheet(undefined);
    setRoomMessage("Community name updated.");
  }

  function handleLeaveRoom() {
    if (!group) return;
    if (ownsGroup) {
      setRoomMessage("Community hosts need to transfer ownership or delete the community before leaving.");
      return;
    }

    confirmAction({
      title: "Leave community?",
      message: `You will leave ${group.name}, but your account will stay signed in.`,
      confirmText: "Leave",
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "leaveGroup", id: group.id }).then(() => router.replace("/identity" as never));
      },
    });
  }

  return (
    <>
      <AppScreen>
        <AppHeader showBack onBack={() => router.back()} />

        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>Community details</Text>
          <BodyText muted>Manage your community and members.</BodyText>
        </View>

        {group ? (
          <>
            <RoomHeaderCard group={group} memberCount={memberCount} inviteMessage={inviteMessage} onInvite={handleInvite} />

            {roomMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{roomMessage}</Text> : null}

            <SettingsSection label="Community settings">
              <SettingsRow icon="users" title="Manage members" onPress={() => setActiveSheet("members")} />
              <SettingsRow
                icon="edit-2"
                title="Community name"
                value={group.name}
                onPress={() => {
                  setRoomName(group.name);
                  setActiveSheet("rename");
                }}
                showDivider
              />
              <SettingsRow icon="bell" title="Notifications" value="All activity" onPress={() => setActiveSheet("notifications")} showDivider />
              <SettingsRow icon="log-out" title="Leave community" tone="danger" onPress={handleLeaveRoom} showDivider />
            </SettingsSection>

            <JoinSwitchCard onBrowse={() => setSwitcherVisible(true)} />
          </>
        ) : (
          <>
            <Card>
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>No community selected</Text>
              <BodyText muted>Join or create a community for the people you pray with.</BodyText>
              <PrimaryButton icon="plus" onPress={() => setSwitcherVisible(true)}>
                Browse communities
              </PrimaryButton>
            </Card>
          </>
        )}
      </AppScreen>

      <BottomSheet title="Manage members" visible={activeSheet === "members"} onClose={() => setActiveSheet(undefined)}>
        <MemberList memberships={state.memberships} />
      </BottomSheet>

      <BottomSheet title="Community name" visible={activeSheet === "rename"} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>{ownsGroup ? "Choose a name that helps your community feel easy to recognize." : "Only the community host can rename this community."}</BodyText>
        <TextInputField
          editable={ownsGroup}
          value={roomName}
          onChangeText={setRoomName}
          onSubmitEditing={handleRenameRoom}
          placeholder="Community name"
          returnKeyType="done"
        />
        <PrimaryButton disabled={!ownsGroup || !group || !roomName.trim() || roomName.trim() === group.name} icon="check" onPress={handleRenameRoom}>
          Save community name
        </PrimaryButton>
      </BottomSheet>

      <InfoSheet
        title="Notifications"
        visible={activeSheet === "notifications"}
        onClose={() => setActiveSheet(undefined)}
        body="Community notifications are currently set to all activity. More granular controls can be connected when notification preferences exist."
      />

      <RoomSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
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
  const rowSurface =
    tone === "danger"
      ? colors.dangerSurface
      : icon === "users" || icon === "user-plus" || icon === "home"
        ? colors.semantic.communitySoft
        : icon === "heart" || icon === "coffee" || icon === "help-circle"
          ? colors.semantic.warmthSoft
          : colors.semantic.reflectionSoft;
  const rowAccent =
    tone === "danger"
      ? colors.danger
      : icon === "users" || icon === "user-plus" || icon === "home"
        ? colors.text.primary
        : icon === "heart" || icon === "coffee" || icon === "help-circle"
          ? colors.text.primary
          : colors.text.primary;
  const content = (
    <>
      {showDivider ? <View style={{ backgroundColor: colors.line, height: 1, marginLeft: 60 }} /> : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: rowSurface,
            borderColor: tone === "danger" ? colors.dangerBorder : colors.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather name={icon} size={17} color={rowAccent} />
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
  return (
    <Card style={{ backgroundColor: group ? colors.semantic.communitySoft : colors.background.surface, gap: 14, padding: 16 }}>
      {group ? (
        <>
          <Pressable accessibilityRole="button" onPress={onDetails} style={{ alignItems: "center", flexDirection: "row", gap: 13 }}>
            <RoomImage image={group.image} name={group.name} size={58} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>
                {group.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{memberLabel(memberCount)}</Text>
            </View>
            <Feather name="chevron-right" size={19} color={colors.muted} />
          </Pressable>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>Community code</Text>
            <RoomCodeCopy code={group.inviteCode} fontSize={14} iconSize={15} />
          </View>
          <SecondaryButton icon="info" onPress={onDetails}>
            View community details
          </SecondaryButton>
        </>
      ) : (
        <>
          <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>No community selected</Text>
          <BodyText muted>Join or create a community for the people you pray with.</BodyText>
        </>
      )}
    </Card>
  );
}

function GivingCard({ amount, onAmount, onGive }: { amount: string; onAmount: (value: string) => void; onGive: () => void }) {
  return (
    <Card style={{ backgroundColor: colors.semantic.warmthSoft, borderColor: colors.border.soft, gap: 14 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.background.surface,
            borderColor: colors.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Feather name="heart" size={19} color={colors.brand.peach} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>Give to KOINO</Text>
          <BodyText muted>Support the mission and help KOINO grow.</BodyText>
        </View>
      </View>
      <FilterChips
        value={amount}
        onChange={onAmount}
        options={[
          { label: "10 kr", value: "10" },
          { label: "25 kr", value: "25" },
          { label: "50 kr", value: "50" },
          { label: "Custom", value: "custom" },
        ]}
      />
      <PrimaryButton icon="heart" onPress={onGive}>
        Give
      </PrimaryButton>
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
  return (
    <Card style={{ backgroundColor: colors.semantic.communitySoft, gap: 16, padding: 18 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <RoomImage image={group.image} name={group.name} size={70} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 21, fontWeight: "900", lineHeight: 25 }}>
            {group.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{memberLabel(memberCount)}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: colors.line, height: 1 }} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>Community code</Text>
        <RoomCodeCopy code={group.inviteCode} />
      </View>
      <PrimaryButton icon="share-2" onPress={onInvite}>
        Invite members
      </PrimaryButton>
      {inviteMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{inviteMessage}</Text> : null}
    </Card>
  );
}

function JoinSwitchCard({ onBrowse }: { onBrowse: () => void }) {
  return (
    <Card style={{ backgroundColor: colors.semantic.communitySoft, gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>Join or switch community</Text>
        <BodyText muted>Join another community or create a new one.</BodyText>
      </View>
      <SecondaryButton icon="users" onPress={onBrowse}>
        Browse communities
      </SecondaryButton>
    </Card>
  );
}

function RoomSwitcherSheet({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const { state, dispatch } = useKoino();
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
    setMessage("Community joined.");
    onClose();
  }

  async function handleCreateRoom() {
    if (!canCreate) return;
    await dispatch({ type: "createGroup", name: newGroupName });
    setNewGroupName("");
    setMessage("Community created.");
    onClose();
  }

  async function handleSwitchRoom(roomId: Id) {
    await dispatch({ type: "switchGroup", id: roomId });
    setMessage("Community switched.");
    onClose();
  }

  return (
    <BottomSheet title="Join or switch community" visible={visible} onClose={onClose}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>Your communities</Text>
        <View style={{ gap: 8 }}>
          {otherRooms.length === 0 ? (
            <BodyText muted>No other communities yet.</BodyText>
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
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>Join by community code</Text>
        <TextInputField
          autoCapitalize="characters"
          autoCorrect={false}
          value={joinInviteCode}
          onChangeText={(value) => setJoinInviteCode(value.toUpperCase())}
          onSubmitEditing={handleJoinRoom}
          placeholder="Community code"
          returnKeyType="join"
        />
        <PrimaryButton disabled={!canJoin} icon="log-in" onPress={handleJoinRoom}>
          Join community
        </PrimaryButton>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>Create a new community</Text>
        <TextInputField value={newGroupName} onChangeText={setNewGroupName} onSubmitEditing={handleCreateRoom} placeholder="Community name" returnKeyType="done" />
        <SecondaryButton disabled={!canCreate} icon="plus" onPress={handleCreateRoom}>
          Create community
        </SecondaryButton>
      </View>
      {message || state.authError ? <Text style={{ color: state.authError ? colors.danger : colors.muted, fontSize: 13, fontWeight: "800" }}>{state.authError ?? message}</Text> : null}
    </BottomSheet>
  );
}

function RoomMiniRow({ memberCount, room }: { memberCount: number; room: Group }) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.semantic.communitySoft,
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
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{memberLabel(memberCount)}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.muted} />
    </View>
  );
}

function MemberList({ memberships }: { memberships: Membership[] }) {
  if (memberships.length === 0) {
    return <BodyText muted>No members are listed for this community yet.</BodyText>;
  }

  return (
    <View style={{ gap: 8 }}>
      {memberships.map((membership) => (
        <View key={membership.id}>
          <RoomMemberRow membership={membership} />
        </View>
      ))}
    </View>
  );
}

function RoomMemberRow({ membership }: { membership: Membership }) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.semantic.communitySoft,
        borderColor: colors.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 10,
      }}
    >
      <Avatar name={membership.userName} size={38} tone={membership.role === "owner" ? "orange" : "green"} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{membership.userName}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{membership.role === "owner" ? "Community host" : "Member"}</Text>
      </View>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ backgroundColor: colors.background.surface, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, gap: 4, padding: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

function InfoSheet({
  body,
  onClose,
  title,
  visible,
}: {
  body: string;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <BottomSheet title={title} visible={visible} onClose={onClose}>
      <BodyText muted>{body}</BodyText>
      <SecondaryButton onPress={onClose}>Done</SecondaryButton>
    </BottomSheet>
  );
}
