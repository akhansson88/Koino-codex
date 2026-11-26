import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { FieldLabel } from "@/ui/shadcn";
import { colors, typography } from "@/ui/theme";

/** The manual path: always available, and the fallback when the camera is denied. */
export function ManualCodeEntry({ busy = false, initialCode = "", onSubmit }: {
  busy?: boolean;
  initialCode?: string;
  onSubmit: (code: string) => void;
}) {
  const { t } = useAppTranslation();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState(false);
  const submitting = useRef(false);

  function submit() {
    if (busy || submitting.current) return;
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 3) {
      setError(true);
      return;
    }
    submitting.current = true;
    setError(false);
    onSubmit(normalized);
    submitting.current = false;
  }

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{t("community.join.manualTitle")}</FieldLabel>
      <TextInputField
        accessibilityLabel={t("community.join.manualTitle")}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        onChangeText={(next) => { setCode(next.toUpperCase()); setError(false); }}
        onSubmitEditing={submit}
        placeholder={t("community.rooms.code")}
        returnKeyType="go"
        value={code}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
          {t("community.error.inviteCodeRequired")}
        </Text>
      ) : null}
      <PrimaryButton disabled={busy || code.trim().length < 3} onPress={submit}>
        {t("community.join.continue")}
      </PrimaryButton>
    </View>
  );
}
