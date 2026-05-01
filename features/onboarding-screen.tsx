import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, Choice, Field, PillButton, Screen, Title } from "@/ui/components";
import { colors } from "@/ui/theme";

export function OnboardingScreen() {
  const { dispatch } = useKoino();
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const canContinue = name.trim().length > 1 && (mode === "create" ? groupName.trim().length > 1 : inviteCode.trim().length > 2);

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 22, padding: 22, paddingTop: 72 }}>
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900", letterSpacing: 2 }}>KOINO MVP</Text>
            <Title>A quieter rhythm for your small group.</Title>
            <Body muted>
              Daily check-ins, sincere prayer, short replies, and a private journal. No public profiles, no streaks, no feed
              treadmill.
            </Body>
          </View>

          <Card>
            <Body>What should your group call you?</Body>
            <Field value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          </Card>

          <Card tone="moss">
            <Body>Start by joining a group with a code, or create a small group and share its code manually.</Body>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Choice label="Join by code" selected={mode === "join"} onPress={() => setMode("join")} />
              <Choice label="Create group" selected={mode === "create"} onPress={() => setMode("create")} />
            </View>
            {mode === "join" ? (
              <Field value={inviteCode} onChangeText={setInviteCode} placeholder="Group code" autoCapitalize="characters" />
            ) : (
              <Field value={groupName} onChangeText={setGroupName} placeholder="Group name" />
            )}
          </Card>

          <PillButton
            disabled={!canContinue}
            onPress={() =>
              dispatch({
                type: "createSession",
                name,
                groupName: mode === "create" ? groupName : undefined,
                inviteCode: mode === "join" ? inviteCode : undefined,
              })
            }
          >
            Enter KOINO
          </PillButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
