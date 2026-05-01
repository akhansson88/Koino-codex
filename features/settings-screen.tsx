import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, Choice, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { colors } from "@/ui/theme";

export function SettingsScreen() {
  const { state, dispatch } = useKoino();
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const resolvedAmount = amount === 0 ? Number(customAmount) : amount;

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card>
          <SectionTitle>Session</SectionTitle>
          <Body>Name: {user?.name ?? "Unknown"}</Body>
          <Body>Group: {group?.name ?? "No group"}</Body>
          <Text selectable style={{ color: colors.olive, fontSize: 18, fontWeight: "900" }}>
            Invite code: {group?.inviteCode ?? "..."}
          </Text>
          <Body muted>Share this code manually with people in your small group.</Body>
        </Card>

        <Card tone="rose">
          <SectionTitle>Support the journey</SectionTitle>
          <Body muted>
            KOINO keeps prayer free. If this little rhythm helps your group, you can make a voluntary support intent here.
            Payment is represented as an external provider demo, so no card data is stored in KOINO.
          </Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[10, 25, 50].map((value) => (
              <Choice key={value} label={`${value} kr`} selected={amount === value} onPress={() => setAmount(value)} />
            ))}
            <Choice label="Custom" selected={amount === 0} onPress={() => setAmount(0)} />
          </View>
          {amount === 0 ? (
            <Field
              value={customAmount}
              onChangeText={(value) => setCustomAmount(value.replace(/[^0-9]/g, ""))}
              placeholder="Custom amount in SEK"
              keyboardType="number-pad"
            />
          ) : null}
          <PillButton
            disabled={!resolvedAmount || resolvedAmount < 1}
            onPress={() => {
              dispatch({ type: "createSupportIntent", amount: resolvedAmount });
              Linking.openURL("https://example.com/koino-support").catch(() => undefined);
            }}
          >
            Continue externally
          </PillButton>
          {state.supportIntents[0] ? <Body muted>Latest support intent: {state.supportIntents[0].amount} SEK confirmed.</Body> : null}
        </Card>

        <Card tone="moss">
          <SectionTitle>Product boundaries</SectionTitle>
          <Body muted>
            This MVP intentionally excludes public profiles, followers, discovery, chat, streaks, badges, rankings, and visible
            prayer statistics.
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}
