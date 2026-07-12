import type { ComponentProps, PropsWithChildren } from "react";
import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKoino } from "@/state/koino-store";
import { platformShadow, typography } from "@/ui/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];
type DonationFrequency = "one_time" | "monthly";
type DonationMethod = "card" | "swish";
type DonationAmountOption = "50" | "100" | "200" | "500" | "custom";

const donationColors = {
  deepNavy: "#0B1220",
  warmPersika: "#FFC79A",
  warmCanvas: "#FAF8F4",
  surfaceWhite: "#FFFFFF",
  softBorder: "#E9E4DC",
  stone: "#6F6B64",
  mutedNavy: "#27324F",
  blushRosa: "#F3AFC8",
  lavenderHaze: "#C8BCE7",
  softCyan: "#8ED6DA",
  warmTint: "rgba(255, 199, 154, 0.18)",
  warmTintStrong: "rgba(255, 199, 154, 0.42)",
  blushTint: "rgba(243, 175, 200, 0.22)",
  lavenderTint: "rgba(200, 188, 231, 0.24)",
  cyanTint: "rgba(142, 214, 218, 0.22)",
} as const;

const donationAmountOptions: { label: string; value: DonationAmountOption }[] = [
  { label: "50 kr", value: "50" },
  { label: "100 kr", value: "100" },
  { label: "200 kr", value: "200" },
  { label: "500 kr", value: "500" },
  { label: "Valfritt", value: "custom" },
];

function parseFrequency(value: unknown): DonationFrequency {
  return value === "monthly" ? "monthly" : "one_time";
}

function cleanAmount(value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

function parseAmount(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const cleaned = cleanAmount(typeof raw === "string" ? raw : "");
  return cleaned || "100";
}

function amountLine(amount: string, frequency: DonationFrequency) {
  return frequency === "monthly" ? `${amount} kr / månad` : `${amount} kr`;
}

function DonationScreenFrame({ children }: PropsWithChildren) {
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

function DonationHeader({ title, wordmark = false }: { title: string; wordmark?: boolean }) {
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

function CircleIcon({
  backgroundColor,
  borderColor = "transparent",
  color,
  icon,
  size = 44,
}: {
  backgroundColor: string;
  borderColor?: string;
  color: string;
  icon: FeatherName;
  size?: number;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor,
        borderRadius: 999,
        borderWidth: borderColor === "transparent" ? 0 : 1,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Feather name={icon} size={Math.round(size * 0.44)} color={color} />
    </View>
  );
}

function DonationEntryIllustration({ compact = false }: { compact?: boolean }) {
  const width = compact ? 138 : 190;
  const height = compact ? 116 : 150;
  const heartSize = compact ? 42 : 54;

  return (
    <View
      pointerEvents="none"
      style={{
        height,
        overflow: "hidden",
        width,
      }}
    >
      <View
        style={{
          backgroundColor: donationColors.warmTint,
          borderRadius: 999,
          height: compact ? 96 : 130,
          position: "absolute",
          right: compact ? 8 : 14,
          top: compact ? 6 : 4,
          width: compact ? 96 : 130,
        }}
      />
      <View style={{ bottom: 10, left: compact ? 10 : 18, position: "absolute", transform: [{ rotate: "-16deg" }] }}>
        <Feather name="feather" size={compact ? 43 : 56} color={donationColors.lavenderHaze} />
      </View>
      <View style={{ bottom: compact ? 14 : 18, position: "absolute", right: compact ? 3 : 8, transform: [{ rotate: "18deg" }] }}>
        <Feather name="feather" size={compact ? 42 : 58} color={donationColors.softCyan} />
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: donationColors.warmTintStrong,
          borderRadius: 999,
          height: heartSize + 28,
          justifyContent: "center",
          left: compact ? 52 : 70,
          position: "absolute",
          top: compact ? 30 : 38,
          width: heartSize + 28,
        }}
      >
        <Feather name="heart" size={heartSize} color={donationColors.warmPersika} />
      </View>
      <View
        style={{
          backgroundColor: donationColors.blushTint,
          borderRadius: 999,
          bottom: 0,
          height: compact ? 42 : 54,
          left: compact ? 28 : 38,
          position: "absolute",
          width: compact ? 42 : 54,
        }}
      />
      <View
        style={{
          backgroundColor: donationColors.lavenderTint,
          borderRadius: 999,
          bottom: 2,
          height: compact ? 46 : 60,
          position: "absolute",
          right: compact ? 22 : 32,
          width: compact ? 56 : 72,
        }}
      />
    </View>
  );
}

function DonationThankYouHero() {
  return (
    <View style={{ alignItems: "center", height: 280, justifyContent: "flex-end", overflow: "hidden" }}>
      <View
        style={{
          backgroundColor: donationColors.warmTint,
          borderRadius: 999,
          height: 258,
          position: "absolute",
          top: 0,
          width: 258,
        }}
      />
      <View style={{ left: 22, position: "absolute", top: 78, transform: [{ rotate: "-20deg" }] }}>
        <Feather name="feather" size={76} color={donationColors.lavenderHaze} />
      </View>
      <View style={{ position: "absolute", right: 28, top: 86, transform: [{ rotate: "18deg" }] }}>
        <Feather name="feather" size={72} color={donationColors.softCyan} />
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: donationColors.warmPersika,
          borderRadius: 999,
          height: 86,
          justifyContent: "center",
          position: "absolute",
          top: 82,
          width: 86,
        }}
      >
        <Feather name="heart" size={48} color={donationColors.surfaceWhite} />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "center", marginBottom: 8 }}>
        <CircleIcon backgroundColor={donationColors.mutedNavy} color={donationColors.warmCanvas} icon="user" size={72} />
        <View style={{ marginHorizontal: -6, zIndex: 2 }}>
          <CircleIcon backgroundColor={donationColors.blushRosa} color={donationColors.deepNavy} icon="user" size={76} />
        </View>
        <CircleIcon backgroundColor={donationColors.lavenderHaze} color={donationColors.deepNavy} icon="user" size={72} />
      </View>
      <View
        style={{
          backgroundColor: donationColors.blushTint,
          borderRadius: 999,
          bottom: 0,
          height: 66,
          left: 18,
          position: "absolute",
          width: 96,
        }}
      />
      <View
        style={{
          backgroundColor: donationColors.lavenderTint,
          borderRadius: 999,
          bottom: 0,
          height: 82,
          position: "absolute",
          right: 12,
          width: 118,
        }}
      />
    </View>
  );
}

