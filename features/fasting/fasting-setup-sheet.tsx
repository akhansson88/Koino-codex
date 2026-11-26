import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { fastDurationDays, fastEndAt, isFastDate } from "@/state/fasting";
import type { Fast } from "@/state/types";
import { AppSheet } from "@/ui/app-sheet";
import { BodyText, PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { formatFastDateTime } from "@/features/fasting/format";
import { localDayKey } from "@/state/store/helpers";

export type FastDraft = {
  startDate: string;
  durationDays: number;
  alertEnabled: boolean;
};

type Props = {
  visible: boolean;
  initial?: Fast;
  saving: boolean;
  error?: TranslationKey;
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

export function FastingSetupSheet({ visible, initial, saving, error, onClose, onSave }: Props) {
  const { t, language } = useAppTranslation();
  const [startDate, setStartDate] = useState(() => initial?.startDate ?? localDayKey(new Date()));
  const [daysText, setDaysText] = useState(() => String(initial?.durationDays ?? 21));
  const [alertEnabled, setAlertEnabled] = useState(initial?.alertEnabled ?? true);

  useEffect(() => {
    if (!visible) return;
    setStartDate(initial?.startDate ?? localDayKey(new Date()));
    setDaysText(String(initial?.durationDays ?? 21));
    setAlertEnabled(initial?.alertEnabled ?? true);
  }, [visible, initial?.id]);

  const today = localDayKey(new Date());
  const durationDays = fastDurationDays(daysText);
  const valid = isFastDate(startDate) && Boolean(durationDays);
  const endAt = useMemo(
    () => (isFastDate(startDate) && durationDays ? fastEndAt(startDate, durationDays) : undefined),
    [durationDays, startDate],
  );

  const quickDates = [
    { key: today, label: t("fasting.setup.today") },
    { key: shiftDay(today, 1), label: t("fasting.setup.tomorrow") },
    { key: nextMonday(today), label: t("fasting.setup.nextMonday") },
  ];

  function changeDays(next: number) {
    const clamped = Math.max(1, Math.min(365, next));
    setDaysText(String(clamped));
  }

  function save() {
    if (!valid || !durationDays || saving) return;
    onSave({ startDate, durationDays, alertEnabled });
  }

  return (
    <AppSheet
      onClose={onClose}
      scroll
      title={initial ? t("fasting.setup.editTitle") : t("fasting.setup.title")}
      visible={visible}
    >
      <View style={{ gap: 8 }}>
        <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.startDate")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {quickDates.map((option) => {
            const active = startDate === option.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
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
                  paddingHorizontal: 6,
                }}
              >
                <Text numberOfLines={1} style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View
          style={{
            alignItems: "center",
            backgroundColor: shadcn.card,
            borderColor: shadcn.border,
            borderRadius: radius.md,
            borderWidth: 1,
            flexDirection: "row",
            minHeight: 52,
            paddingHorizontal: 4,
          }}
        >
          <Pressable
            accessibilityLabel={t("fasting.setup.previousDay")}
            accessibilityRole="button"
            onPress={() => setStartDate((value) => shiftDay(value, -1))}
            style={({ pressed }) => ({ alignItems: "center", height: 44, justifyContent: "center", opacity: pressed ? 0.55 : 1, width: 48 })}
          >
            <Feather color={colors.ink} name="chevron-left" size={20} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.bodyMedium, { color: colors.ink, textAlign: "center" }]}>
              {new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en-GB", {
                day: "numeric",
                month: "long",
                weekday: "long",
              }).format(new Date(`${startDate}T12:00:00`))}
            </Text>
            {startDate === today ? (
              <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("fasting.setup.today")}</Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t("fasting.setup.nextDay")}
            accessibilityRole="button"
            onPress={() => setStartDate((value) => shiftDay(value, 1))}
            style={({ pressed }) => ({ alignItems: "center", height: 44, justifyContent: "center", opacity: pressed ? 0.55 : 1, width: 48 })}
          >
            <Feather color={colors.ink} name="chevron-right" size={20} />
          </Pressable>
        </View>
        <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.setup.midnight")}</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[typography.label, { color: colors.ink }]}>{t("fasting.setup.duration")}</Text>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Pressable
            accessibilityLabel={t("fasting.setup.decrease")}
            accessibilityRole="button"
            disabled={Boolean(durationDays) && durationDays! <= 1}
            onPress={() => changeDays((durationDays ?? 1) - 1)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: shadcn.card,
              borderColor: shadcn.border,
              borderRadius: radius.md,
              borderWidth: 1,
              height: 56,
              justifyContent: "center",
              opacity: pressed ? 0.55 : 1,
              width: 56,
            })}
          >
            <Feather color={colors.ink} name="minus" size={21} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <TextInputField
              accessibilityLabel={t("fasting.setup.duration")}
              keyboardType="number-pad"
              maxLength={3}
              onChangeText={(value) => setDaysText(value.replace(/[^0-9]/g, ""))}
              selectTextOnFocus
              style={{ fontSize: 24, fontWeight: "700", minHeight: 56, textAlign: "center" }}
              value={daysText}
            />
          </View>
          <Pressable
            accessibilityLabel={t("fasting.setup.increase")}
            accessibilityRole="button"
            disabled={Boolean(durationDays) && durationDays! >= 365}
            onPress={() => changeDays((durationDays ?? 0) + 1)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: shadcn.card,
              borderColor: shadcn.border,
              borderRadius: radius.md,
              borderWidth: 1,
              height: 56,
              justifyContent: "center",
              opacity: pressed ? 0.55 : 1,
              width: 56,
            })}
          >
            <Feather color={colors.ink} name="plus" size={21} />
          </Pressable>
        </View>
        <Text style={[typography.caption, { color: valid ? colors.muted : colors.danger }]}>
          {t(valid ? "fasting.setup.durationHint" : "fasting.setup.durationError")}
        </Text>
      </View>

      <View style={{ backgroundColor: colors.line, height: 1 }} />

      <View style={{ gap: 4 }}>
        <Text style={[typography.bodyMedium, { color: colors.ink }]}>
          {endAt ? t("fasting.setup.ends", { date: formatFastDateTime(endAt, language) }) : ""}
        </Text>
      </View>

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

      {error ? <BodyText muted>{t(error)}</BodyText> : null}

      <PrimaryButton disabled={!valid} loading={saving} onPress={save}>
        {t(initial ? "fasting.setup.saveChanges" : "fasting.setup.save")}
      </PrimaryButton>
    </AppSheet>
  );
}
