import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { formatAudioDuration, type AudioPurpose, type AudioScope } from "@/state/audio";
import type { AudioClip } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { AudioCard } from "@/features/audio/audio-card";
import { AudioRecorderSheet } from "@/features/audio/recorder-sheet";

export function VoiceNoteField({
  clip,
  communityName,
  disabled = false,
  groupId,
  label,
  onClip,
  purpose,
  readOnly = false,
  scope,
}: {
  clip?: AudioClip;
  communityName?: string;
  disabled?: boolean;
  groupId?: string;
  label?: string;
  onClip: (clip: AudioClip | undefined) => void;
  purpose: AudioPurpose;
  readOnly?: boolean;
  scope: AudioScope;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const title = label ?? t(purpose === "journal" ? "audio.field.add" : "audio.field.addPrayer");

  function complete(next: AudioClip) {
    onClip(next);
  }

  function remove() {
    if (!clip) return;
    onClip(undefined);
  }

  if (clip) {
    return (
      <View style={{ gap: 8 }}>
        <AudioCard clip={clip} kind={purpose === "journal" ? "journal" : "prayer"} />
        {readOnly ? null : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => setOpen(true)}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={[typography.caption, { color: colors.muted }]}>{t("audio.field.replace")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={remove}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={[typography.caption, { color: colors.danger }]}>{t("audio.field.remove")}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Text style={[typography.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]}>
              {formatAudioDuration(clip.durationMs)}
            </Text>
          </View>
        )}
        <AudioRecorderSheet
          communityName={communityName}
          groupId={groupId}
          onClose={() => setOpen(false)}
          onComplete={complete}
          purpose={purpose}
          scope={scope}
          visible={open}
        />
      </View>
    );
  }

  if (readOnly) return null;

  return (
    <>
      <Pressable
        accessibilityHint={t("audio.record.ready")}
        accessibilityLabel={title}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: pressed ? shadcn.secondary : "transparent",
          borderColor: colors.line,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderStyle: "dashed",
          borderWidth: 1,
          flexDirection: "row",
          gap: 12,
          minHeight: 54,
          opacity: disabled ? 0.55 : 1,
          paddingHorizontal: 14,
          paddingVertical: 10,
        })}
      >
        <View style={{ alignItems: "center", backgroundColor: shadcn.brandSoft, borderRadius: 999, height: 34, justifyContent: "center", width: 34 }}>
          <Feather color={colors.accentPrayer} name="mic" size={16} />
        </View>
        <Text style={[typography.label, { color: colors.ink, flex: 1 }]}>{title}</Text>
        <Feather color={colors.muted} name="plus" size={16} />
      </Pressable>
      <AudioRecorderSheet
        communityName={communityName}
        groupId={groupId}
        onClose={() => setOpen(false)}
        onComplete={complete}
        purpose={purpose}
        scope={scope}
        visible={open}
      />
    </>
  );
}
