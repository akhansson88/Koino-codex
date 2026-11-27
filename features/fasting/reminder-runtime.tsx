import { useEffect } from "react";
import { AppState } from "react-native";

import { syncFastReminders } from "@/features/fasting/reminders";
import { useKoinoFields } from "@/state/koino-store";
import { useAppTranslation } from "@/ui/app-language";

const fields = ["currentUserId", "fasts", "fastsReady"] as const;

/** Keeps the local completion alert in step with the account's one open fast. */
export function FastingReminderRuntime() {
  const { currentUserId, fasts, fastsReady } = useKoinoFields(fields);
  const { t } = useAppTranslation();
  const body = t("fasting.notification.body");
  const windowStartBody = t("fasting.notification.windowStart");
  const windowEndBody = t("fasting.notification.windowEnd");
  const danielMorningBody = t("fasting.notification.danielMorning");

  useEffect(() => {
    if (!fastsReady) return;
    void syncFastReminders({
      body,
      danielMorningBody,
      fasts: currentUserId ? fasts : [],
      windowEndBody,
      windowStartBody,
    });
  }, [body, currentUserId, danielMorningBody, fasts, fastsReady, windowEndBody, windowStartBody]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !fastsReady) return;
      void syncFastReminders({
        body,
        danielMorningBody,
        fasts: currentUserId ? fasts : [],
        windowEndBody,
        windowStartBody,
      });
    });
    return () => subscription.remove();
  }, [body, currentUserId, danielMorningBody, fasts, fastsReady, windowEndBody, windowStartBody]);

  return null;
}
