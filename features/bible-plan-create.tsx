import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { displayBibleReference } from "@/features/bible-book-names";
import {
  buildBiblePlanDays,
  formatPlanDate,
  todayDateKey,
} from "@/features/bible-plans";
import { addPlanDays, isPlanDate } from "@/state/bible-plan-schedule";
import { PlanPassagePicker } from "@/features/bible-plan-passage-picker";
import { StartDateChoice, planReferencesLabel } from "@/features/bible-plan-ui";
import type { BiblePlan, BiblePlanRange } from "@/state/types";
import { useKoino } from "@/state/koino-store";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { BodyText, FullScreenModal, PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const dayPresets = [7, 14, 21, 30, 90, 365];

export function CreatePlanModal({
  initialPlan,
  onClose,
  onSaved,
  visible,
}: {
  initialPlan?: BiblePlan;
  onClose: () => void;
  onSaved?: () => void;
  visible: boolean;
}) {
  const { dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [dayCount, setDayCount] = useState("7");
  const [startDate, setStartDate] = useState(todayDateKey());
  const [ranges, setRanges] = useState<BiblePlanRange[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editingRangeId, setEditingRangeId] = useState<string | undefined>();
  const [customPace, setCustomPace] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(initialPlan?.title ?? "");
    setDayCount(String(initialPlan?.dayCount ?? 7));
    setStartDate(initialPlan?.startDate ?? todayDateKey());
    setRanges(initialPlan?.ranges ?? []);
    setEditingRangeId(undefined);
    setPickerVisible(false);
    setCustomPace(Boolean(initialPlan && !dayPresets.includes(initialPlan.dayCount)));
    setSaving(false);
  }, [initialPlan, visible]);

  const numericDayCount = Number(dayCount);
  const validDayCount = Number.isInteger(numericDayCount) && numericDayCount > 0 && numericDayCount <= 3660;
  const preview = useMemo(
    () => (validDayCount && ranges.length ? buildBiblePlanDays(ranges, numericDayCount) : []),
    [numericDayCount, ranges, validDayCount],
  );
  const emptyDays = preview.filter((day) => day.ranges.length === 0).length;
  const canSave = !saving && title.trim().length > 0 && ranges.length > 0 && validDayCount && isPlanDate(startDate);
  const editingRange = editingRangeId ? ranges.find((range) => range.id === editingRangeId) : undefined;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (initialPlan) {
        await dispatch({
          type: "updateBiblePlan",
          id: initialPlan.id,
          title,
          ranges,
          dayCount: numericDayCount,
          startDate,
        });
      } else {
        await dispatch({
          type: "createBiblePlan",
          title,
          ranges,
          dayCount: numericDayCount,
          startDate,
        });
      }
      onSaved?.();
      onClose();
    } catch {
      // The store exposes the save error; keep the draft open.
    } finally {
      setSaving(false);
    }
  }

  function chooseRange(range: BiblePlanRange) {
    setRanges((current) => {
      if (!editingRangeId) return [...current, range];
      return current.map((item) => (item.id === editingRangeId ? range : item));
    });
    setEditingRangeId(undefined);
  }

  function removeRange(id: string) {
    setRanges((current) => current.filter((range) => range.id !== id));
  }

  return (
    <>
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
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.heading, { color: colors.ink, fontSize: 20, lineHeight: 26 }]}>
              {t(initialPlan ? "bible.plans.create.editTitle" : "bible.plans.create.title")}
            </Text>
            <Text style={[typography.caption, { color: colors.muted }]}>{t("bible.plans.create.description")}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(insets.bottom, 18) + 120 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 7 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.create.nameLabel")}</Text>
            <TextInputField
              accessibilityLabel={t("bible.plans.create.nameLabel")}
              onChangeText={setTitle}
              placeholder={t("bible.plans.create.namePlaceholder")}
              value={title}
            />
          </View>

          <StartDateChoice language={language} onChange={setStartDate} value={startDate} />

          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.create.pace")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {dayPresets.map((preset) => {
                const active = Number(dayCount) === preset && !customPace;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    key={preset}
                    onPress={() => {
                      setDayCount(String(preset));
                      setCustomPace(false);
                    }}
                    style={{
                      alignItems: "center",
                      backgroundColor: active ? shadcn.primary : shadcn.card,
                      borderColor: active ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      justifyContent: "center",
                      minHeight: 40,
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                      {preset}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: customPace }}
                onPress={() => setCustomPace(true)}
                style={{
                  alignItems: "center",
                  backgroundColor: customPace ? shadcn.primary : shadcn.card,
                  borderColor: customPace ? shadcn.primary : shadcn.border,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  justifyContent: "center",
                  minHeight: 40,
                  paddingHorizontal: 14,
                }}
              >
                <Text style={[typography.label, { color: customPace ? shadcn.primaryForeground : colors.ink }]}>
                  {t("bible.plans.create.customPace")}
                </Text>
              </Pressable>
            </View>
            {customPace ? (
              <View style={{ maxWidth: 160 }}>
                <TextInputField
                  accessibilityLabel={t("bible.plans.create.customDays")}
                  keyboardType="number-pad"
                  onChangeText={(value) => setDayCount(value.replace(/[^0-9]/g, ""))}
                  placeholder={t("bible.plans.create.customDays")}
                  style={{ textAlign: "center" }}
                  value={dayCount}
                />
              </View>
            ) : null}
            <BodyText muted>
              {validDayCount
                ? t("bible.plans.create.daysChosen", { count: numericDayCount })
                : t("bible.plans.create.invalidDays")}
            </BodyText>
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.create.passages")}</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>
                {ranges.length ? t("bible.plans.create.passageCount", { count: ranges.length }) : ""}
              </Text>
            </View>
            {ranges.map((range, index) => (
              <View
                key={range.id}
                style={{
                  backgroundColor: shadcn.card,
                  borderColor: shadcn.border,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: shadcn.brandSoft,
                      borderRadius: radius.md,
                      height: 30,
                      justifyContent: "center",
                      width: 30,
                    }}
                  >
                    <Text style={[typography.caption, { color: shadcn.brand, fontWeight: "700" }]}>{index + 1}</Text>
                  </View>
                  <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>
                    {displayBibleReference(range.displayReference, bookLanguage)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    accessibilityLabel={t("bible.plans.create.changePassage", { number: index + 1 })}
                    accessibilityRole="button"
                    onPress={() => {
                      setEditingRangeId(range.id);
                      setPickerVisible(true);
                    }}
                    style={{
                      alignItems: "center",
                      borderColor: shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      flex: 1,
                      flexDirection: "row",
                      gap: 6,
                      justifyContent: "center",
                      minHeight: 40,
                    }}
                  >
                    <Feather color={colors.ink} name="edit-3" size={15} />
                    <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.create.change")}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={t("bible.plans.create.removePassage", { number: index + 1 })}
                    accessibilityRole="button"
                    onPress={() => removeRange(range.id)}
                    style={{
                      alignItems: "center",
                      borderColor: colors.dangerBorder,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: 6,
                      justifyContent: "center",
                      minHeight: 40,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Feather color={colors.danger} name="trash-2" size={15} />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditingRangeId(undefined);
                setPickerVisible(true);
              }}
              style={{
                alignItems: "center",
                backgroundColor: shadcn.secondary,
                borderColor: shadcn.border,
                borderRadius: radius.lg,
                borderStyle: "dashed",
                borderWidth: 1,
                flexDirection: "row",
                gap: 8,
                justifyContent: "center",
                minHeight: 50,
              }}
            >
              <Feather color={colors.ink} name="plus" size={17} />
              <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.create.addPassage")}</Text>
            </Pressable>
          </View>

          {preview.length ? (
            <View style={{ gap: 8 }}>
              <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.create.preview")}</Text>
              {emptyDays > 0 ? (
                <Text style={[typography.caption, { color: shadcn.warning }]}>
                  {t("bible.plans.create.emptyDays", { count: emptyDays })}
                </Text>
              ) : null}
              {preview.slice(0, 5).map((day) => (
                <View
                  key={day.dayNumber}
                  style={{
                    backgroundColor: shadcn.card,
                    borderColor: shadcn.border,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    gap: 3,
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={[typography.label, { color: colors.ink }]}>
                      {t("bible.plans.checklist.day", { day: day.dayNumber })}
                    </Text>
                    <Text style={[typography.caption, { color: colors.muted }]}>
                      {formatPlanDate(addPlanDays(startDate, day.dayNumber - 1), language, { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={[typography.caption, { color: colors.muted }]}>
                    {day.ranges.length
                      ? planReferencesLabel(day, bookLanguage)
                      : t("bible.plans.plan.noReading")}
                  </Text>
                </View>
              ))}
              {preview.length > 5 ? (
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {t("bible.plans.create.moreDays", { count: preview.length - 5 })}
                </Text>
              ) : null}
            </View>
          ) : null}

          {!canSave && (title.trim() || ranges.length) ? (
            <Text style={[typography.caption, { color: colors.danger }]}>{t("bible.plans.create.invalid")}</Text>
          ) : null}
        </ScrollView>

        <View
          style={{
            backgroundColor: colors.cream,
            borderTopColor: colors.line,
            borderTopWidth: 1,
            bottom: 0,
            left: 0,
            paddingBottom: Math.max(insets.bottom, 14),
            paddingHorizontal: 18,
            paddingTop: 12,
            position: "absolute",
            right: 0,
          }}
        >
          <PrimaryButton disabled={!canSave} icon="check" loading={saving} onPress={save}>
            {saving
              ? t("bible.plans.create.saving")
              : t(initialPlan ? "bible.plans.create.saveChanges" : "bible.plans.create.save")}
          </PrimaryButton>
        </View>
      </View>
    </FullScreenModal>

      <PlanPassagePicker
        initialRange={editingRange}
        onClose={() => {
          setPickerVisible(false);
          setEditingRangeId(undefined);
        }}
        onSelect={chooseRange}
        visible={pickerVisible}
      />
    </>
  );
}
