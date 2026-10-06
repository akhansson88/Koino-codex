export type StartupMilestone =
  | "jsStart"
  | "bibleInitializationStart"
  | "bibleInitializationReady"
  | "bibleInitializationError"
  | "authReady"
  | "profileReady"
  | "userGroupsReady"
  | "homeContentReady"
  | "firstScreenMounted";

export type StartupMark = {
  name: StartupMilestone;
  elapsedMs: number;
  timestampMs: number;
  detail?: string;
};

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const jsStartTimestamp = clock();
const marks = new Map<StartupMilestone, StartupMark>();

function publishStartupMarks() {
  (globalThis as typeof globalThis & { __KOINO_STARTUP_MARKS__?: StartupMark[] }).__KOINO_STARTUP_MARKS__ =
    Array.from(marks.values());
}

export function markStartupMilestone(name: StartupMilestone, detail?: string) {
  const existing = marks.get(name);
  if (existing) return existing;

  const timestampMs = clock();
  const mark: StartupMark = {
    name,
    elapsedMs: Math.round((timestampMs - jsStartTimestamp) * 10) / 10,
    timestampMs,
    ...(detail ? { detail } : {}),
  };
  marks.set(name, mark);
  publishStartupMarks();
  console.info(`[startup] ${name} +${mark.elapsedMs}ms${detail ? ` (${detail})` : ""}`);
  return mark;
}

export function getStartupMarks() {
  return Array.from(marks.values());
}

markStartupMilestone("jsStart");
