import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useKoino } from "@/state/koino-store";
import { startDonationCheckout, type DonationFrequency } from "@/features/donation-api";
import { useAppTranslation } from "@/ui/app-language";
import { typography } from "@/ui/theme";
import { donationColors } from "@/features/donation/colors";
import { DonationSummaryMark, CircleIcon } from "@/features/donation/illustrations";
import {
  DonationAmountLine,
  DonationScreenFrame,
  DonationHeader,
  DonationTrustNote,
  SectionTitle,
  DonationPrimaryButton,
} from "@/features/donation/layout";
import { parseAmount, parseFrequency } from "@/features/donation/amounts";

function DonationSummaryCard({ amount, frequency }: { amount: string; frequency: DonationFrequency }) {
  const { t } = useAppTranslation();
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
          {t("donation.confirm.recipient")} <Text style={[typography.bodyMedium, { color: donationColors.deepNavy, fontSize: 15 }]}>KOINO</Text>
        </Text>
        <Text style={[typography.body, { color: donationColors.stone, fontSize: 14, lineHeight: 20 }]}>
          {frequency === "monthly" ? t("donation.confirm.monthlyNote") : t("donation.confirm.oneTimeNote")}
        </Text>
      </View>
    </View>
  );
}

function DonationContactRow({ email }: { email?: string | null }) {
  const { t } = useAppTranslation();
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
        {email ?? t("donation.confirm.addEmail")}
      </Text>
      <Feather name="chevron-right" size={22} color={donationColors.deepNavy} />
    </Pressable>
  );
}

export function DonationConfirmScreen() {
  const { state, getAuthToken } = useKoino();
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ amount?: string; frequency?: DonationFrequency; cancelled?: string }>();
  const amount = parseAmount(params.amount);
  const frequency = parseFrequency(params.frequency);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string>();
  const email = state.authEmail;

  async function handleDonationCheckout() {
    if (checkoutPending) return;
    setCheckoutPending(true);
    setCheckoutError(undefined);
    try {
      await startDonationCheckout(await getAuthToken(), Number(amount), frequency);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : t("donation.confirm.startFailed"));
    } finally {
      setCheckoutPending(false);
    }
  }

  return (
    <DonationScreenFrame>
      <DonationHeader title={t("donation.confirm.title")} />
      <DonationSummaryCard amount={amount} frequency={frequency} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 4 }}>
        <Feather name="lock" size={22} color={donationColors.deepNavy} />
        <Text style={[typography.body, { color: donationColors.deepNavy, flex: 1, fontSize: 15, lineHeight: 22 }]}>
          {t("donation.confirm.secure")}
        </Text>
      </View>
      {params.cancelled === "1" ? (
        <DonationTrustNote icon="info">{t("donation.confirm.cancelled")}</DonationTrustNote>
      ) : null}
      <View style={{ gap: 12 }}>
        <SectionTitle>{t("donation.confirm.contact")}</SectionTitle>
        <DonationContactRow email={email} />
      </View>
      <View style={{ gap: 12 }}>
        <SectionTitle>{t("donation.confirm.method")}</SectionTitle>
        <DonationTrustNote icon="credit-card" iconBackground={donationColors.lavenderTint} iconColor={donationColors.deepNavy}>
          {t("donation.confirm.stripe")}
        </DonationTrustNote>
      </View>
      <DonationTrustNote
        backgroundColor="rgba(142, 214, 218, 0.14)"
        borderColor={donationColors.softCyan}
        icon="shield"
        iconBackground="transparent"
        iconColor={donationColors.deepNavy}
      >
        {t("donation.confirm.voluntary")}
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
          {t("donation.confirm.terms")}
        </Text>
        <Feather name="chevron-right" size={22} color={donationColors.deepNavy} />
      </Pressable>
      {checkoutError ? <Text style={[typography.body, { color: "#A33A3A", lineHeight: 22, textAlign: "center" }]}>{checkoutError}</Text> : null}
      <DonationPrimaryButton disabled={checkoutPending} icon="lock" onPress={handleDonationCheckout} tone="navy">
        {checkoutPending ? t("donation.confirm.opening") : t("donation.confirm.submit")}
      </DonationPrimaryButton>
      {checkoutPending ? <ActivityIndicator color={donationColors.deepNavy} /> : null}
    </DonationScreenFrame>
  );
}
