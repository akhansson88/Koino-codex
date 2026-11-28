import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { type DonationFrequency } from "@/features/donation-api";
import { useAppTranslation } from "@/ui/app-language";
import { typography } from "@/ui/theme";
import { donationColors } from "@/features/donation/colors";
import { type DonationAmountOption } from "@/features/donation/types";
import { donationAmountOptions, cleanAmount } from "@/features/donation/amounts";
import {
  DonationScreenFrame,
  DonationHeader,
  DonationTrustNote,
  DonationPrimaryButton,
} from "@/features/donation/layout";
import { ReturningDonorManagement } from "@/features/donation/management";

function DonationFrequencySelector({
  frequency,
  onChange,
}: {
  frequency: DonationFrequency;
  onChange: (value: DonationFrequency) => void;
}) {
  const { t } = useAppTranslation();
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
          { label: t("donation.amount.oneTime"), value: "one_time" as const },
          { label: t("donation.amount.monthly"), value: "monthly" as const },
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
          <Text style={[typography.body, { color: donationColors.stone }]}>{t("donation.amount.bestForOngoing")}</Text>
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
  const { t } = useAppTranslation();
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
                {option.value === "custom" ? t("donation.amount.custom") : option.label}
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
          placeholder={t("donation.amount.customPlaceholder")}
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

export function DonationAmountScreen() {
  const { t } = useAppTranslation();
  const [frequency, setFrequency] = useState<DonationFrequency>("one_time");
  const [selectedAmount, setSelectedAmount] = useState<DonationAmountOption>("100");
  const [customAmount, setCustomAmount] = useState("");
  const resolvedAmount = selectedAmount === "custom" ? customAmount : selectedAmount;
  const numericAmount = Number(resolvedAmount);
  const canContinue = Number.isSafeInteger(numericAmount) && numericAmount >= 10 && numericAmount <= 100000;

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
        <Text style={[typography.screenTitle, { color: donationColors.deepNavy }]}>{t("donation.amount.title")}</Text>
        <Text style={[typography.body, { color: donationColors.mutedNavy, fontSize: 16, lineHeight: 24 }]}>
          {t("donation.amount.intro")}
        </Text>
      </View>
      <ReturningDonorManagement />
      <DonationFrequencySelector frequency={frequency} onChange={setFrequency} />
      <DonationAmountGrid
        customAmount={customAmount}
        onCustomAmountChange={setCustomAmount}
        onSelect={setSelectedAmount}
        selectedAmount={selectedAmount}
      />
      <DonationTrustNote icon="shield" iconBackground={donationColors.warmPersika} iconColor={donationColors.surfaceWhite}>
        {t("donation.amount.optionalNote")}
      </DonationTrustNote>
      {frequency === "monthly" ? (
        <DonationTrustNote
          backgroundColor={donationColors.lavenderTint}
          borderColor="transparent"
          icon="refresh-cw"
          iconBackground={donationColors.surfaceWhite}
          iconColor={donationColors.lavenderHaze}
        >
          {t("donation.amount.cancelAnytime")}
        </DonationTrustNote>
      ) : null}
      <DonationPrimaryButton disabled={!canContinue} onPress={continueToConfirm}>
        {t("donation.amount.continue")}
      </DonationPrimaryButton>
      {selectedAmount === "custom" && customAmount && !canContinue ? (
        <Text style={[typography.body, { color: donationColors.stone, textAlign: "center" }]}>{t("donation.amount.rangeError")}</Text>
      ) : null}
    </DonationScreenFrame>
  );
}
