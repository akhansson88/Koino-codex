import type { PropsWithChildren } from "react";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type DonationFrequency } from "@/features/donation-api";
import { typography } from "@/ui/theme";
import { donationColors } from "@/features/donation/colors";
import { type FeatherName } from "@/features/donation/types";
import { CircleIcon } from "@/features/donation/illustrations";

export function DonationScreenFrame({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ backgroundColor: donationColors.warmCanvas, flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          gap: 24,
          paddingBottom: Math.max(42, insets.bottom + 34),
          paddingHorizontal: 22,
          paddingTop: insets.top + 20,
        }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function DonationBackButton({ onPress = () => router.back() }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Gå tillbaka"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: donationColors.surfaceWhite,
        borderColor: donationColors.softBorder,
        borderRadius: 999,
        borderWidth: 1,
        height: 54,
        justifyContent: "center",
        opacity: pressed ? 0.72 : 1,
        width: 54,
      })}
    >
      <Feather name="arrow-left" size={25} color={donationColors.deepNavy} />
    </Pressable>
  );
}

export function DonationHeader({ title, wordmark = false }: { title: string; wordmark?: boolean }) {
  if (wordmark) {
    return (
      <View style={{ alignItems: "center", flexDirection: "row", gap: 22 }}>
        <DonationBackButton />
        <Text
          style={[
            typography.heading,
            {
              color: donationColors.deepNavy,
              fontSize: 20,
              letterSpacing: 8,
              lineHeight: 26,
            },
          ]}
        >
          {title}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", flexDirection: "row", minHeight: 58 }}>
      <DonationBackButton />
      <Text
        style={[
          typography.heading,
          {
            color: donationColors.deepNavy,
            flex: 1,
            fontSize: 21,
            lineHeight: 27,
            marginRight: 54,
            textAlign: "center",
          },
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

export function DonationAmountLine({ amount, frequency }: { amount: string; frequency: DonationFrequency }) {
  return (
    <View style={{ alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", columnGap: 7 }}>
      <Text style={[typography.display, { color: donationColors.deepNavy, fontSize: 28, lineHeight: 34 }]}>{amount} kr</Text>
      {frequency === "monthly" ? (
        <Text style={[typography.body, { color: donationColors.deepNavy, fontSize: 18, lineHeight: 24 }]}>/ månad</Text>
      ) : null}
    </View>
  );
}

export function DonationTrustNote({
  backgroundColor = donationColors.surfaceWhite,
  borderColor = donationColors.softBorder,
  children,
  icon,
  iconBackground = donationColors.warmTintStrong,
  iconColor = donationColors.deepNavy,
}: PropsWithChildren<{
  backgroundColor?: string;
  borderColor?: string;
  icon: FeatherName;
  iconBackground?: string;
  iconColor?: string;
}>) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: 14,
        padding: 16,
      }}
    >
      <CircleIcon backgroundColor={iconBackground} color={iconColor} icon={icon} size={44} />
      <Text style={[typography.body, { color: donationColors.deepNavy, flex: 1, fontSize: 15, lineHeight: 22 }]}>{children}</Text>
    </View>
  );
}

export function DonationPrimaryButton({
  children,
  disabled = false,
  icon,
  onPress,
  tone = "warm",
}: PropsWithChildren<{ disabled?: boolean; icon?: FeatherName; onPress: () => void; tone?: "warm" | "navy" }>) {
  const navy = tone === "navy";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: disabled ? donationColors.softBorder : navy ? donationColors.deepNavy : donationColors.warmPersika,
        borderRadius: 20,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 64,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 18,
      })}
    >
      {icon ? <Feather name={icon} size={21} color={navy ? donationColors.surfaceWhite : donationColors.deepNavy} /> : null}
      <Text
        style={[
          typography.title,
          {
            color: navy ? donationColors.surfaceWhite : donationColors.deepNavy,
            fontSize: 16,
            lineHeight: 22,
            textAlign: "center",
          },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={[typography.heading, { color: donationColors.deepNavy, fontSize: 20, lineHeight: 26 }]}>{children}</Text>;
}
