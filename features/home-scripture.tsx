import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

import { biblePlanReadingRoute, completionPercent, planPace, todayDateKey } from "@/features/bible-plans";
import { biblePlanTemplates, displayPlanTitle, planCoverKey } from "@/features/bible-plan-library";
import { PlanCoverImage, PlanProgressBar, planReferencesLabel } from "@/features/bible-plan-ui";
import { hasRecordedBibleReadingPosition, readerStorageKey } from "@/features/bible-preferences";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import storage from "@/state/encryption/local-storage";
import { useKoinoActions } from "@/state/koino-store";
import type { BiblePlan } from "@/state/types";
import { BodyText, Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export function HomeScripture({ date, plans, userId }: { date: string; plans: BiblePlan[]; userId?: string }) {
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const { dispatch } = useKoinoActions();
  const [resumeUserId, setResumeUserId] = useState<string>();
  const highlight = useMemo(() => {
    if (userId) return highlightedPlan(plans.filter((plan) => plan.userId === userId), date);
  }, [date, plans, userId]);
  const plan = highlight?.plan;
  const day = highlight?.day;
  const pace = plan ? planPace(plan, date) : undefined;
  const percent = plan ? completionPercent(plan.days.filter((item) => item.completedAt).length, plan.days.length) : 0;
  const title = plan ? displayPlanTitle(plan, language) : t("bible.plans.today.emptyTitle");
  const reference = day ? planReferencesLabel(day, bookLanguage) : undefined;

  useFocusEffect(useCallback(() => {
    if (day || !userId) return;
    const key = readerStorageKey(userId);
    if (!key) return;
    let active = true;
    void storage.getItem(key).then((value) => {
      if (active) setResumeUserId(hasRecordedBibleReadingPosition(value) ? userId : undefined);
    }).catch(() => {
      if (active) setResumeUserId(undefined);
    });
    return () => { active = false; };
  }, [day, userId]));

  const canResume = Boolean(userId && resumeUserId === userId);
  const dayDate = day && plan ? scheduledDateFor(plan, day.dayNumber) : undefined;
  const isCatchUp = Boolean(dayDate && dayDate < todayDateKey());
  const openPlans = () => router.push({ pathname: "/bible-plans", params: { tab: "library" } });
  const openMyPlans = () => router.push({ pathname: "/bible-plans", params: { tab: "mine" } });
  const primary = () => {
    if (plan && day) router.push(biblePlanReadingRoute(plan.id, day.dayNumber));
    else if (plan) openMyPlans();
    else router.push("/(tabs)/bible");
  };
  const primaryLabel = plan && day
    ? isCatchUp ? t("bible.plans.today.catchUp") : t("bible.plans.today.continue")
    : plan
      ? t("bible.plans.plan.view")
      : canResume
        ? t("home.scripture.resume")
        : t("home.scripture.open");

  return (
    <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
      <PlanCoverImage coverKey={plan ? planCoverKey(plan) : "story-30"} style={{ height: 150 }}>
        <LinearGradient
          colors={["rgba(20, 12, 6, 0)", "rgba(20, 12, 6, 0.18)", "rgba(20, 12, 6, 0.82)"]}
          locations={[0, 0.42, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ bottom: 0, left: 0, padding: 16, position: "absolute", right: 0 }}
        >
          <Text style={[typography.sectionLabel, { color: "#FFD9BA", fontSize: 10, letterSpacing: 1.4 }]}>
            {plan
              ? plan.pausedAt
                ? t("bible.plans.paused")
                : isCatchUp
                  ? t("bible.plans.today.catchUpLabel")
                  : t("bible.plans.today.todayLabel")
              : t("bible.plans.today.startHere")}
          </Text>
          <Text numberOfLines={2} style={[typography.title, { color: "#FFFFFF" }]}>{title}</Text>
          <Text style={[typography.caption, { color: "rgba(255,255,255,0.84)" }]}>
            {plan && day
              ? t("bible.plans.today.dayOf", { day: day.dayNumber, total: plan.days.length })
              : plan
                ? t("bible.plans.paused")
                : t("bible.plans.today.emptyBody")}
          </Text>
        </LinearGradient>
      </PlanCoverImage>

      <View style={{ gap: 12, padding: 16 }}>
        {plan ? (
          <>
            <View style={{ gap: 3 }}>
              <Text accessibilityRole="header" style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>
                {t("bible.plans.today.reading")}
              </Text>
              <Text numberOfLines={2} style={[typography.title, { color: colors.ink }]}>
                {reference || t("bible.plans.noToday")}
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {pace?.behind
                    ? t("bible.plans.today.behind", { count: pace.behind })
                    : pace?.todayCompleted
                      ? t("bible.plans.today.completed")
                      : t("bible.plans.progress", { percent })}
                </Text>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {plan.days.length === 1 ? t("bible.plans.day.single") : t("bible.plans.day.count", { count: plan.days.length })}
                </Text>
              </View>
              <PlanProgressBar percent={percent} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PrimaryButton icon="book-open" onPress={primary} style={{ flex: 1 }}>
                {primaryLabel}
              </PrimaryButton>
              {plan.pausedAt ? (
                <SecondaryButton
                  icon="play"
                  onPress={() => void dispatch({ type: "rescheduleBiblePlan", planId: plan.id, startDate: date })}
                  style={{ flex: 1 }}
                >
                  {t("bible.plans.resume")}
                </SecondaryButton>
              ) : (
                <SecondaryButton icon="list" onPress={openMyPlans} style={{ flex: 1 }}>
                  {t("bible.plans.plan.view")}
                </SecondaryButton>
              )}
            </View>
          </>
        ) : (
          <>
            <BodyText muted>{t("home.scripture.libraryCount", { count: biblePlanTemplates.length })}</BodyText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PrimaryButton icon={canResume ? "book-open" : "compass"} onPress={primary} style={{ flex: 1 }}>
                {primaryLabel}
              </PrimaryButton>
              <SecondaryButton icon="calendar" onPress={openPlans} style={{ flex: 1 }}>
                {t("bible.plans.today.findPlan")}
              </SecondaryButton>
            </View>
          </>
        )}
      </View>
    </Card>
  );
}

function highlightedPlan(plans: BiblePlan[], date: string) {
  const active = plans.filter((plan) => plan.status !== "completed");
  let catchUp: { plan: BiblePlan; day: BiblePlan["days"][number] } | undefined;
  for (const plan of active) {
    if (plan.pausedAt) continue;
    const today = plan.days.find((day) => scheduledDateFor(plan, day.dayNumber) === date && !day.completedAt);
    if (today) return { plan, day: today };
    const next = plan.days.find((day) => !day.completedAt && day.ranges.length > 0);
    if (!catchUp && next) catchUp = { plan, day: next };
  }
  if (catchUp) return catchUp;
  const plan = active.find((item) => !item.pausedAt) ?? active[0];
  return plan ? { plan, day: undefined } : undefined;
}

function scheduledDateFor(plan: BiblePlan, dayNumber: number) {
  return plan.days.find((day) => day.dayNumber === dayNumber)?.scheduledDate
    ?? addDays(plan.startDate, dayNumber - 1);
}

function addDays(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
