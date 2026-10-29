/** A topic list is copied when playback starts, so later voting cannot reorder it. */
export type TopicItem = { id: string; reference: string; book: string; chapter: number; startVerse: number; endVerse: number };
export type TopicDefinition = { id: string; topic: string; title: string; translation: string; items: TopicItem[]; unavailableCount: number; searchSessionId?: string; windowed?: boolean };
export type TopicLoop = "off" | "passage" | "topic";
export type TopicOptions = { mode: "single" | "all"; initialItemId?: string; pauseSeconds?: number; loop?: TopicLoop };
export type TopicSession = {
  definition: TopicDefinition; mode: "single" | "all"; loop: TopicLoop; pauseSeconds: number;
  itemIndex: number; phase: "verse" | "gap"; unavailableItemIds: string[];
  gapElapsedSeconds?: number; gapRemainingSeconds?: number; resolvedItemCount?: number;
  completed?: boolean;
};
/** The native queue carries an ID rather than duplicating the full list per verse. */
export type TopicTrackMetadata = {
  definitionId: string; itemId: string; mode: "single" | "all"; loop: TopicLoop;
  pauseSeconds: number; phase: "verse" | "gap"; gapSeconds?: number;
};
export const TOPIC_PAUSE_KEY = "koino.audio.topic.pause.v1";
export const TOPIC_PREPARATION_TIMEOUT_MS = 45_000;
export const topicDefinitionKey = (id: string) => `koino.audio.topic.definition.v1.${encodeURIComponent(id)}`;
export const normalizeTopicPause = (seconds: number) => Math.round(Math.max(0, Math.min(60, Number.isFinite(seconds) ? seconds : 3)));
export function isTopicLoop(value: unknown): value is TopicLoop { return value === "off" || value === "passage" || value === "topic"; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 1000; }
export function isTopicItem(value: unknown): value is TopicItem {
  return object(value) && text(value.id) && text(value.reference) && text(value.book)
    && Number.isSafeInteger(value.chapter) && Number(value.chapter) > 0 && Number(value.chapter) <= 150
    && Number.isSafeInteger(value.startVerse) && Number(value.startVerse) > 0
    && Number.isSafeInteger(value.endVerse) && Number(value.endVerse) >= Number(value.startVerse) && Number(value.endVerse) <= 200;
}
export function isTopicDefinition(value: unknown): value is TopicDefinition {
  return object(value) && text(value.id) && text(value.topic) && text(value.title) && text(value.translation)
    && (value.searchSessionId === undefined || text(value.searchSessionId))
    && (value.windowed === undefined || typeof value.windowed === "boolean")
    && Array.isArray(value.items) && (value.windowed === true || value.items.length <= 2000) && value.items.every(isTopicItem)
    && new Set(value.items.map((item) => item.id)).size === value.items.length
    && Number.isSafeInteger(value.unavailableCount) && Number(value.unavailableCount) >= 0;
}
export function isTopicTrackMetadata(value: unknown): value is TopicTrackMetadata {
  return object(value) && text(value.definitionId) && text(value.itemId) && (value.mode === "single" || value.mode === "all")
    && isTopicLoop(value.loop) && Number.isInteger(value.pauseSeconds) && Number(value.pauseSeconds) >= 0 && Number(value.pauseSeconds) <= 60
    && (value.phase === "verse" || value.phase === "gap")
    && (value.phase !== "gap" || (typeof value.gapSeconds === "number" && Number.isFinite(value.gapSeconds) && value.gapSeconds > 0 && value.gapSeconds <= 60));
}
