import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, RepeatMode, State, type Track } from "react-native-track-player";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@/state/encryption/local-storage";
import { nextBibleChapter, previousBibleChapter } from "../bible-canon";
import { AUDIO_TRANSLATION, fetchAudioJson, locateChapterTime, parseChapter, type AudioCatalog, type AudioChapter, type AudioChapterEntry } from "./catalog";
import { isTopicDefinition, isTopicLoop, isTopicTrackMetadata, normalizeTopicPause, TOPIC_PAUSE_KEY, TOPIC_PREPARATION_TIMEOUT_MS, topicDefinitionKey, type TopicDefinition, type TopicItem, type TopicLoop, type TopicOptions, type TopicSession, type TopicTrackMetadata } from "./topic-playback";
import { ensureTopicSilence } from "./topic-silence";

export type AudioPassage = { startVerse: number; endVerse: number; savedVerseId: string };
export type AudioRequest = { entry: AudioChapterEntry; index?: number; offset: number; autoplay: boolean; passage?: AudioPassage };
type VerseTrack = Track & { entry: AudioChapterEntry; verseIndex: number; passage?: AudioPassage; topic?: TopicTrackMetadata };
// Keep each manifest once; embedding it in every native track makes long queues quadratic.
const chapters = new Map<string, AudioChapter>();
const chapterLoads = new Map<string, Promise<AudioChapter>>();
export type AudioSession = { chapter: AudioChapter; entry: AudioChapterEntry; index: number; passage?: AudioPassage; topic?: TopicSession };
type Snapshot = { session?: AudioSession; pendingRequest?: AudioRequest; pendingTopic?: { definition: TopicDefinition; options: TopicOptions }; topicPauseSeconds: number; navigationRevision: number; playing: boolean; playWhenReady: boolean; loading: boolean; buffering: boolean; commandPending: boolean; position: number; problem: "network" | "unavailable" | null; speed: number; continuous: boolean; sleep: number | "chapter" };
let snapshot: Snapshot = { topicPauseSeconds: 3, navigationRevision: 0, playing: false, playWhenReady: false, loading: false, buffering: false, commandPending: false, position: 0, problem: null, speed: 1, continuous: true, sleep: 0 };
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSnapshot = () => snapshot;
export const getSessionGeneration = () => generation;
export async function hasNativeQueue() {
  try { return (await TrackPlayer.getQueue()).length > 0; } catch { return false; }
}
function update(value: Partial<Snapshot>) { snapshot = { ...snapshot, ...value }; listeners.forEach((listener) => listener()); }
let catalog: AudioCatalog | undefined;
export function setAudioCatalog(value: AudioCatalog) { catalog = value; }
export async function applyAudioCatalog(value: AudioCatalog) {
  catalog = value;
  const available = (entry: AudioChapterEntry) => value.chapters[`${entry.bookId}:${entry.chapter}`]?.manifestUrl === entry.manifestUrl;
  if (!pendingTopic && (pending ? !available(pending.entry) : snapshot.session && !available(snapshot.session.entry))) {
    await stop();
    return;
  }
  // While replacing a queue, the paused old tracks do not describe the new request.
  if (!setup || pending || pendingTopic) return;
  const token = generation;
  let withdrawnActive = false;
  await serial(async () => {
    if (token !== generation || pending || pendingTopic) return;
    const queue = await TrackPlayer.getQueue() as VerseTrack[];
    const active = await TrackPlayer.getActiveTrackIndex();
    if (token !== generation || pending || pendingTopic) return;
    if (active !== undefined && queue[active]?.entry && !available(queue[active].entry)) {
      withdrawnActive = true;
      return;
    }
    const removed = queue.flatMap((track, index) => track.entry && !available(track.entry) ? [index] : []);
    if (removed.length) {
      // Rebuild topic queues at passage granularity: a withdrawn range must never play partially.
      if (snapshot.session?.topic && activeTopic) {
        for (const resolved of activeTopic.resolved) if (!available(resolved.entry)) activeTopic.unavailable.add(resolved.item.id);
        activeTopic.resolved = activeTopic.resolved.filter((resolved) => available(resolved.entry));
        await rebuildTopicQueue(activeTopic, token);
      } else await TrackPlayer.remove(removed);
    }
  });
  if (withdrawnActive && token === generation && !pending && !pendingTopic) await stop();
}
let setup: Promise<void> | undefined;
let nativeCapabilitiesTopic: boolean | undefined;
let generation = 0;
let readRevision = 0;
let playbackListenersReady = false;
let remoteListenersReady = false;
const commands = new Set<symbol>();
let deadline = 0;
let pending: AudioRequest | undefined;
type PendingTopic = { definition: TopicDefinition; options: TopicOptions; restore?: TopicRestorePoint };
let pendingTopic: PendingTopic | undefined;
let appending: number | undefined;
let closing = false;
let savedWrites = Promise.resolve();
let savedAt = 0;
let mutations = Promise.resolve();
const serial = (operation: () => Promise<void>) => { const result = mutations.then(operation); mutations = result.catch(() => {}); return result; };
const POSITION_KEY = "koino.audio.position.v1";
type TopicRestorePoint = { itemId: string; index: number; phase: "verse" | "gap"; offset: number; speed: number; autoplay: boolean; completed?: boolean };
type ResolvedTopicItem = { item: TopicItem; itemIndex: number; entry: AudioChapterEntry; chapter: AudioChapter; indices: number[] };
type TopicRuntime = {
  definitionId: string; definition: TopicDefinition; mode: "single" | "all"; loop: TopicLoop; pauseSeconds: number;
  resolved: ResolvedTopicItem[]; unavailable: Set<string>; allResolved: boolean; selectedItemId: string;
  local: Map<string, string>; cacheRevision: number; installedCacheRevision: number;
  completed?: boolean;
  requestedSpeed?: number;
  resolutionRevision?: number;
  promotionScheduled?: boolean;
};
const topicRuntimes = new Map<string, TopicRuntime>();
let activeTopic: TopicRuntime | undefined;
let topicCommandProblem = false;
let topicCounter = 0;
let pauseRevision = 0;
let topicPreferenceLoaded = false;

export function isAudioPassage(value: unknown): value is AudioPassage {
  if (!value || typeof value !== "object") return false;
  const passage = value as AudioPassage;
  return Number.isSafeInteger(passage.startVerse) && passage.startVerse > 0
    && Number.isSafeInteger(passage.endVerse) && passage.endVerse >= passage.startVerse
    && typeof passage.savedVerseId === "string" && passage.savedVerseId.length > 0;
}
function samePassage(first?: AudioPassage, second?: AudioPassage) {
  return first?.startVerse === second?.startVerse && first?.endVerse === second?.endVerse && first?.savedVerseId === second?.savedVerseId;
}
function passageIndices(chapter: AudioChapter, passage?: AudioPassage) {
  return chapter.verses.flatMap((verse, index) => !passage || (verse.verse >= passage.startVerse && verse.verse <= passage.endVerse) ? [index] : []);
}
class UnavailablePassageError extends Error {}

