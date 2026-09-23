import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useKoino } from "@/state/koino-store";
import {
  openDonationPortal,
  primeDonationStatus,
  verifyDonation,
  type DonationFrequency,
} from "@/features/donation-api";
import { typography } from "@/ui/theme";
import { donationColors } from "@/features/donation/colors";
import { CircleIcon, DonationThankYouHero } from "@/features/donation/illustrations";
import { amountLine } from "@/features/donation/amounts";
import { type FeatherName } from "@/features/donation/types";
import {
  DonationScreenFrame,
  DonationHeader,
  DonationTrustNote,
  DonationPrimaryButton,
  SectionTitle,
} from "@/features/donation/layout";

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

export function DonationActionRow({
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
  const { state, getAuthToken } = useKoino();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const sessionId = Array.isArray(params.session_id) ? params.session_id[0] : params.session_id;
  const [verification, setVerification] = useState<{ amountSek: number; frequency: DonationFrequency }>();
  const [verificationError, setVerificationError] = useState<string>();
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [portalPending, setPortalPending] = useState(false);
  const [portalError, setPortalError] = useState<string>();
  const amount = String(verification?.amountSek || 0);
  const frequency = verification?.frequency || "one_time";
  const monthly = frequency === "monthly";

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      setVerificationError("Ingen betalning kunde verifieras.");
      return () => { active = false; };
    }
    void (async () => {
      try {
        const result = await verifyDonation(await getAuthToken(), sessionId);
        if (!result.paid) throw new Error("Betalningen är ännu inte slutförd.");
        if (active) {
          if (state.currentUserId) primeDonationStatus(state.currentUserId, result.frequency);
          setVerification({ amountSek: result.amountSek, frequency: result.frequency });
        }
      } catch (error) {
        if (active) setVerificationError(error instanceof Error ? error.message : "Betalningen kunde inte verifieras.");
      }
    })();
    return () => { active = false; };
  }, [getAuthToken, sessionId, state.currentUserId, verificationAttempt]);

  async function handleDonationPortal() {
    if (portalPending) return;
    setPortalPending(true);
    setPortalError(undefined);
    try {
      await openDonationPortal(await getAuthToken());
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Kunde inte öppna gåvohanteringen.");
    } finally {
      setPortalPending(false);
    }
  }

  function handlePrayForKoino() {
    // TODO: Connect this to a private prayer composer or prayer route when that flow exists.
  }

  function returnToMeTab() {
    router.dismissAll();
    requestAnimationFrame(() => {
      router.replace("/(tabs)/me" as never);
    });
  }

  if (!verification) {
    return (
      <DonationScreenFrame>
        <DonationHeader title="Verifierar gåva" />
        {verificationError ? (
          <>
            <DonationTrustNote icon="alert-circle">{verificationError} Kontrollera betalningen eller försök igen.</DonationTrustNote>
            <DonationPrimaryButton onPress={() => { setVerificationError(undefined); setVerificationAttempt((value) => value + 1); }} tone="navy">
              Kontrollera igen
            </DonationPrimaryButton>
            <DonationPrimaryButton onPress={returnToMeTab} tone="warm">Tillbaka till Du</DonationPrimaryButton>
          </>
        ) : (
          <View style={{ alignItems: "center", gap: 14, paddingVertical: 48 }}>
            <ActivityIndicator color={donationColors.deepNavy} size="large" />
            <Text style={[typography.body, { color: donationColors.stone }]}>Kontrollerar betalningen säkert med Stripe…</Text>
          </View>
        )}
      </DonationScreenFrame>
    );
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
              onPress={handleDonationPortal}
              subtitle="Ändra betalningsmetod eller avsluta"
              title="Hantera månadsvis gåva"
            />
          ) : null}
          <DonationActionRow icon="file-text" onPress={handleDonationPortal} showDivider={monthly} subtitle="Se och ladda ner dina kvitton" title="Gåvokvitton" />
          <DonationActionRow icon="help-circle" showDivider subtitle="Vanliga frågor och kontakt" title="Hjälp kring givande" />
        </View>
      </View>
      {portalPending ? <ActivityIndicator color={donationColors.deepNavy} /> : null}
      {portalError ? <Text style={[typography.body, { color: "#A33A3A", textAlign: "center" }]}>{portalError}</Text> : null}
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
