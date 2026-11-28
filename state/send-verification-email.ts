import { httpsCallable } from "firebase/functions";

import { functions } from "@/state/store/firebase";

/** Sends KOINO's branded verification email in the member's language. */
export async function sendVerificationEmail(language?: string) {
  await httpsCallable(functions, "koinoSendEmailVerification")({ language: language ?? "en" });
}