export function adjacent(delta: number) {
  const value = snapshot.session;
  if (!value || value.passage || value.topic) return;
  const target = (delta < 0 ? previousBibleChapter : nextBibleChapter)(value.chapter.book, value.chapter.chapter);
  return Object.values(catalog?.chapters ?? {}).find((entry) => entry.book === target?.book && entry.chapter === target.chapter);
}
export async function savePosition() {
  const value = snapshot.session;
  if (!value || closing || pending || pendingTopic) return;
  savedAt = Date.now();
  const json = JSON.stringify({ entry: value.entry, index: value.index, offset: value.topic?.phase === "gap" ? value.topic.gapElapsedSeconds : snapshot.position, speed: value.topic ? activeTopic?.requestedSpeed ?? snapshot.speed : snapshot.speed, passage: value.passage, topic: value.topic });
  savedWrites = savedWrites.then(() => AsyncStorage.setItem(POSITION_KEY, json)).catch(() => {});
  await savedWrites;
}
export function ensurePlayer() {
  ensurePlaybackListeners();
  if (!setup) setup = (async () => {
    try { await TrackPlayer.getPlaybackState(); }
    catch { await TrackPlayer.setupPlayer({ autoHandleInterruptions: true, minBuffer: 15, maxBuffer: 60, playBuffer: 0.5 }); }
    await updateCapabilities(false);
  })().catch((error) => { setup = undefined; throw error; });
  return setup;
}
async function updateCapabilities(topic: boolean) {
  await TrackPlayer.updateOptions({ android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification }, capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SeekTo, ...topic ? [] : [Capability.SkipToNext, Capability.SkipToPrevious]], progressUpdateEventInterval: 1 });
  nativeCapabilitiesTopic = topic;
}
async function setNativeRepeat(loop: TopicLoop = "off") {
  // Older test adapters and legacy queues need not implement the topic-only API.
  if (typeof TrackPlayer.setRepeatMode === "function") await TrackPlayer.setRepeatMode(loop === "off" ? RepeatMode.Off : RepeatMode.Queue);
}

async function getChapter(entry: AudioChapterEntry): Promise<AudioChapter> {
  const key = `koino.audio.manifest.${entry.bookId}.${entry.chapter}.${entry.revision}`;
  const memory = chapters.get(entry.manifestUrl);
  if (memory) return memory;
  const inFlight = chapterLoads.get(entry.manifestUrl);
  if (inFlight) return inFlight;
  let abandoned = false;
  const work = withDeadline((async () => {
    let chapter: AudioChapter;
    try {
      const cached = await AsyncStorage.getItem(key);
      if (abandoned) throw new Error("Cancelled manifest read");
      if (!cached) throw new Error("No cached manifest");
      chapter = parseChapter(JSON.parse(cached), entry);
    } catch {
      if (abandoned) throw new Error("Cancelled manifest read");
      chapter = parseChapter(await fetchAudioJson(entry.manifestUrl), entry);
      if (abandoned) throw new Error("Cancelled manifest fetch");
      await AsyncStorage.setItem(key, JSON.stringify(chapter));
    }
    if (abandoned) throw new Error("Cancelled manifest read");
    chapters.set(entry.manifestUrl, chapter);
    return chapter;
  })(), 25_000, () => { abandoned = true; });
  chapterLoads.set(entry.manifestUrl, work);
  try { return await work; }
  finally { if (chapterLoads.get(entry.manifestUrl) === work) chapterLoads.delete(entry.manifestUrl); }
}
function withDeadline<T>(work: Promise<T>, milliseconds: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { onTimeout(); reject(new Error("Audio preparation timed out")); }, milliseconds);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

