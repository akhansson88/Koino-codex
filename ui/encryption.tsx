import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, Text, View, StyleSheet } from "react-native";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/state/store/firebase";
import { useAppTranslation } from "@/ui/app-language";
import { colors } from "@/ui/theme";
import { lockSession } from "@/state/encryption/session";
import { migrateVaultToPlaintext, plaintextMigrationComplete } from "@/state/encryption/vault-migration";
import { readOnboardingProgress, writeOnboardingProgress, type OnboardingProgress } from "@/state/onboarding-progress";
import { OnboardingProgressContext } from "@/ui/onboarding-progress";

function useWords() {
  const { language } = useAppTranslation();
  return (english: string, swedish: string) => language === "sv" ? swedish : english;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { alignItems: "center", justifyContent: "center", gap: 18, padding: 24 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24, textAlign: "center", maxWidth: 360 },
  button: { backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
});

type ActiveOnboarding = {
  userId: string;
  generation: number;
  progress: Exclude<OnboardingProgress, { phase: "complete" }>;
};

// Accounts are ordinary Firebase accounts. This boundary only waits for the
// signed-in account's one-time conversion from the retired vault and exposes
// onboarding progress to the rest of the app.
export function EncryptionBoundary({ children }: PropsWithChildren) {
  const w = useWords();
  const authRevision = useRef(0);
  const [phase, setPhase] = useState<"loading" | "signedOut" | "migrating" | "ready" | "error">("loading");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [onboarding, setOnboardingState] = useState<ActiveOnboarding>();
  const activeOnboarding = useRef<ActiveOnboarding | undefined>(undefined);
  const onboardingWrite = useRef<ActiveOnboarding | undefined>(undefined);
  function setOnboarding(value: ActiveOnboarding | undefined) {
    activeOnboarding.current = value;
    setOnboardingState(value);
  }
  async function finish(user: User, isCurrent: () => boolean) {
    if (!await plaintextMigrationComplete(user.uid)) {
      if (!isCurrent()) return;
      setPhase("migrating");
      await migrateVaultToPlaintext((message) => { if (isCurrent()) setProgress(message); });
    }
    if (!isCurrent()) return;
    const saved = await readOnboardingProgress(user.uid).catch(() => null);
    if (!isCurrent()) return;
    setOnboarding(saved && saved.phase !== "complete" ? { userId: user.uid, generation: authRevision.current, progress: saved } : undefined);
    setProgress("");
    setPhase("ready");
  }
  async function advanceOnboarding(uid: string, next: Exclude<OnboardingProgress, { phase: "journey" }>) {
    const isCurrent = () => auth.currentUser?.uid === uid
      && activeOnboarding.current === onboarding
      && phase === "ready" && onboardingWrite.current !== onboarding;
    const expectedPhase = next.phase === "guide" ? "journey" : "guide";
    if (!onboarding || onboarding.userId !== uid || onboarding.progress.phase !== expectedPhase || !isCurrent()) {
      throw new Error("This onboarding session is no longer available.");
    }
    onboardingWrite.current = onboarding;
    try {
      await writeOnboardingProgress(uid, next);
      if (activeOnboarding.current === onboarding) setOnboarding(next.phase === "guide" ? { ...onboarding, progress: next } : undefined);
    } finally {
      if (onboardingWrite.current === onboarding) onboardingWrite.current = undefined;
    }
  }
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      const request = ++authRevision.current;
      lockSession();
      setOnboarding(undefined);
      setError("");
      if (!next) { setPhase("signedOut"); return; }
      const isCurrent = () => active && authRevision.current === request && auth.currentUser?.uid === next.uid;
      setPhase("loading");
      void finish(next, isCurrent).catch((problem: Error) => {
        if (!isCurrent()) return;
        setError(problem.message);
        setPhase("error");
      });
    });
    return () => { active = false; authRevision.current++; unsubscribe(); lockSession(); };
  }, []);
  if (phase === "ready" || phase === "signedOut") {
    return (
      <OnboardingProgressContext.Provider value={{
        userId: onboarding?.userId,
        pending: Boolean(onboarding),
        journey: onboarding?.progress.phase === "guide" ? onboarding.progress.journey : undefined,
        chooseJourney: (uid, journey) => advanceOnboarding(uid, { phase: "guide", journey }),
        complete: (uid) => advanceOnboarding(uid, { phase: "complete" }),
      }}>
        {children}
      </OnboardingProgressContext.Provider>
    );
  }
  if (phase === "error") return <View style={[styles.screen, styles.content]}>
    <Text accessibilityRole="header" style={styles.title}>KOINO</Text>
    <Text accessibilityRole="alert" style={styles.body}>{error || w("Your account could not be prepared. Try again.", "Ditt konto kunde inte f├Ârberedas. F├Ârs├Âk igen.")}</Text>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
      const user = auth.currentUser;
      if (!user) { setPhase("signedOut"); return; }
      const revision = authRevision.current;
      setError("");
      setPhase("loading");
      void finish(user, () => authRevision.current === revision && auth.currentUser?.uid === user.uid)
        .catch((problem: Error) => { setError(problem.message); setPhase("error"); });
    }}><Text style={styles.buttonText}>{w("Try again", "F├Ârs├Âk igen")}</Text></Pressable>
  </View>;
  return <View style={[styles.screen, styles.content]}>
    <Text accessibilityRole="header" style={styles.title}>KOINO</Text>
    <ActivityIndicator accessibilityLabel={w("Opening KOINO", "├ûppnar KOINO")} color={colors.ink} />
    {phase === "migrating" ? <>
      <Text style={styles.body}>{w("Preparing your account. Keep the app open.", "F├Ârbereder ditt konto. H├Ñll appen ├Âppen.")}</Text>
      {progress ? <Text style={styles.body}>{progress}</Text> : null}
    </> : null}
  </View>;
}
