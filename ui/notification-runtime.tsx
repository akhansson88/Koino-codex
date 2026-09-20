import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useKoino } from "@/state/koino-store";
import { setNotificationRegistrationState, useNotificationRegistrationRetryVersion } from "@/ui/notification-registration";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationData = {
  groupId?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  notificationId?: unknown;
  bundled?: unknown;
  prayerNotificationId?: unknown;
};

function validTargetType(value: unknown): value is "post" | "check_in" {
  return value === "post" || value === "check_in";
}

export function NotificationRuntime() {
  const { state, dispatch } = useKoino();
  const handledResponseId = useRef<string | undefined>(undefined);
  const dispatchRef = useRef(dispatch);
  const retryVersion = useNotificationRegistrationRetryVersion();

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const unreadCount = state.activityNotifications.filter((item) => !item.readAt).length;
    void Notifications.setBadgeCountAsync(unreadCount).catch(() => undefined);
  }, [state.activityNotifications]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!state.currentUserId) {
      setNotificationRegistrationState({ status: "idle" });
      return;
    }

    let active = true;
    const register = async () => {
      setNotificationRegistrationState({ status: "checking" });
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("comments", {
          name: "Comments",
          importance: Notifications.AndroidImportance.HIGH,
        });
        await Notifications.setNotificationChannelAsync("mentions", {
          name: "Mentions",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 150, 250],
        });
        await Notifications.setNotificationChannelAsync("prayer-activity", {
          name: "Prayer activity",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
      if (!active) return;
      if (permission.status !== "granted") {
        setNotificationRegistrationState({ status: "denied" });
        return;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) throw new Error("The Expo project ID is missing from this build.");
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      if (active) {
        await dispatchRef.current({ type: "registerPushToken", token: token.data, platform: Platform.OS as "android" | "ios" });
        setNotificationRegistrationState({ status: "ready", tokenUpdatedAt: new Date().toISOString() });
      }
    };

    void register().catch((error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : "Push registration failed.";
      console.error("[notifications] Push registration failed", error);
      setNotificationRegistrationState({ status: "error", message });
    });

    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void register().catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Push token refresh failed.";
        console.error("[notifications] Push token refresh failed", error);
        setNotificationRegistrationState({ status: "error", message });
      });
    });

    return () => {
      active = false;
      tokenSubscription.remove();
    };
  }, [retryVersion, state.currentUserId]);

  useEffect(() => {
    if (!state.currentUserId || Platform.OS === "web") return;

    const openResponse = async (response: Notifications.NotificationResponse | null) => {
      if (!response || handledResponseId.current === response.notification.request.identifier) return;
      handledResponseId.current = response.notification.request.identifier;
      const data = response.notification.request.content.data as NotificationData;
      if (
        data.bundled === true &&
        typeof data.groupId === "string" &&
        validTargetType(data.targetType) &&
        typeof data.targetId === "string"
      ) {
        await dispatch({
          type: "markActivityDiscussionRead",
          groupId: data.groupId,
          targetType: data.targetType,
          targetId: data.targetId,
        });
      } else if (typeof data.notificationId === "string") {
        await dispatch({ type: "markActivityNotificationRead", id: data.notificationId });
      }
      if (validTargetType(data.targetType) && typeof data.targetId === "string") {
        router.push({
          pathname: "/feed/[targetType]/[id]",
          params: {
            targetType: data.targetType,
            id: data.targetId,
            ...(typeof data.groupId === "string" ? { groupId: data.groupId } : {}),
          },
        } as never);
      } else if (typeof data.prayerNotificationId === "string") {
        router.replace("/(tabs)" as never);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(openResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void openResponse(response);
    });
    return () => subscription.remove();
  }, [dispatch, state.currentUserId]);

  return null;
}
