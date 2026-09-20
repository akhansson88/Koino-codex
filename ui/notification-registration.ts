import { useSyncExternalStore } from "react";

export type NotificationRegistrationState =
  | { status: "idle" | "checking" }
  | { status: "ready"; tokenUpdatedAt: string }
  | { status: "denied" }
  | { status: "error"; message: string };

let state: NotificationRegistrationState = { status: "idle" };
let retryVersion = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setNotificationRegistrationState(next: NotificationRegistrationState) {
  state = next;
  emit();
}

export function retryNotificationRegistration() {
  retryVersion += 1;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotificationRegistration() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function useNotificationRegistrationRetryVersion() {
  return useSyncExternalStore(subscribe, () => retryVersion, () => retryVersion);
}
