import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { type FeatherName } from "@/features/donation/types";
import { donationColors } from "@/features/donation/colors";

export function CircleIcon({
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

export function DonationEntryIllustration({ compact = false }: { compact?: boolean }) {
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

export function DonationThankYouHero() {
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

export function DonationSummaryMark() {
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
