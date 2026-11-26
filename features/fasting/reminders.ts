import * as Notifications from "expo-notifications";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Linking, Platform } from "react-native";

import { openFast } from "@/state/fasting";
import type { Fast } from "@/state/types";

const FASTING_CHANNEL = "fasting-complete";
const FASTING_NOTIFICATION_PREFIX = "koino-fast-";
const FASTING_TEST_ID = "koino-fast-test";

type FastingAlarmModule = {
  schedule: (endAtMillis: number) => void;
  cancel: () => void;
  test: (delayMillis: number) => void;
  canScheduleExactAlarms: () => boolean;
  openExactAlarmSettings: () => void;
  stop: () => void;
};

type AlertPermission = "granted" | "denied" | "undetermined" | "unavailable";

export type FastingAlertStatus = {
  permission: AlertPermission;
  exact: boolean | null;
  native: boolean;
};

const FastingAlarm = Platform.OS === "android"
  ? requireOptionalNativeModule<FastingAlarmModule>("FastingAlarm")
  : null;

let syncRevision = 0;

export async function ensureFastingChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(FASTING_CHANNEL, {
      name: "Fasting",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 500, 250, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      bypassDnd: false,
    });
  } catch {
    // A build without the native notification module can still run every fasting screen.
  }
}

function isFastingNotification(identifier: string, data: unknown) {
  if (identifier === FASTING_TEST_ID || identifier.startsWith(FASTING_NOTIFICATION_PREFIX)) return true;
  return Boolean(data && typeof data === "object" && (data as { koinoFast?: unknown }).koinoFast === true);
}

async function cancelFastingSchedules() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((item) => isFastingNotification(
      item.identifier,
      item.content.data as { koinoFast?: unknown } | undefined,
    ));
    await Promise.all(ours.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined)));
  } catch {
    // Scheduling is best effort; the UI still counts down.
  }
  try {
    FastingAlarm?.cancel();
  } catch {
    // The JS notification remains the fallback.
  }
}

/**
 * Cancel every local fasting alert and schedule exactly the one this account needs.
 * Called on fast create/edit/end, sign-out and app resume so two devices converge.
 */
export async function syncFastReminders({ fasts, body }: { fasts: readonly Fast[]; body: string }) {
  const revision = ++syncRevision;
  await ensureFastingChannel();
  await cancelFastingSchedules();
  if (revision !== syncRevision) return;

  const fast = openFast(fasts);
  if (!fast || !fast.alertEnabled) return;
  const end = Date.parse(fast.endAt);
  if (!Number.isFinite(end) || end <= Date.now()) return;

  if (FastingAlarm && FastingAlarm.canScheduleExactAlarms()) {
    try {
      FastingAlarm.schedule(end);
      return;
    } catch {
      // Fall through to the standard local notification.
    }
  }

  const permission = await Notifications.getPermissionsAsync().catch(() => undefined);
  if (permission?.status !== "granted") return;
  await Notifications.scheduleNotificationAsync({
    identifier: `${FASTING_NOTIFICATION_PREFIX}${fast.id}`,
    content: {
      title: "KOINO",
      body,
      sound: "default",
      data: { koinoFast: true, fastId: fast.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(end),
      channelId: FASTING_CHANNEL,
    },
  }).catch(() => undefined);
}

export async function getFastingAlertStatus(): Promise<FastingAlertStatus> {
  if (Platform.OS === "web") return { permission: "unavailable", exact: null, native: false };
  try {
    const permission = await Notifications.getPermissionsAsync();
    return {
      permission: permission.status,
      exact: FastingAlarm ? FastingAlarm.canScheduleExactAlarms() : null,
      native: Boolean(FastingAlarm),
    };
  } catch {
    return { permission: "unavailable", exact: null, native: false };
  }
}

export async function requestFastingAlertPermission() {
  try {
    const permission = await Notifications.requestPermissionsAsync();
    return permission.status === "granted";
  } catch {
    return false;
  }
}

export function openFastingAlertSettings() {
  void Linking.openSettings();
}

export function openExactAlarmSettings() {
  try {
    FastingAlarm?.openExactAlarmSettings();
  } catch {
    openFastingAlertSettings();
  }
}

export async function scheduleFastingTestAlert(body: string) {
  await ensureFastingChannel();
  const permission = await Notifications.getPermissionsAsync().catch(() => undefined);
  if (permission?.status !== "granted") return false;

  if (FastingAlarm && FastingAlarm.canScheduleExactAlarms()) {
    try {
      FastingAlarm.test(10_000);
      return true;
    } catch {
      // Fall through to the standard local notification.
    }
  }

  await Notifications.cancelScheduledNotificationAsync(FASTING_TEST_ID).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: FASTING_TEST_ID,
    content: {
      title: "KOINO",
      body,
      sound: "default",
      data: { koinoFast: true, test: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 10_000),
      channelId: FASTING_CHANNEL,
    },
  });
  return true;
}

export function stopFastingAlarm() {
  try {
    FastingAlarm?.stop();
  } catch {
    // Nothing to stop when the native alarm module is unavailable.
  }
}

export const fastingAlarmAvailable = Boolean(FastingAlarm);
