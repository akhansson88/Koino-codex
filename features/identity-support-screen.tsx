import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Linking, Pressable, Text, View } from "react-native";
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
} from "@/ui/app-components";
import { colors } from "@/ui/theme";

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

export function IdentitySupportScreen() {
  const { state, dispatch } = useKoino();
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [amount, setAmount] = useState("50");
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? state.groupMemberCounts[group.id] || state.memberships.length || 4 : 0;

  return (
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
                <Avatar name={user?.name ?? state.authEmail ?? "K"} size={42} tone="pink" />
                <View>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Profile</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>View and edit your profile</Text>
                </View>
              </View>
            </Row>
          </Pressable>
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
        <SectionHeading muted>Community</SectionHeading>
        <Card>
          {group ? (
            <>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <RoomImage size={54} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>{group.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{memberLabel(memberCount)}</Text>
                </View>
              </View>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Room code</Text>
                <Text selectable style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{group.inviteCode}</Text>
                <Feather name="copy" size={15} color={colors.muted} />
              </View>
              <PrimaryButton icon="share-2" onPress={() => undefined}>Invite button</PrimaryButton>
            </>
          ) : (
            <BodyText muted>No room selected.</BodyText>
          )}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/settings")}>
            <Row icon="settings">
              <Text style={{ color: colors.ink, fontWeight: "900" }}>Manage room</Text>
            </Row>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/settings")}>
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
            <BodyText muted>KOINO is supported by voluntary giving. Payments happen securely outside the app.</BodyText>
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
              Linking.openURL("https://example.com/koino-support").catch(() => undefined);
            }}
          >
            Continue externally
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
  );
}