function DonationSummaryMark() {
  return (
    <View style={{ height: 92, position: "relative", width: 92 }}>
      <View
        style={{
          backgroundColor: donationColors.warmTint,
          borderRadius: 999,
          height: 82,
          left: 5,
          position: "absolute",
          top: 5,
          width: 82,
        }}
      />
      <View style={{ left: 4, position: "absolute", top: 8, transform: [{ rotate: "-18deg" }] }}>
        <Feather name="feather" size={34} color={donationColors.lavenderHaze} />
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: donationColors.warmTintStrong,
          borderRadius: 999,
          height: 68,
          justifyContent: "center",
          left: 12,
          position: "absolute",
          top: 16,
          width: 68,
        }}
      >
        <Feather name="heart" size={40} color={donationColors.warmPersika} />
      </View>
    </View>
  );
}

function DonationAmountLine({ amount, frequency }: { amount: string; frequency: DonationFrequency }) {
  return (
    <View style={{ alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", columnGap: 7 }}>
      <Text style={[typography.display, { color: donationColors.deepNavy, fontSize: 28, lineHeight: 34 }]}>{amount} kr</Text>
      {frequency === "monthly" ? (
        <Text style={[typography.body, { color: donationColors.deepNavy, fontSize: 18, lineHeight: 24 }]}>/ månad</Text>
      ) : null}
    </View>
  );
}

export function SupportKoinoCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: donationColors.surfaceWhite,
        borderColor: donationColors.softBorder,
        borderRadius: 18,
        borderWidth: 1,
        minHeight: 190,
        opacity: pressed ? 0.82 : 1,
        overflow: "hidden",
        padding: 18,
        ...platformShadow({
          boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
          offset: { width: 0, height: 10 },
          opacity: 0.055,
          radius: 24,
        }),
      })}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, gap: 12, minWidth: 0, paddingRight: 2 }}>
          <View style={{ gap: 8 }}>
            <Text style={[typography.heading, { color: donationColors.deepNavy, fontSize: 18, lineHeight: 24 }]}>Stötta KOINO</Text>
            <Text style={[typography.body, { color: donationColors.deepNavy, lineHeight: 22 }]}>
              Hjälp oss bygga en lugn plats för bön, Ordet och verklig gemenskap.
            </Text>
          </View>
          <View
            style={{
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: donationColors.warmTintStrong,
              borderRadius: 14,
              flexDirection: "row",
              gap: 9,
              minHeight: 48,
              paddingHorizontal: 16,
            }}
          >
            <Text style={[typography.button, { color: donationColors.deepNavy }]}>Ge en gåva</Text>
            <Feather name="heart" size={18} color={donationColors.deepNavy} />
          </View>
        </View>
        <View style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
          <Feather name="chevron-right" size={22} color={donationColors.deepNavy} />
          <DonationEntryIllustration compact />
        </View>
      </View>
    </Pressable>
  );
}

