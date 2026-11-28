import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useKoino } from "@/state/koino-store";
import { openDonationPortal, type DonationStatus } from "@/features/donation-api";
import { platformShadow, typography } from "@/ui/theme";
import { useAppTranslation } from "@/ui/app-language";
import { donationColors } from "@/features/donation/colors";
import { DonationActionRow } from "@/features/donation/thank-you-screen";
import { usePersistentDonationStatus } from "@/features/donation/use-donation-status";

export function DonationStatusRetry({ error, onRetry, pending }: { error: string; onRetry: () => void; pending: boolean }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 8 }}>
      <Text style={[typography.body, { color: "#A33A3A", fontSize: 13, lineHeight: 18, textAlign: "center" }]}>{error}</Text>
      <Pressable accessibilityRole="button" disabled={pending} onPress={onRetry} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 6 })}>
        <Text style={[typography.button, { color: donationColors.mutedNavy }]}>{pending ? t("donation.retrying") : t("donation.retry")}</Text>
      </Pressable>
    </View>
  );
}

export function DonationManagementPanel({
  onDonate,
  status,
}: {
  onDonate?: () => void;
  status: DonationStatus;
}) {
  const { getAuthToken } = useKoino();
  const { t } = useAppTranslation();
  const [portalPending, setPortalPending] = useState(false);
  const [portalError, setPortalError] = useState<string>();

  async function handlePortal() {
    if (portalPending) return;
    setPortalPending(true);
    setPortalError(undefined);
    try {
      await openDonationPortal(await getAuthToken());
    } catch (openError) {
      setPortalError(openError instanceof Error ? openError.message : t("donation.manage.openError"));
    } finally {
      setPortalPending(false);
    }
  }

  const subtitle = status.hasManageableSubscription
    ? t("donation.manage.subtitleManageable")
    : status.hasSubscriptionHistory
      ? t("donation.manage.subtitleHistory")
      : t("donation.manage.subtitleThanks");

  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          backgroundColor: donationColors.surfaceWhite,
          borderColor: donationColors.softBorder,
          borderRadius: 18,
          borderWidth: 1,
          overflow: "hidden",
          ...platformShadow({
            boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
            offset: { width: 0, height: 10 },
            opacity: 0.055,
            radius: 24,
          }),
        }}
      >
        <View style={{ gap: 5, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 }}>
          <Text style={[typography.heading, { color: donationColors.deepNavy, fontSize: 18, lineHeight: 24 }]}>{t("donation.manage.title")}</Text>
          <Text style={[typography.body, { color: donationColors.stone, fontSize: 14, lineHeight: 20 }]}>{subtitle}</Text>
        </View>
        {status.hasManageableSubscription ? (
          <DonationActionRow icon="repeat" onPress={handlePortal} subtitle={t("donation.manage.manageMonthlySubtitle")} title={t("donation.manage.manageMonthly")} />
        ) : null}
        <DonationActionRow
          icon="file-text"
          onPress={handlePortal}
          showDivider={status.hasManageableSubscription}
          subtitle={t("donation.manage.receiptsSubtitle")}
          title={t("donation.manage.receipts")}
        />
        {onDonate ? (
          <DonationActionRow icon="heart" onPress={onDonate} showDivider subtitle={t("donation.manage.newGiftSubtitle")} title={t("donation.manage.newGift")} />
        ) : null}
      </View>
      {portalPending ? <ActivityIndicator color={donationColors.deepNavy} /> : null}
      {portalError ? <Text style={[typography.body, { color: "#A33A3A", textAlign: "center" }]}>{portalError}</Text> : null}
    </View>
  );
}

export function ReturningDonorManagement() {
  const { error, pending, refresh, status } = usePersistentDonationStatus();
  if (!status?.hasCompletedDonation) {
    return error ? <DonationStatusRetry error={error} onRetry={refresh} pending={pending} /> : null;
  }
  return (
    <View style={{ gap: 10 }}>
      <DonationManagementPanel status={status} />
      {error ? <DonationStatusRetry error={error} onRetry={refresh} pending={pending} /> : null}
    </View>
  );
}
