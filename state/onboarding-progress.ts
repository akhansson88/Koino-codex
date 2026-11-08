import * as FirebaseAuth from "@firebase/auth";

import storage from "@/state/encryption/local-storage";
import { auth } from "@/state/store/firebase";

export type OnboardingChoice = "private" | "join" | "joinApproved" | "create";
type JourneyProgress = { phase: "journey"; signupName?: string; creationGroupId?: string };

export type OnboardingProgress =
  | JourneyProgress
  | { phase: "guide"; journey: OnboardingChoice }
  | { phase: "complete" };

const pendingWrites = new Map<string, Promise<void>>();
const interruptedRegistrations = new Map<string, JourneyProgress>();

function progressKey(uid: string) {
  const projectId = auth.app.options.projectId;
  if (!projectId) throw new Error("The account project is unavailable.");
  // The encrypted storage sign-out cleanup preserves account keys prefixed with e2ee.
  return `e2ee.onboarding.v1.${projectId}.${uid}`;
}

export async function readOnboardingProgress(uid: string): Promise<OnboardingProgress | null> {
  const key = progressKey(uid);
  // A quick sign-out and sign-in can reload this UID while a write is settling.
  await pendingWrites.get(key)?.catch(() => undefined);
  const saved = await storage.getItem(key);
  if (saved === null) return null;

  try {
    const progress = JSON.parse(saved) as {
      phase?: unknown; signupName?: unknown; journey?: unknown; creationGroupId?: unknown;
    } | null;
    if (progress?.phase === "complete") return { phase: "complete" };
    if (progress?.phase === "journey"
      && (progress.signupName === undefined || typeof progress.signupName === "string")
      && (progress.creationGroupId === undefined || (typeof progress.creationGroupId === "string" && /^group_[a-z0-9]+_[a-z0-9]*$/.test(progress.creationGroupId)))) {
      return {
        phase: "journey",
        ...(progress.signupName === undefined ? {} : { signupName: progress.signupName }),
        ...(progress.creationGroupId === undefined ? {} : { creationGroupId: progress.creationGroupId }),
      };
    }
    if (progress?.phase === "guide" && (progress.journey === "private" || progress.journey === "join" || progress.journey === "joinApproved" || progress.journey === "create")) {
      return { phase: "guide", journey: progress.journey };
    }
  } catch {
    // Only an absent marker identifies an account outside this onboarding flow.
  }
  throw new Error("Onboarding progress could not be read.");
}

export function writeOnboardingProgress(uid: string, progress: OnboardingProgress) {
  const key = progressKey(uid);
  const write = () => storage.setItem(key, JSON.stringify(progress));
  const previous = pendingWrites.get(key);
  const pending = previous ? previous.catch(() => undefined).then(write) : write();
  pendingWrites.set(key, pending);
  return pending.finally(() => {
    if (pendingWrites.get(key) === pending) pendingWrites.delete(key);
  });
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
    const key = progressKey(user.uid);
    const progress: JourneyProgress = { phase: "journey", signupName: name.trim() };
    interruptedRegistrations.set(key, progress);
    await writeOnboardingProgress(user.uid, progress);
    interruptedRegistrations.delete(key);
  });
  try {
    await FirebaseAuth.createUserWithEmailAndPassword(auth, trimmedEmail, password);
  } finally {
    unsubscribe();
  }
}

export async function signInToKoino(email: string, password: string) {
  // If the server returned the UID but local storage blocked signup, a same-
  // process sign-in can safely finish writing the exact account's marker.
  const unsubscribe = interruptedRegistrations.size ? FirebaseAuth.beforeAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const key = progressKey(user.uid);
    const progress = interruptedRegistrations.get(key);
    if (!progress) return;
    if (!await readOnboardingProgress(user.uid)) await writeOnboardingProgress(user.uid, progress);
    interruptedRegistrations.delete(key);
  }) : undefined;
  try {
    await FirebaseAuth.signInWithEmailAndPassword(auth, email.trim(), password);
  } finally {
    unsubscribe?.();
  }
}
