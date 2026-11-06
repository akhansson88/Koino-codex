import * as FirebaseAuth from "@firebase/auth";

import storage from "@/state/encryption/local-storage";
import { auth } from "@/state/store/firebase";

export type OnboardingChoice = "private" | "join" | "create";

export type OnboardingProgress =
  | { phase: "journey"; signupName?: string }
  | { phase: "guide"; journey: OnboardingChoice }
  | { phase: "complete" };

function progressKey(uid: string) {
  const projectId = auth.app.options.projectId;
  if (!projectId) throw new Error("The account project is unavailable.");
  // The encrypted storage sign-out cleanup preserves account keys prefixed with e2ee.
  return `e2ee.onboarding.v1.${projectId}.${uid}`;
}

export async function readOnboardingProgress(uid: string): Promise<OnboardingProgress | null> {
  const saved = await storage.getItem(progressKey(uid));
  if (saved === null) return null;

  try {
    const progress = JSON.parse(saved) as { phase?: unknown; signupName?: unknown; journey?: unknown } | null;
    if (progress?.phase === "complete") return { phase: "complete" };
    if (progress?.phase === "journey" && (progress.signupName === undefined || typeof progress.signupName === "string")) {
      return { phase: "journey", signupName: progress.signupName };
    }
    if (progress?.phase === "guide" && (progress.journey === "private" || progress.journey === "join" || progress.journey === "create")) {
      return { phase: "guide", journey: progress.journey };
    }
  } catch {
    // Only an absent marker identifies an account outside this onboarding flow.
  }
  throw new Error("Onboarding progress could not be read.");
}

export function writeOnboardingProgress(uid: string, progress: OnboardingProgress) {
  return storage.setItem(progressKey(uid), JSON.stringify(progress));
}

export async function registerForOnboarding(email: string, password: string, name: string): Promise<void> {
  if (auth.currentUser) throw new Error("Sign out before creating an account.");

  const trimmedEmail = email.trim();
  // Firebase awaits this hook before persisting the new user and notifying the encryption boundary.
  const unsubscribe = FirebaseAuth.beforeAuthStateChanged(auth, async (user) => {
    if (!user) return;
    if (auth.currentUser || user.email?.toLowerCase() !== trimmedEmail.toLowerCase()) {
      throw new Error("The account changed during registration.");
    }
    await writeOnboardingProgress(user.uid, { phase: "journey", signupName: name.trim() });
  });
  try {
    await FirebaseAuth.createUserWithEmailAndPassword(auth, trimmedEmail, password);
  } finally {
    unsubscribe();
  }
}