// Four downloads at a time; playback starts only after every requested verse is local.
async function downloadChapter(entry: AudioChapterEntry, token: number, passage?: AudioPassage): Promise<VerseTrack[]> {
  const chapter = await getChapter(entry);
  const indices = passageIndices(chapter, passage);
  if (passage && indices.length !== passage.endVerse - passage.startVerse + 1) throw new UnavailablePassageError("Missing passage verses");
  const directory = `${FileSystem.cacheDirectory}bible-audio/${entry.bookId}-${entry.chapter}-${entry.revision}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const tracks: VerseTrack[] = new Array(indices.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, tracks.length) }, async () => {
    while (cursor < indices.length) {
      if (generation !== token) throw new Error("Cancelled chapter download");
      const queueIndex = cursor++;
      const index = indices[queueIndex];
      const verse = chapter.verses[index];
      const uri = `${directory}${verse.verse}-${verse.sha256}.mp3`;
      const existing = await FileSystem.getInfoAsync(uri);
      if (!existing.exists || !existing.size) {
        const temporary = `${uri}.${token}.part`;
        try {
          const result = await FileSystem.downloadAsync(verse.url, temporary);
          const info = await FileSystem.getInfoAsync(temporary);
          if (generation !== token || result.status !== 200 || !info.exists || !info.size) throw new Error("Incomplete or cancelled verse download");
          await FileSystem.moveAsync({ from: temporary, to: uri });
        } catch (error) {
          await FileSystem.deleteAsync(temporary, { idempotent: true });
          throw error;
        }
      }
      tracks[queueIndex] = { id: `${entry.bookId}:${entry.chapter}:${entry.revision}:${index}`, url: uri, title: `${chapter.bookName} ${chapter.chapter}:${verse.verse}`, artist: "Reformationsbibeln", album: "Koino", duration: verse.duration, entry, verseIndex: index, passage };
    }
  }));
  return tracks;
}

async function prepareNext() {
  if (appending === generation || pending || pendingTopic || closing || !snapshot.continuous || snapshot.sleep === "chapter" || !snapshot.session || snapshot.session.passage || snapshot.session.topic) return;
  const entry = adjacent(1);
  if (!entry) return;
  const token = generation;
  appending = token;
  try {
    const queue = await TrackPlayer.getQueue() as VerseTrack[];
    if (queue.some((track) => track.entry?.manifestUrl === entry.manifestUrl)) return;
    const tracks = await downloadChapter(entry, token);
    await serial(async () => {
      if (token === generation && !pendingTopic && !snapshot.session?.passage && !snapshot.session?.topic && snapshot.continuous && snapshot.sleep !== "chapter" && catalog?.chapters[`${entry.bookId}:${entry.chapter}`]?.manifestUrl === entry.manifestUrl) await TrackPlayer.add(tracks);
    });
  } catch { /* The current chapter remains fully playable offline. */ }
  finally { if (appending === token) appending = undefined; }
}

export function startPassage(entry: AudioChapterEntry, passage: AudioPassage) {
  return start(entry, undefined, 0, true, passage);
}
export async function start(entry: AudioChapterEntry, index?: number, offset = 0, autoplay = true, passage?: AudioPassage) {
  const current = catalog?.chapters[`${entry.bookId}:${entry.chapter}`];
  entry = current ?? entry;
  const token = ++generation;
  ++readRevision;
  closing = false;
  pendingTopic = undefined; activeTopic = undefined;
  topicCommandProblem = false;
  pending = { entry, index, offset, autoplay, passage: passage ? { ...passage } : undefined };
  const request = pending;
  commands.clear();
  update({ pendingRequest: request, pendingTopic: undefined, loading: true, commandPending: false, playing: false, playWhenReady: false, buffering: false, problem: null });
  try {
    await ensurePlayer();
    await serial(async () => { if (token === generation) await TrackPlayer.pause(); });
    if ((catalog && !current) || (passage !== undefined && !isAudioPassage(passage))) throw new UnavailablePassageError("Unavailable passage");
    const tracks = await downloadChapter(entry, token, request.passage);
    await serial(async () => {
      if (token !== generation) return;
      await TrackPlayer.reset();
      await setNativeRepeat();
      await updateCapabilities(false);
      await TrackPlayer.add(tracks);
      const first = tracks[0].verseIndex;
      const selectedVerse = Number.isInteger(index) ? Math.max(first, Math.min(index!, tracks[tracks.length - 1].verseIndex)) : first;
      const selected = tracks.findIndex((track) => track.verseIndex === selectedVerse);
      await TrackPlayer.skip(selected, Math.max(0, Math.min(offset, tracks[selected].duration! - 0.05)));
      await TrackPlayer.setRate(snapshot.speed);
      if (token !== generation) return;
      pending = undefined;
      update({ session: { chapter: chapters.get(entry.manifestUrl)!, entry, index: tracks[selected].verseIndex, passage: request.passage }, pendingRequest: undefined, position: Math.max(0, Math.min(offset, tracks[selected].duration! - 0.05)), loading: false });
      if (autoplay) await TrackPlayer.play();
    });
    if (token === generation) { await syncFromNative(); void prepareNext(); }
  } catch (error) { if (token === generation) update({ loading: false, playing: false, playWhenReady: false, problem: error instanceof UnavailablePassageError ? "unavailable" : "network" }); }
}
export async function stop() {
  ++generation; ++readRevision; pending = undefined; pendingTopic = undefined; activeTopic = undefined; topicCommandProblem = false; deadline = 0; closing = true;
  commands.clear();
  update({ session: undefined, pendingRequest: undefined, pendingTopic: undefined, position: 0, playing: false, playWhenReady: false, loading: false, buffering: false, commandPending: false, problem: null, sleep: 0 });
  await serial(async () => { if (setup) { await ensurePlayer(); await TrackPlayer.reset(); } });
  await savedWrites;
  if (closing) await AsyncStorage.removeItem(POSITION_KEY);
}
// Commands read native intent, so missed events cannot turn Pause into another Play.
async function command(operation: () => Promise<void>) {
  const token = generation;
  if (closing || pending || pendingTopic || !snapshot.session) return;
  const id = Symbol();
  commands.add(id);
  update({ commandPending: true });
  try {
    await serial(async () => {
      if (closing || pending || pendingTopic || token !== generation) return;
      ++readRevision;
      await operation();
      ++readRevision;
    });
    if (token === generation && !closing) { await syncFromNative(); await savePosition(); }
  } catch { if (token === generation && !closing) { if (snapshot.session?.topic) topicCommandProblem = true; update({ problem: "network" }); await savePosition(); } }
  finally { commands.delete(id); if (token === generation) update({ commandPending: commands.size > 0 }); }
}
async function playOrReplay() {
  if ((await TrackPlayer.getPlaybackState()).state === State.Ended || (snapshot.session?.topic && activeTopic?.completed)) {
    if (snapshot.session?.passage || snapshot.session?.topic) await TrackPlayer.skip(0, 0);
    else await TrackPlayer.seekTo(0);
  }
  if (activeTopic) activeTopic.completed = false;
  await TrackPlayer.play();
}
export async function toggle() {
  if (topicCommandProblem && snapshot.session?.topic) { await retry(); return; }
  await command(async () => {
    const [state, intent] = await Promise.all([TrackPlayer.getPlaybackState(), TrackPlayer.getPlayWhenReady()]);
    if (state.state === State.Ended || (snapshot.session?.topic && activeTopic?.completed)) await playOrReplay();
    else if (intent) await TrackPlayer.pause();
    else await TrackPlayer.play();
    update({ problem: null });
  });
}
async function seekInChapter(seconds: number) {
  const session = snapshot.session;
  if (!session) return;
  if (session.topic) { await seekInTopic(seconds); return; }
  const indices = passageIndices(session.chapter, session.passage);
  const target = locateChapterTime(indices.map((index) => session.chapter.verses[index]), seconds);
  const queue = await TrackPlayer.getQueue() as VerseTrack[];
  const index = queue.findIndex((track) => track.entry?.manifestUrl === session.entry.manifestUrl && samePassage(track.passage, session.passage) && track.verseIndex === indices[target.index]);
  if (index >= 0) {
    const intent = await TrackPlayer.getPlayWhenReady();
    await TrackPlayer.skip(index, target.offset);
    if (!intent) await TrackPlayer.pause();
  }
}
export async function seek(seconds: number) { await command(() => seekInChapter(seconds)); update({ navigationRevision: snapshot.navigationRevision + 1 }); }
export async function move(delta: number) {
  await syncFromNative();
  await command(async () => {
    const session = snapshot.session;
    if (!session) return;
    if (session.topic) {
      const item = session.topic.definition.items[session.topic.itemIndex];
      const indices = passageIndices(session.chapter, { startVerse: item.startVerse, endVerse: item.endVerse, savedVerseId: item.id });
      const index = indices.indexOf(session.index) + delta;
      if (index >= 0 && index < indices.length) await seekInTopic(indices.slice(0, index).reduce((sum, verseIndex) => sum + session.chapter.verses[verseIndex].duration, 0));
      return;
    }
    const indices = passageIndices(session.chapter, session.passage);
    const index = indices.indexOf(session.index) + delta;
    if (index >= 0 && index < indices.length) await seekInChapter(indices.slice(0, index).reduce((n, verseIndex) => n + session.chapter.verses[verseIndex].duration, 0));
  });
}
export async function moveChapter(delta: number) {
  await syncFromNative();
  const token = generation;
  const entry = adjacent(delta);
  if (!entry || pending || closing) return;
  let uncachedIntent: boolean | undefined;
  await command(async () => {
    const intent = await TrackPlayer.getPlayWhenReady();
    const queue = await TrackPlayer.getQueue() as VerseTrack[];
    const index = queue.findIndex((track) => track.entry?.manifestUrl === entry.manifestUrl && track.verseIndex === 0);
    if (index >= 0) { await TrackPlayer.skip(index, 0); if (!intent) await TrackPlayer.pause(); }
    else uncachedIntent = intent;
  });
  if (uncachedIntent !== undefined && token === generation && !pending && !closing) await start(entry, 0, 0, uncachedIntent);
}
export async function setSpeed(speed: number) {
  if (![0.75, 1, 1.25, 1.5, 2].includes(speed)) return;
  if (snapshot.session?.topic && activeTopic) {
    await command(async () => { if (activeTopic) { activeTopic.requestedSpeed = speed; await rebuildTopicQueue(activeTopic, generation, { speed }); } });
  } else {
    await serial(async () => { update({ speed }); if (setup) await TrackPlayer.setRate(speed); });
    await savePosition();
  }
}
async function trimUpcoming() {
  await serial(async () => {
    if (!setup) return;
    const session = snapshot.session;
    if (session?.topic || pendingTopic) return;
    const queue = await TrackPlayer.getQueue() as VerseTrack[];
    const active = await TrackPlayer.getActiveTrackIndex();
    const indices = queue.flatMap((track, index) => index > (active ?? -1) && track.entry.manifestUrl !== session?.entry.manifestUrl ? [index] : []);
    if (indices.length) await TrackPlayer.remove(indices);
  });
}
export async function setContinuous(continuous: boolean) { update({ continuous }); if (continuous) await prepareNext(); else await trimUpcoming(); }
export async function setSleep(sleep: number | "chapter") {
  if (snapshot.session?.topic && sleep === "chapter") return;
  update({ sleep }); deadline = typeof sleep === "number" && sleep > 0 ? Date.now() + sleep * 60000 : 0;
  if (sleep === "chapter") await trimUpcoming(); else await prepareNext();
}
export function retry() {
  if (pendingTopic) return beginTopic(pendingTopic.definition, pendingTopic.options, pendingTopic.restore);
  const request = pending;
  if (request) return start(request.entry, request.index, request.offset, request.autoplay, request.passage);
  if (snapshot.session?.topic) {
    const session = snapshot.session;
    const topic = session.topic!;
    return beginTopic(topic.definition, { mode: topic.mode, initialItemId: topic.definition.items[topic.itemIndex].id, pauseSeconds: topic.pauseSeconds, loop: topic.loop }, { itemId: topic.definition.items[topic.itemIndex].id, index: session.index, phase: topic.phase, offset: topic.phase === "gap" ? topic.gapElapsedSeconds ?? 0 : snapshot.position, speed: activeTopic?.requestedSpeed ?? snapshot.speed, autoplay: true });
  }
  const session = snapshot.session;
  if (session) return start(session.entry, session.index, snapshot.position, true, session.passage);
}

export async function loadTopicPreferences() {
  if (topicPreferenceLoaded) return;
  const revision = pauseRevision;
  try {
    const stored = await AsyncStorage.getItem(TOPIC_PAUSE_KEY);
    const value = stored === null ? 3 : Number(stored);
    if (revision === pauseRevision && Number.isInteger(value) && value >= 0 && value <= 60) update({ topicPauseSeconds: value });
  } catch { /* Keep the default if private storage is temporarily unavailable. */ }
  topicPreferenceLoaded = true;
}

function checkTopicGeneration(token: number) { if (token !== generation || closing) throw new Error("Cancelled topic playback"); }
function topicEntry(item: TopicItem) {
  return Object.values(catalog?.chapters ?? {}).find((entry) => entry.book === item.book && entry.chapter === item.chapter);
}
async function resolveTopicItem(runtime: TopicRuntime, itemIndex: number, token: number, resolutionRevision?: number): Promise<ResolvedTopicItem | undefined> {
  const check = () => { checkTopicGeneration(token); if (resolutionRevision !== undefined && runtime.resolutionRevision !== resolutionRevision) throw new Error("Cancelled topic preparation"); };
  const item = runtime.definition.items[itemIndex];
  const previous = runtime.resolved.find((resolved) => resolved.item.id === item.id);
  if (previous) return previous;
  const entry = topicEntry(item);
  if (!entry) { runtime.unavailable.add(item.id); return; }
  const chapter = await getChapter(entry);
  check();
  const indices = chapter.verses.flatMap((verse, index) => verse.verse >= item.startVerse && verse.verse <= item.endVerse ? [index] : []);
  if (indices.length !== item.endVerse - item.startVerse + 1) { runtime.unavailable.add(item.id); return; }
  const resolved = { item, itemIndex, entry, chapter, indices };
  await Promise.all(indices.map((index) => rememberTopicCache(runtime, resolved, index).catch(() => {})));
  check();
  runtime.resolved.push(resolved);
  runtime.resolved.sort((a, b) => a.itemIndex - b.itemIndex);
  return resolved;
}
async function resolveAllTopicItems(runtime: TopicRuntime, token: number) {
  if (runtime.allResolved) return;
  const revision = runtime.resolutionRevision = (runtime.resolutionRevision ?? 0) + 1;
  let cursor = 0;
  await withDeadline(Promise.all(Array.from({ length: Math.min(4, runtime.definition.items.length) }, async () => {
    while (cursor < runtime.definition.items.length) {
      checkTopicGeneration(token);
      if (runtime.resolutionRevision !== revision) throw new Error("Cancelled topic preparation");
      const index = cursor++;
      if (!runtime.unavailable.has(runtime.definition.items[index].id)) await resolveTopicItem(runtime, index, token, revision);
    }
  })), TOPIC_PREPARATION_TIMEOUT_MS, () => { if (runtime.resolutionRevision === revision) runtime.resolutionRevision++; });
  checkTopicGeneration(token);
  runtime.allResolved = true;
}
function recordingKey(resolved: ResolvedTopicItem, index: number) { return resolved.chapter.verses[index].url; }
function recordingUri(resolved: ResolvedTopicItem, index: number) {
  const verse = resolved.chapter.verses[index];
  return `${FileSystem.cacheDirectory}bible-audio/${resolved.entry.bookId}-${resolved.entry.chapter}-${resolved.entry.revision}/${verse.verse}-${verse.sha256}.mp3`;
}
async function rememberTopicCache(runtime: TopicRuntime, resolved: ResolvedTopicItem, index: number) {
  const uri = recordingUri(resolved, index);
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && info.size) runtime.local.set(recordingKey(resolved, index), uri);
}
async function downloadTopicRecordings(runtime: TopicRuntime, items: ResolvedTopicItem[], token: number, ahead = false) {
  const unique = new Map<string, { resolved: ResolvedTopicItem; index: number }>();
  for (const resolved of items) for (const index of resolved.indices) unique.set(recordingKey(resolved, index), { resolved, index });
  const jobs = [...unique.values()];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      checkTopicGeneration(token);
      const { resolved, index } = jobs[cursor++];
      const verse = resolved.chapter.verses[index];
      const uri = recordingUri(resolved, index);
      if (!runtime.local.has(verse.url)) {
        await rememberTopicCache(runtime, resolved, index);
        if (!runtime.local.has(verse.url)) {
          await FileSystem.makeDirectoryAsync(uri.slice(0, uri.lastIndexOf("/") + 1), { intermediates: true });
          const temporary = `${uri}.${token}.topic.part`;
          try {
            const result = await FileSystem.downloadAsync(verse.url, temporary);
            const info = await FileSystem.getInfoAsync(temporary);
            checkTopicGeneration(token);
            if (result.status !== 200 || !info.exists || !info.size) throw new Error("Incomplete topic recording");
            await FileSystem.moveAsync({ from: temporary, to: uri });
            runtime.local.set(verse.url, uri);
          } catch (error) {
            await FileSystem.deleteAsync(temporary, { idempotent: true });
            if (!ahead || token !== generation) throw error;
            // The queue still contains its validated remote URL. A native playback
            // failure is surfaced with Retry; an optional prefetch failure is not.
            continue;
          }
        }
        runtime.cacheRevision++;
        if (ahead) void substituteTopicCache(runtime, token);
      }
    }
  }));
}
function topicSession(runtime: TopicRuntime, itemId: string, phase: "verse" | "gap", gapElapsed = 0): TopicSession {
  return {
    definition: runtime.definition, mode: runtime.mode, loop: runtime.loop, pauseSeconds: runtime.pauseSeconds,
    itemIndex: runtime.definition.items.findIndex((item) => item.id === itemId), phase,
    unavailableItemIds: [...runtime.unavailable], resolvedItemCount: runtime.allResolved ? runtime.resolved.length : undefined,
    gapElapsedSeconds: phase === "gap" ? gapElapsed : undefined,
    gapRemainingSeconds: phase === "gap" ? Math.max(0, runtime.pauseSeconds - gapElapsed) : undefined,
    completed: runtime.completed || undefined,
  };
}
async function persistTopicRuntime(runtime: TopicRuntime) {
  await AsyncStorage.setItem(topicDefinitionKey(runtime.definitionId), JSON.stringify({ definition: runtime.definition, unavailableItemIds: [...runtime.unavailable] }));
}
function topicEntryAvailable(entry: AudioChapterEntry) {
  return !catalog || catalog.chapters[`${entry.bookId}:${entry.chapter}`]?.manifestUrl === entry.manifestUrl;
}
function pruneTopicCatalog(runtime: TopicRuntime) {
  const previous = runtime.resolved.length;
  runtime.resolved = runtime.resolved.filter((resolved) => {
    if (topicEntryAvailable(resolved.entry)) return true;
    runtime.unavailable.add(resolved.item.id); return false;
  });
  return previous !== runtime.resolved.length;
}
async function topicTracks(runtime: TopicRuntime, currentItemId: string, speed: number): Promise<VerseTrack[]> {
  const selected = runtime.loop === "passage" || runtime.mode === "single"
    ? runtime.resolved.filter((resolved) => resolved.item.id === currentItemId) : runtime.resolved;
  if (!selected.length) throw new UnavailablePassageError("No playable topic passages");
  const silence = runtime.pauseSeconds > 0 ? await ensureTopicSilence(runtime.pauseSeconds * speed) : undefined;
  const tracks: VerseTrack[] = [];
  for (let itemIndex = 0; itemIndex < selected.length; itemIndex++) {
    const resolved = selected[itemIndex];
    for (let index = 0; index < resolved.indices.length; index++) {
      const verseIndex = resolved.indices[index];
      const verse = resolved.chapter.verses[verseIndex];
      const topic: TopicTrackMetadata = { definitionId: runtime.definitionId, itemId: resolved.item.id, mode: runtime.mode, loop: runtime.loop, pauseSeconds: runtime.pauseSeconds, phase: "verse" };
      const track: VerseTrack = {
        id: `${runtime.definitionId}:${resolved.item.id}:${verseIndex}:verse`,
        url: runtime.local.get(verse.url) ?? verse.url, duration: verse.duration,
        title: `${resolved.chapter.bookName} ${resolved.chapter.chapter}:${verse.verse}`, artist: "Reformationsbibeln", album: runtime.definition.title,
        entry: resolved.entry, verseIndex, topic,
      };
      tracks.push(track);
      const final = itemIndex === selected.length - 1 && index === resolved.indices.length - 1;
      if (silence && (!final || runtime.loop !== "off")) tracks.push({
        ...track, id: `${runtime.definitionId}:${resolved.item.id}:${verseIndex}:gap`, url: silence,
        duration: runtime.pauseSeconds * speed, topic: { ...topic, phase: "gap", gapSeconds: runtime.pauseSeconds },
      });
    }
  }
  return tracks;
}
function publishTopicTrack(runtime: TopicRuntime, track: VerseTrack, nativeOffset: number, speed: number) {
  const resolved = runtime.resolved.find((item) => item.item.id === track.topic!.itemId)!;
  const phase = track.topic!.phase;
  update({ session: { chapter: resolved.chapter, entry: resolved.entry, index: track.verseIndex, topic: topicSession(runtime, resolved.item.id, phase, phase === "gap" ? nativeOffset / speed : 0) }, position: phase === "gap" ? resolved.chapter.verses[track.verseIndex].duration : nativeOffset });
}
type TopicQueueChange = { speed?: number; itemId?: string; restore?: TopicRestorePoint; intent?: boolean; requireLocalFirst?: boolean };
/** Called only inside serial(): all queue edits preserve a freshly read native position. */
async function rebuildTopicQueue(runtime: TopicRuntime, token: number, change: TopicQueueChange = {}) {
  checkTopicGeneration(token);
  const [intent, state] = await Promise.all([TrackPlayer.getPlayWhenReady(), TrackPlayer.getPlaybackState()]);
  checkTopicGeneration(token);
  await TrackPlayer.pause();
  const [active, progress, rate] = await Promise.all([TrackPlayer.getActiveTrackIndex(), TrackPlayer.getProgress(), TrackPlayer.getRate()]);
  const previous = active === undefined ? undefined : await TrackPlayer.getTrack(active) as VerseTrack | undefined;
  checkTopicGeneration(token);
  const same = previous?.topic?.definitionId === runtime.definitionId;
  const restore = change.restore;
  let itemId = change.itemId ?? restore?.itemId ?? (same ? previous!.topic!.itemId : runtime.selectedItemId);
  runtime.selectedItemId = itemId;
  const speed = change.speed ?? restore?.speed ?? snapshot.speed;
  const phase = change.itemId ? "verse" : restore?.phase ?? (same ? previous!.topic!.phase : "verse");
  const verseIndex = change.itemId ? runtime.resolved.find((item) => item.item.id === itemId)?.indices[0] : restore?.index ?? (same ? previous!.verseIndex : undefined);
  const elapsed = change.itemId ? 0 : restore?.offset ?? (same ? phase === "gap" ? progress.position / rate : progress.position : 0);
  const ready = change.intent ?? restore?.autoplay ?? (intent && state.state !== State.Ended && state.state !== State.Error);
  checkTopicGeneration(token);
  if (state.state === State.Ended) runtime.completed = true;
  if (change.itemId || restore) runtime.completed = restore?.completed ?? false;
  if (runtime.mode === "all" && runtime.loop !== "passage") await resolveAllTopicItems(runtime, token);
  const selectAvailable = async () => {
    pruneTopicCatalog(runtime);
    if (runtime.resolved.some((resolved) => resolved.item.id === itemId)) return;
    if (runtime.mode === "single") throw new UnavailablePassageError("Topic recording was withdrawn");
    await resolveAllTopicItems(runtime, token);
    pruneTopicCatalog(runtime);
    const oldIndex = runtime.definition.items.findIndex((item) => item.id === itemId);
    const next = runtime.resolved.find((resolved) => resolved.itemIndex >= oldIndex) ?? runtime.resolved[0];
    if (!next) throw new UnavailablePassageError("No topic recordings remain available");
    itemId = next.item.id; runtime.selectedItemId = itemId;
  };
  await selectAvailable();
  if (change.requireLocalFirst) {
    await downloadTopicRecordings(runtime, runtime.resolved.filter((item) => item.item.id === itemId), token);
    if (pruneTopicCatalog(runtime)) {
      await selectAvailable();
      await downloadTopicRecordings(runtime, runtime.resolved.filter((item) => item.item.id === itemId), token);
    }
  }
  let tracks = await topicTracks(runtime, itemId, speed);
  if (pruneTopicCatalog(runtime)) { await selectAvailable(); tracks = await topicTracks(runtime, itemId, speed); }
  checkTopicGeneration(token);
  let selected = tracks.findIndex((track) => track.topic!.itemId === itemId && track.verseIndex === verseIndex && track.topic!.phase === phase);
  let offset = phase === "gap" ? elapsed * speed : elapsed;
  let finished = false;
  if (selected < 0 && phase === "gap") {
    // A shorter or zero pause may already be over. Continue after its preceding verse.
    const before = tracks.findIndex((track) => track.topic!.itemId === itemId && track.verseIndex === verseIndex && track.topic!.phase === "verse");
    selected = before + 1; offset = 0;
    if (selected >= tracks.length) { selected = runtime.loop === "off" ? Math.max(0, before) : 0; finished = runtime.loop === "off"; }
  } else if (selected >= 0 && phase === "gap" && elapsed >= runtime.pauseSeconds) {
    selected++; offset = 0;
    if (selected >= tracks.length) { selected = runtime.loop === "off" ? tracks.length - 1 : 0; finished = runtime.loop === "off"; }
  }
  if (selected < 0) selected = Math.max(0, tracks.findIndex((track) => track.topic!.itemId === itemId));
  if (finished) { runtime.completed = true; offset = Math.max(0, (tracks[selected].duration ?? 0) - 0.05); }
  offset = Math.max(0, Math.min(offset, Math.max(0, (tracks[selected].duration ?? 0) - 0.05)));
  await persistTopicRuntime(runtime);
  checkTopicGeneration(token);
  await TrackPlayer.reset();
  checkTopicGeneration(token);
  if (tracks.some((track) => !topicEntryAvailable(track.entry))) throw new UnavailablePassageError("Topic recording was withdrawn");
  await TrackPlayer.add(tracks);
  await TrackPlayer.skip(selected, offset);
  await TrackPlayer.setRate(speed);
  await setNativeRepeat(runtime.loop);
  await updateCapabilities(true);
  checkTopicGeneration(token);
  if (tracks.some((track) => !topicEntryAvailable(track.entry))) { await TrackPlayer.reset(); throw new UnavailablePassageError("Topic recording was withdrawn"); }
  runtime.installedCacheRevision = runtime.cacheRevision;
  runtime.requestedSpeed = undefined;
  topicCommandProblem = false;
  update({ speed, problem: null });
  publishTopicTrack(runtime, tracks[selected], offset, speed);
  if (ready && !finished && !runtime.completed) await TrackPlayer.play();
}
async function substituteTopicCache(runtime: TopicRuntime, token: number) {
  if (runtime.promotionScheduled) return;
  runtime.promotionScheduled = true;
  await serial(async () => {
    let originalIntent = false;
    let editing = false;
    try {
      if (token !== generation || closing || pending || pendingTopic || activeTopic !== runtime || runtime.cacheRevision === runtime.installedCacheRevision) return;
      const index = await TrackPlayer.getActiveTrackIndex();
      const track = index === undefined ? undefined : await TrackPlayer.getTrack(index) as VerseTrack | undefined;
      const intent = await TrackPlayer.getPlayWhenReady();
      originalIntent = intent;
      const state = await TrackPlayer.getPlaybackState();
      if (state.state === State.Ended || state.state === State.Error || topicCommandProblem) return;
      if (intent && track?.topic?.phase !== "gap") return;
      checkTopicGeneration(token);
      let active = index;
      let queue = await TrackPlayer.getQueue() as VerseTrack[];
      const replacement = (queued: VerseTrack) => {
        if (queued.topic?.definitionId !== runtime.definitionId || queued.topic.phase !== "verse") return;
        const resolved = runtime.resolved.find((item) => item.item.id === queued.topic!.itemId);
        const local = resolved && runtime.local.get(recordingKey(resolved, queued.verseIndex));
        return local && queued.url !== local ? local : undefined;
      };
      if (!queue.some((queued, i) => i !== active && replacement(queued))) {
        if (!queue.some((queued) => replacement(queued))) runtime.installedCacheRevision = runtime.cacheRevision;
        return;
      }
      ++readRevision;
      if (intent) await TrackPlayer.pause();
      editing = true;
      active = await TrackPlayer.getActiveTrackIndex();
      queue = await TrackPlayer.getQueue() as VerseTrack[];
      checkTopicGeneration(token);
      let promoted = 0;
      for (let i = queue.length - 1; i >= 0; i--) {
        const queued = queue[i];
        const local = replacement(queued);
        if (!local) continue;
        if (i === active) continue;
        // Insert then remove the old copy. The active item is never reloaded and
        // retains its native clock, even if playback advances near a gap boundary.
        await TrackPlayer.add({ ...queued, url: local }, i);
        await TrackPlayer.remove(i + 1);
        checkTopicGeneration(token);
        if (++promoted >= 4) break;
      }
      const remaining = await TrackPlayer.getQueue() as VerseTrack[];
      if (!remaining.some((queued) => replacement(queued))) runtime.installedCacheRevision = runtime.cacheRevision;
      if (intent && token === generation && !closing && !pending && !pendingTopic) await TrackPlayer.play();
      ++readRevision;
    } catch {
      if (token !== generation || closing || pending || pendingTopic || activeTopic !== runtime) return;
      try {
        // An insert may have succeeded before removal failed. Reconstructing
        // restores the exact queue and its active clock before resuming.
        if (editing) await rebuildTopicQueue(runtime, token, { intent: originalIntent });
        else if (originalIntent) await TrackPlayer.play();
      } catch {
        if (token === generation && !closing && !pending && !pendingTopic) {
          topicCommandProblem = true;
          update({ problem: "network", playing: false, playWhenReady: false });
          await savePosition();
        }
      }
      ++readRevision;
    }
  }).catch(() => {}).finally(() => { runtime.promotionScheduled = false; });
}
export function startTopicPlaylist(definition: TopicDefinition, options: TopicOptions) { return beginTopic(definition, options); }
async function beginTopic(definition: TopicDefinition, options: TopicOptions, restore?: TopicRestorePoint) {
  const token = ++generation;
  ++readRevision; closing = false; pending = undefined; activeTopic = undefined; topicCommandProblem = false;
  const frozen = isTopicDefinition(definition) ? { ...definition, items: definition.items.map((item) => ({ ...item })) } : definition;
  const request: PendingTopic = { definition: frozen, options: { ...options, pauseSeconds: normalizeTopicPause(options.pauseSeconds ?? snapshot.topicPauseSeconds), loop: options.loop ?? "off" }, restore };
  pendingTopic = request; commands.clear();
  update({ pendingRequest: undefined, pendingTopic: { definition: frozen, options: request.options }, loading: true, commandPending: false, playing: false, playWhenReady: false, buffering: false, problem: null, sleep: snapshot.sleep === "chapter" ? 0 : snapshot.sleep });
  try {
    await ensurePlayer();
    await serial(async () => { if (token === generation) await TrackPlayer.pause(); });
    if (!isTopicDefinition(frozen) || frozen.translation !== AUDIO_TRANSLATION || !frozen.items.length || !isTopicLoop(request.options.loop) || !["single", "all"].includes(options.mode)) throw new UnavailablePassageError("Unavailable topic audio");
    checkTopicGeneration(token);
    const initial = frozen.items.findIndex((item) => item.id === options.initialItemId);
    const initialIndex = initial < 0 ? 0 : initial;
    const runtime: TopicRuntime = { definitionId: `${frozen.id}:${Date.now().toString(36)}:${++topicCounter}`, definition: frozen, mode: options.loop === "topic" ? "all" : options.mode, loop: request.options.loop!, pauseSeconds: request.options.pauseSeconds!, resolved: [], unavailable: new Set(), allResolved: false, selectedItemId: frozen.items[initialIndex].id, local: new Map(), cacheRevision: 0, installedCacheRevision: -1 };
    let first = await resolveTopicItem(runtime, initialIndex, token);
    if (!first && runtime.mode === "all") {
      for (let i = initialIndex + 1; i < frozen.items.length && !first; i++) first = await resolveTopicItem(runtime, i, token);
    }
    if (!first) throw new UnavailablePassageError("No recording for requested topic passage");
    runtime.selectedItemId = first.item.id;
    request.options.initialItemId = first.item.id;
    update({ pendingTopic: { definition: frozen, options: { ...request.options } } });
    // Manifest preparation overlaps the first passage download. Later audio can
    // stream natively even when JavaScript is suspended before prefetch completes.
    await Promise.all([downloadTopicRecordings(runtime, [first], token), runtime.mode === "all" ? resolveAllTopicItems(runtime, token) : Promise.resolve()]);
    checkTopicGeneration(token);
    runtime.pauseSeconds = request.options.pauseSeconds!;
    topicRuntimes.set(runtime.definitionId, runtime);
    await serial(async () => {
      if (token !== generation) return;
      await rebuildTopicQueue(runtime, token, { restore: restore && { ...restore, itemId: first!.item.id }, itemId: restore ? undefined : first!.item.id, intent: restore?.autoplay ?? true, requireLocalFirst: true });
      if (token !== generation) return;
      activeTopic = runtime; pendingTopic = undefined;
      update({ pendingTopic: undefined, loading: false });
    });
    if (token === generation) {
      await syncFromNative(); await savePosition();
      if (runtime.mode === "all") void downloadTopicRecordings(runtime, runtime.resolved, token, true).catch(() => {});
    }
  } catch (error) {
    if (token === generation) update({ loading: false, playing: false, playWhenReady: false, problem: error instanceof UnavailablePassageError ? "unavailable" : "network" });
  }
}
export async function setTopicPause(seconds: number) {
  const pause = normalizeTopicPause(seconds);
  ++pauseRevision; update({ topicPauseSeconds: pause });
  savedWrites = savedWrites.then(() => AsyncStorage.setItem(TOPIC_PAUSE_KEY, String(pause))).catch(() => {});
  if (pendingTopic) {
    pendingTopic.options.pauseSeconds = pause;
    update({ pendingTopic: { definition: pendingTopic.definition, options: { ...pendingTopic.options } } });
  } else if (snapshot.session?.topic && activeTopic) {
    await command(async () => {
      if (activeTopic) {
        activeTopic.pauseSeconds = pause;
        const session = snapshot.session;
        if (session?.topic) update({ session: { ...session, topic: { ...session.topic, pauseSeconds: pause, gapRemainingSeconds: session.topic.phase === "gap" ? Math.max(0, pause - (session.topic.gapElapsedSeconds ?? 0)) : undefined } } });
        await rebuildTopicQueue(activeTopic, generation);
      }
    });
  }
  await savedWrites;
}
export async function setTopicLoop(loop: TopicLoop) {
  if (!isTopicLoop(loop)) return;
  const token = generation;
  await command(async () => {
    const runtime = activeTopic;
    if (!runtime) return;
    const active = await TrackPlayer.getActiveTrackIndex();
    const track = active === undefined ? undefined : await TrackPlayer.getTrack(active) as VerseTrack | undefined;
    const intent = await TrackPlayer.getPlayWhenReady();
    await TrackPlayer.pause();
    checkTopicGeneration(token);
    if (track?.topic?.definitionId === runtime.definitionId) runtime.selectedItemId = track.topic.itemId;
    runtime.loop = loop;
    if (loop === "topic") runtime.mode = "all";
    const session = snapshot.session;
    if (session?.topic) update({ session: { ...session, topic: { ...session.topic, mode: runtime.mode, loop } } });
    if (runtime.mode === "all") await resolveAllTopicItems(runtime, token);
    await rebuildTopicQueue(runtime, token, { intent });
    if (runtime.mode === "all") void downloadTopicRecordings(runtime, runtime.resolved, token, true).catch(() => {});
  });
}
export async function moveTopicPassage(delta: number) {
  await syncFromNative();
  const token = generation;
  await command(async () => {
    const runtime = activeTopic, session = snapshot.session;
    if (!runtime || !session?.topic || !Number.isInteger(delta) || !delta) return;
    const intent = await TrackPlayer.getPlayWhenReady();
    await TrackPlayer.pause();
    await resolveAllTopicItems(runtime, token);
    const position = runtime.resolved.findIndex((item) => item.itemIndex === session.topic!.itemIndex);
    const target = runtime.resolved[position + delta];
    if (!target) { if (intent) await TrackPlayer.play(); return; }
    await rebuildTopicQueue(runtime, token, { itemId: target.item.id, intent });
    update({ navigationRevision: snapshot.navigationRevision + 1 });
  });
}
async function seekInTopic(seconds: number) {
  const session = snapshot.session;
  if (!session?.topic || !Number.isFinite(seconds)) return;
  const item = session.topic.definition.items[session.topic.itemIndex];
  const indices = session.chapter.verses.flatMap((verse, index) => verse.verse >= item.startVerse && verse.verse <= item.endVerse ? [index] : []);
  const target = locateChapterTime(indices.map((index) => session.chapter.verses[index]), seconds);
  const queue = await TrackPlayer.getQueue() as VerseTrack[];
  const index = queue.findIndex((track) => track.topic?.itemId === item.id && track.topic.phase === "verse" && track.verseIndex === indices[target.index]);
  if (index < 0) return;
  const intent = await TrackPlayer.getPlayWhenReady();
  if (activeTopic) activeTopic.completed = false;
  await TrackPlayer.skip(index, target.offset);
  if (!intent) await TrackPlayer.pause();
}
export async function restoreTopicPlayback(value: unknown): Promise<boolean> {
  if (!value || typeof value !== "object") return false;
  const saved = value as { topic?: TopicSession; index?: number; offset?: number; speed?: number };
  const topic = saved.topic;
  if (!topic || !isTopicDefinition(topic.definition) || !["single", "all"].includes(topic.mode) || !isTopicLoop(topic.loop)
    || !Number.isInteger(topic.pauseSeconds) || topic.pauseSeconds < 0 || topic.pauseSeconds > 60
    || !Number.isInteger(topic.itemIndex) || topic.itemIndex < 0 || topic.itemIndex >= topic.definition.items.length
    || !["verse", "gap"].includes(topic.phase) || !Number.isInteger(saved.index) || saved.index! < 0
    || typeof saved.offset !== "number" || !Number.isFinite(saved.offset) || saved.offset < 0
    || ![0.75, 1, 1.25, 1.5, 2].includes(saved.speed!) || (topic.completed !== undefined && typeof topic.completed !== "boolean")) return false;
  const initialGeneration = generation;
  if (snapshot.session || snapshot.loading || await hasNativeQueue() || initialGeneration !== generation) return false;
  const itemId = topic.definition.items[topic.itemIndex].id;
  await beginTopic(topic.definition, { mode: topic.mode, initialItemId: itemId, pauseSeconds: topic.pauseSeconds, loop: topic.loop }, { itemId, index: saved.index!, phase: topic.phase, offset: saved.offset, speed: saved.speed!, autoplay: false, completed: topic.completed });
  return true;
}
async function topicRuntimeFromTrack(track: VerseTrack, chapter: AudioChapter, token: number): Promise<TopicRuntime | undefined> {
  const metadata = track.topic;
  if (!isTopicTrackMetadata(metadata)) return;
  let runtime = topicRuntimes.get(metadata.definitionId);
  if (!runtime) {
    const json = await AsyncStorage.getItem(topicDefinitionKey(metadata.definitionId));
    if (!json) return;
    const saved = JSON.parse(json) as { definition: TopicDefinition; unavailableItemIds?: string[] };
    if (!isTopicDefinition(saved.definition) || saved.definition.translation !== AUDIO_TRANSLATION) return;
    runtime = { definitionId: metadata.definitionId, definition: saved.definition, mode: metadata.mode, loop: metadata.loop, pauseSeconds: metadata.pauseSeconds, resolved: [], unavailable: new Set(Array.isArray(saved.unavailableItemIds) ? saved.unavailableItemIds.filter((id) => typeof id === "string") : []), allResolved: false, selectedItemId: metadata.itemId, local: new Map(), cacheRevision: 0, installedCacheRevision: 0 };
    topicRuntimes.set(runtime.definitionId, runtime);
  }
  checkTopicGeneration(token);
  const itemIndex = runtime.definition.items.findIndex((item) => item.id === metadata.itemId);
  const item = runtime.definition.items[itemIndex];
  if (!item || item.book !== chapter.book || item.chapter !== chapter.chapter) return;
  const indices = chapter.verses.flatMap((verse, index) => verse.verse >= item.startVerse && verse.verse <= item.endVerse ? [index] : []);
  if (indices.length !== item.endVerse - item.startVerse + 1 || !indices.includes(track.verseIndex)) return;
  if (!runtime.resolved.some((resolved) => resolved.item.id === item.id)) {
    const resolved = { item, itemIndex, entry: track.entry, chapter, indices };
    await Promise.all(indices.map((index) => rememberTopicCache(runtime, resolved, index).catch(() => {})));
    checkTopicGeneration(token);
    runtime.resolved.push(resolved);
  }
  runtime.resolved.sort((a, b) => a.itemIndex - b.itemIndex);
  runtime.selectedItemId = item.id;
  return runtime;
}

// Events are hints to reconcile native state, never the sole source of UI truth.
// Read the index twice to avoid assigning one track's progress to another track.
export async function syncFromNative(): Promise<boolean> {
  if (closing || pending || pendingTopic) return false;
  const token = generation;
  const revision = ++readRevision;
  try {
    const index = await TrackPlayer.getActiveTrackIndex();
    if (index === undefined || index === null) return false;
    const [track, progress, state, intent, rate] = await Promise.all([
      TrackPlayer.getTrack(index), TrackPlayer.getProgress(), TrackPlayer.getPlaybackState(), TrackPlayer.getPlayWhenReady(), TrackPlayer.getRate(),
    ]);
    const verse = track as VerseTrack | undefined;
    if (!verse?.entry || !Number.isInteger(verse.verseIndex) || (verse.passage !== undefined && !isAudioPassage(verse.passage)) || (verse.topic !== undefined && !isTopicTrackMetadata(verse.topic))) return false;
    const chapter = await getChapter(verse.entry);
    const runtime = verse.topic ? await topicRuntimeFromTrack(verse, chapter, token) : undefined;
    if (verse.topic && !runtime) return false;
    if (runtime && nativeCapabilitiesTopic !== true) await serial(async () => {
      if (token === generation && !closing && !pending && !pendingTopic && nativeCapabilitiesTopic !== true) await updateCapabilities(true);
    });
    const active = await TrackPlayer.getActiveTrackIndex();
    if (active !== index || token !== generation || revision !== readRevision || closing || pending || pendingTopic) return false;
    const item = chapter.verses[verse.verseIndex];
    if (!item || !Number.isFinite(progress.position) || (verse.passage && (item.verse < verse.passage.startVerse || item.verse > verse.passage.endVerse))) return false;
    const old = snapshot.session;
    const changed = old?.entry.manifestUrl !== verse.entry.manifestUrl || old.index !== verse.verseIndex || !samePassage(old.passage, verse.passage)
      || old?.topic?.definition.id !== runtime?.definition.id || old?.topic?.definition.items[old.topic.itemIndex]?.id !== verse.topic?.itemId || old?.topic?.phase !== verse.topic?.phase;
    if (runtime) { activeTopic = runtime; if (state.state === State.Ended) runtime.completed = true; }
    const topic = runtime && verse.topic ? topicSession(runtime, verse.topic.itemId, verse.topic.phase, verse.topic.phase === "gap" ? Math.max(0, Math.min(progress.position / rate, verse.topic.gapSeconds!)) : 0) : undefined;
    update({
      session: changed || topic ? { chapter, entry: verse.entry, index: verse.verseIndex, passage: verse.passage, topic } : old,
      position: verse.topic?.phase === "gap" ? item.duration : Math.max(0, Math.min(progress.position, item.duration)),
      playing: state.state === State.Playing, playWhenReady: intent && state.state !== State.Ended && state.state !== State.Error,
      loading: false, buffering: state.state === State.Loading || state.state === State.Buffering, speed: rate,
      problem: state.state === State.Error || (runtime && topicCommandProblem) ? "network" : state.state === State.Playing || state.state === State.Paused ? null : snapshot.problem,
    });
    if (changed || Date.now() - savedAt >= 5000) void savePosition();
    if (changed) void prepareNext();
    if (runtime && (verse.topic?.phase === "gap" || !intent)) void substituteTopicCache(runtime, token);
    return true;
  } catch { return false; /* Uninitialized native player or temporarily unavailable manifest. */ }
}

export function ensurePlaybackListeners() {
  if (playbackListenersReady) return;
  playbackListenersReady = true;
  TrackPlayer.addEventListener(Event.PlaybackState, () => { void syncFromNative(); });
  TrackPlayer.addEventListener(Event.PlaybackError, () => { if (!closing) update({ problem: "network", playing: false, playWhenReady: false, buffering: false }); });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => { void syncFromNative(); });
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => {
    void syncFromNative();
    if (deadline && Date.now() >= deadline) { deadline = 0; update({ sleep: 0 }); void command(() => TrackPlayer.pause()); }
  });
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (closing || pending || pendingTopic) return;
    const token = generation;
    void (async () => {
      await syncFromNative();
      // Ignore delayed end events from a queue that has since changed or resumed.
      const state = await TrackPlayer.getPlaybackState();
      if (closing || pending || pendingTopic || token !== generation || state.state !== State.Ended) return;
      if (snapshot.sleep === "chapter") update({ sleep: 0 });
      else if (snapshot.continuous && !snapshot.session?.passage && !snapshot.session?.topic) { const entry = adjacent(1); if (entry) await start(entry); else update({ problem: "unavailable" }); }
    })().catch(() => {});
  });
}

// Mounted by the provider only while the app is foregrounded; paused sessions also reconcile.
export function observeForeground() {
  ensurePlaybackListeners();
  void syncFromNative();
  let polling = false;
  const timer = setInterval(() => {
    if (polling || closing || pending || pendingTopic || (!snapshot.session && !setup)) return;
    polling = true;
    void syncFromNative().finally(() => { polling = false; });
  }, 500);
  return () => clearInterval(timer);
}

export async function playbackService() {
  ensurePlaybackListeners();
  if (remoteListenersReady) return;
  remoteListenersReady = true;
  TrackPlayer.addEventListener(Event.RemotePlay, () => { void syncFromNative().then(() => topicCommandProblem && snapshot.session?.topic ? retry() : command(playOrReplay)); });
  TrackPlayer.addEventListener(Event.RemotePause, () => { void syncFromNative().then(() => command(() => TrackPlayer.pause())); });
  TrackPlayer.addEventListener(Event.RemoteStop, () => { void stop(); });
  TrackPlayer.addEventListener(Event.RemoteNext, () => { void moveChapter(1); });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => { void moveChapter(-1); });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => { void command(async () => {
    if (snapshot.session?.topic) {
      const active = await TrackPlayer.getActiveTrackIndex();
      const track = active === undefined ? undefined : await TrackPlayer.getTrack(active);
      if (Number.isFinite(position) && typeof track?.duration === "number") await TrackPlayer.seekTo(Math.max(0, Math.min(position, track.duration - 0.05)));
      return;
    }
    const duration = snapshot.session?.chapter.verses[snapshot.session.index]?.duration;
    if (Number.isFinite(position) && duration) await TrackPlayer.seekTo(Math.max(0, Math.min(position, duration - 0.05)));
  }); });
  await syncFromNative();
}
