import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { formatFastDate } from "@/features/fasting/format";
import { fastModeTint } from "@/features/fasting/fasting-style";
import { fastModeConfig } from "@/state/fasting-modes";
import { canJoinGroupFast, groupFastEnd, groupFastStart, participantCount } from "@/state/group-fasting";
import type { GroupFast, GroupImage } from "@/state/types";
import { AvatarStack, BodyText, Card } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function GroupFastCard({
  fast,
  hostName,
  joined,
  now,
  onJoin,
  onOpen,
  participantUsers,
}: {
  fast: GroupFast;
  hostName?: string;
  joined: boolean;
  now: number;
  onJoin: () => void;
  onOpen: () => void;
  participantUsers: { name: string; image?: GroupImage }[];
}) {
  const { t, language } = useAppTranslation();
  const config = fastModeConfig(fast.mode);
  const tint = fastModeTint(fast.mode);
  const started = now >= fast.joinCutoffMs;
  const joinable = canJoinGroupFast(fast, now) && !joined;
  const count = participantCount(fast);

  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      <Card style={{ gap: 12 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View style={{ alignItems: "center", backgroundColor: tint.soft, borderRadius: radius.lg, height: 46, justifyContent: "center", width: 46 }}>
            <Feather color={tint.ink} name={config.icon as never} size={20} />
          </View>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={[typography.cardTitle, { color: colors.ink }]}>{t(config.titleKey as TranslationKey)}</Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
              {t("fasting.group.host", { name: hostName ?? t("fasting.group.participants") })}
            </Text>
          </View>
          <View style={{ backgroundColor: joined ? shadcn.successSoft : started ? shadcn.muted : tint.soft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={[typography.caption, { color: joined ? shadcn.success : started ? colors.muted : tint.ink }]}>
              {joined ? t("fasting.group.joined") : started ? t("fasting.group.inProgress") : t("fasting.group.joinBefore")}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
            <Feather color={colors.muted} name="calendar" size={13} />
            <Text style={[typography.caption, { color: colors.muted }]}>
              {formatFastDate(new Date(groupFastStart(fast)), language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
            <Feather color={colors.muted} name="clock" size={13} />
            <Text style={[typography.caption, { color: colors.muted }]}>
              {formatFastDate(new Date(groupFastEnd(fast)), language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {participantUsers.length ? <AvatarStack size={28} users={participantUsers} /> : null}
          <Text style={[typography.caption, { color: colors.muted, flex: 1 }]}>{t("fasting.group.joinedCount", { count })}</Text>
          {joinable ? (
            <Pressable
              accessibilityRole="button"
              onPress={onJoin}
              style={({ pressed }) => ({
                backgroundColor: shadcn.primary,
                borderRadius: radius.md,
                opacity: pressed ? 0.75 : 1,
                paddingHorizontal: 13,
                paddingVertical: 7,
              })}
            >
              <Text style={[typography.label, { color: shadcn.primaryForeground }]}>{t("fasting.group.join")}</Text>
            </Pressable>
          ) : null}
        </View>
        {!joinable && !joined && started ? <BodyText muted>{t("fasting.group.joinClosed")}</BodyText> : null}
      </Card>
    </Pressable>
  );
}
