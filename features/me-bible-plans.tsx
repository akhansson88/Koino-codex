import { useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { biblePlanReadingRoute, completionPercent, highlightedBiblePlan, todayDateKey } from "@/features/bible-plans";
import type { BiblePlan } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { Card } from "@/ui/app-components";
import { Button } from "@/ui/shadcn/button";
import { colors, radius, shadcn, typography } from "@/ui/theme";

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

  const completedDays = plan ? plan.days.filter((item) => Boolean(item.completedAt)).length : 0;
  const percent = plan ? completionPercent(completedDays, plan.days.length) : 0;
  const dayContext = plan && day ? t("me.biblePlans.day", { day: day.dayNumber, total: plan.days.length })
    : plan?.pausedAt ? t("bible.plans.paused")
    : undefined;
  const progress = plan ? t("bible.plans.progress", { percent }) : undefined;

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: shadcn.brandSoft,
            borderCurve: "continuous",
            borderRadius: radius.lg,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Feather name="book-open" size={19} color={shadcn.brand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>
            {t("me.biblePlans.title")}
          </Text>
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink }]}>
            {plan ? plan.title : t("me.biblePlans.empty")}
          </Text>
          {dayContext ? <Text style={[typography.caption, { color: colors.muted }]}>{dayContext}</Text> : null}
          {!plan && tab !== "active" ? <Text style={[typography.caption, { color: colors.muted }]}>{t(summary[tab])}</Text> : null}
        </View>
      </View>

      {plan ? (
        <View style={{ gap: 6 }}>
          <Text style={[typography.caption, { color: colors.muted }]}>{progress}</Text>
          <View
            accessibilityLabel={progress}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: 100, min: 0, now: percent }}
            style={{ backgroundColor: shadcn.secondary, borderRadius: 999, height: 6, overflow: "hidden" }}
          >
            <View style={{ backgroundColor: shadcn.primary, borderRadius: 999, height: "100%", width: `${percent}%` }} />
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        {plan && day ? (
          <Button iconRight="arrow-right" onPress={() => router.push(biblePlanReadingRoute(plan.id, day.dayNumber))} size="sm" style={{ flex: 1 }}>
            {t("me.biblePlans.continue")}
          </Button>
        ) : null}
        <Button
          onPress={() => router.push({ pathname: "/bible-plans", params: { tab } })}
          size="sm"
          style={{ flex: 1 }}
          variant="outline"
        >
          {t(browseLabel[tab])}
        </Button>
      </View>
    </Card>
  );
}
