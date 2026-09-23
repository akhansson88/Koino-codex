import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  biblePlanDayRegionLabel,
  completionPercent,
  dayKeyForPlanDay,
  todayDateKey,
  type BiblePlanCurrentDay,
  type BiblePlanMarker,
  type BiblePlanMarkerKind,
} from "@/features/bible-plans";
import { nextUnreadPlanDay, todayPlanDay } from "@/state/bible-plan-schedule";
import { useKoinoSelector } from "@/state/koino-store";
import type { BiblePlan } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";

export function BiblePlanReaderPanel({
  currentDay,
  markers,
  onJump,
  onMarkRead,
  onSelectPlan,
  onSelectDay,
  palette,
  plan,
  plans,
}: {
  currentDay?: BiblePlanCurrentDay;
  markers: BiblePlanMarker[];
  onJump: () => void;
  onMarkRead: () => Promise<void>;
  onSelectPlan: (id: string) => void;
  onSelectDay: (dayNumber: number) => void;
  palette: ReaderPalette;
  plan?: BiblePlan;
  plans: BiblePlan[];
}) {
  const { t } = useAppTranslation();
  const authError = useKoinoSelector((state) => state.authError);
  const [saving, setSaving] = useState(false);
  if (!plan || plans.length === 0) return null;

  const completed = plan.days.filter((day) => Boolean(day.completedAt)).length;
  const percent = completionPercent(completed, plan.days.length);
  const day = currentDay?.day;
  const dayCompleted = Boolean(day?.completedAt);
  const hasMarkersInChapter = markers.length > 0;
  const dateLabel = day ? dayKeyForPlanDay(plan, day.dayNumber) : todayDateKey();
  const regionLabel = biblePlanDayRegionLabel(day);
  const today = todayPlanDay(plan, todayDateKey());
  const next = nextUnreadPlanDay(plan);

  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        gap: 10,
        padding: 12,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Feather name="calendar" size={17} color={palette.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>
            {plan.title}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
            {day ? `Day ${day.dayNumber} · ${dateLabel} · ${percent}% complete` : `${percent}% complete`}
          </Text>
          {regionLabel ? (
            <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 12, fontWeight: "800", lineHeight: 17 }}>
              {regionLabel}
            </Text>
          ) : null}
        </View>
        {plans.length > 1 ? (
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900" }}>
            {plans.findIndex((item) => item.id === plan.id) + 1}/{plans.length}
          </Text>
        ) : null}
      </View>
      {plan.pausedAt ? <Text style={{ color: palette.muted }}>{t("bible.plans.paused")}</Text> : null}
      <Text style={{ color: palette.muted }}>{today ? t("bible.plans.plan.today", { day: today.dayNumber }) : t("bible.plans.noToday")}</Text>
      <Text style={{ color: palette.muted }}>{next ? t("bible.plans.nextDay", { day: next.dayNumber }) : t("bible.plans.noUnread")}</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[{ label: t("bible.plans.today"), target: today }, { label: t("bible.plans.nextUnread"), target: next }].map(({ label, target }) => (
          <Pressable key={label} accessibilityRole="button" disabled={!target?.ranges?.length} onPress={() => target && onSelectDay(target.dayNumber)} style={{ flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", opacity: target?.ranges?.length ? 1 : 0.5 }}>
            <Text style={{ color: palette.accent, fontWeight: "800" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {plans.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {plans.map((item) => {
            const selected = item.id === plan.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={item.id}
                onPress={() => onSelectPlan(item.id)}
                style={{
                  backgroundColor: selected ? palette.peach : palette.input,
                  borderColor: selected ? palette.accent : palette.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  minHeight: 34,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                }}
              >
                <Text numberOfLines={1} style={{ color: selected ? palette.accent : palette.muted, fontSize: 12, fontWeight: "900", maxWidth: 160 }}>
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          disabled={!day}
          onPress={onJump}
          style={{
            alignItems: "center",
            backgroundColor: palette.input,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            flex: 1,
            flexDirection: "row",
            gap: 7,
            justifyContent: "center",
            minHeight: 40,
            opacity: day ? 1 : 0.5,
            paddingHorizontal: 10,
          }}
        >
          <Feather name={hasMarkersInChapter ? "map-pin" : "corner-up-right"} size={15} color={palette.accent} />
          <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "900" }}>{t("bible.plans.plan.read")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!day || saving}
          accessibilityState={{ disabled: !day || saving }}
          onPress={async () => {
            setSaving(true);
            try { await onMarkRead(); } finally { setSaving(false); }
          }}
          style={{
            alignItems: "center",
            backgroundColor: dayCompleted ? palette.peach : palette.accent,
            borderColor: dayCompleted ? palette.accent : palette.accent,
            borderRadius: 999,
            borderWidth: 1,
            flex: 1,
            flexDirection: "row",
            gap: 7,
            justifyContent: "center",
            minHeight: 40,
            opacity: !day || saving ? 0.5 : 1,
            paddingHorizontal: 10,
          }}
        >
          <Feather name={dayCompleted ? "check-circle" : "circle"} size={15} color={dayCompleted ? palette.accent : palette.surface} />
          <Text style={{ color: dayCompleted ? palette.accent : palette.surface, fontSize: 12, fontWeight: "900" }}>{t(dayCompleted ? "bible.plans.markUnread" : "bible.plans.markRead")}</Text>
        </Pressable>
      </View>
      {authError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{authError}</Text> : null}
    </View>
  );
}

export function BiblePlanInlineMarker({ kind, label, palette }: { kind: BiblePlanMarkerKind; label: string; palette: ReaderPalette }) {
  const isStart = kind === "start";
  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: isStart ? palette.peach : palette.input,
        borderColor: isStart ? palette.accent : palette.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 7,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Feather name={isStart ? "play-circle" : "flag"} size={13} color={palette.accent} />
      <Text style={{ color: palette.accent, fontSize: 11, fontWeight: "900", textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}
