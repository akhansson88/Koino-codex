import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { deleteAudioClip } from "@/state/audio-storage";
import type { AudioClip } from "@/state/types";
import { TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { Button } from "@/ui/shadcn/button";
import { colors, typography } from "@/ui/theme";
import { VoiceNoteField } from "@/features/audio/voice-note-field";

export const MAX_WRITTEN_REPLY_LENGTH = 500;

function writtenReplyId() {
  return `reply_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function WrittenReplyComposer({
  autoFocus = false,
  communityName,
  groupId,
  onChangeText,
  onDismiss,
  onSend,
  placeholder,
  value,
  variant = "inline",
}: {
  autoFocus?: boolean;
  communityName?: string;
  groupId?: string;
  onChangeText: (value: string) => void;
  onDismiss?: () => void;
  onSend: (body: string, replyId: string, audio?: AudioClip) => Promise<void>;
  placeholder?: string;
  value: string;
  variant?: "inline" | "sheet";
}) {
  const { t } = useAppTranslation();
  const [audio, setAudio] = useState<AudioClip>();
  const [submitting, setSubmitting] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const submittingRef = useRef(false);
  const replyIdRef = useRef<string | undefined>(undefined);
  const trimmedValue = value.trim();
  const sendDisabled = (!trimmedValue && !audio) || submitting;
  const resolvedPlaceholder = placeholder ?? t("community.reply.placeholder");

  function changeAudio(next: AudioClip | undefined) {
    if (audio && audio.id !== next?.id) void deleteAudioClip(audio);
    setAudio(next);
  }

  function changeText(nextValue: string) {
    if (submittingRef.current) return;
    replyIdRef.current = undefined;
    setSubmissionFailed(false);
    onChangeText(nextValue.slice(0, MAX_WRITTEN_REPLY_LENGTH));
  }

  async function send() {
    if ((!trimmedValue && !audio) || submittingRef.current) return;

    const replyId = replyIdRef.current ?? writtenReplyId();
    replyIdRef.current = replyId;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionFailed(false);

    try {
      await onSend(trimmedValue, replyId, audio);
      replyIdRef.current = undefined;
      setAudio(undefined);
    } catch {
      setSubmissionFailed(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const input = (
    <TextInputField
      accessibilityLabel={resolvedPlaceholder}
      autoFocus={autoFocus}
      editable={!submitting}
      maxLength={MAX_WRITTEN_REPLY_LENGTH}
      multiline={variant === "sheet"}
      onChangeText={changeText}
      onSubmitEditing={variant === "inline" ? send : undefined}
      placeholder={resolvedPlaceholder}
      returnKeyType={variant === "inline" ? "send" : "default"}
      style={variant === "inline" ? { flex: 1 } : undefined}
      value={value}
    />
  );

  const error = submissionFailed ? (
    <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
      {t("community.error.generic")}
    </Text>
  ) : null;

  if (variant === "sheet") {
    return (
      <View style={{ gap: 12 }}>
        {input}
        {groupId ? (
          <VoiceNoteField
            clip={audio}
            communityName={communityName}
            disabled={submitting}
            groupId={groupId}
            label={t("audio.field.addPrayer")}
            onClip={changeAudio}
            purpose="reply"
            scope="group"
          />
        ) : null}
        {error}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button disabled={submitting} onPress={onDismiss} style={{ flex: 1 }} variant="outline">
            {t("community.reply.notNow")}
          </Button>
          <Button disabled={sendDisabled} icon="send" loading={submitting} onPress={send} style={{ flex: 1 }}>
            {t("community.reply.send")}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        {input}
        <Button
          accessibilityLabel={t("community.reply.send")}
          disabled={sendDisabled}
          icon="send"
          loading={submitting}
          onPress={send}
          size="icon"
        />
      </View>
      {groupId ? (
        <VoiceNoteField
          clip={audio}
          communityName={communityName}
          disabled={submitting}
          groupId={groupId}
          label={t("audio.field.addPrayer")}
          onClip={changeAudio}
          purpose="reply"
          scope="group"
        />
      ) : null}
      {error}
    </View>
  );
}

