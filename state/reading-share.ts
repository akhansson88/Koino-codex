import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as FirebaseDatabase from "firebase/database";
import AsyncStorage from "@/state/encryption/local-storage";
import { database } from "@/state/store/firebase";
import { useCommunityPresence } from "@/state/presence";
import type { BiblePosition, BibleVersionId } from "@/features/bible-kjv";
import {
  deriveGroupReading,
  READING_HEARTBEAT_MS,
  READING_SETTLE_MS,
  type ReadingEntry,
  type ReadingScope,
} from "@/state/reading-model";

export type ReadingShareScope = ReadingScope | "off";

const shareStoragePrefix = "koino.readingShare";

function shareStorageKey(userId: string, groupId: string) {
  return `${shareStoragePrefix}.${userId}.${groupId}`;
}

export function groupReadingPath(groupId: string, userId: string) {
  return `groupReading/${groupId}/${userId}`;
}

function readingPlatform() {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  return "web";
}

function parseShareScope(value: string | null): ReadingShareScope {
  return value === "chapter" || value === "verse" ? value : "off";
}

/**
 * The member's own choice, kept on the device and applied per community. Off is
 * the default for every community the member joins.
 */
export function useReadingShareSetting(groupId?: string, userId?: string) {
  const key = groupId && userId ? shareStorageKey(userId, groupId) : undefined;
  const [scope, setScopeState] = useState<ReadingShareScope>("off");

  useEffect(() => {
    let active = true;
    setScopeState("off");
    if (!key) return () => { active = false; };
    void AsyncStorage.getItem(key).then((value) => {
      if (active) setScopeState(parseShareScope(value));
    });
    return () => { active = false; };
  }, [key]);

  const setScope = useCallback((next: ReadingShareScope) => {
    setScopeState(next);
    if (!key || !groupId || !userId) return;
    void AsyncStorage.setItem(key, next).catch(() => undefined);
    if (next === "off") {
      // Turning sharing off must remove the record, not merely hide it.
      void FirebaseDatabase.remove(
        FirebaseDatabase.ref(database, groupReadingPath(groupId, userId)),
      ).catch(() => undefined);
    }
  }, [groupId, key, userId]);

  return { scope, setScope };
}

/**
 * Publishes the reader's live position while they are in the Bible and chose to
 * share. One record per member per community, overwritten in place. Nothing is
 * written in the background, and the record is left to expire rather than
 * pretending the member is still reading.
 */
export function useReadingPublisher({
  groupId,
  userId,
  position,
  versionId,
  scope,
}: {
  groupId?: string;
  userId?: string;
  position: BiblePosition;
  versionId: BibleVersionId;
  scope: ReadingShareScope;
}) {
  const latest = useRef({ groupId, userId, position, versionId, scope });
  latest.current = { groupId, userId, position, versionId, scope };
  const published = useRef({ at: 0, key: "" });
  const trailing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!groupId || !userId || scope === "off") return undefined;
    let disposed = false;

    const write = () => {
      if (disposed) return;
      const current = latest.current;
      if (!current.groupId || !current.userId || current.scope === "off") return;
      if (AppState.currentState !== "active") return;

      const chapterOnly = current.scope === "chapter";
      const key = [
        current.versionId,
        current.position.book,
        current.position.chapter,
        chapterOnly ? 0 : current.position.verse,
        current.scope,
      ].join(":");
      const now = Date.now();
      if (key === published.current.key && now - published.current.at < READING_HEARTBEAT_MS - 2000) return;

      // A fast page turn must not become a write per verse: hold a changed
      // position until the minimum gap passes, then publish the latest one.
      const wait = 6000 - (now - published.current.at);
      if (key !== published.current.key && wait > 0) {
        clearTimeout(trailing.current);
        trailing.current = setTimeout(write, wait);
        return;
      }

      published.current = { at: now, key };
      void FirebaseDatabase.set(
        FirebaseDatabase.ref(database, groupReadingPath(current.groupId, current.userId)),
        {
          at: FirebaseDatabase.serverTimestamp(),
          book: current.position.book,
          chapter: current.position.chapter,
          // A chapter-level choice never sends a verse at all.
          verse: chapterOnly ? null : current.position.verse,
          scope: current.scope,
          versionId: current.versionId,
          platform: readingPlatform(),
        },
      ).catch(() => undefined);
    };

    // The visible verse settles after a short pause; the heartbeat keeps a long
    // uninterrupted read (and a reconnect) fresh without extra writes.
    const settle = setTimeout(write, READING_SETTLE_MS);
    const heartbeat = setInterval(write, READING_HEARTBEAT_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") write();
    });

    return () => {
      disposed = true;
      clearTimeout(settle);
      clearTimeout(trailing.current);
      trailing.current = undefined;
      clearInterval(heartbeat);
      subscription.remove();
    };
  }, [
    groupId,
    userId,
    scope,
    versionId,
    position.book,
    position.chapter,
    position.verse,
  ]);
}

/**
 * Reads the live reading positions for one community. The presence hook owns
 * the clock, so a member disappears on the same tick the community sees them
 * go inactive.
 */
export function useGroupReading(groupId?: string) {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const { now, presence } = useCommunityPresence(groupId);

  useEffect(() => {
    setSnapshot(null);
    if (!groupId) return undefined;
    return FirebaseDatabase.onValue(
      FirebaseDatabase.ref(database, `groupReading/${groupId}`),
      (value) => setSnapshot(value.val()),
      () => setSnapshot(null),
    );
  }, [groupId]);

  const entries: ReadingEntry[] = useMemo(
    () => deriveGroupReading(snapshot, presence, now),
    [snapshot, presence, now],
  );

  return { entries, now, presence };
}
