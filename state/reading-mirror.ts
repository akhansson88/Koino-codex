// Live reading mirror: when a member taps Follow, they may watch the other
// member's reader move in real time. The follower has read access only. No
// path in the database lets a follower write the other member's reading, and
// the stream exists only while at least one follower is watching.
//
// The regular groupReading record stays the coarse, privacy-preserving signal
// (book/chapter, or verse). This mirror record adds the anchor within the page
// and the sharer's own highlights for the chapter they are in. It is written
// only with verse-level sharing, only while followed, and it is overwritten in
// place rather than appended, so it can never become a reading history.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import * as FirebaseDatabase from "firebase/database";
import { database } from "@/state/store/firebase";
import type { BiblePosition, BibleVersionId } from "@/features/bible-kjv";
import type { ReadingScope } from "@/state/reading-model";
import {
  followerPath,
  followersPath,
  mirrorPath,
  mirrorStatus,
  parseMirrorRecord,
  MIRROR_HEARTBEAT_MS,
  MIRROR_PUBLISH_INTERVAL_MS,
  type MirrorAnchor,
  type MirrorRecord,
} from "@/state/reading-mirror-model";

export * from "@/state/reading-mirror-model";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

type PublisherOptions = {
  getAnchor?: () => MirrorAnchor;
  groupId?: string;
  highlights?: Record<number, string>;
  position: BiblePosition;
  scope: ReadingScope | "off";
  selection?: number[];
  userId?: string;
  versionId: BibleVersionId;
};

/**
 * Publishes the extra mirror detail (anchor inside the page and the sharer's
 * chapter highlights) while at least one member follows. Nothing is published
 * without a follower, so the richer stream does not exist most of the time.
 */
export function useReadingMirrorPublisher({
  getAnchor,
  groupId,
  highlights,
  position,
  scope,
  selection,
  userId,
  versionId,
}: PublisherOptions) {
  const [followerCount, setFollowerCount] = useState(0);
  const followers = useRef(0);
  const latest = useRef({ getAnchor, highlights, position, selection, versionId, scope, groupId, userId });
  latest.current = { getAnchor, highlights, position, selection, versionId, scope, groupId, userId };

  useEffect(() => {
    followers.current = 0;
    setFollowerCount(0);
    if (!groupId || !userId) return undefined;

    const node = FirebaseDatabase.ref(database, followersPath(groupId, userId));
    const stop = FirebaseDatabase.onValue(node, (snapshot) => {
      const value = snapshot.val();
      const count = isRecord(value) ? Object.keys(value).length : 0;
      followers.current = count;
      setFollowerCount(count);
      if (count === 0) {
        void FirebaseDatabase.remove(
          FirebaseDatabase.ref(database, mirrorPath(groupId, userId)),
        ).catch(() => undefined);
      }
    }, () => {
      followers.current = 0;
      setFollowerCount(0);
    });
    return stop;
  }, [groupId, userId]);

  useEffect(() => {
    if (!groupId || !userId) return undefined;

    if (scope !== "verse") {
      void FirebaseDatabase.remove(
        FirebaseDatabase.ref(database, mirrorPath(groupId, userId)),
      ).catch(() => undefined);
      return undefined;
    }

    let disposed = false;
    const live = FirebaseDatabase.ref(database, mirrorPath(groupId, userId));
    const disconnect = FirebaseDatabase.onDisconnect(live);
    void disconnect.remove().catch(() => undefined);

    let lastWriteAt = 0;
    let lastBody = "";

    const write = () => {
      if (disposed) return;
      const current = latest.current;
      if (!current.groupId || !current.userId || current.scope !== "verse") return;
      if (followers.current === 0) return;
      if (AppState.currentState !== "active") return;

      const anchor = current.getAnchor?.();
      const anchorVerse = anchor?.verse ?? current.position.verse;
      const anchorOffset = anchor ? anchor.offset : 0;
      const selection = current.selection && current.selection.length > 0
        ? {
          end: Math.max(...current.selection),
          start: Math.min(...current.selection),
        }
        : undefined;
      const ownHighlights: Record<string, string> = {};
      for (const [verse, color] of Object.entries(current.highlights ?? {})) {
        if (hexColor(color)) ownHighlights[verse] = color;
      }

      const payload = {
        anchorOffset,
        anchorVerse,
        book: current.position.book,
        chapter: current.position.chapter,
        ...(Object.keys(ownHighlights).length > 0 ? { highlights: ownHighlights } : {}),
        ...(selection ? { selection } : {}),
        verse: current.position.verse,
        versionId: current.versionId,
      };
      const body = JSON.stringify(payload);
      const now = Date.now();
      if (body === lastBody && now - lastWriteAt < MIRROR_HEARTBEAT_MS) return;
      lastWriteAt = now;
      lastBody = body;

      void FirebaseDatabase.set(live, {
        ...payload,
        at: FirebaseDatabase.serverTimestamp(),
      }).catch(() => undefined);
    };

    write();
    const timer = setInterval(write, MIRROR_PUBLISH_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(timer);
      void disconnect.cancel().catch(() => undefined);
      void FirebaseDatabase.remove(live).catch(() => undefined);
    };
  }, [groupId, scope, userId]);

  return { followerCount };
}