function DonationFrequencySelector({
  frequency,
  onChange,
}: {
  frequency: DonationFrequency;
  onChange: (value: DonationFrequency) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          backgroundColor: donationColors.surfaceWhite,
          borderColor: donationColors.softBorder,
          borderRadius: 18,
          borderWidth: 1,
          flexDirection: "row",
          padding: 5,
        }}
      >
        {[
          { label: "En gång", value: "one_time" as const },
          { label: "Varje månad", value: "monthly" as const },
        ].map((option) => {
          const selected = option.value === frequency;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: selected ? donationColors.lavenderTint : "transparent",
                borderRadius: 14,
                flex: 1,
                minHeight: 56,
                justifyContent: "center",
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <Text
                style={[
                  typography.title,
                  {
                    color: selected ? donationColors.mutedNavy : donationColors.deepNavy,
                    fontSize: 16,
                    lineHeight: 22,
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {frequency === "monthly" ? (
        <View style={{ alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: 8, paddingRight: 10 }}>
          <Feather name="feather" size={18} color={donationColors.lavenderHaze} />
          <Text style={[typography.body, { color: donationColors.stone }]}>Bäst för långsiktigt stöd</Text>
        </View>
      ) : null}
    </View>
  );
}

function DonationAmountGrid({
  customAmount,
  onCustomAmountChange,
  onSelect,
  selectedAmount,
}: {
  customAmount: string;
  onCustomAmountChange: (value: string) => void;
  onSelect: (value: DonationAmountOption) => void;
  selectedAmount: DonationAmountOption;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {donationAmountOptions.map((option) => {
          const selected = selectedAmount === option.value;
          const wide = option.value === "500" || option.value === "custom";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: selected ? donationColors.lavenderTint : donationColors.surfaceWhite,
                borderColor: selected ? donationColors.lavenderHaze : donationColors.softBorder,
                borderRadius: 16,
                borderWidth: selected ? 2 : 1,
                flexBasis: wide ? "47%" : "30%",
                flexGrow: 1,
                justifyContent: "center",
                minHeight: 84,
                opacity: pressed ? 0.72 : 1,
                paddingHorizontal: 10,
              })}
            >
              <Text
                style={[
                  typography.heading,
                  {
                    color: donationColors.deepNavy,
                    fontSize: option.value === "custom" ? 20 : 24,
                    lineHeight: 30,
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: donationColors.surfaceWhite,
          borderColor: selectedAmount === "custom" ? donationColors.lavenderHaze : donationColors.softBorder,
          borderRadius: 16,
          borderWidth: selectedAmount === "custom" ? 2 : 1,
          flexDirection: "row",
          gap: 12,
          minHeight: 64,
          paddingHorizontal: 16,
        }}
      >
        <Feather name="edit-3" size={22} color={donationColors.lavenderHaze} />
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => onCustomAmountChange(cleanAmount(value))}
          onFocus={() => onSelect("custom")}
          placeholder="Ange valfritt belopp"
          placeholderTextColor={donationColors.stone}
          returnKeyType="done"
          style={[typography.body, { color: donationColors.deepNavy, flex: 1, fontSize: 16, minHeight: 58 }]}
          value={customAmount}
        />
        {customAmount ? <Text style={[typography.bodyMedium, { color: donationColors.stone }]}>kr</Text> : null}
      </View>
    </View>
  );
}

function DonationTrustNote({
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

function DonationPrimaryButton({
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

export function DonationAmountScreen() {
  const [frequency, setFrequency] = useState<DonationFrequency>("one_time");
  const [selectedAmount, setSelectedAmount] = useState<DonationAmountOption>("100");
  const [customAmount, setCustomAmount] = useState("");
  const resolvedAmount = selectedAmount === "custom" ? customAmount : selectedAmount;
  const canContinue = Number(resolvedAmount) > 0;

  function continueToConfirm() {
    if (!canContinue) return;
    router.push({
      pathname: "/donation-confirm",
      params: { amount: resolvedAmount, frequency },
    } as never);
  }

  return (
    <DonationScreenFrame>
      <DonationHeader title="KOINO" wordmark />
      <View style={{ gap: 12 }}>
        <Text style={[typography.screenTitle, { color: donationColors.deepNavy }]}>Välj gåva</Text>
        <Text style={[typography.body, { color: donationColors.mutedNavy, fontSize: 16, lineHeight: 24 }]}>
          Välj ett belopp som känns rätt för dig.{"\n"}Varje gåva är frivillig.
        </Text>
      </View>
      <DonationFrequencySelector frequency={frequency} onChange={setFrequency} />
      <DonationAmountGrid
        customAmount={customAmount}
        onCustomAmountChange={setCustomAmount}
        onSelect={setSelectedAmount}
        selectedAmount={selectedAmount}
      />
      <DonationTrustNote icon="shield" iconBackground={donationColors.warmPersika} iconColor={donationColors.surfaceWhite}>
        Frivillig gåva. Inga extra funktioner, status eller förmåner ingår.
      </DonationTrustNote>
      {frequency === "monthly" ? (
        <DonationTrustNote
          backgroundColor={donationColors.lavenderTint}
          borderColor="transparent"
          icon="refresh-cw"
          iconBackground={donationColors.surfaceWhite}
          iconColor={donationColors.lavenderHaze}
        >
          Du kan avsluta en månadsvis gåva när som helst.
        </DonationTrustNote>
      ) : null}
      <DonationPrimaryButton disabled={!canContinue} onPress={continueToConfirm}>
        Fortsätt
      </DonationPrimaryButton>
    </DonationScreenFrame>
  );
}

function DonationSummaryCard({ amount, frequency }: { amount: string; frequency: DonationFrequency }) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: donationColors.surfaceWhite,
        borderColor: donationColors.warmPersika,
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: "row",
        gap: 18,
        padding: 18,
      }}
    >
      <DonationSummaryMark />
      <View style={{ flex: 1, gap: 8 }}>
        <DonationAmountLine amount={amount} frequency={frequency} />
        <Text style={[typography.body, { color: donationColors.stone, fontSize: 15 }]}>
          Mottagare: <Text style={[typography.bodyMedium, { color: donationColors.deepNavy, fontSize: 15 }]}>KOINO</Text>
        </Text>
        <Text style={[typography.body, { color: donationColors.stone, fontSize: 14, lineHeight: 20 }]}>
          {frequency === "monthly" ? "Förnyas månadsvis tills du avslutar." : "Engångsgåva."}
        </Text>
      </View>
    </View>
  );
}

function DonationContactRow({ email }: { email?: string | null }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => undefined}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: donationColors.surfaceWhite,
        borderColor: donationColors.softBorder,
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: "row",
        gap: 14,
        minHeight: 68,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 16,
      })}
    >
      <CircleIcon backgroundColor={donationColors.lavenderTint} color={donationColors.lavenderHaze} icon="mail" size={44} />
      <Text numberOfLines={1} style={[typography.body, { color: donationColors.deepNavy, flex: 1, fontSize: 15 }]}>
        {email ?? "Lägg till e-post"}
      </Text>
      <Feather name="chevron-right" size={22} color={donationColors.deepNavy} />
    </Pressable>
  );
}

