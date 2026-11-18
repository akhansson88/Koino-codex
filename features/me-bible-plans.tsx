import { useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { biblePlanReadingRoute, completionPercent, highlightedBiblePlan, todayDateKey } from "@/features/bible-plans";
import { displayPlanTitle, planCoverKey } from "@/features/bible-plan-library";
import { PlanProgressBar, PlanProgressRing, PlanThumbnail, planReferencesLabel } from "@/features/bible-plan-ui";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { useKoinoActions } from "@/state/koino-store";
import type { BiblePlan } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { BodyText, Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function MeBiblePlans({ plans, userId }: { plans: BiblePlan[]; userId: string | undefined }) {
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const { dispatch } = useKoinoActions();
  const date = todayDateKey();
  const ownedPlans = useMemo(() => plans.filter((plan) => userId && plan.userId === userId), [plans, userId]);
  const highlight = useMemo(() => highlightedBiblePlan(ownedPlans, date), [ownedPlans, date]);
  const plan = highlight?.plan;
  const day = highlight?.day;
  const completedCount = ownedPlans.filter((item) => item.status === "completed").length;
  const percent = plan ? completionPercent(plan.days.filter((item) => item.completedAt).length, plan.days.length) : 0;
  const title = plan ? displayPlanTitle(plan, language) : t("me.biblePlans.title");
  const reference = plan && day ? planReferencesLabel(day, bookLanguage) : undefined;
  const openPlans = () => router.push({ pathname: "/bible-plans", params: { tab: "library" } });
  const openCompleted = () => router.push({ pathname: "/bible-plans", params: { tab: "mine", filter: "completed" } });

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        {plan ? (
          <PlanThumbnail coverKey={planCoverKey(plan)} />
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: shadcn.brandSoft,
              borderRadius: radius.lg,
              height: 56,
              justifyContent: "center",
              width: 56,
            }}
          >
            <Feather name="book-open" size={21} color={shadcn.brand} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text accessibilityRole="header" style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>
            {t("me.biblePlans.title")}
          </Text>
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
            {plan && day
              ? t("me.biblePlans.day", { day: day.dayNumber, total: plan.days.length })
              : plan
                ? t("bible.plans.paused")
                : t("me.biblePlans.empty")}
          </Text>
        </View>
        {plan ? <PlanProgressRing percent={percent} size={44} /> : null}
      </View>

      {plan ? (
        <View style={{ gap: 6 }}>
          <Text numberOfLines={2} style={[typography.label, { color: colors.ink }]}>
            {reference || t("bible.plans.noToday")}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={[typography.caption, { color: colors.muted }]}>{t("bible.plans.progress", { percent })}</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {plan.days.length === 1 ? t("bible.plans.day.single") : t("bible.plans.day.count", { count: plan.days.length })}
            </Text>
          </View>
          <PlanProgressBar percent={percent} />
        </View>
      ) : (
        <BodyText muted>{t(completedCount > 0 ? "me.biblePlans.completed" : "me.biblePlans.empty")}</BodyText>
      )}

      <View style={{ flexDirection: "row", gap: 8 }}>
        {plan && day ? (
          <>
            <PrimaryButton
              icon="book-open"
              onPress={() => router.push(biblePlanReadingRoute(plan.id, day.dayNumber))}
              style={{ flex: 1 }}
            >
              {t("me.biblePlans.continue")}
            </PrimaryButton>
            <SecondaryButton icon="compass" onPress={openPlans} style={{ flex: 1 }}>
              {t("me.biblePlans.browse")}
            </SecondaryButton>
          </>
        ) : plan?.pausedAt ? (
          <>
            <PrimaryButton
              icon="play"
              onPress={() => void dispatch({ type: "rescheduleBiblePlan", planId: plan.id, startDate: date })}
              style={{ flex: 1 }}
            >
              {t("bible.plans.resume")}
            </PrimaryButton>
            <SecondaryButton icon="compass" onPress={openPlans} style={{ flex: 1 }}>
              {t("me.biblePlans.browse")}
            </SecondaryButton>
          </>
        ) : completedCount > 0 ? (
          <PrimaryButton icon="award" onPress={openCompleted} style={{ flex: 1 }}>
            {t("me.biblePlans.browseCompleted")}
          </PrimaryButton>
        ) : (
          <PrimaryButton icon="compass" onPress={openPlans} style={{ flex: 1 }}>
            {t("me.biblePlans.explore")}
          </PrimaryButton>
        )}
      </View>
    </Card>
  );
}
