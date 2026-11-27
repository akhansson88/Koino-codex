import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import type { Fast, FastMode, FastSchedule } from "@/state/types";
import { buildFastPlan } from "@/state/fasting-plan";
import { cloneSchedule, defaultFastSchedule, fastDurationProblem, fastModeConfig, fastScheduleProblem } from "@/state/fasting-modes";
import { formatFastDateTime } from "@/features/fasting/format";
import { AppSheet } from "@/ui/app-sheet";
import { BodyText, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { localDayKey } from "@/state/store/helpers";

export type FastDraft = {
  mode: FastMode;
  schedule: FastSchedule;
  startDate: string;
  startTime: string;
  durationDays: number;
  durationHours?: number;
  alertEnabled: boolean;
  shareWithGroup: boolean;
};

type Props = {
  visible: boolean;
  mode: FastMode;
  initial?: Fast;
  saving: boolean;
  error?: TranslationKey;
  groupName?: string;
  locked?: boolean;
  defaultShare?: boolean;
  onClose: () => void;
  onSave: (draft: FastDraft) => void;
};

function shiftDay(dayKey: string, amount: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return localDayKey(new Date(year, month - 1, day + amount, 12, 0, 0, 0));
}

function nextMonday(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  const offset = (8 - date.getDay()) % 7 || 7;
  return shiftDay(dayKey, offset);
}

export function FastingSetupSheet({ visible, mode, initial, saving, error, groupName, locked, defaultShare, onClose, onSave }: Props) {
  const { t, language } = useAppTranslation();
  const config = fastModeConfig(mode);
  const [startDate, setStartDate] = useState(() => initial?.startDate ?? localDayKey(new Date()));
  const [startTime, setStartTime] = useState(() => initial?.schedule.kind === "weekly" ? initial.schedule.startTime : "00:00");
  const [durationDays, setDurationDays] = useState(() => initial?.durationDays ?? config.defaultDurationDays);
  const [durationHours, setDurationHours] = useState(() => initial?.durationHours ?? config.defaultDurationHours ?? 24);
  const [schedule, setSchedule] = useState<FastSchedule>(() => initial?.schedule ? cloneSchedule(initial.schedule) : defaultFastSchedule(mode));
  const [alertEnabled, setAlertEnabled] = useState(initial?.alertEnabled ?? true);
  const [shareWithGroup, setShareWithGroup] = useState(initial?.visibility === "group");
  const [safetyAccepted, setSafetyAccepted] = useState(Boolean(initial?.safetyAcceptedAt));
  const [localError, setLocalError] = useState<TranslationKey>();

  useEffect(() => {
    if (!visible) return;
    setStartDate(initial?.startDate ?? localDayKey(new Date()));
    setStartTime(initial?.schedule.kind === "weekly" ? initial.schedule.startTime : "00:00");
    setDurationDays(initial?.durationDays ?? config.defaultDurationDays);
    setDurationHours(initial?.durationHours ?? config.defaultDurationHours ?? 24);
    setSchedule(initial?.schedule ? cloneSchedule(initial.schedule) : defaultFastSchedule(mode));
    setAlertEnabled(initial?.alertEnabled ?? true);
    setShareWithGroup(initial?.visibility === "group" || Boolean(defaultShare && !initial));
    setSafetyAccepted(Boolean(initial?.safetyAcceptedAt));
    setLocalError(undefined);
  }, [visible, initial?.id, mode, defaultShare]);

  const family = config.family;
  const today = localDayKey(new Date());
  const quickDates = [
    { key: today, label: t("fasting.setup.today") },
    { key: shiftDay(today, 1), label: t("fasting.setup.tomorrow") },
    { key: nextMonday(today), label: t("fasting.setup.nextMonday") },
  ];

  const durationChoices = useMemo(() => {
    if (family === "continuous") {
      const max = config.maxDurationHours ?? 72;
      return [12, 16, 24, 36, 48, 72].filter((hours) => hours <= max);
    }
    if (family === "weekly") return [14, 28, 42];
    if (mode === "daniel") return [10, 21];
    if (mode === "until_1800") return [1, 3, 7, 14, 21];
    return [7, 14, 21, 30, 42];
  }, [config.maxDurationHours, family, mode]);

  const needsSafety = mode === "dry" || (family === "continuous" && durationHours > 48);
  const scheduleProblem = fastScheduleProblem(schedule);
  const durationProblem = fastDurationProblem(mode, durationDays, durationHours);
  const plan = useMemo(() => {
    try {
      return buildFastPlan({
        mode,
        schedule,
        startDate,
        startTime: family === "weekly" && schedule.kind === "weekly" ? schedule.startTime : startTime,
        durationDays,
        durationHours,
      });
    } catch {
      return undefined;
    }
  }, [durationDays, durationHours, family, mode, schedule, startDate, startTime]);

  function setDailyWindow(fastStart: string, fastEnd: string) {
    if (schedule.kind !== "daily") return;
    setSchedule({ ...schedule, fastStart, fastEnd });
  }

  function setWeeklyStart(value: string) {
    if (schedule.kind !== "weekly") return;
    setSchedule({ ...schedule, startTime: value });
    setStartTime(value);
  }

  function toggleWeekday(value: number) {
    if (schedule.kind !== "weekly") return;
    const weekdays = schedule.weekdays.includes(value)
      ? schedule.weekdays.filter((day) => day !== value)
      : [...schedule.weekdays, value].sort((left, right) => left - right);
    setSchedule({ ...schedule, weekdays });
  }

  function save() {
    if (saving) return;
    if (durationProblem) {
      setLocalError(family === "continuous" ? "fasting.setup.durationHintHours" : "fasting.setup.durationHintDays");
      return;
    }
    if (scheduleProblem) {
      setLocalError(scheduleProblem === "weekdays" ? "fasting.setup.weekdays" : "fasting.setup.invalid");
      return;
    }
    if (needsSafety && !safetyAccepted) {
      setLocalError("fasting.setup.safetyRequired");
      return;
    }
    setLocalError(undefined);
    onSave({
      mode,
      schedule,
      startDate,
      startTime: family === "weekly" && schedule.kind === "weekly" ? schedule.startTime : startTime,
      durationDays,
      durationHours: family === "continuous" ? durationHours : undefined,
      alertEnabled,
      shareWithGroup: Boolean(shareWithGroup && groupName),
    });
  }

  const weekdayLabels = useMemo(() => {
    const locale = language === "sv" ? "sv-SE" : "en-GB";
    return [1, 2, 3, 4, 5, 6, 0].map((value) => ({
      value,
      label: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 10, 2 + (value === 0 ? 6 : value - 1))),
    }));
  }, [language]);

  const eatingPresets = mode === "if_16_8"
    ? [["12:00", "20:00"], ["10:00", "18:00"], ["13:00", "21:00"]]
    : mode === "if_18_6"
      ? [["13:00", "19:00"], ["12:00", "18:00"], ["14:00", "20:00"]]
      : mode === "if_20_4"
        ? [["16:00", "20:00"], ["15:00", "19:00"], ["17:00", "21:00"]]
        : [];

  const dailyPresets = mode === "until_1800"
    ? [
        { label: t("fasting.setup.presetMidnight"), start: "00:00", end: "18:00" },
        { label: t("fasting.setup.presetEvening"), start: "20:00", end: "18:00" },
      ]
    : eatingPresets.map(([eatStart, eatEnd]) => ({
        label: t("fasting.setup.eatingWindow", { start: eatStart, end: eatEnd }),
        start: eatEnd,
        end: eatStart,
      }));

  return (
    <AppSheet
      onClose={onClose}
      scroll
      title={initial ? t("fasting.setup.editTitle") : t(config.titleKey as TranslationKey)}
      visible={visible}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <View style={{ alignItems: "center", backgroundColor: shadcn.secondary, borderRadius: radius.md, height: 40, justifyContent: "center", width: 40 }}>
          <Feather color={colors.muted} name={config.icon as never} size={18} />
        </View>
        <BodyText muted>{t(config.shortKey as TranslationKey)}</BodyText>
      </View>

      {locked ? (
        <View style={{ backgroundColor: colors.warmSoft, borderRadius: radius.md, gap: 4, padding: 12 }}>
          <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t("fasting.dashboard.locked")}</Text>
          <BodyText muted>{t("fasting.setup.locked")}</BodyText>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.startDate")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {quickDates.map((option) => {
            const active = startDate === option.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                disabled={locked}
                key={option.label}
                onPress={() => setStartDate(option.key)}
                style={{
                  alignItems: "center",
                  backgroundColor: active ? shadcn.primary : shadcn.card,
                  borderColor: active ? shadcn.primary : shadcn.border,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  flex: 1,
                  justifyContent: "center",
                  minHeight: 42,
                  opacity: locked ? 0.5 : 1,
                  paddingHorizontal: 6,
                }}
              >
                <Text numberOfLines={1} style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ alignItems: "center", backgroundColor: shadcn.card, borderColor: shadcn.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", minHeight: 52, paddingHorizontal: 4 }}>
          <Pressable
            accessibilityLabel={t("fasting.setup.previousDay")}
            accessibilityRole="button"
            disabled={locked}
            onPress={() => setStartDate((value) => shiftDay(value, -1))}
            style={({ pressed }) => ({ alignItems: "center", height: 44, justifyContent: "center", opacity: locked ? 0.4 : pressed ? 0.55 : 1, width: 48 })}
          >
            <Feather color={colors.ink} name="chevron-left" size={20} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.bodyMedium, { color: colors.ink, textAlign: "center" }]}>
              {new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "long", weekday: "long" }).format(new Date(`${startDate}T12:00:00`))}
            </Text>
            {startDate === today ? <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("fasting.setup.today")}</Text> : null}
          </View>
          <Pressable
            accessibilityLabel={t("fasting.setup.nextDay")}
            accessibilityRole="button"
            disabled={locked}
            onPress={() => setStartDate((value) => shiftDay(value, 1))}
            style={({ pressed }) => ({ alignItems: "center", height: 44, justifyContent: "center", opacity: locked ? 0.4 : pressed ? 0.55 : 1, width: 48 })}
          >
            <Feather color={colors.ink} name="chevron-right" size={20} />
          </Pressable>
        </View>
      </View>

      {family === "continuous" ? (
        <>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.startTime")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["00:00", "06:00", "12:00", "18:00", "20:00"].map((value) => {
                const active = startTime === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={value}
                    onPress={() => setStartTime(value)}
                    style={{
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      minWidth: 64,
                      opacity: locked ? 0.5 : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink, textAlign: "center" }]}>{value}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.length")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {durationChoices.map((value) => {
                const active = durationHours === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={value}
                    onPress={() => setDurationHours(value)}
                    style={{
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      opacity: locked ? 0.5 : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                      {t("fasting.setup.hours", { count: value })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {t("fasting.setup.durationHintHours", { max: config.maxDurationHours ?? 72 })}
            </Text>
          </View>
        </>
      ) : null}

      {family === "daily" ? (
        <>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.length")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {durationChoices.map((value) => {
                const active = durationDays === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={value}
                    onPress={() => setDurationDays(value)}
                    style={{
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      opacity: locked ? 0.5 : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                      {t("fasting.setup.days", { count: value })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.window")}</Text>
            <View style={{ gap: 8 }}>
              {dailyPresets.map((preset) => {
                const active = schedule.kind === "daily" && schedule.fastStart === preset.start && schedule.fastEnd === preset.end;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={preset.label}
                    onPress={() => setDailyWindow(preset.start, preset.end)}
                    style={{
                      backgroundColor: active ? colors.warmSoft : shadcn.card,
                      borderColor: active ? shadcn.brand : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      opacity: locked ? 0.5 : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={[typography.bodyMedium, { color: colors.ink }]}>{preset.label}</Text>
                    <Text style={[typography.caption, { color: colors.muted }]}>
                      {t("fasting.setup.fastingWindow", { start: preset.start, end: preset.end })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : null}

      {family === "weekly" ? (
        <>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.weekdays")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {weekdayLabels.map((day) => {
                const active = schedule.kind === "weekly" && schedule.weekdays.includes(day.value);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={day.value}
                    onPress={() => toggleWeekday(day.value)}
                    style={{
                      alignItems: "center",
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: 999,
                      borderWidth: 1,
                      height: 38,
                      justifyContent: "center",
                      opacity: locked ? 0.5 : 1,
                      width: 44,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>{day.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.setup.weekdaysHint")}</Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.startTime")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["16:00", "18:00", "20:00"].map((value) => {
                const active = schedule.kind === "weekly" && schedule.startTime === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={value}
                    onPress={() => setWeeklyStart(value)}
                    style={{
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      opacity: locked ? 0.5 : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>{value}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {mode === "monk" ? "36 h" : t("fasting.setup.hours", { count: schedule.kind === "weekly" ? schedule.durationHours : 24 })}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.length")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {durationChoices.map((value) => {
                const active = durationDays === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={value}
                    onPress={() => setDurationDays(value)}
                    style={{
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      opacity: locked ? 0.5 : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                      {t("fasting.setup.weeks", { count: value / 7 })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : null}

      {family === "partial" ? (
        <>
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.length")}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[10, 21].map((value) => {
                const active = durationDays === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={locked}
                    key={value}
                    onPress={() => setDurationDays(value)}
                    style={{
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      flex: 1,
                      opacity: locked ? 0.5 : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink, textAlign: "center" }]}>
                      {t("fasting.setup.days", { count: value })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ backgroundColor: colors.mossSurface, borderRadius: radius.md, gap: 6, padding: 12 }}>
            <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t("fasting.setup.danielNote")}</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.mode.daniel.eat")}</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.mode.daniel.avoid")}</Text>
          </View>
        </>
      ) : null}

      {plan ? (
        <View style={{ gap: 2 }}>
          <Text style={[typography.bodyMedium, { color: colors.ink }]}>
            {t("fasting.setup.planEnds", { date: formatFastDateTime(plan.endAt, language) })}
          </Text>
          <Text style={[typography.caption, { color: colors.muted }]}>
            {schedule.kind === "daily"
              ? t("fasting.setup.eatingWindow", {
                  start: schedule.fastEnd,
                  end: schedule.fastStart,
                })
              : schedule.kind === "weekly"
                ? t("fasting.setup.hours", { count: schedule.durationHours })
                : null}
          </Text>
        </View>
      ) : null}

      {needsSafety ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: safetyAccepted }}
          onPress={() => setSafetyAccepted((value) => !value)}
          style={{ alignItems: "flex-start", flexDirection: "row", gap: 10, paddingVertical: 4 }}
        >
          <View style={{ backgroundColor: safetyAccepted ? shadcn.primary : shadcn.card, borderColor: shadcn.border, borderRadius: 6, borderWidth: 1, height: 24, marginTop: 1, width: 24, alignItems: "center", justifyContent: "center" }}>
            {safetyAccepted ? <Feather color={shadcn.primaryForeground} name="check" size={15} /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t("fasting.setup.safety")}</Text>
            <BodyText muted>{t("fasting.setup.safetyHint")}</BodyText>
          </View>
        </Pressable>
      ) : null}

      <View style={{ backgroundColor: colors.line, height: 1 }} />

      <View style={{ alignItems: "center", flexDirection: "row", gap: 16, minHeight: 56 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("fasting.setup.alert")}</Text>
          <BodyText muted>{t("fasting.setup.alertHint")}</BodyText>
        </View>
        <Switch
          accessibilityLabel={t("fasting.setup.alert")}
          onValueChange={setAlertEnabled}
          thumbColor={alertEnabled ? colors.paper : colors.disabledText}
          trackColor={{ false: colors.disabled, true: colors.gold }}
          value={alertEnabled}
        />
      </View>

      {groupName ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 16, minHeight: 56 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("fasting.setup.share", { group: groupName })}</Text>
            <BodyText muted>{t("fasting.setup.shareHint")}</BodyText>
          </View>
          <Switch
            accessibilityLabel={t("fasting.setup.share", { group: groupName })}
            onValueChange={setShareWithGroup}
            thumbColor={shareWithGroup ? colors.paper : colors.disabledText}
            trackColor={{ false: colors.disabled, true: colors.gold }}
            value={shareWithGroup}
          />
        </View>
      ) : null}

      {localError || error ? <BodyText muted>{t(localError ?? error!)}</BodyText> : null}

      <PrimaryButton disabled={Boolean(scheduleProblem) || Boolean(durationProblem) || (needsSafety && !safetyAccepted)} loading={saving} onPress={save}>
        {t(initial ? "fasting.setup.saveChanges" : "fasting.setup.save")}
      </PrimaryButton>
    </AppSheet>
  );
}
