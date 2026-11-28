import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import {
  eventDefaultDuration,
  eventDescriptionLimit,
  eventDurationOptions,
  eventKindKey,
  eventKinds,
  eventLocationLimit,
  eventReminderChoices,
  eventTitleLimit,
  formatDuration,
  localEventDayKey,
} from "@/state/events";
import type { EventDraft } from "@/state/events";
import type { GroupEvent, GroupEventKind } from "@/state/types";
import { AppScreen, BodyText, FullScreenModal, IconButton, PrimaryButton, SecondaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { addDays, combineLocalDateAndTime, dateFromDayKey, dayKeyFor, localTimeValue } from "@/features/events/calendar";
import { localeFor } from "@/ui/localization";
import type { AppLanguage } from "@/ui/localization";

type EventFormScreenProps = {
  event?: GroupEvent;
  groupName: string;
  language: AppLanguage;
  onClose: () => void;
  onSubmit: (draft: EventDraft) => Promise<void> | void;
  saving: boolean;
  visible: boolean;
};

const reminderLabelKeys = {
  1440: "events.reminder.day",
  60: "events.reminder.hour",
  15: "events.reminder.quarter",
} as const;

function shiftTime(value: string, minutes: number) {
  const base = combineLocalDateAndTime("2000-01-01", value) ?? new Date(2000, 0, 1, 18, 0, 0, 0);
  const next = new Date(base.getTime() + minutes * 60000);
  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
}

export function EventFormScreen({ event, groupName, language, onClose, onSubmit, saving, visible }: EventFormScreenProps) {
  const { t } = useAppTranslation();
  const [kind, setKind] = useState<GroupEventKind>("prayer_meeting");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dayKey, setDayKey] = useState(dayKeyFor(new Date()));
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState<number>(eventDefaultDuration);
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [reminders, setReminders] = useState<number[]>([1440, 60]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    if (event) {
      setKind(event.kind);
      setTitle(event.title);
      setDescription(event.description ?? "");
      setDayKey(localEventDayKey(event.startAt));
      setTime(localTimeValue(event.startAt));
      setDuration(Math.max(15, Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000)));
      setLocation(event.location ?? "");
      setMeetingUrl(event.meetingUrl ?? "");
      setReminders(event.reminderMinutes ?? [1440, 60]);
    } else {
      setKind("prayer_meeting");
      setTitle("");
      setDescription("");
      setDayKey(dayKeyFor(new Date()));
      setTime("18:00");
      setDuration(eventDefaultDuration);
      setLocation("");
      setMeetingUrl("");
      setReminders([1440, 60]);
    }
    setError("");
  }, [event, visible]);

  const date = useMemo(() => dateFromDayKey(dayKey), [dayKey]);
  const todayKey = dayKeyFor(new Date());
  const tomorrowKey = dayKeyFor(addDays(new Date(), 1));
  const start = useMemo(() => combineLocalDateAndTime(dayKey, time), [dayKey, time]);
  const end = useMemo(() => (start ? new Date(start.getTime() + duration * 60000) : undefined), [duration, start]);

  function toggleReminder(value: number) {
    setReminders((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value].sort((left, right) => right - left));
  }

  async function submit() {
    setError("");
    if (!title.trim()) {
      setError(t("events.form.titleRequired"));
      return;
    }
    if (!start || !end) {
      setError(t("events.form.timeInvalid"));
      return;
    }
    if (end.getTime() <= Date.now() && !event) {
      setError(t("events.form.timePast"));
      return;
    }
    try {
      await onSubmit({
        kind,
        title: title.trim(),
        description: description.trim() || undefined,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: location.trim() || undefined,
        meetingUrl: meetingUrl.trim() || undefined,
        reminderMinutes: reminders,
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t("events.form.saveFailed"));
    }
  }

  return (
    <FullScreenModal animationType="slide" onRequestClose={onClose} visible={visible}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <IconButton accessibilityLabel={t("common.close")} icon="x" onPress={onClose} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[typography.title, { color: colors.ink, fontSize: 24 }]}>
              {event ? t("events.form.editTitle") : t("events.form.createTitle")}
            </Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>{groupName}</Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("events.form.kind")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {eventKinds.map((value) => {
              const active = value === kind;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={value}
                  onPress={() => setKind(value)}
                  style={{
                    backgroundColor: active ? shadcn.primary : shadcn.card,
                    borderColor: active ? shadcn.primary : shadcn.border,
                    borderRadius: 999,
                    borderWidth: 1,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                    {t(eventKindKey(value))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("events.form.title")}</Text>
          <TextInputField
            accessibilityLabel={t("events.form.title")}
            maxLength={eventTitleLimit}
            onChangeText={setTitle}
            placeholder={t("events.form.titlePlaceholder")}
            value={title}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("events.form.description")}</Text>
          <TextInputField
            accessibilityLabel={t("events.form.description")}
            maxLength={eventDescriptionLimit}
            multiline
            onChangeText={setDescription}
            placeholder={t("events.form.descriptionPlaceholder")}
            style={{ minHeight: 96, textAlignVertical: "top" }}
            value={description}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("events.form.when")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { key: todayKey, label: t("events.form.today") },
              { key: tomorrowKey, label: t("events.form.tomorrow") },
            ].map((option) => {
              const active = dayKey === option.key;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={option.key}
                  onPress={() => setDayKey(option.key)}
                  style={{
                    backgroundColor: active ? shadcn.primary : shadcn.card,
                    borderColor: active ? shadcn.primary : shadcn.border,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    flex: 1,
                    minHeight: 40,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.stepperRow, { backgroundColor: shadcn.card, borderColor: shadcn.border }]}>
            <Pressable accessibilityLabel={t("events.form.previousDay")} accessibilityRole="button" onPress={() => setDayKey(dayKeyFor(addDays(date, -1)))} style={styles.stepperButton}>
              <Feather color={colors.ink} name="chevron-left" size={19} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyMedium, { color: colors.ink, textAlign: "center" }]}>
                {new Intl.DateTimeFormat(localeFor(language), { weekday: "long", month: "long", day: "numeric" }).format(date)}
              </Text>
            </View>
            <Pressable accessibilityLabel={t("events.form.nextDay")} accessibilityRole="button" onPress={() => setDayKey(dayKeyFor(addDays(date, 1)))} style={styles.stepperButton}>
              <Feather color={colors.ink} name="chevron-right" size={19} />
            </Pressable>
          </View>
          <View style={[styles.stepperRow, { backgroundColor: shadcn.card, borderColor: shadcn.border }]}>
            <Pressable accessibilityLabel={t("events.form.earlier")} accessibilityRole="button" onPress={() => setTime(shiftTime(time, -15))} style={styles.stepperButton}>
              <Feather color={colors.ink} name="minus" size={18} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[typography.title, { color: colors.ink, textAlign: "center" }]}>{time}</Text>
              <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("events.form.startTime")}</Text>
            </View>
            <Pressable accessibilityLabel={t("events.form.later")} accessibilityRole="button" onPress={() => setTime(shiftTime(time, 15))} style={styles.stepperButton}>
              <Feather color={colors.ink} name="plus" size={18} />
            </Pressable>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[typography.caption, { color: colors.muted }]}>{t("events.form.duration")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {eventDurationOptions.map((minutes) => {
                const active = duration === minutes;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    key={minutes}
                    onPress={() => setDuration(minutes)}
                    style={{
                      backgroundColor: active ? shadcn.secondary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={[typography.caption, { color: colors.ink }]}>{formatDuration(minutes, t)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("events.form.location")}</Text>
          <TextInputField
            accessibilityLabel={t("events.form.location")}
            maxLength={eventLocationLimit}
            onChangeText={setLocation}
            placeholder={t("events.form.locationPlaceholder")}
            value={location}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("events.form.link")}</Text>
          <TextInputField
            accessibilityLabel={t("events.form.link")}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setMeetingUrl}
            placeholder="https://"
            value={meetingUrl}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("events.form.reminders")}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{t("events.form.remindersBody")}</Text>
          <View style={{ gap: 0 }}>
            {eventReminderChoices.map((minutes) => (
              <View key={minutes} style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 48 }}>
                <Text style={[typography.body, { color: colors.ink, flex: 1 }]}>{t(reminderLabelKeys[minutes])}</Text>
                <Switch
                  accessibilityLabel={t(reminderLabelKeys[minutes])}
                  onValueChange={() => toggleReminder(minutes)}
                  thumbColor={reminders.includes(minutes) ? colors.paper : colors.disabledText}
                  trackColor={{ false: colors.disabled, true: colors.gold }}
                  value={reminders.includes(minutes)}
                />
              </View>
            ))}
          </View>
        </View>

        {error ? (
          <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.danger }]}>{error}</Text>
        ) : null}

        <PrimaryButton icon="check" loading={saving} onPress={() => void submit()}>
          {event ? t("events.form.save") : t("events.form.create")}
        </PrimaryButton>
        <SecondaryButton disabled={saving} onPress={onClose}>{t("common.cancel")}</SecondaryButton>
        <BodyText muted>{t("events.form.notifyNote")}</BodyText>
      </AppScreen>
    </FullScreenModal>
  );
}

const styles = {
  stepperRow: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 4,
  } as const,
  stepperButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  } as const,
};
