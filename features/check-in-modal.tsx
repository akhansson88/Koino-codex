import type { ComponentProps } from "react";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { heartMoods } from "@/state/product";
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
import { BibleVerseField } from "@/ui/bible-verse-picker";
import { colors, platformShadow, radius } from "@/ui/theme";

export type CheckInStep = "choose" | "details" | "thanks";
type FeatherName = ComponentProps<typeof Feather>["name"];

export function moodNumber(mood?: HeartMood) {
  if (mood === "grateful") return 5;
  if (mood === "peaceful" || mood === "hopeful") return 4;
  if (mood === "heavy" || mood === "anxious" || mood === "tired") return 2;
  return 3;
}

function moodToneFor(mood: HeartMood): { background: string; color: string; icon: FeatherName } {
  if (mood === "peaceful") return { background: colors.rhythmSoft, color: colors.textMuted, icon: "feather" };
  if (mood === "grateful") return { background: colors.warmSoft, color: colors.textMuted, icon: "sun" };
  if (mood === "heavy") return { background: colors.reflectionSoft, color: colors.textSecondary, icon: "cloud" };
  if (mood === "anxious") return { background: colors.prayerSoft, color: colors.textMuted, icon: "cloud-rain" };
  if (mood === "hopeful") return { background: colors.warmSoft, color: colors.textMuted, icon: "star" };
  return { background: colors.lavenderSoft, color: colors.textMuted, icon: "moon" };
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
  onSubmit: () => void;
  onVerses: (verses: BibleVerse[]) => void;
}) {
  const selectedMood = heartMoods.find((option) => option.value === mood);

  return (
    <FullScreenModal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={step === "details" ? onBack : onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ backgroundColor: colors.cream, flex: 1 }}>
        <AppScreen topInset>
          {step !== "thanks" ? (
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={step === "choose" ? onClose : onBack} />
              {step === "details" ? (
                <Pressable accessibilityRole="button" onPress={onSubmit} style={{ padding: 8 }}>
                  <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Save</Text>
                </Pressable>
              ) : (
                <View style={{ width: 38 }} />
              )}
            </View>
          ) : null}

          {step === "choose" ? (
            <>
              <View style={{ gap: 7 }}>
                <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31 }}>How is your heart today?</Text>
                <BodyText muted>Choose how your heart feels right now.</BodyText>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {heartMoods.map((option) => (
                  <MoodOptionCard key={option.value} option={option} selected={option.value === mood} onPress={() => onMood(option.value)} />
                ))}
              </View>
              <SecondaryButton onPress={onClose}>Skip</SecondaryButton>
            </>
          ) : null}

          {step === "details" ? (
            <>
              <View style={{ gap: 7 }}>
                <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31 }}>What's on your heart?</Text>
                <BodyText muted>Be honest. God already knows.</BodyText>
              </View>
              <View style={{ gap: 6 }}>
                <TextInputField
                  multiline
                  maxLength={350}
                  value={note}
                  onChangeText={(value) => onNote(value.slice(0, 350))}
                  onSubmitEditing={onSubmit}
                  placeholder="Write your thoughts..."
                  returnKeyType="send"
                  style={{ minHeight: 210 }}
                  submitBehavior="submit"
                />
                <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{note.length}/350</Text>
              </View>
              {selectedMood ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <MoodIcon mood={selectedMood.value} size={34} />
                  <Text style={{ color: colors.muted, flex: 1, fontSize: 13, fontWeight: "800" }}>{selectedMood.label}</Text>
                </View>
              ) : null}
              <BibleVerseField label="Add Scripture (optional)" verses={verses} onChange={onVerses} />
              <View style={{ gap: 8, marginTop: 8 }}>
                <SectionHeading>Share with</SectionHeading>
                <Pressable accessibilityRole="button" onPress={() => onShare(!share)}>
                  <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                    <RoomImage image={share ? roomImage : undefined} name={share ? roomName : "Private journal"} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{share ? roomName : "Private journal"}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                        {share ? "Shared with your room" : "Only you can see this"}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              </View>
              <PrimaryButton icon="send" onPress={onSubmit} style={{ minHeight: 58 }}>
                {share ? "Share check-in" : "Save privately"}
              </PrimaryButton>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" }}>
                <Feather name="lock" size={13} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {share ? "This will be shared with your room" : "This will stay in your private journal"}
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
                <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>Check-in shared</Text>
                <BodyText muted style={{ textAlign: "center" }}>
                  Thank you for taking a quiet moment with God.
                </BodyText>
              </View>
              <PrimaryButton onPress={onDone} style={{ alignSelf: "stretch" }}>
                Done
              </PrimaryButton>
            </View>
          ) : null}
        </AppScreen>
      </KeyboardAvoidingView>
    </FullScreenModal>
  );
}

function MoodOptionCard({
  onPress,
  option,
  selected,
}: {
  onPress: () => void;
  option: (typeof heartMoods)[number];
  selected: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
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
          ...platformShadow({
            boxShadow: "0 8px 18px rgba(11, 18, 32, 0.04)",
            offset: { width: 0, height: 8 },
            opacity: 0.04,
            radius: 18,
          }),
        }}
      >
        <MoodIcon mood={option.value} />
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900", textAlign: "center" }}>{option.label}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, textAlign: "center" }}>{option.description}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MoodIcon({ mood, size = 48 }: { mood: HeartMood; size?: number }) {
  const tone = moodToneFor(mood);
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: tone.background,
        borderRadius: 999,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Feather name={tone.icon} size={Math.round(size * 0.45)} color={tone.color} />
    </View>
  );
}
