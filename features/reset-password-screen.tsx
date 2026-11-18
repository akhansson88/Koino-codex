import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, PasswordField, PillButton, Screen, Title } from "@/ui/components";
import { FieldLabel } from "@/ui/shadcn";
import { colors, typography } from "@/ui/theme";

type QueryParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamFromUrl(value: string | undefined, key: string) {
  if (!value) return undefined;

  try {
    return new URL(value).searchParams.get(key) ?? undefined;
  } catch {
    const query = value.split("?")[1]?.split("#")[0];
    if (!query) return undefined;
    return new URLSearchParams(query).get(key) ?? undefined;
  }
}

function resetParam(params: QueryParams, key: string) {
  return firstParam(params[key]) ?? searchParamFromUrl(firstParam(params.link), key);
}

export function ResetPasswordScreen() {
  const { state, dispatch } = useKoino();
  const params = useLocalSearchParams() as QueryParams;
  const resetCode = resetParam(params, "oobCode") ?? resetParam(params, "oobcode");
  const mode = resetParam(params, "mode");
  const hasResetCode = Boolean(resetCode) && (!mode || mode === "resetPassword");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordsMatch = !confirmPassword || newPassword === confirmPassword;
  const canSubmit = hasResetCode && newPassword.length >= 6 && newPassword === confirmPassword && !isSubmitting;

  async function handleResetPassword() {
    if (!canSubmit || !resetCode) return;

    setHasSubmitted(true);
    setMessage("");
    setIsSubmitting(true);
    try {
      await dispatch({ type: "confirmPasswordReset", oobCode: resetCode, newPassword });
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Your password has been reset. You can sign in with the new password.");
    } catch {
      setMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 16, padding: 22, paddingTop: 72 }}>
          <View style={{ gap: 8 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted, letterSpacing: 2 }]}>KOINO PASSWORD RESET</Text>
            <Title>Choose a new password.</Title>
            <Body muted>Use the reset link from your email to set a fresh password for the KOINO app.</Body>
          </View>

          <Card>
            {hasResetCode ? (
              <>
                <Body>Enter your new password below.</Body>
                <View style={{ gap: 6 }}>
                  <FieldLabel>New password</FieldLabel>
                  <PasswordField
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onSubmitEditing={handleResetPassword}
                    placeholder="New password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    returnKeyType="next"
                    textContentType="newPassword"
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <FieldLabel>Confirm new password</FieldLabel>
                  <PasswordField
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onSubmitEditing={handleResetPassword}
                    placeholder="Confirm new password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    returnKeyType="done"
                    textContentType="newPassword"
                  />
                </View>
                {newPassword && newPassword.length < 6 ? <Text style={[typography.caption, { color: colors.danger }]}>Use at least 6 characters.</Text> : null}
                {!passwordsMatch ? <Text style={[typography.caption, { color: colors.danger }]}>The new passwords do not match.</Text> : null}
                {hasSubmitted && state.authError ? <Text style={[typography.caption, { color: colors.danger }]}>{state.authError}</Text> : null}
                {message ? <Text style={[typography.caption, { color: colors.ink }]}>{message}</Text> : null}
              </>
            ) : (
              <>
                <Body>This reset link is missing its confirmation code.</Body>
                <Body muted>Request a new password reset email from the sign-in screen, then open the latest link.</Body>
              </>
            )}
          </Card>

          {hasResetCode && !message ? (
            <PillButton disabled={!canSubmit} onPress={handleResetPassword}>
              {isSubmitting ? "Resetting..." : "Reset password"}
            </PillButton>
          ) : null}

          <PillButton variant="ghost" onPress={() => router.replace("/")}>
            Back to sign in
          </PillButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
