import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import * as FirebaseDatabase from "firebase/database";
import AsyncStorage from "@/state/encryption/local-storage";
import { database } from "@/state/store/firebase";
import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_TICK_MS,
  derivePresence,
  type PresenceByUser,
} from "@/state/presence-model";

const presenceDeviceStorageKey = "koino.presence.deviceId";
let cachedDeviceId: string | undefined;

function presencePlatform() {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  return "web";
}

async function presenceDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await AsyncStorage.getItem(presenceDeviceStorageKey).catch(() => null);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  const generated = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  cachedDeviceId = generated;
  await AsyncStorage.setItem(presenceDeviceStorageKey, generated).catch(() => undefined);
  return generated;
}

// One session per device. The offline stamp is written by the RTDB server when
// the socket closes, including when the app is force-quit, so "online" can
// never survive a crash.
export function usePresencePublisher(groupId?: string, userId?: string) {
  useEffect(() => {
    if (!groupId || !userId) return undefined;

    let active = true;
    let sessionRef: FirebaseDatabase.DatabaseReference | undefined;
    let connectedUnsubscribe: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const write = (state: "online" | "away") => {
      if (!active || !sessionRef) return;
      void FirebaseDatabase.set(sessionRef, {
        state,
        at: FirebaseDatabase.serverTimestamp(),
        platform: presencePlatform(),
      }).catch(() => undefined);
    };

    const connect = async () => {
      const deviceId = await presenceDeviceId();
      if (!active) return;
      sessionRef = FirebaseDatabase.ref(database, `presence/${groupId}/${userId}/sessions/${deviceId}`);
      connectedUnsubscribe = FirebaseDatabase.onValue(
        FirebaseDatabase.ref(database, ".info/connected"),
        (snapshot) => {
          if (!active || !sessionRef || snapshot.val() !== true) return;
          write(AppState.currentState === "active" ? "online" : "away");
          void FirebaseDatabase.onDisconnect(sessionRef)
            .set({
              state: "offline",
              at: FirebaseDatabase.serverTimestamp(),
              platform: presencePlatform(),
            })
            .catch(() => undefined);
          if (!heartbeat) {
            heartbeat = setInterval(() => {
              if (AppState.currentState === "active") write("online");
            }, PRESENCE_HEARTBEAT_MS);
          }
        },
      );
    };

    void connect();

    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next === "active") write("online");
      else write("away");
    });

    return () => {
      active = false;
      appStateSubscription.remove();
      if (heartbeat) clearInterval(heartbeat);
      connectedUnsubscribe?.();
      const session = sessionRef;
      sessionRef = undefined;
      if (session) {
        void (async () => {
          try {
            await FirebaseDatabase.onDisconnect(session).cancel();
            await FirebaseDatabase.remove(session);
          } catch {
            // The server-side disconnect handler still clears the session.
          }
        })();
      }
    };
  }, [groupId, userId]);
}

// Reads the current community's presence while the screen using it is mounted.
// The clock tick keeps stale sessions moving from online to inactive to offline
// even when no new database value arrives.
export function useCommunityPresence(groupId?: string): { now: number; presence: PresenceByUser } {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setSnapshot(null);
    if (!groupId) return undefined;
    const presenceRef = FirebaseDatabase.ref(database, `presence/${groupId}`);
    return FirebaseDatabase.onValue(
      presenceRef,
      (value) => setSnapshot(value.val()),
      () => setSnapshot(null),
    );
  }, [groupId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PRESENCE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const presence = useMemo(() => derivePresence(snapshot, now), [snapshot, now]);
  return { now, presence };
}
