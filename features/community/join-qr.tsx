import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import type { GroupJoinApprovers, GroupJoinPolicy } from "@/state/types";
import { joinQrPayload } from "@/state/join-qr";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationFunction } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";

/** The community QR: only `koino://join?code=…`, never group data. */
export function JoinQrCode({ code, size = 236 }: { code: string; size?: number }) {
  const { t } = useAppTranslation();
  return (
    <View
      accessible
      accessibilityLabel={t("community.join.qrCodeLabel", { code })}
      accessibilityRole="image"
      style={{
        alignSelf: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: radius.lg,
        padding: 14,
      }}
    >
      <QRCode
        backgroundColor="#FFFFFF"
        color={colors.ink}
        ecl="M"
        quietZone={0}
        size={size}
        value={joinQrPayload(code)}
      />
    </View>
  );
}

export function joinPolicyBadgeKey(policy: GroupJoinPolicy, approvers: GroupJoinApprovers = "owner") {
  if (policy === "open") return "community.join.openBadge" as const;
  return approvers === "owner_and_leaders" ? "community.join.badgePrivateLeaders" as const : "community.join.badgePrivateOwner" as const;
}

/** The short combined value used in room details, e.g. "Privat · Jag och gruppledarna". */
export function joinPolicySummary(policy: GroupJoinPolicy, approvers: GroupJoinApprovers, t: TranslationFunction) {
  if (policy === "open") return t("community.join.openBadge");
  const who = approvers === "owner_and_leaders" ? t("community.join.approversLeaders") : t("community.join.approversOwner");
  return `${t("common.private")} · ${who}`;
}

export function JoinPolicyBadge({ approvers = "owner", policy }: { approvers?: GroupJoinApprovers; policy: GroupJoinPolicy }) {
  const { t } = useAppTranslation();
  const open = policy === "open";
  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: open ? shadcn.successSoft : shadcn.secondary,
        borderColor: open ? shadcn.success : shadcn.border,
        borderRadius: radius.sm,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        minHeight: 28,
        paddingHorizontal: 10,
      }}
    >
      <View
        style={{
          backgroundColor: open ? shadcn.success : colors.muted,
          borderRadius: 999,
          height: 6,
          width: 6,
        }}
      />
      <Text style={[typography.navLabel, { color: open ? shadcn.success : colors.muted }]}>
        {t(joinPolicyBadgeKey(policy, approvers))}
      </Text>
    </View>
  );
}
