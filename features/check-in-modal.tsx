import { useEffect, useState } from "react";
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
  SectionHeading,
  TextInputField,
} from "@/ui/app-components";
import { BibleVerseField } from "@/ui/bible-verse-field";
import { useAppTranslation } from "@/ui/app-language";
import { colors, platformShadow, radius } from "@/ui/theme";

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
  if (mood === "peaceful") return { background: colors.rhythmSoft, color: colors.textMuted };
  if (mood === "grateful") return { background: colors.warmSoft, color: colors.textMuted };
  if (mood === "heavy") return { background: colors.reflectionSoft, color: colors.textSecondary };
  if (mood === "anxious") return { background: colors.prayerSoft, color: colors.textMuted };
  if (mood === "hopeful") return { background: colors.warmSoft, color: colors.textMuted };
  return { background: colors.lavenderSoft, color: colors.textMuted };
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

  useEffect(() => {
    if (!visible || step !== "details") {
      setSubmitting(false);
      setSubmitError(undefined);
    }
  }, [step, visible]);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await onSubmit();
    } catch (error) {
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
      setSubmitting(false);
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
                <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31 }}>{t("community.checkIn.promptTitle")}</Text>
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
                <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31 }}>{t("community.checkIn.detailsTitle")}</Text>
                <BodyText muted>{t("community.checkIn.detailsBody")}</BodyText>
              </View>
              <View style={{ gap: 6 }}>
                <TextInputField
                  multiline
                  maxLength={350}
                  value={note}
                  onChangeText={(value) => onNote(value.slice(0, 350))}
                  onSubmitEditing={submit}
                  placeholder={t("community.checkIn.notePlaceholder")}
                  returnKeyType="send"
                  style={{ minHeight: 210 }}
                  submitBehavior="submit"
                />
                <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{note.length}/350</Text>
              </View>
              {selectedMood ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <MoodIcon mood={selectedMood.value} size={34} />
                  <Text style={{ color: colors.muted, flex: 1, fontSize: 13, fontWeight: "800" }}>{t(moodCopyKeys[selectedMood.value].label)}</Text>
                </View>
              ) : null}
              <BibleVerseField label={t("community.checkIn.scriptureOptional")} verses={verses} onChange={onVerses} />
              <View style={{ gap: 8, marginTop: 8 }}>
                <SectionHeading>{t("community.checkIn.shareWith")}</SectionHeading>
                <Pressable accessibilityRole="button" onPress={() => onShare(!share)}>
                  <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                    <RoomImage image={share ? roomImage : undefined} name={share ? roomName : t("community.checkIn.privateJournal")} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{share ? roomName : t("community.checkIn.privateJournal")}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                        {share ? t("community.checkIn.sharedWithCommunity", { name: roomName }) : t("community.checkIn.privateOnly")}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              </View>
              {submitError ? <BodyText style={{ color: colors.danger }}>{submitError}</BodyText> : null}
              <PrimaryButton disabled={submitting} icon="send" onPress={submit} style={{ minHeight: 58 }}>
                {submitting
                  ? t("community.checkIn.saving")
                  : share
                    ? t("community.checkIn.shareAction")
                    : t("community.checkIn.savePrivateAction")}
              </PrimaryButton>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" }}>
                <Feather name="lock" size={13} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {share ? t("community.checkIn.sharedNotice", { name: roomName }) : t("community.checkIn.privateNotice")}
                </Text>
              </View>
            </>
          ) : null}

          {step === "thanks" ? (
            <View style={{ alignItems: "center", flex: 1, gap: 20, justifyContent: "center", minHeight: 560 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.accentSubtle,
                  borderRadius: 999,
                  height: 96,
                  justifyContent: "center",
                  width: 96,
                }}
              >
                <Feather name="heart" size={42} color={colors.gold} />
              </View>
              <View style={{ alignItems: "center", gap: 8 }}>
                <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>{t("community.checkIn.completionTitle")}</Text>
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
          backgroundColor: selected ? colors.accentSubtle : colors.paper,
          borderColor: selected ? colors.gold : colors.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          gap: 10,
          minHeight: 136,
          padding: 12,
          width: "100%",
          ...platformShadow({
            boxShadow: "0 8px 18px rgba(11, 18, 32, 0.04)",
            offset: { width: 0, height: 8 },
            opacity: 0.04,
            radius: 18,
          }),
        }}
      >
        <MoodIcon mood={option.value} />
        <View style={{ alignItems: "center", alignSelf: "stretch", gap: 4, minWidth: 0 }}>
          <Text style={{ color: colors.ink, flexShrink: 1, fontSize: 14, fontWeight: "900", lineHeight: 19, textAlign: "center" }}>{label}</Text>
          <Text style={{ color: colors.muted, flexShrink: 1, fontSize: 12, fontWeight: "700", lineHeight: 17, textAlign: "center" }}>{description}</Text>
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
