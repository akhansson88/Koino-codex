// Presence is deliberately a small, server-timed model. A member has one
// session record per device; the server writes the offline state itself through
// onDisconnect so a killed app never lingers as online.

export const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const PRESENCE_INACTIVE_WINDOW_MS = 30 * 60 * 1000;
export const PRESENCE_HEARTBEAT_MS = 60 * 1000;
export const PRESENCE_TICK_MS = 30 * 1000;

export type PresenceSessionState = "online" | "away" | "offline" | "hidden";

export type PresenceStatus = "online" | "inactive" | "offline" | "hidden";

export type PresenceSession = {
  state?: unknown;
  at?: unknown;
  platform?: unknown;
};

export type PresenceUserRecord = {
  sessions?: unknown;
};

export type PresenceInfo = {
  status: PresenceStatus;
  lastSeen?: number;
};

export type PresenceByUser = Record<string, PresenceInfo>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sessionTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function deriveUserPresence(record: unknown, now: number): PresenceInfo {
  if (!isRecord(record)) return { status: "offline" };
  const sessions = isRecord(record.sessions) ? Object.values(record.sessions) : [];
  let lastSeen: number | undefined;
  let hasOnlineSession = false;
  let hasRecentSession = false;
  let hasHiddenSession = false;
  let hasVisibleSession = false;

  for (const candidate of sessions) {
    if (!isRecord(candidate)) continue;
    const session = candidate as PresenceSession;
    const at = sessionTimestamp(session.at);
    const stamp = at === undefined ? undefined : Math.min(at, now);
    if (stamp !== undefined && (lastSeen === undefined || stamp > lastSeen)) lastSeen = stamp;

    if (session.state === "hidden") {
      hasHiddenSession = true;
      continue;
    }
    hasVisibleSession = true;
    if (stamp === undefined) continue;
    if (session.state === "online" && now - stamp <= PRESENCE_ONLINE_WINDOW_MS) hasOnlineSession = true;
    if (now - stamp <= PRESENCE_INACTIVE_WINDOW_MS) hasRecentSession = true;
  }

  if (hasOnlineSession) return lastSeen === undefined ? { status: "online" } : { status: "online", lastSeen };
  if (hasRecentSession) return lastSeen === undefined ? { status: "inactive" } : { status: "inactive", lastSeen };
  if (hasHiddenSession && !hasVisibleSession) return lastSeen === undefined ? { status: "hidden" } : { status: "hidden", lastSeen };
  return lastSeen === undefined ? { status: "offline" } : { status: "offline", lastSeen };
}

export function derivePresence(snapshot: unknown, now: number): PresenceByUser {
  if (!isRecord(snapshot)) return {};
  const presence: PresenceByUser = {};
  for (const [userId, record] of Object.entries(snapshot)) {
    presence[userId] = deriveUserPresence(record, now);
  }
  return presence;
}

export function presenceCounts(presence: PresenceByUser, userIds: Iterable<string>) {
  const counts = { online: 0, inactive: 0, offline: 0, hidden: 0 };
  for (const userId of userIds) {
    const status = presence[userId]?.status ?? "offline";
    counts[status] += 1;
  }
  return counts;
}

export function comparePresenceMembers(
  left: { id: string; name: string; lastSeen?: number },
  right: { id: string; name: string; lastSeen?: number },
  status: PresenceStatus,
  language: string,
) {
  if (status === "inactive" || status === "offline") {
    const leftSeen = left.lastSeen ?? -1;
    const rightSeen = right.lastSeen ?? -1;
    if (leftSeen !== rightSeen) return rightSeen - leftSeen;
  }
  return left.name.localeCompare(right.name, language);
}
