import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Text, View } from "react-native";

import { displayBibleReference } from "@/features/bible-book-names";
import { biblePlanReadingRoute, highlightedBiblePlan } from "@/features/bible-plans";
import { hasRecordedBibleReadingPosition, readerStorageKey } from "@/features/bible-preferences";
import storage from "@/state/encryption/local-storage";
import type { BiblePlan } from "@/state/types";
import { BodyText, Card, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export function HomeScripture({ date, plans, userId }: { date: string; plans: BiblePlan[]; userId?: string }) {
  const { language, t } = useAppTranslation();
  const [resumeUserId, setResumeUserId] = useState<string>();
  const highlight = useMemo(() => {
    if (userId) return highlightedBiblePlan(plans.filter((plan) => plan.userId === userId), date);
  }, [date, plans, userId]);
  const plan = highlight?.plan;
  const day = highlight?.day;

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
  const reference = day?.ranges[0]?.displayReference;
  const title = reference ? displayBibleReference(reference, language) : t("home.scripture.readerTitle");

  return (
    <Card style={{ backgroundColor: colors.elevated, gap: 16, padding: 18 }}>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[typography.sectionLabel, { color: colors.muted }]}>
          {t("home.scripture.title")}
        </Text>
        <Text style={[typography.heading, { color: colors.ink }]}>{title}</Text>
        {plan && day ? <BodyText muted>{plan.title}</BodyText> : null}
      </View>
      <PrimaryButton
        icon="book-open"
        onPress={() => router.push(plan && day ? biblePlanReadingRoute(plan.id, day.dayNumber) : "/(tabs)/bible")}
        style={{ paddingVertical: 12 }}
      >
        {day ? t("home.scripture.continuePlan") : canResume ? t("home.scripture.resume") : t("home.scripture.open")}
      </PrimaryButton>
    </Card>
  );
}
