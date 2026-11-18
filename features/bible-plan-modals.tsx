import { Feather } from "@expo/vector-icons";import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  completionPercent,
  formatPlanDate,
  planDayMinutes,
  planPace,
  todayDateKey,
} from "@/features/bible-plans";
import {
  displayPlanDescription,
  displayPlanTitle,
  planCategoryTranslationKeys,
  planCoverKey,
  planTemplateById,
  planTemplateDays,
  type BiblePlanTemplate,
} from "@/features/bible-plan-library";
import {
  PlanCoverImage,
  PlanDayReference,
  PlanProgressBar,
  PlanProgressRing,
  PlanWeekStrip,
  StartDateChoice,
  planReferencesLabel,
} from "@/features/bible-plan-ui";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { confirmAction } from "@/ui/confirm";
import type { BiblePlan, BiblePlanDay } from "@/state/types";
import { useKoino } from "@/state/koino-store";
import { scheduledPlanDate } from "@/state/bible-plan-schedule";
import { useAppTranslation } from "@/ui/app-language";
import { BodyText, FullScreenModal, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function PlanTemplateModal({
  onClose,
  onStart,
  template,
  visible,
}: {
  onClose: () => void;
  onStart: (template: BiblePlanTemplate, startDate: string) => Promise<void>;
  template?: BiblePlanTemplate;
  visible: boolean;
}) {
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const insets = useSafeAreaInsets();
  const [startDate, setStartDate] = useState(todayDateKey());
  const [starting, setStarting] = useState(false);
  const days = useMemo(() => (template ? planTemplateDays(template) : []), [template]);

  useEffect(() => {
    if (visible) setStartDate(todayDateKey());
  }, [visible, template?.id]);

  if (!template) return null;
  const title = template.title[language];
  const category = t(planCategoryTranslationKeys[template.category]);

  async function start() {
    if (!template || starting) return;
    setStarting(true);
    try {
      await onStart(template, startDate);
      onClose();
    } finally {
      setStarting(false);
    }
  }

  return (
    <FullScreenModal onRequestClose={onClose} visible={visible}>
      <View style={{ backgroundColor: colors.cream, flex: 1, paddingTop: insets.top }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 18, paddingVertical: 14 }}>
          <Pressable
            accessibilityLabel={t("bible.plans.create.cancel")}
            accessibilityRole="button"
            onPress={onClose}
            style={{ alignItems: "center", height: 42, justifyContent: "center", width: 42 }}
          >
            <Feather color={colors.ink} name="x" size={21} />
          </Pressable>
          <Text numberOfLines={1} style={[typography.heading, { color: colors.ink, flex: 1, fontSize: 20, lineHeight: 26 }]}>
            {t("bible.plans.library.planTitle")}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ gap: 16, paddingBottom: Math.max(insets.bottom, 18) + 140 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 18 }}>
            <PlanCoverImage coverKey={template.coverKey} style={{ borderRadius: radius.xxl, height: 210 }}>
              <LinearGradient
                colors={["rgba(20, 12, 6, 0)", "rgba(20, 12, 6, 0.18)", "rgba(20, 12, 6, 0.84)"]}
                locations={[0, 0.4, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{ bottom: 0, left: 0, padding: 18, position: "absolute", right: 0 }}
              >
                <Text style={[typography.sectionLabel, { color: "#FFD9BA", fontSize: 10, letterSpacing: 1.4 }]}>
                  {category}
                </Text>
                <Text style={[typography.heading, { color: "#FFFFFF" }]}>{title}</Text>
              </LinearGradient>
            </PlanCoverImage>
          </View>

          <View style={{ gap: 12, paddingHorizontal: 18 }}>
            <BodyText style={{ color: colors.muted, lineHeight: 22 }}>{template.description[language]}</BodyText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <StatPill icon="calendar" label={t("bible.plans.library.days", { count: template.dayCount })} />
              <StatPill icon="clock" label={t("bible.plans.library.minutes", { minutes: template.minutesPerDay })} />
            </View>
          </View>

          <View style={{ paddingHorizontal: 18 }}>
            <StartDateChoice language={language} onChange={setStartDate} value={startDate} />
          </View>

          <View style={{ gap: 8, paddingHorizontal: 18 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.library.preview")}</Text>
            {days.slice(0, 3).map((day) => (
              <View
                key={day.dayNumber}
                style={{
                  backgroundColor: shadcn.card,
                  borderColor: shadcn.border,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  gap: 4,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={[typography.label, { color: colors.ink }]}>
                    {t("bible.plans.checklist.day", { day: day.dayNumber })}
                  </Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {t("bible.plans.library.minutesShort", { minutes: planDayMinutes(day) || template.minutesPerDay })}
                  </Text>
                </View>
                <Text numberOfLines={2} style={[typography.caption, { color: colors.muted }]}>
                  {planReferencesLabel(day, bookLanguage)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={{
            backgroundColor: colors.cream,
            borderTopColor: colors.line,
            borderTopWidth: 1,
            bottom: 0,
            gap: 8,
            left: 0,
            paddingBottom: Math.max(insets.bottom, 14),
            paddingHorizontal: 18,
            paddingTop: 12,
            position: "absolute",
            right: 0,
          }}
        >
          <PrimaryButton icon="play" loading={starting} onPress={start}>
            {starting ? t("bible.plans.library.starting") : t("bible.plans.library.start")}
          </PrimaryButton>
          <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>
            {t("bible.plans.library.startsOn", {
              date: formatPlanDate(startDate, language, { weekday: "long", month: "long", day: "numeric" }),
            })}
          </Text>
        </View>
      </View>
    </FullScreenModal>
  );
}

function StatPill({ icon, label }: { icon: "calendar" | "clock"; label: string }) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: shadcn.secondary,
        borderColor: shadcn.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        minHeight: 34,
        paddingHorizontal: 11,
      }}
    >
      <Feather color={colors.muted} name={icon} size={14} />
      <Text style={[typography.caption, { color: colors.ink }]}>{label}</Text>
    </View>
  );
}

export function PlanDetailModal({
  canAnnounce = false,
  onAnnounce,
  onClose,
  onEdit,
  onJump,
  plan,
  visible,
}: {
  canAnnounce?: boolean;
  onAnnounce?: (plan: BiblePlan) => void;
  onClose: () => void;
  onEdit?: (plan: BiblePlan) => void;
  onJump: (dayNumber: number) => void;
  plan?: BiblePlan;
  visible: boolean;
}) {
  const { dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const insets = useSafeAreaInsets();
  const [savingDay, setSavingDay] = useState<number | undefined>();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(todayDateKey());

  useEffect(() => {
    if (!visible) return;
    setScheduleOpen(false);
    setScheduleDate(plan?.startDate ?? todayDateKey());
  }, [visible, plan?.id]);

  if (!plan) return null;
  const today = todayDateKey();
  const pace = planPace(plan, today);
  const percent = completionPercent(plan.days.filter((day) => day.completedAt).length, plan.days.length);
  const title = displayPlanTitle(plan, language);
  const description = displayPlanDescription(plan, language);
  const template = planTemplateById(plan.templateId);
  const category = template ? t(planCategoryTranslationKeys[template.category]) : t("bible.plans.library.customCategory");
  const coverKey = planCoverKey(plan);
  const currentDay = pace.today ?? pace.next;

  async function toggleDay(dayNumber: number, read: boolean) {
    if (!plan) return;
    setSavingDay(dayNumber);
    try {
      await dispatch({ type: "markBiblePlanDay", planId: plan.id, dayNumber, read });
    } finally {
      setSavingDay(undefined);
    }
  }

  async function saveSchedule() {
    if (!plan) return;
    try {
      await dispatch({ type: "rescheduleBiblePlan", planId: plan.id, startDate: scheduleDate });
      setScheduleOpen(false);
    } catch {
      // The store exposes the error.
    }
  }

  function confirmRestart() {
    if (!plan) return;
    const planId = plan.id;
    confirmAction({
      title: t("bible.plans.plan.restartTitle"),
      message: t("bible.plans.plan.restartMessage"),
      confirmText: t("bible.plans.plan.restartConfirm"),
      cancelText: t("bible.plans.create.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "restartBiblePlan", planId, startDate: today }).then(onClose);
      },
    });
  }

  function confirmDelete() {
    if (!plan) return;
    const planId = plan.id;
    confirmAction({
      title: t("bible.plans.plan.deleteTitle"),
      message: t("bible.plans.plan.deleteMessage"),
      confirmText: t("bible.plans.plan.deleteConfirm"),
      cancelText: t("bible.plans.create.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteBiblePlan", id: planId }).then(onClose);
      },
    });
  }

  return (
    <FullScreenModal onRequestClose={onClose} visible={visible}>
      <View style={{ backgroundColor: colors.cream, flex: 1, paddingTop: insets.top }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 18, paddingVertical: 12 }}>
          <Pressable
            accessibilityLabel={t("bible.plans.create.cancel")}
            accessibilityRole="button"
            onPress={onClose}
            style={{ alignItems: "center", height: 42, justifyContent: "center", width: 42 }}
          >
            <Feather color={colors.ink} name="arrow-left" size={21} />
          </Pressable>
          <Text numberOfLines={1} style={[typography.heading, { color: colors.ink, flex: 1, fontSize: 20, lineHeight: 26 }]}>
            {t("bible.plans.detail.title")}
          </Text>
        </View>

        <FlatList
          contentContainerStyle={{ gap: 14, paddingBottom: Math.max(insets.bottom, 18) + 28, paddingHorizontal: 18 }}
          data={plan.days}
          initialNumToRender={12}
          keyExtractor={(item) => String(item.dayNumber)}
          ListHeaderComponent={
            <View style={{ gap: 14 }}>
              <PlanCoverImage coverKey={coverKey} style={{ borderRadius: radius.xxl, height: 190 }}>
                <LinearGradient
                  colors={["rgba(20, 12, 6, 0)", "rgba(20, 12, 6, 0.2)", "rgba(20, 12, 6, 0.84)"]}
                  locations={[0, 0.4, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={{ bottom: 0, left: 0, padding: 18, position: "absolute", right: 0 }}
                >
                  <Text style={[typography.sectionLabel, { color: "#FFD9BA", fontSize: 10, letterSpacing: 1.4 }]}>
                    {category ?? t("bible.plans.library.templateLabel")}
                  </Text>
                  <Text style={[typography.heading, { color: "#FFFFFF" }]}>{title}</Text>
                </LinearGradient>
              </PlanCoverImage>

              <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
                <PlanProgressRing percent={percent} size={58} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[typography.cardTitle, { color: colors.ink }]}>
                    {t("bible.plans.plan.metadataShort", {
                      days: plan.days.length,
                      progress: t("bible.plans.progress", { percent }),
                    })}
                  </Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {plan.pausedAt
                      ? t("bible.plans.paused")
                      : pace.notStarted
                        ? t("bible.plans.today.starts", { date: formatPlanDate(plan.startDate, language, { month: "short", day: "numeric" }) })
                        : pace.behind > 0
                          ? t("bible.plans.today.behind", { count: pace.behind })
                          : pace.todayCompleted
                            ? t("bible.plans.today.completed")
                            : t("bible.plans.plan.onTrack")}
                  </Text>
                </View>
              </View>

              <PlanProgressBar percent={percent} />
              <PlanWeekStrip date={today} plan={plan} />
              {plan.status === "completed" ? (
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: shadcn.successSoft,
                    borderColor: "#BBF7D0",
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: 12,
                    padding: 14,
                  }}
                >
                  <View style={{ alignItems: "center", backgroundColor: "#DCFCE7", borderRadius: 999, height: 42, justifyContent: "center", width: 42 }}>
                    <Feather color={shadcn.success} name="award" size={21} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[typography.cardTitle, { color: shadcn.success }]}>{t("bible.plans.plan.finishedTitle")}</Text>
                    <Text style={[typography.caption, { color: "#166534" }]}>{t("bible.plans.plan.finishedBody")}</Text>
                  </View>
                </View>
              ) : null}
              {description ? <BodyText style={{ color: colors.muted }}>{description}</BodyText> : null}

              <View style={{ gap: 8 }}>
                {currentDay ? (
                  <PrimaryButton icon="book-open" onPress={() => { onJump(currentDay.dayNumber); onClose(); }}>
                    {t(pace.today ? "bible.plans.today.continue" : "bible.plans.today.catchUp")}
                  </PrimaryButton>
                ) : null}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {plan.status !== "completed" ? (
                    <SecondaryButton
                      icon={plan.pausedAt ? "play" : "pause"}
                      onPress={() => {
                        if (plan.pausedAt) {
                          void dispatch({ type: "rescheduleBiblePlan", planId: plan.id, startDate: today });
                        } else {
                          void dispatch({ type: "pauseBiblePlan", planId: plan.id });
                        }
                      }}
                      style={{ flex: 1 }}
                    >
                      {t(plan.pausedAt ? "bible.plans.resume" : "bible.plans.pause")}
                    </SecondaryButton>
                  ) : null}
                  <SecondaryButton icon="calendar" onPress={() => setScheduleOpen(!scheduleOpen)} style={{ flex: 1 }}>
                    {t("bible.plans.reschedule")}
                  </SecondaryButton>
                </View>
                {scheduleOpen ? (
                  <View style={{ gap: 10 }}>
                    <StartDateChoice language={language} onChange={setScheduleDate} value={scheduleDate} />
                    <PrimaryButton icon="check" onPress={saveSchedule}>
                      {t("bible.plans.applySchedule")}
                    </PrimaryButton>
                  </View>
                ) : null}
                {canAnnounce && onAnnounce ? (
                  <SecondaryButton icon="users" onPress={() => onAnnounce(plan)}>
                    {t("bible.plans.plan.share")}
                  </SecondaryButton>
                ) : null}
                {onEdit && plan.source === "personal" && !plan.templateId && !plan.announcementId ? (
                  <SecondaryButton icon="edit-3" onPress={() => onEdit(plan)}>
                    {t("bible.plans.plan.edit")}
                  </SecondaryButton>
                ) : null}
                <SecondaryButton icon="rotate-ccw" onPress={confirmRestart}>
                  {t("bible.plans.plan.restart")}
                </SecondaryButton>
              </View>

              <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
                <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("bible.plans.detail.allDays")}</Text>
                <Pressable accessibilityRole="button" onPress={confirmDelete} style={{ alignItems: "center", flexDirection: "row", gap: 5, minHeight: 36 }}>
                  <Feather color={colors.danger} name="trash-2" size={14} />
                  <Text style={[typography.caption, { color: colors.danger }]}>{t("bible.plans.plan.deleteConfirm")}</Text>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <PlanDayRow
              day={item}
              disabled={savingDay === item.dayNumber}
              language={language}
              onOpen={() => { onJump(item.dayNumber); onClose(); }}
              onToggle={() => toggleDay(item.dayNumber, !item.completedAt)}
              plan={plan}
              today={today}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </FullScreenModal>
  );
}