function DonationMethodRow({
  icon,
  onPress,
  selected,
  subtitle,
  title,
}: {
  icon: FeatherName;
  onPress: () => void;
  selected: boolean;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        flexDirection: "row",
        gap: 14,
        minHeight: 78,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
      })}
    >
      <CircleIcon backgroundColor={donationColors.warmTint} color={donationColors.deepNavy} icon={icon} size={52} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[typography.title, { color: donationColors.deepNavy, fontSize: 16, lineHeight: 22 }]}>{title}</Text>
        <Text style={[typography.body, { color: donationColors.stone, fontSize: 14, lineHeight: 20 }]}>{subtitle}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          borderColor: selected ? donationColors.deepNavy : donationColors.stone,
          borderRadius: 999,
          borderWidth: 2,
          height: 32,
          justifyContent: "center",
          width: 32,
        }}
      >
        {selected ? <View style={{ backgroundColor: donationColors.deepNavy, borderRadius: 999, height: 18, width: 18 }} /> : null}
      </View>
    </Pressable>
  );
}

function DonationMethodSection({ method, onChange }: { method: DonationMethod; onChange: (value: DonationMethod) => void }) {
  return (
    <View
      style={{
        backgroundColor: donationColors.surfaceWhite,
        borderColor: donationColors.softBorder,
        borderRadius: 18,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      <DonationMethodRow
        icon="credit-card"
        onPress={() => onChange("card")}
        selected={method === "card"}
        subtitle="Visa, Mastercard eller Amex"
        title="Kort"
      />
      <View style={{ backgroundColor: donationColors.softBorder, height: 1, marginLeft: 82 }} />
      <DonationMethodRow
        icon="smartphone"
        onPress={() => onChange("swish")}
        selected={method === "swish"}
        subtitle="Betala säkert med Swish"
        title="Swish"
      />
    </View>
  );
}

function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={[typography.heading, { color: donationColors.deepNavy, fontSize: 20, lineHeight: 26 }]}>{children}</Text>;
}

export function DonationConfirmScreen() {
  const { state } = useKoino();
  const params = useLocalSearchParams<{ amount?: string; frequency?: DonationFrequency }>();
  const amount = parseAmount(params.amount);
  const frequency = parseFrequency(params.frequency);
  const [method, setMethod] = useState<DonationMethod>("card");
  const email = state.authEmail;

  function startDonationCheckout() {
    // TODO: Connect Stripe/Payment Link checkout here. This MVP keeps payment handling out of the app.
    router.push({
      pathname: "/donation-thank-you",
      params: { amount, frequency },
    } as never);
  }

  return (
    <DonationScreenFrame>
      <DonationHeader title="Bekräfta gåva" />
      <DonationSummaryCard amount={amount} frequency={frequency} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 4 }}>
        <Feather name="lock" size={22} color={donationColors.deepNavy} />
        <Text style={[typography.body, { color: donationColors.deepNavy, flex: 1, fontSize: 15, lineHeight: 22 }]}>
          Säker betalning sker via extern betaltjänst.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <SectionTitle>Kontakt</SectionTitle>
        <DonationContactRow email={email} />
      </View>
      <View style={{ gap: 12 }}>
        <SectionTitle>Betalningssätt</SectionTitle>
        <DonationMethodSection method={method} onChange={setMethod} />
      </View>
      <DonationTrustNote
        backgroundColor="rgba(142, 214, 218, 0.14)"
        borderColor={donationColors.softCyan}
        icon="shield"
        iconBackground="transparent"
        iconColor={donationColors.deepNavy}
      >
        Detta är en frivillig gåva till KOINO.{"\n"}Gåvan ger inte tillgång till extra funktioner eller förmåner.
      </DonationTrustNote>
      <Pressable
        accessibilityRole="button"
        onPress={() => undefined}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: donationColors.surfaceWhite,
          borderColor: donationColors.softBorder,
          borderRadius: 18,
          borderWidth: 1,
          flexDirection: "row",
          gap: 12,
          minHeight: 66,
          opacity: pressed ? 0.78 : 1,
          paddingHorizontal: 16,
        })}
      >
        <CircleIcon backgroundColor={donationColors.lavenderTint} color={donationColors.lavenderHaze} icon="feather" size={42} />
        <Text style={[typography.bodyMedium, { color: donationColors.deepNavy, flex: 1, fontSize: 14, lineHeight: 20 }]}>
          Integritetspolicy   ·   Villkor för givande
        </Text>
        <Feather name="chevron-right" size={22} color={donationColors.deepNavy} />
      </Pressable>
      <DonationPrimaryButton icon="lock" onPress={startDonationCheckout} tone="navy">
        Fortsätt till säker betalning
      </DonationPrimaryButton>
    </DonationScreenFrame>
  );
}

