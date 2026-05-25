import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { useKoino } from "@/state/koino-store";
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
  Row,
  SectionHeading,
  SecondaryButton,
} from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { openLinkInApp } from "@/ui/open-link";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { colors } from "@/ui/theme";

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

export function IdentitySupportScreen() {
  const { state, dispatch } = useKoino();
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [amount, setAmount] = useState("50");
  const [avatarCropSource, setAvatarCropSource] = useState<RoomImageCropSource>();
  const [avatarMessage, setAvatarMessage] = useState("");
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? state.groupMemberCounts[group.id] || state.memberships.length || 4 : 0;

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

  return (
    <>
    <AppScreen>
      <AppHeader showBack onBack={() => router.back()} />

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>Identity & Support</Text>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading muted>Identity</SectionHeading>
        <Card style={{ gap: 0, padding: 0 }}>
          <Pressable accessibilityRole="button" style={{ paddingHorizontal: 14 }}>
            <Row icon="user">
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={42} tone="pink" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Profile</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>View and edit your profile</Text>
                </View>
              </View>
            </Row>
          </Pressable>
          <View style={{ gap: 10, paddingBottom: 14, paddingHorizontal: 14 }}>
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
            {avatarMessage ? <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{avatarMessage}</Text> : null}
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ paddingHorizontal: 14 }}>
            <Row onPress={() => undefined}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Name</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{user?.name ?? "Joel"}</Text>
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ paddingHorizontal: 14 }}>
            <Row onPress={() => undefined}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Email</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{state.authEmail ?? "joel@example.com"}</Text>
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={() => dispatch({ type: "setTheme", theme: state.theme === "dark" ? "light" : "dark" })} style={{ paddingHorizontal: 14 }}>
            <Row>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Appearance</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{state.theme === "dark" ? "Night" : "Light"}</Text>
            </Row>
          </Pressable>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={() => setAccountSheetVisible(true)} style={{ paddingHorizontal: 14 }}>
            <Row onPress={() => setAccountSheetVisible(true)}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}>Account options</Text>
            </Row>
          </Pressable>
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading muted>Room</SectionHeading>
        <Card>
          {group ? (
            <>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <RoomImage image={group.image} name={group.name} size={54} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>{group.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{memberLabel(memberCount)}</Text>
                </View>
              </View>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Room code</Text>
                <RoomCodeCopy code={group.inviteCode} fontSize={14} iconSize={15} />
              </View>
              <PrimaryButton icon="share-2" onPress={() => undefined}>Invite button</PrimaryButton>
            </>
          ) : (
            <BodyText muted>No room selected.</BodyText>
          )}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/room" as never)}>
            <Row icon="settings">
              <Text style={{ color: colors.ink, fontWeight: "900" }}>Manage room</Text>
            </Row>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/room" as never)}>
            <Row icon="plus">
              <Text style={{ color: colors.ink, fontWeight: "900" }}>Join another room</Text>
            </Row>
          </Pressable>
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading muted>Support & Trust</SectionHeading>
        <Card>
          <Row icon="heart">
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Support KOINO</Text>
            <BodyText muted>KOINO is supported by voluntary giving. Payments open inside the app.</BodyText>
          </Row>
          <FilterChips
            value={amount}
            onChange={setAmount}
            options={[
              { label: "10 kr", value: "10" },
              { label: "25 kr", value: "25" },
              { label: "50 kr", value: "50" },
              { label: "Custom", value: "custom" },
            ]}
          />
          <PrimaryButton
            icon="arrow-right"
            onPress={() => {
              const resolvedAmount = Number(amount === "custom" ? "50" : amount);
              dispatch({ type: "createSupportIntent", amount: resolvedAmount });
              openLinkInApp("https://example.com/koino-support").catch(() => undefined);
            }}
          >
            Continue
          </PrimaryButton>
        </Card>
        <Card style={{ gap: 0, padding: 0 }}>
          {[
            ["lock", "Password & security"],
            ["shield", "Privacy"],
            ["file-text", "Terms"],
          ].map(([icon, label], index) => (
            <View key={label}>
              {index > 0 ? <View style={{ backgroundColor: colors.line, height: 1 }} /> : null}
              <Pressable accessibilityRole="button" style={{ paddingHorizontal: 14 }}>
                <Row icon={icon as "lock" | "shield" | "file-text"} onPress={() => undefined}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{label}</Text>
                </Row>
              </Pressable>
            </View>
          ))}
        </Card>
      </View>

      <BottomSheet title="Account options" visible={accountSheetVisible} onClose={() => setAccountSheetVisible(false)}>
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="user">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Manage your account settings</Text>
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAccountSheetVisible(false);
              dispatch({ type: "signOut" });
            }}
            style={{ paddingHorizontal: 14 }}
          >
            <Row icon="log-out" tone="danger">
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>Log out</Text>
            </Row>
          </Pressable>
        </Card>
      </BottomSheet>
    </AppScreen>
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
