import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { markStartupMilestone } from "@/features/startup-performance";
import { useKoinoActions } from "@/state/koino-store";
import { developmentMode } from "@/state/store/firebase";
import { Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { AmbientBackground } from "@/ui/ambient-background";
import { Field, PasswordField } from "@/ui/components";
import { KoinoLogo } from "@/ui/koino-logo";
import { appLanguageInfo, appLanguages, type TranslationKey } from "@/ui/localization";
import { FieldLabel } from "@/ui/shadcn";
import { colors, radius, shadcn, typography } from "@/ui/theme";

type AuthMode = "signIn" | "signUp";

function accountError(error: unknown, resetting: boolean): TranslationKey {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SIGNUP_BLOCKED")) {
    return message.includes("disposable_email") ? "onboarding.account.disposableEmail" : "onboarding.account.signupBlocked";
  }
  if (message.includes("EMAIL_NOT_VERIFIED")) return "onboarding.account.emailNotVerified";
  if (message.includes("ACTION_RATE_LIMITED")) return "onboarding.account.actionRateLimited";
  // Firebase Auth surfaces a blocking-function rejection as a backend error
  // instead of a readable code. Treat that specific backend error as blocked.
  if (message.includes("Error code: 47")) return "onboarding.account.signupBlocked";
  switch (code) {
    case "auth/email-already-in-use": return "onboarding.account.emailInUse";
    case "auth/invalid-email": return "onboarding.account.invalidEmail";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return resetting ? "onboarding.account.resetFailed" : "onboarding.account.credentials";
    case "auth/weak-password": return "onboarding.account.passwordHint";
    case "auth/too-many-requests": return "onboarding.account.tooManyAttempts";
    case "auth/network-request-failed": return "onboarding.account.networkError";
    default: return resetting ? "onboarding.account.resetFailed" : "onboarding.account.authFailed";
  }
}

export function OnboardingScreen() {
  const { language, rtlRestartRequired, setLanguage, t } = useAppTranslation();
  const [mode, setMode] = useState<AuthMode>();

  useEffect(() => {
    markStartupMilestone("firstScreenMounted", "onboarding");
  }, []);

  return (
    <OnboardingPage key={mode ?? "welcome"} center={!mode}>
      {mode ? <AccountForm mode={mode} onBack={() => setMode(undefined)} /> : (
        <>
          <View style={{ alignItems: "center", gap: 12 }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <KoinoLogo size={128} />
            </View>
            <Text style={[typography.sectionLabel, { color: colors.muted, letterSpacing: 4 }]}>KOINO</Text>
            <Text accessibilityRole="header" style={[typography.display, { color: colors.ink, textAlign: "center" }]}>
              {t("onboarding.welcome.title")}
            </Text>
            <Text style={[typography.body, { color: colors.muted, textAlign: "center" }]}>
              {t("onboarding.welcome.description")}
            </Text>
          </View>
          <PrimaryButton onPress={() => setMode("signUp")}>{t("onboarding.account.signUp")}</PrimaryButton>
          <SecondaryButton onPress={() => setMode("signIn")}>{t("onboarding.account.signIn")}</SecondaryButton>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={[typography.caption, { color: colors.muted }]}>{t("onboarding.language")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {appLanguages.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLanguage={appLanguageInfo[option].locale}
                  accessibilityState={{ selected: language === option }}
                  onPress={() => setLanguage(option)}
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 40,
                    paddingHorizontal: 14,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: language === option ? shadcn.primary : shadcn.border,
                    backgroundColor: language === option ? shadcn.primary : shadcn.card,
                  }}
                >
                  <Text style={[typography.label, { color: language === option ? shadcn.primaryForeground : colors.clay }]}>{appLanguageInfo[option].label}</Text>
                </Pressable>
              ))}
            </View>
            {rtlRestartRequired ? (
              <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("settings.language.rtlRestart")}</Text>
            ) : null}
          </View>
        </>
      )}
    </OnboardingPage>
  );
}

