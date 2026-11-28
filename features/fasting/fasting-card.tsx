import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View, type ViewStyle } from "react-native";

import { formatCountdown, formatFastRange } from "@/features/fasting/format";
import { useFastClock } from "@/features/fasting/use-fast-clock";
import { latestFast, openFast } from "@/state/fasting";
import {
  fastPlanDayNumber,
  fastPlanPhase,
  fastPlanRemainingMinutes,
  fastPlanWindowAt,
  fastWindowProgressPercent,
} from "@/state/fasting-plan";
import { fastModeConfig } from "@/state/fasting-modes";
import { participantCount } from "@/state/group-fasting";
import { useKoinoFields } from "@/state/koino-store";
import { useAppTranslation } from "@/ui/app-language";
import { BodyText, Card } from "@/ui/app-components";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const fastingCardFields = ["fasts", "fastsReady", "groupFasts", "groups", "currentGroupId"] as const;

export function FastingCard() {
  const state = useKoinoFields(fastingCardFields);
  const { t, language } = useAppTranslation();
  const now = useFastClock(30_000);

  if (!state.fastsReady) {
    return (
      <Card style={{ gap: 8 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View style={iconTile}>
            <Feather color={colors.accentRhythm} name="activity" size={19} />
          </View>
          <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("me.fasting.title")}</Text>
        </View>
        <BodyText muted>{t("fasting.loading")}</BodyText>
      </Card>
    );
  }

  const active = openFast(state.fasts, now);
  const latest = latestFast(state.fasts);
  const shown = active ?? latest;
  const phase = shown ? fastPlanPhase(shown, now) : undefined;
  const window = shown ? fastPlanWindowAt(shown, now) : undefined;
  const percent = shown && window?.phase === "fasting" ? fastWindowProgressPercent(shown, now) : 0;
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const shared = shown?.visibility === "group" && shown.groupId === group?.id
    ? state.groupFasts.find((item) => item.id === shown.id)
    : undefined;
  const joined = Boolean(shown?.sourceGroupFastId);

  const title = !shown
    ? t("me.fasting.start")
    : window?.phase === "fasting"
      ? t("me.fasting.remaining", { time: formatCountdown(fastPlanRemainingMinutes(shown, now), t) })
      : window?.phase === "eating"
        ? t("fasting.status.eating")
        : phase === "scheduled"
          ? t("me.fasting.startsIn", { time: formatCountdown(fastPlanRemainingMinutes(shown, now), t) })
          : phase === "ended"
            ? t("me.fasting.ended")
            : t("me.fasting.complete");

  const subtitle = !shown
    ? t("fasting.choose.body")
    : `${t(fastModeConfig(shown.mode).titleKey as never)} · ${t("fasting.dashboard.dayOf", { day: fastPlanDayNumber(shown, now), total: shown.durationDays })}`;

  return (
    <Pressable
      accessibilityHint={t("me.fasting.openHint")}
      accessibilityLabel={`${t("me.fasting.title")}. ${title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={() => router.push("/fasting" as never)}
    >
      {({ pressed }) => (
        <Card style={{ gap: 14, opacity: pressed ? 0.82 : 1 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <View style={iconTile}>
              <Feather color={colors.accentRhythm} name="activity" size={19} />
            </View>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("me.fasting.title")}</Text>
              <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>{subtitle}</Text>
            </View>
            <Feather color={colors.muted} name="chevron-right" size={18} />
          </View>

          {shown && window?.phase === "fasting" ? (
            <View style={{ gap: 6 }}>
              <View
                accessibilityLabel={`${percent}%`}
                accessibilityRole="progressbar"
                accessibilityValue={{ max: 100, min: 0, now: percent }}
                style={{ backgroundColor: shadcn.secondary, borderRadius: 999, height: 6, overflow: "hidden" }}
              >
                <View style={{ backgroundColor: colors.accentRhythm, borderRadius: 999, height: "100%", width: `${percent}%` }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.progress.percent", { percent })}</Text>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
                  <Feather color={colors.muted} name={shared ? "users" : "lock"} size={11} />
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {joined ? t("fasting.group.joined") : shared ? t("fasting.dashboard.sharedCount", { count: participantCount(shared) }) : t("me.fasting.private")}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {!shown ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Feather color={colors.muted} name="lock" size={11} />
              <Text style={[typography.caption, { color: colors.muted }]}>{t("me.fasting.private")}</Text>
            </View>
          ) : null}

          {shown && window?.phase !== "fasting" ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Feather color={colors.muted} name={shared ? "users" : "lock"} size={11} />
              <Text style={[typography.caption, { color: colors.muted }]}>
                {joined ? t("fasting.group.joined") : shared ? t("fasting.dashboard.sharedCount", { count: participantCount(shared) }) : t("me.fasting.private")}
              </Text>
              {shown ? <Text style={[typography.caption, { color: colors.muted }]}>· {formatFastRange(shown, language)}</Text> : null}
            </View>
          ) : null}
        </Card>
      )}
    </Pressable>
  );
}

const iconTile: ViewStyle = {
  alignItems: "center",
  backgroundColor: colors.mossSurface,
  borderRadius: radius.lg,
  height: 48,
  justifyContent: "center",
  width: 48,
};
