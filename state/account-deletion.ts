import * as FirebaseAuth from "@firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/state/store/firebase";

export type AccountDeletionMember = { id: string; name: string };
export type AccountDeletionCommunity = { id: string; name: string; members: AccountDeletionMember[] };
export type AccountDeletionPreflight = { communities: AccountDeletionCommunity[]; authTime: number };
export type AccountDeletionOutcome = { status: "completed" | "running" };

type CallableOptions = { operation: "preflight" | "delete" | "status"; confirmation?: string };
type CallableResult<T> = { data: T };

async function call<T>(options: CallableOptions): Promise<T> {
  const result = await httpsCallable<CallableOptions, T>(functions, "koinoDeleteAccount")(options) as CallableResult<T>;
  return result.data;
}

export function accountDeletionErrorCode(error: unknown): string | undefined {
  const value = error as { code?: string; details?: { code?: string } };
  return value?.details?.code ?? value?.code?.split("/").pop();
}

export function accountDeletionCommunities(error: unknown): AccountDeletionCommunity[] {
  const value = error as { details?: { communities?: AccountDeletionCommunity[] } };
  return Array.isArray(value?.details?.communities) ? value.details.communities : [];
}

export async function loadAccountDeletionPreflight(): Promise<AccountDeletionPreflight> {
  return call<AccountDeletionPreflight>({ operation: "preflight" });
}

export async function reauthenticateForDeletion(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) {
    const error = new Error("NO_EMAIL") as Error & { code: string };
    error.code = "NO_EMAIL";
    throw error;
  }
  const credential = FirebaseAuth.EmailAuthProvider.credential(user.email, password);
  await FirebaseAuth.reauthenticateWithCredential(user, credential);
}

export async function requestAccountDeletion(confirmation: string): Promise<AccountDeletionOutcome> {
  return call<AccountDeletionOutcome>({ operation: "delete", confirmation });
}

export async function loadAccountDeletionStatus(): Promise<{ status: string; requestedAt: string | null; lastErrorCode: string | null }> {
  return call({ operation: "status" });
}
