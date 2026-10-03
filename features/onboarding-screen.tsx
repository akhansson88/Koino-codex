import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { markStartupMilestone } from "@/features/startup-performance";
import { Body, Card, Choice, Field, PasswordField, PillButton, Screen } from "@/ui/components";
import { KoinoLogo } from "@/ui/koino-logo";
import { colors } from "@/ui/theme";

export function OnboardingScreen() {
  const { state, dispatch } = useKoino();
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [groupMode, setGroupMode] = useState<"join" | "create">("join");
  const [groupName, setGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);

  useEffect(() => {
    markStartupMilestone("firstScreenMounted", "onboarding");
  }, []);

  useEffect(() => {
    if (!name && state.users[0]?.name) {
      setName(state.users[0].name);
    }
  }, [name, state.users]);

  const canAuth =
    email.trim().includes("@") && password.length >= 6 && (authMode === "signIn" || name.trim().length > 1);
  const canContinue =
    state.currentUserId &&
    name.trim().length > 1 &&
    (groupMode === "create" ? groupName.trim().length > 1 : inviteCode.trim().length > 2);

  async function handlePasswordReset() {
    const resetEmail = email.trim();
    setResetMessage("");

    if (!resetEmail.includes("@")) {
      setResetMessage("Enter your email above, then request a reset link.");
      return;
    }

    setIsSendingReset(true);
    try {
      await dispatch({ type: "requestPasswordReset", email: resetEmail });
      setResetMessage(`A reset link was sent to ${resetEmail}. Open it to choose a new password.`);
    } catch {
      setResetMessage("");
    } finally {
      setIsSendingReset(false);
    }
  }

  function handleAuthSubmit() {
    if (!canAuth) return;
    dispatch(authMode === "signIn" ? { type: "signIn", email, password } : { type: "signUp", email, password, name });
  }

  function handleSessionSubmit() {
    if (!canContinue) return;
    dispatch({
      type: "createSession",
      name,
      groupName: groupMode === "create" ? groupName : undefined,
      inviteCode: groupMode === "join" ? inviteCode : undefined,
    });
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 22, padding: 22, paddingTop: 48 }}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <KoinoLogo size={164} />
            <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "700", letterSpacing: 1 }}>KOINO</Text>
            <Text selectable style={{ color: colors.ink, fontSize: 33, fontWeight: "700", letterSpacing: 0, textAlign: "center" }}>
              A quiet rhythm for prayer and honest reflection.
            </Text>
            <Text selectable style={{ color: colors.muted, fontSize: 16, lineHeight: 23, maxWidth: 380, textAlign: "center" }}>
              Check in, share honestly when you are ready, pray for your people, and leave encouraged.
            </Text>
          </View>

          {!state.currentUserId ? (
            <>
              <Card>
                <Body>{authMode === "signIn" ? "Welcome back." : "Create a quiet account for KOINO."}</Body>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  <Choice label="Sign in" selected={authMode === "signIn"} onPress={() => setAuthMode("signIn")} />
                  <Choice label="Create account" selected={authMode === "signUp"} onPress={() => setAuthMode("signUp")} />
                </View>
                {authMode === "signUp" ? (
                  <Field value={name} onChangeText={setName} onSubmitEditing={handleAuthSubmit} placeholder="Your name" autoCapitalize="words" returnKeyType="next" />
                ) : null}
                <Field
                  value={email}
                  onChangeText={setEmail}
                  onSubmitEditing={handleAuthSubmit}
                  placeholder="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={Platform.OS === "web" ? "default" : "email-address"}
                  returnKeyType="next"
                />
                <PasswordField
                  key={authMode}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={handleAuthSubmit}
                  placeholder="Password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {state.authError ? <Body muted>{state.authError}</Body> : null}
                {authMode === "signIn" && resetMessage ? <Body muted>{resetMessage}</Body> : null}
              </Card>

              <PillButton
                disabled={!canAuth}
                onPress={handleAuthSubmit}
              >
                {authMode === "signIn" ? "Sign in" : "Create account"}
              </PillButton>
              {authMode === "signIn" ? (
                <PillButton variant="ghost" disabled={isSendingReset} onPress={handlePasswordReset}>
                  {isSendingReset ? "Sending reset link..." : "Forgot my password"}
                </PillButton>
              ) : null}
            </>
          ) : (
            <>
              <Card>
                <Body>What should your community call you?</Body>
                <Field value={name} onChangeText={setName} onSubmitEditing={handleSessionSubmit} placeholder="Your name" autoCapitalize="words" returnKeyType="next" />
                <Body muted>Signed in as {state.authEmail ?? "your account"}.</Body>
              </Card>

              <Card tone="moss">
                <Body>Join a community with a code, or create one for the people you pray with.</Body>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  <Choice label="Join by code" selected={groupMode === "join"} onPress={() => setGroupMode("join")} />
                  <Choice label="Create community" selected={groupMode === "create"} onPress={() => setGroupMode("create")} />
                </View>
                {groupMode === "join" ? (
                  <Field value={inviteCode} onChangeText={setInviteCode} onSubmitEditing={handleSessionSubmit} placeholder="Community code" autoCapitalize="characters" returnKeyType="join" />
                ) : (
                  <Field value={groupName} onChangeText={setGroupName} onSubmitEditing={handleSessionSubmit} placeholder="Community name" returnKeyType="done" />
                )}
                {state.authError ? <Body muted>{state.authError}</Body> : null}
              </Card>

              <PillButton
                disabled={!canContinue}
                onPress={handleSessionSubmit}
              >
                Enter the rhythm
              </PillButton>

              <PillButton variant="ghost" onPress={() => dispatch({ type: "signOut" })}>
                Log out
              </PillButton>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
