import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { platformShadow, typography } from "@/ui/theme";
import { usePersistentDonationStatus } from "@/features/donation/use-donation-status";
import { DonationManagementPanel, DonationStatusRetry } from "@/features/donation/management";
import { donationColors } from "@/features/donation/colors";
import { DonationEntryIllustration } from "@/features/donation/illustrations";

export function SupportKoinoCard({ onPress }: { onPress: () => void }) {
  const { error, pending, refresh, status } = usePersistentDonationStatus();

  if (status?.hasCompletedDonation) {
    return (
      <View style={{ gap: 10 }}>
        <DonationManagementPanel onDonate={onPress} status={status} />
        {error ? <DonationStatusRetry error={error} onRetry={refresh} pending={pending} /> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
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
              <Text style={[typography.body, { color: donationColors.deepNavy, lineHeight: 22 }]}>Hjälp oss bygga en lugn plats för bön, Ordet och verklig gemenskap.</Text>
            </View>
            <View style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor: donationColors.warmTintStrong, borderRadius: 14, flexDirection: "row", gap: 9, minHeight: 48, paddingHorizontal: 16 }}>
              <Text style={[typography.button, { color: donationColors.deepNavy }]}>Ge en gåva</Text>
              {pending ? <ActivityIndicator color={donationColors.deepNavy} size="small" /> : <Feather name="heart" size={18} color={donationColors.deepNavy} />}
            </View>
          </View>
          <View style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
            <Feather name="chevron-right" size={22} color={donationColors.deepNavy} />
            <DonationEntryIllustration compact />
          </View>
        </View>
      </Pressable>
      {error ? <DonationStatusRetry error={error} onRetry={refresh} pending={pending} /> : null}
    </View>
  );
}
