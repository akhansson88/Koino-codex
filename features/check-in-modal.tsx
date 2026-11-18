import { useEffect, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { heartMoods } from "@/state/product";
import { CheckInSubmissionError } from "@/state/check-ins";
import type { BibleVerse, GroupImage, HeartMood } from "@/state/types";
import {
  AppScreen,
  BodyText,
  Card,
  FullScreenModal,
  IconButton,
  PrimaryButton,
  RoomImage,
  SecondaryButton,
  TextInputField,
} from "@/ui/app-components";
import { BibleVerseField } from "@/ui/bible-verse-field";
import { useAppTranslation } from "@/ui/app-language";
import { FieldLabel } from "@/ui/shadcn";
import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";

export type CheckInStep = "choose" | "details" | "thanks";
const moodCopyKeys = {
  peaceful: {
    description: "community.checkIn.mood.peaceful.description",
    label: "community.checkIn.mood.peaceful.label",
  },
  grateful: {
    description: "community.checkIn.mood.grateful.description",
    label: "community.checkIn.mood.grateful.label",
  },
  heavy: {
    description: "community.checkIn.mood.heavy.description",
    label: "community.checkIn.mood.heavy.label",
  },
  anxious: {
    description: "community.checkIn.mood.anxious.description",
    label: "community.checkIn.mood.anxious.label",
  },
  hopeful: {
    description: "community.checkIn.mood.hopeful.description",
    label: "community.checkIn.mood.hopeful.label",
  },
  tired: {
    description: "community.checkIn.mood.tired.description",
    label: "community.checkIn.mood.tired.label",
  },
} as const satisfies Record<HeartMood, { description: string; label: string }>;

export function moodNumber(mood?: HeartMood) {
  if (mood === "grateful") return 5;
  if (mood === "peaceful" || mood === "hopeful") return 4;
  if (mood === "heavy" || mood === "anxious" || mood === "tired") return 2;
  return 3;
}

function moodToneFor(mood: HeartMood): { background: string; color: string } {
  if (mood === "peaceful") return { background: colors.rhythmSoft, color: colors.accentRhythm };
  if (mood === "grateful") return { background: colors.warmSoft, color: colors.accentWarm };
  if (mood === "heavy") return { background: colors.reflectionSoft, color: colors.accentReflection };
  if (mood === "anxious") return { background: colors.prayerSoft, color: colors.accentPrayer };
  if (mood === "hopeful") return { background: colors.warmSoft, color: shadcn.warning };
  return { background: colors.lavenderSoft, color: colors.clay };
}

export function CheckInModal({
  visible,
  step,
  mood,
  note,
  verses,
  roomName,
  roomImage,
  share,
  onBack,
  onClose,
  onDone,
  onMood,
  onNote,
  onShare,
  onSubmit,
  onVerses,
}: {
  visible: boolean;
  step: CheckInStep;
  mood?: HeartMood;
  note: string;
  verses: BibleVerse[];
  roomName: string;
  roomImage?: GroupImage;
  share: boolean;
  onBack: () => void;
  onClose: () => void;
  onDone: () => void;
  onMood: (value: HeartMood) => void;
  onNote: (value: string) => void;
  onShare: (value: boolean) => void;
  onSubmit: () => void | Promise<void>;
  onVerses: (verses: BibleVerse[]) => void;
}) {
  const { t } = useAppTranslation();
  const selectedMood = heartMoods.find((option) => option.value === mood);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [confirmation, setConfirmation] = useState<{ shared: boolean; communityName: string }>();
  const submittingRef = useRef(false);
  const submissionVersionRef = useRef(0);

  useEffect(() => {
    if (!visible || step === "choose") {
      submissionVersionRef.current += 1;
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitError(undefined);
      setConfirmation(undefined);
    }
  }, [step, visible]);

  useEffect(() => () => {
    submissionVersionRef.current += 1;
    submittingRef.current = false;
  }, []);

  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const submissionVersion = ++submissionVersionRef.current;
    // The same render's onSubmit captures this audience in both entry points.
    // Record it only after that attempt succeeds, independently of later props.
    const submittedAudience = { shared: share, communityName: roomName };
    setSubmitting(true);
    setSubmitError(undefined);
    setConfirmation(undefined);
    try {
      await onSubmit();
      if (submissionVersionRef.current === submissionVersion) setConfirmation(submittedAudience);
    } catch (error) {
      if (submissionVersionRef.current !== submissionVersion) return;
      if (error instanceof CheckInSubmissionError && error.code === "already_submitted") {
        setSubmitError(t("community.checkIn.alreadySubmitted"));
      } else if (error instanceof CheckInSubmissionError && error.code === "in_progress") {
        setSubmitError(t("community.checkIn.inProgress"));
      } else if (error instanceof CheckInSubmissionError && error.code === "unavailable") {
        setSubmitError(t("community.checkIn.unavailable"));
      } else {
        setSubmitError(t("community.checkIn.saveFailed"));
      }
    } finally {
      if (submissionVersionRef.current === submissionVersion) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
    <FullScreenModal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={submitting ? () => {} : step === "details" ? onBack : onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ backgroundColor: colors.cream, flex: 1 }}>
        <AppScreen topInset>
          {step !== "thanks" ? (
            <View style={{ alignItems: "center", flexDirection: "row" }}>
              <IconButton accessibilityLabel={t("community.checkIn.back")} icon="arrow-left" onPress={submitting ? () => {} : step === "choose" ? onClose : onBack} />
            </View>
          ) : null}

          {step === "choose" ? (
            <>
              <View style={{ gap: 7 }}>
                <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink }]}>{t("community.checkIn.promptTitle")}</Text>
                <BodyText muted>{t("community.checkIn.promptBody")}</BodyText>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {heartMoods.map((option) => (
                  <MoodOptionCard
                    accessibilityLabel={t("community.checkIn.stateAccessibility", {
                      description: t(moodCopyKeys[option.value].description),
                      label: t(moodCopyKeys[option.value].label),
                    })}
                    description={t(moodCopyKeys[option.value].description)}
                    key={option.value}
                    label={t(moodCopyKeys[option.value].label)}
                    option={option}
                    selected={option.value === mood}
                    onPress={() => onMood(option.value)}
                  />
                ))}
              </View>
              <SecondaryButton disabled={submitting} onPress={onClose}>{t("community.checkIn.skip")}</SecondaryButton>
            </>
          ) : null}

          {step === "details" ? (
            <>
              <View style={{ gap: 7 }}>
                <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink }]}>{t("community.checkIn.detailsTitle")}</Text>
                <BodyText muted>{t("community.checkIn.detailsBody")}</BodyText>
              </View>
              <View style={{ gap: 8 }}>
                <Text style={[typography.label, { color: colors.ink }]}>{t("community.checkIn.shareWith")}</Text>
                <Pressable
                  accessibilityLabel={share
                    ? t("community.checkIn.sharedNotice", { name: roomName })
                    : `${t("community.checkIn.privateOnly")}. ${t("community.checkIn.shareOptionLabel", { name: roomName })}`}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: share, disabled: submitting }}
                  disabled={submitting}
                  onPress={() => onShare(!share)}
                  style={({ pressed }) => ({ minHeight: 44, opacity: pressed ? 0.86 : 1 })}
                >
                  <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                    <RoomImage image={share ? roomImage : undefined} name={share ? roomName : t("community.checkIn.privateJournal")} size={36} />
                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, fontSize: 14 }]}>{share ? roomName : t("community.checkIn.privateJournal")}</Text>
                      <Text style={[typography.caption, { color: colors.muted }]}>
                        {share ? t("community.checkIn.sharedNotice", { name: roomName }) : t("community.checkIn.privateOnly")}
                      </Text>
                    </View>
                    <View
                      accessibilityElementsHidden
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                      style={{ alignItems: "center", backgroundColor: shadcn.secondary, borderRadius: radius.md, height: 34, justifyContent: "center", width: 34 }}
                    >
                      <Feather name={share ? "users" : "lock"} size={16} color={colors.ink} />
                    </View>
                  </Card>
                </Pressable>
              </View>
              <View style={{ gap: 6 }}>
                <FieldLabel>{t("community.checkIn.noteOptional")}</FieldLabel>
                <TextInputField
                  accessibilityLabel={t("community.checkIn.noteOptional")}
                  editable={!submitting}
                  multiline
                  maxLength={350}
                  value={note}
                  onChangeText={(value) => onNote(value.slice(0, 350))}
                  onSubmitEditing={submit}
                  placeholder={t("community.checkIn.notePlaceholder")}
                  returnKeyType="send"
                  style={{ minHeight: 120 }}
                  submitBehavior="submit"
                />
                <Text style={[typography.caption, { alignSelf: "flex-end", color: colors.muted }]}>{note.length}/350</Text>
              </View>
              {selectedMood ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <MoodIcon mood={selectedMood.value} size={34} />
                  <Text style={[typography.label, { color: colors.muted, flex: 1 }]}>{t(moodCopyKeys[selectedMood.value].label)}</Text>
                </View>
              ) : null}
              <BibleVerseField label={t("community.checkIn.scriptureOptional")} verses={verses} onChange={onVerses} />
              {submitError ? <BodyText accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: colors.danger }}>{submitError}</BodyText> : null}
              <PrimaryButton disabled={submitting} icon="send" onPress={submit}>
                {submitting
                  ? t("community.checkIn.saving")
                  : share
                    ? t("community.checkIn.shareAction")
                    : t("community.checkIn.savePrivateAction")}
              </PrimaryButton>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center", minWidth: 0 }}>
                <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
                  <Feather name={share ? "users" : "lock"} size={13} color={colors.muted} />
                </View>
                <Text style={[typography.caption, { color: colors.muted, flexShrink: 1 }]}>
                  {share ? t("community.checkIn.sharedNotice", { name: roomName }) : t("community.checkIn.privateNotice")}
                </Text>
              </View>
            </>
          ) : null}

          {step === "thanks" && !confirmation ? (
            <View style={{ gap: 16 }}>
              <BodyText accessibilityLiveRegion="polite" muted>
                {t(submitting ? "community.checkIn.saving" : "community.checkIn.completionBody")}
              </BodyText>
              {!submitting ? <PrimaryButton onPress={onDone}>{t("community.checkIn.done")}</PrimaryButton> : null}
            </View>
          ) : null}
          {step === "thanks" && confirmation ? (
            <View style={{ alignItems: "center", gap: 20, paddingVertical: 24 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: shadcn.primary,
                  borderRadius: 999,
                  height: 88,
                  justifyContent: "center",
                  width: 88,
                }}
              >
                <Feather name="heart" size={38} color={shadcn.primaryForeground} />
              </View>
              <View style={{ alignItems: "center", gap: 8 }}>
                <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink, textAlign: "center" }]}>
                  {confirmation.shared
                    ? t("community.checkIn.completionSharedTitle", { name: confirmation.communityName })
                    : t("community.checkIn.completionPrivateTitle")}
                </Text>
                <BodyText muted style={{ textAlign: "center" }}>
                  {t("community.checkIn.completionBody")}
                </BodyText>
              </View>
              <PrimaryButton onPress={onDone} style={{ alignSelf: "stretch" }}>
                {t("community.checkIn.done")}
              </PrimaryButton>
            </View>
          ) : null}
        </AppScreen>
      </KeyboardAvoidingView>
    </FullScreenModal>
  );
}

