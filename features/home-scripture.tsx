import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

import { displayBibleReference } from "@/features/bible-book-names";
import { biblePlanReadingRoute, highlightedBiblePlan } from "@/features/bible-plans";
import { hasRecordedBibleReadingPosition, readerStorageKey } from "@/features/bible-preferences";
import storage from "@/state/encryption/local-storage";
import type { BiblePlan } from "@/state/types";
import { BodyText, Card, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadows, typography } from "@/ui/theme";

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
    <Card style={{ gap: 16, padding: 18, ...shadows.raised }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
        <LinearGradient
          colors={["#FFE1C9", "#FFC79A"]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={{
            alignItems: "center",
            borderRadius: radius.md,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Feather name="book-open" size={18} color="#8A4A1F" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <Text accessibilityRole="header" style={[typography.sectionLabel, { color: colors.muted }]}>
            {t("home.scripture.title")}
          </Text>
          <Text numberOfLines={2} style={[typography.title, { color: colors.ink }]}>{title}</Text>
          {plan && day ? <BodyText muted>{plan.title}</BodyText> : null}
        </View>
      </View>
      <PrimaryButton
        icon="arrow-right"
        onPress={() => router.push(plan && day ? biblePlanReadingRoute(plan.id, day.dayNumber) : "/(tabs)/bible")}
      >
        {day ? t("home.scripture.continuePlan") : canResume ? t("home.scripture.resume") : t("home.scripture.open")}
      </PrimaryButton>
    </Card>
  );
}