function DonationStatusPill({ frequency }: { frequency: DonationFrequency }) {
  const monthly = frequency === "monthly";
  return (
    <View
      style={{
        backgroundColor: monthly ? donationColors.cyanTint : donationColors.lavenderTint,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={[typography.label, { color: donationColors.mutedNavy, fontSize: 12, lineHeight: 17 }]}>{monthly ? "aktiv" : "mottagen"}</Text>
    </View>
  );
}

function DonationReceiptCard({ amount, frequency }: { amount: string; frequency: DonationFrequency }) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: donationColors.surfaceWhite,
        borderColor: donationColors.softBorder,
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: "row",
        gap: 16,
        minHeight: 74,
        paddingHorizontal: 16,
      }}
    >
      <CircleIcon backgroundColor={donationColors.lavenderTint} color={donationColors.deepNavy} icon="feather" size={52} />
      <Text style={[typography.heading, { color: donationColors.deepNavy, flex: 1, fontSize: 20, lineHeight: 26, textAlign: "center" }]}>
        {amountLine(amount, frequency)}
      </Text>
      <DonationStatusPill frequency={frequency} />
    </View>
  );
}

function DonationActionRow({
  icon,
  iconBackground = donationColors.lavenderTint,
  iconColor = donationColors.mutedNavy,
  onPress,
  showDivider = false,
  subtitle,
  title,
}: {
  icon: FeatherName;
  iconBackground?: string;
  iconColor?: string;
  onPress?: () => void;
  showDivider?: boolean;
  subtitle: string;
  title: string;
}) {
  const content = (
    <>
      {showDivider ? <View style={{ backgroundColor: donationColors.softBorder, height: 1, marginLeft: 74 }} /> : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: 76, paddingHorizontal: 16, paddingVertical: 12 }}>
        <CircleIcon backgroundColor={iconBackground} color={iconColor} icon={icon} size={48} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[typography.title, { color: donationColors.deepNavy, fontSize: 15, lineHeight: 21 }]}>{title}</Text>
          <Text style={[typography.body, { color: donationColors.stone, fontSize: 13, lineHeight: 18 }]}>{subtitle}</Text>
        </View>
        <Feather name="chevron-right" size={22} color={donationColors.deepNavy} />
      </View>
    </>
  );

  return (
    <Pressable accessibilityRole="button" onPress={onPress ?? (() => undefined)} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      {content}
    </Pressable>
  );
}