function MoodOptionCard({
  accessibilityLabel,
  description,
  label,
  onPress,
  option,
  selected,
}: {
  accessibilityLabel: string;
  description: string;
  label: string;
  onPress: () => void;
  option: (typeof heartMoods)[number];
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexBasis: "47%", flexGrow: 1, minWidth: 0 }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: selected ? shadcn.secondary : shadcn.card,
          borderColor: selected ? shadcn.primary : shadcn.border,
          borderRadius: radius.xl,
          borderWidth: 1,
          gap: 10,
          minHeight: 136,
          padding: 12,
          position: "relative",
          width: "100%",
          ...shadows.card,
        }}
      >
        {selected ? (
          <View
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              alignItems: "center",
              backgroundColor: shadcn.primary,
              borderRadius: 999,
              height: 20,
              justifyContent: "center",
              position: "absolute",
              right: 8,
              top: 8,
              width: 20,
            }}
          >
            <Feather name="check" size={12} color={shadcn.primaryForeground} />
          </View>
        ) : null}
        <MoodIcon mood={option.value} />
        <View style={{ alignItems: "center", alignSelf: "stretch", gap: 4, minWidth: 0 }}>
          <Text style={[typography.cardTitle, { color: colors.ink, flexShrink: 1, fontSize: 15, textAlign: "center" }]}>{label}</Text>
          <Text style={[typography.caption, { color: colors.muted, flexShrink: 1, textAlign: "center" }]}>{description}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MoodIcon({ mood, size = 48 }: { mood: HeartMood; size?: number }) {
  const tone = moodToneFor(mood);
  const icon = heartMoods.find((option) => option.value === mood)?.icon ?? "circle";
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: "center",
        backgroundColor: tone.background,
        borderRadius: 999,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Feather name={icon} size={Math.round(size * 0.45)} color={tone.color} />
    </View>
  );
}