type MirrorFollowerOptions = {
  enabled: boolean;
  followerUserId?: string;
  groupId?: string;
  targetUserId?: string;
};

/**
 * Declares the follower interest and subscribes to the target's mirror stream.
 * The follower entry is removed on sign-out, on app exit and on disconnect, so
 * a sharer never keeps publishing to a screen that is gone.
 */
export function useReadingMirror({
  enabled,
  followerUserId,
  groupId,
  targetUserId,
}: MirrorFollowerOptions) {
  const [record, setRecord] = useState<MirrorRecord | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    setRecord(undefined);
  }, [enabled, groupId, targetUserId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!enabled || !groupId || !targetUserId || !followerUserId) return undefined;
    if (targetUserId === followerUserId) return undefined;

    const entry = FirebaseDatabase.ref(database, followerPath(groupId, targetUserId, followerUserId));
    const disconnect = FirebaseDatabase.onDisconnect(entry);
    void disconnect.remove().catch(() => undefined);
    const declareFollower = () => {
      void FirebaseDatabase.set(entry, {
        at: FirebaseDatabase.serverTimestamp(),
        userId: followerUserId,
      }).catch(() => undefined);
    };
    declareFollower();
    // A long watch refreshes the declaration so the daily sweep cannot mistake
    // an idle-but-open mirror for an abandoned one.
    const heartbeat = setInterval(declareFollower, 5 * 60 * 1000);

    const live = FirebaseDatabase.ref(database, mirrorPath(groupId, targetUserId));
    const stop = FirebaseDatabase.onValue(live, (snapshot) => {
      const parsed = parseMirrorRecord(snapshot.val());
      setRecord(parsed);
      setNow(Date.now());
    }, () => setRecord(undefined));

    return () => {
      stop();
      clearInterval(heartbeat);
      void disconnect.cancel().catch(() => undefined);
      void FirebaseDatabase.remove(entry).catch(() => undefined);
    };
  }, [enabled, followerUserId, groupId, targetUserId]);

  const status = useMemo(
    () => mirrorStatus(record, now, startedAt.current),
    [now, record],
  );

  const clear = useCallback(() => setRecord(undefined), []);

  return { clear, record, status };
}

/** Subscribe to how many members currently follow this member's reading. */
export function useReadingFollowers(groupId?: string, userId?: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    if (!groupId || !userId) return undefined;
    return FirebaseDatabase.onValue(
      FirebaseDatabase.ref(database, followersPath(groupId, userId)),
      (snapshot) => {
        const value = snapshot.val();
        setCount(isRecord(value) ? Object.keys(value).length : 0);
      },
      () => setCount(0),
    );
  }, [groupId, userId]);

  return count;
}
