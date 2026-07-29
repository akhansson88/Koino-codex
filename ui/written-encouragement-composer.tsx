import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export const MAX_WRITTEN_ENCOURAGEMENT_LENGTH = 500;

function writtenEncouragementId() {
  return `reply_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function WrittenEncouragementComposer({
  autoFocus = false,
  onChangeText,
  onDismiss,
  onSend,
  placeholder,
  value,
  variant = "inline",
}: {
  autoFocus?: boolean;
  onChangeText: (value: string) => void;
  onDismiss?: () => void;
  onSend: (body: string, replyId: string) => Promise<void>;
  placeholder?: string;
  value: string;
  variant?: "inline" | "sheet";
}) {
  const { t } = useAppTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const submittingRef = useRef(false);
  const replyIdRef = useRef<string | undefined>(undefined);
  const trimmedValue = value.trim();
  const sendDisabled = !trimmedValue || submitting;
  const resolvedPlaceholder = placeholder ?? t("community.encouragement.placeholder");

  function changeText(nextValue: string) {
    if (submittingRef.current) return;
    replyIdRef.current = undefined;
    setSubmissionFailed(false);
    onChangeText(nextValue.slice(0, MAX_WRITTEN_ENCOURAGEMENT_LENGTH));
  }

  async function send() {
    if (!trimmedValue || submittingRef.current) return;

    const replyId = replyIdRef.current ?? writtenEncouragementId();
    replyIdRef.current = replyId;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionFailed(false);

    try {
      await onSend(trimmedValue, replyId);
      replyIdRef.current = undefined;
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
      maxLength={MAX_WRITTEN_ENCOURAGEMENT_LENGTH}
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
    <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger, fontWeight: "800" }]}>
      {t("community.error.generic")}
    </Text>
  ) : null;

  if (variant === "sheet") {
    return (
      <View style={{ gap: 12 }}>
        {input}
        {error}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            accessibilityLabel={t("community.encouragement.notNow")}
            accessibilityRole="button"
            disabled={submitting}
            onPress={onDismiss}
            style={{
              alignItems: "center",
              backgroundColor: colors.paper,
              borderColor: colors.line,
              borderRadius: 999,
              borderWidth: 1,
              flex: 1,
              justifyContent: "center",
              minHeight: 52,
              opacity: submitting ? 0.5 : 1,
              paddingHorizontal: 16,
            }}
          >
            <Text style={[typography.button, { color: colors.olive, textAlign: "center" }]}>
              {t("community.encouragement.notNow")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t("community.encouragement.send")}
            accessibilityRole="button"
            accessibilityState={{ busy: submitting, disabled: sendDisabled }}
            disabled={sendDisabled}
            onPress={send}
            style={{
              alignItems: "center",
              backgroundColor: sendDisabled ? colors.disabled : colors.gold,
              borderColor: sendDisabled ? colors.disabled : colors.gold,
              borderRadius: 999,
              borderWidth: 1,
              flex: 1,
              flexDirection: "row",
              gap: 8,
              justifyContent: "center",
              minHeight: 52,
              paddingHorizontal: 16,
            }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Feather name="send" size={17} color={sendDisabled ? colors.disabledText : colors.onAccent} />
            )}
            <Text style={[typography.button, { color: sendDisabled ? colors.disabledText : colors.onAccent, textAlign: "center" }]}>
              {t("community.encouragement.send")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        {input}
        <Pressable
          accessibilityLabel={t("community.reply.send")}
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: sendDisabled }}
          disabled={sendDisabled}
          onPress={send}
          style={{
            alignItems: "center",
            height: 48,
            justifyContent: "center",
            opacity: sendDisabled ? 0.4 : 1,
            width: 48,
          }}
        >
          {submitting ? <ActivityIndicator color={colors.gold} size="small" /> : <Feather name="send" size={22} color={colors.gold} />}
        </Pressable>
      </View>
      {error}
    </View>
  );
}
