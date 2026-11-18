import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { displayBibleReference } from "@/features/bible-book-names";
import {
  biblePlanDayRegionLabel,
  completionPercent,
  dayKeyForPlanDay,
  formatPlanDate,
  todayDateKey,
  type BiblePlanCurrentDay,
  type BiblePlanMarker,
  type BiblePlanMarkerKind,
} from "@/features/bible-plans";
import { displayPlanTitle } from "@/features/bible-plan-library";
import { nextUnreadPlanDay, todayPlanDay } from "@/state/bible-plan-schedule";
import { useKoinoSelector } from "@/state/koino-store";
import type { BiblePlan } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
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
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const authError = useKoinoSelector((state) => state.authError);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!plan || plans.length === 0) return null;

  const completed = plan.days.filter((day) => Boolean(day.completedAt)).length;
  const percent = completionPercent(completed, plan.days.length);
  const day = currentDay?.day;
  const dayCompleted = Boolean(day?.completedAt);
  const dateLabel = day ? formatPlanDate(dayKeyForPlanDay(plan, day.dayNumber), language, { month: "short", day: "numeric" }) : "";
  const regionLabel = day ? displayBibleReference(biblePlanDayRegionLabel(day), bookLanguage) : "";
  const today = todayPlanDay(plan, todayDateKey());
  const next = nextUnreadPlanDay(plan);
  const title = displayPlanTitle(plan, language);
  const statusLine = plan.pausedAt
    ? t("bible.plans.paused")
    : today
      ? t("bible.plans.plan.today", { day: today.dayNumber })
      : next
        ? t("bible.plans.nextDay", { day: next.dayNumber })
        : t("bible.plans.noUnread");

  return (
    <View
      style={{
        backgroundColor: expanded ? palette.surface : palette.input,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityLabel={t(expanded ? "bible.plans.reader.collapse" : "bible.plans.reader.expand")}
        accessibilityRole="button"
        onPress={() => setExpanded((value) => !value)}
        style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: 54, paddingHorizontal: 12, paddingVertical: 8 }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette.peach,
            borderRadius: 999,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather name={dayCompleted ? "check" : "calendar"} size={16} color={palette.accent} />
        </View>
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "800" }}>
            {title}
          </Text>
          <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "600" }}>
            {day
              ? t("bible.plans.reader.dayProgress", { day: day.dayNumber, date: dateLabel, percent })
              : t("bible.plans.progress", { percent: percent })}
          </Text>
        </View>
        {dayCompleted ? (
          <Feather name="check-circle" size={17} color={palette.accent} />
        ) : null}
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={palette.muted} />
      </Pressable>

      {expanded ? (
        <View style={{ borderTopColor: palette.line, borderTopWidth: 1, gap: 10, padding: 12 }}>
          {regionLabel ? (
            <Text numberOfLines={2} style={{ color: palette.text, fontSize: 14, fontWeight: "800", lineHeight: 20 }}>
              {regionLabel}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: palette.line, borderRadius: 999, flex: 1, height: 5, overflow: "hidden" }}>
              <View style={{ backgroundColor: palette.accent, borderRadius: 999, height: "100%", width: `${percent}%` }} />
            </View>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>{percent}%</Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: palette.muted, fontSize: 12, flex: 1 }}>{statusLine}</Text>
            {markers.length ? (
              <View style={{ backgroundColor: palette.peach, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: palette.accent, fontSize: 10, fontWeight: "800" }}>{t("bible.plans.reader.here")}</Text>
              </View>
            ) : null}
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
                      justifyContent: "center",
                      minHeight: 32,
                      paddingHorizontal: 11,
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: selected ? palette.accent : palette.muted, fontSize: 11, fontWeight: "800", maxWidth: 150 }}>
                      {displayPlanTitle(item, language)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8 }}>
            {[{ label: t("bible.plans.today"), target: today }, { label: t("bible.plans.nextUnread"), target: next }].map(({ label, target }) => (
              <Pressable
                accessibilityRole="button"
                disabled={!target?.ranges?.length}
                key={label}
                onPress={() => target && onSelectDay(target.dayNumber)}
                style={{
                  alignItems: "center",
                  borderColor: palette.line,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  flex: 1,
                  minHeight: 40,
                  justifyContent: "center",
                  opacity: target?.ranges?.length ? 1 : 0.45,
                }}
              >
                <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "800" }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!day}
              onPress={onJump}
              style={{
                alignItems: "center",
                backgroundColor: palette.input,
                borderColor: palette.line,
                borderRadius: radius.md,
                borderWidth: 1,
                flex: 1,
                flexDirection: "row",
                gap: 7,
                justifyContent: "center",
                minHeight: 42,
                opacity: day ? 1 : 0.45,
              }}
            >
              <Feather name={markers.length ? "map-pin" : "corner-up-right"} size={15} color={palette.accent} />
              <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "900" }}>{t("bible.plans.plan.read")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !day || saving }}
              disabled={!day || saving}
              onPress={async () => {
                setSaving(true);
                try { await onMarkRead(); } finally { setSaving(false); }
              }}
              style={{
                alignItems: "center",
                backgroundColor: dayCompleted ? palette.peach : palette.accent,
                borderColor: palette.accent,
                borderRadius: radius.md,
                borderWidth: 1,
                flex: 1,
                flexDirection: "row",
                gap: 7,
                justifyContent: "center",
                minHeight: 42,
                opacity: !day || saving ? 0.5 : 1,
              }}
            >
              <Feather name={dayCompleted ? "check-circle" : "circle"} size={15} color={dayCompleted ? palette.accent : palette.surface} />
              <Text style={{ color: dayCompleted ? palette.accent : palette.surface, fontSize: 12, fontWeight: "900" }}>
                {t(dayCompleted ? "bible.plans.markUnread" : "bible.plans.markRead")}
              </Text>
            </Pressable>
          </View>

          {authError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{authError}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function BiblePlanInlineMarker({ kind, label, palette }: { kind: BiblePlanMarkerKind; label: string; palette: ReaderPalette }) {
  const { t } = useAppTranslation();
  const isStart = kind === "start";
  const translated = t(isStart ? "bible.plans.marker.start" : "bible.plans.marker.finish");
  return (
    <View
      accessibilityLabel={translated}
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
      <Text style={{ color: palette.accent, fontSize: 11, fontWeight: "900", textTransform: "uppercase" }}>{translated}</Text>
    </View>
  );
}