function AccountForm({ mode, onBack }: { mode: AuthMode; onBack: () => void }) {
  const { dispatch } = useKoinoActions();
  const { language, t } = useAppTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<TranslationKey>();
  const [resetEmail, setResetEmail] = useState("");
  const [pending, setPending] = useState<"auth" | "reset">();
  const running = useRef(false);
  const signingUp = mode === "signUp";
  const canSubmit = email.trim().includes("@")
    && (signingUp ? password.length >= 10 : password.length > 0)
    && (!signingUp || name.trim().length > 1);
  const submitLabel = signingUp ? "onboarding.account.signUp" : "onboarding.account.signIn";

  async function submit(resetting = false) {
    if (running.current || (!resetting && !canSubmit)) return;
    setError(undefined);
    setResetEmail("");
    const address = email.trim();
    if (resetting && !address.includes("@")) {
      setError("onboarding.account.resetEmail");
      return;
    }
    if (resetting && developmentMode) {
      setError("onboarding.account.resetUnavailableDev");
      return;
    }

    running.current = true;
    setPending(resetting ? "reset" : "auth");
    try {
      if (resetting) {
        await dispatch({ type: "requestPasswordReset", email: address, language });
        setResetEmail(address);
      } else {
        await dispatch(signingUp ? { type: "signUp", email: address, password, name } : { type: "signIn", email: address, password });
      }
    } catch (problem) {
      setError(accountError(problem, resetting));
    } finally {
      running.current = false;
      setPending(undefined);
    }
  }

  const nameLabel = t("onboarding.account.name");
  const emailLabel = t("onboarding.account.email");
  const passwordLabel = t("onboarding.account.password");

  return (
    <>
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
          {t(signingUp ? "onboarding.account.signUpTitle" : "onboarding.account.signInTitle")}
        </Text>
        {signingUp ? (
          <Text style={[typography.body, { color: colors.muted }]}>{t("onboarding.account.signUpDescription")}</Text>
        ) : null}
      </View>
      <Card>
        {signingUp ? (
          <View style={{ gap: 6 }}>
            <FieldLabel>{nameLabel}</FieldLabel>
            <Field accessibilityLabel={nameLabel} autoCapitalize="words" autoComplete="name" editable={!pending} value={name} onChangeText={setName} />
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <FieldLabel>{emailLabel}</FieldLabel>
          <Field accessibilityLabel={emailLabel} autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!pending} keyboardType="email-address" value={email} onChangeText={setEmail} />
        </View>
        <View style={{ gap: 6 }}>
          <FieldLabel>{passwordLabel}</FieldLabel>
          <PasswordField
            accessibilityLabel={passwordLabel}
            accessibilityHint={signingUp ? t("onboarding.account.passwordHint") : undefined}
            autoCapitalize="none"
            autoComplete={signingUp ? "new-password" : "current-password"}
            autoCorrect={false}
            editable={!pending}
            hidePasswordLabel={t("onboarding.account.hidePassword")}
            showPasswordLabel={t("onboarding.account.showPassword")}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
          />
          {signingUp ? <Text style={[typography.caption, { color: colors.muted }]}>{t("onboarding.account.passwordHint")}</Text> : null}
        </View>
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[typography.body, { color: colors.danger }]}>{t(error)}</Text>
        ) : null}
        {resetEmail ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[typography.body, { color: colors.ink }]}>
            {t("onboarding.account.resetSent", { email: resetEmail })}
          </Text>
        ) : null}
      </Card>
      <PrimaryButton disabled={!canSubmit || Boolean(pending)} onPress={() => void submit()}>
        {t(pending === "auth" ? (signingUp ? "onboarding.account.signingUp" : "onboarding.account.signingIn") : submitLabel)}
      </PrimaryButton>
      {!signingUp ? (
        <SecondaryButton disabled={Boolean(pending)} onPress={() => void submit(true)}>
          {t(pending === "reset" ? "onboarding.account.sendingReset" : "onboarding.account.forgot")}
        </SecondaryButton>
      ) : null}
      <SecondaryButton disabled={Boolean(pending)} icon="arrow-left" onPress={onBack}>{t("onboarding.account.back")}</SecondaryButton>
    </>
  );
}

export function OnboardingPage({ children, center = false }: PropsWithChildren<{ center?: boolean }>) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.cream }}>
      <AmbientBackground />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: center ? "center" : "flex-start",
          paddingHorizontal: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View style={{ alignSelf: "center", width: "100%", maxWidth: 430, gap: 14 }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