function PlanDayRow({
  day,
  disabled,
  language,
  onOpen,
  onToggle,
  plan,
  today,
}: {
  day: BiblePlanDay;
  disabled: boolean;
  language: "en" | "sv";
  onOpen: () => void;
  onToggle: () => void;
  plan: BiblePlan;
  today: string;
}) {
  const { t } = useAppTranslation();
  const completed = Boolean(day.completedAt);
  const scheduledDate = formatPlanDate(
    scheduledPlanDate(plan, day.dayNumber),
    language,
    { weekday: "short", month: "short", day: "numeric" },
  );
  const isToday = scheduledPlanDate(plan, day.dayNumber) === today;
  const missed = !completed && scheduledPlanDate(plan, day.dayNumber) < today && day.ranges.length > 0;
  const hasReading = day.ranges.length > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !hasReading }}
      disabled={!hasReading}
      onPress={onOpen}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: isToday ? shadcn.brandSoft : shadcn.card,
        borderColor: isToday ? shadcn.brand : shadcn.border,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        minHeight: 72,
        opacity: !hasReading ? 0.6 : pressed ? 0.82 : 1,
        padding: 12,
      })}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: completed ? shadcn.brand : shadcn.secondary,
          borderRadius: radius.md,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Text style={[typography.caption, { color: completed ? "#FFFFFF" : colors.ink, fontWeight: "700" }]}>
          {day.dayNumber}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
          <Text style={[typography.label, { color: colors.ink }]}>
            {t("bible.plans.checklist.day", { day: day.dayNumber })}
          </Text>
          <Text style={[typography.caption, { color: missed ? colors.danger : colors.muted }]}>{scheduledDate}</Text>
        </View>
        <PlanDayReference day={day} style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }} />
        <Text style={[typography.caption, { color: colors.muted }]}>
          {t("bible.plans.library.minutesShort", { minutes: planDayMinutes(day) })}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={t(completed ? "bible.plans.markUnread" : "bible.plans.markRead")}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed, disabled: disabled || !hasReading }}
        disabled={disabled || !hasReading}
        onPress={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        style={{ alignItems: "center", height: 44, justifyContent: "center", opacity: disabled || !hasReading ? 0.45 : 1, width: 44 }}
      >
        <Feather color={completed ? shadcn.brand : colors.disabledText} name={completed ? "check-circle" : "circle"} size={23} />
      </Pressable>
    </Pressable>
  );
}
