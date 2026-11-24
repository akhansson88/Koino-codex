import { useEffect } from "react";

import { syncEventReminders } from "@/features/events/reminders";
import { useKoinoFields } from "@/state/koino-store";
import { useAppTranslation } from "@/ui/app-language";

const reminderFields = ["currentUserId", "eventRsvps", "groupEvents", "notificationPreferences"] as const;

export function EventReminderRuntime() {
  const state = useKoinoFields(reminderFields);
  const { language, t } = useAppTranslation();
  const userId = state.currentUserId;
  const pushEnabled = state.notificationPreferences.pushEnabled && state.notificationPreferences.eventReminders;

  useEffect(() => {
    if (!userId) return;
    void syncEventReminders({
      events: state.groupEvents,
      language,
      pushEnabled,
      rsvps: state.eventRsvps,
      t,
      userId,
    });
  }, [language, pushEnabled, state.eventRsvps, state.groupEvents, t, userId]);

  return null;
}
