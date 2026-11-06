import { useMemo } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { biblePlanReadingRoute, completionPercent, highlightedBiblePlan, todayDateKey } from "@/features/bible-plans";
import type { BiblePlan } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { BodyText } from "@/ui/app-components";
import { colors, typography } from "@/ui/theme";

function PlanLink({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => ({ justifyContent: "center", maxWidth: "100%", minHeight: 44, opacity: pressed ? 0.7 : 1, paddingVertical: 6 })}
    >
      <Text style={[typography.button, { color: colors.olive, textDecorationLine: "underline" }]}>{children}</Text>
    </Pressable>
  );
}

export function MeBiblePlans({ plans, userId }: { plans: BiblePlan[]; userId: string | undefined }) {
  const { t } = useAppTranslation();
  const date = todayDateKey();
  const ownedPlans = useMemo(() => plans.filter((plan) => userId && plan.userId === userId), [plans, userId]);
  const highlight = useMemo(() => highlightedBiblePlan(ownedPlans, date), [ownedPlans, date]);
  const plan = highlight?.plan;
  const day = highlight?.day;
  const tab = highlight ? "active"
    : ownedPlans.some((plan) => plan.status === "saved") ? "saved"
    : ownedPlans.some((plan) => plan.status === "completed") ? "completed"
    : "active";
  const summary = {
    active: "me.biblePlans.empty",
    saved: "me.biblePlans.saved",
    completed: "me.biblePlans.completed",
  } as const;
  const browseLabel = {
    active: plan ? "me.biblePlans.browse" : "me.biblePlans.explore",
    saved: "me.biblePlans.browseSaved",
    completed: "me.biblePlans.browseCompleted",
  } as const;

  const dayContext = plan && day ? t("me.biblePlans.day", { day: day.dayNumber, total: plan.days.length })
    : plan?.pausedAt ? t("bible.plans.paused")
    : undefined;
  const progress = plan ? t("bible.plans.progress", {
    percent: completionPercent(plan.days.filter((item) => Boolean(item.completedAt)).length, plan.days.length),
  }) : undefined;

  return (
    <View style={{ borderColor: colors.line, borderTopWidth: 1, gap: 6, paddingTop: 16 }}>
      <Text accessibilityRole="header" style={[typography.sectionLabel, { color: colors.muted }]}>{t("me.biblePlans.title")}</Text>
      {plan ? (
        <>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{plan.title}</Text>
          <BodyText muted>{dayContext ? `${dayContext} · ${progress}` : progress}</BodyText>
        </>
      ) : <BodyText muted>{t(summary[tab])}</BodyText>}
      <View style={{ columnGap: 18, flexDirection: "row", flexWrap: "wrap" }}>
        {plan && day ? <PlanLink onPress={() => router.push(biblePlanReadingRoute(plan.id, day.dayNumber))}>{t("me.biblePlans.continue")}</PlanLink> : null}
        <PlanLink onPress={() => router.push({ pathname: "/bible-plans", params: { tab } })}>{t(browseLabel[tab])}</PlanLink>
      </View>
    </View>
  );
}
