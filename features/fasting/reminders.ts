import * as Notifications from "expo-notifications";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Linking, Platform } from "react-native";

import { openFast } from "@/state/fasting";
import { fastPlanWindows } from "@/state/fasting-plan";
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
 * Cancel every local fasting alert and schedule the alerts this account needs.
 * Called on fast create/edit/end, sign-out and app resume so two devices converge.
 * Continuous fasts keep the exact end alarm; daily and weekly plans get one
 * bounded set of window notifications for the next days, refreshed on resume.
 */
export async function syncFastReminders({
  fasts,
  body,
  windowStartBody,
  windowEndBody,
  danielMorningBody,
}: {
  fasts: readonly Fast[];
  body: string;
  windowStartBody?: string;
  windowEndBody?: string;
  danielMorningBody?: string;
}) {
  const revision = ++syncRevision;
  await ensureFastingChannel();
  await cancelFastingSchedules();
  if (revision !== syncRevision) return;

  const fast = openFast(fasts);
  if (!fast || !fast.alertEnabled) return;
  const now = Date.now();
  const end = Date.parse(fast.endAt);
  if (!Number.isFinite(end) || end <= now) return;

  if (fast.schedule.kind === "continuous") {
    if (FastingAlarm && FastingAlarm.canScheduleExactAlarms()) {
      try {
        FastingAlarm.schedule(end);
        return;
      } catch {
        // Fall through to the standard local notification.
      }
    }
    await scheduleDateNotification(`${FASTING_NOTIFICATION_PREFIX}${fast.id}`, end, body, fast.id);
    return;
  }

  const permission = await Notifications.getPermissionsAsync().catch(() => undefined);
  if (permission?.status !== "granted") return;

  if (fast.schedule.kind === "partial") {
    if (danielMorningBody) {
      const morning = new Date();
      morning.setHours(8, 0, 0, 0);
      if (morning.getTime() <= now) morning.setDate(morning.getDate() + 1);
      for (let day = 0; day < 7; day++) {
        const at = new Date(morning);
        at.setDate(morning.getDate() + day);
        if (at.getTime() >= end) break;
        await scheduleDateNotification(`${FASTING_NOTIFICATION_PREFIX}${fast.id}-daniel-${day}`, at.getTime(), danielMorningBody, fast.id);
      }
    }
    return;
  }

  const horizon = now + 7 * 24 * 60 * 60 * 1000;
  const windows = fastPlanWindows(fast)
    .filter((window) => window.end > now && window.start < horizon)
    .slice(0, 8);

  let index = 0;
  for (const window of windows) {
    if (window.start > now && windowStartBody) {
      await scheduleDateNotification(`${FASTING_NOTIFICATION_PREFIX}${fast.id}-s${index}`, window.start, windowStartBody, fast.id);
    }
    if (window.end > now && windowEndBody) {
      await scheduleDateNotification(`${FASTING_NOTIFICATION_PREFIX}${fast.id}-e${index}`, window.end, windowEndBody, fast.id);
    }
    index += 1;
  }
}

async function scheduleDateNotification(identifier: string, at: number, body: string, fastId: string) {
  if (at <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: "KOINO",
      body,
      sound: "default",
      data: { koinoFast: true, fastId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(at),
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