export function DonationThankYouScreen() {
  const params = useLocalSearchParams<{ amount?: string; frequency?: DonationFrequency }>();
  const amount = parseAmount(params.amount);
  const frequency = parseFrequency(params.frequency);
  const monthly = frequency === "monthly";

  function handlePrayForKoino() {
    // TODO: Connect this to a private prayer composer or prayer route when that flow exists.
  }

  function returnToMeTab() {
    router.dismissAll();
    requestAnimationFrame(() => {
      router.replace("/(tabs)/me" as never);
    });
  }

  return (
    <DonationScreenFrame>
      <DonationHeader title="Tack" />
      <DonationThankYouHero />
      <View style={{ alignItems: "center", gap: 12 }}>
        <Text style={[typography.screenTitle, { color: donationColors.deepNavy, fontSize: 26, lineHeight: 32, textAlign: "center" }]}>
          Tack för att du stöttar KOINO
        </Text>
        <Text style={[typography.body, { color: donationColors.stone, fontSize: 16, lineHeight: 24, textAlign: "center" }]}>
          Din gåva hjälper oss bygga en plats för bön, Ordet och verklig gemenskap.
        </Text>
      </View>
      <DonationReceiptCard amount={amount} frequency={frequency} />
      <View style={{ gap: 12 }}>
        <SectionTitle>Hantera givande</SectionTitle>
        <View
          style={{
            backgroundColor: donationColors.surfaceWhite,
            borderColor: donationColors.softBorder,
            borderRadius: 18,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          {monthly ? (
            <DonationActionRow
              icon="repeat"
              subtitle="Ändra belopp, betalningsmetod eller paus"
              title="Hantera månadsvis gåva"
            />
          ) : null}
          <DonationActionRow icon="file-text" showDivider={monthly} subtitle="Se och ladda ner dina kvitton" title="Gåvokvitton" />
          <DonationActionRow icon="help-circle" showDivider subtitle="Vanliga frågor och kontakt" title="Hjälp kring givande" />
        </View>
      </View>
      <View
        style={{
          backgroundColor: donationColors.surfaceWhite,
          borderColor: donationColors.warmPersika,
          borderRadius: 18,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        <DonationActionRow
          icon="heart"
          iconBackground={donationColors.warmTintStrong}
          iconColor={donationColors.deepNavy}
          onPress={handlePrayForKoino}
          subtitle="Stå med oss i bön för visionen och människorna"
          title="Be för KOINO"
        />
      </View>
      <DonationPrimaryButton onPress={returnToMeTab} tone="warm">
        Tillbaka till Du
      </DonationPrimaryButton>
    </DonationScreenFrame>
  );
}
