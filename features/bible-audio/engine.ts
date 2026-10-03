import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, State, type Track } from "react-native-track-player";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@/state/encryption/local-storage";
import { nextBibleChapter, previousBibleChapter } from "../bible-canon";
import { fetchAudioJson, locateChapterTime, parseChapter, type AudioCatalog, type AudioChapter, type AudioChapterEntry } from "./catalog";

type VerseTrack = Track & { entry: AudioChapterEntry; verseIndex: number };
// Keep each manifest once; embedding it in every native track makes long queues quadratic.
const chapters = new Map<string, AudioChapter>();
export type AudioSession = { chapter: AudioChapter; entry: AudioChapterEntry; index: number };
type Snapshot = { session?: AudioSession; navigationRevision: number; playing: boolean; playWhenReady: boolean; loading: boolean; buffering: boolean; commandPending: boolean; position: number; problem: "network" | "unavailable" | null; speed: number; continuous: boolean; sleep: number | "chapter" };
let snapshot: Snapshot = { navigationRevision: 0, playing: false, playWhenReady: false, loading: false, buffering: false, commandPending: false, position: 0, problem: null, speed: 1, continuous: true, sleep: 0 };
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
  if ((pending && !available(pending)) || (snapshot.session && !available(snapshot.session.entry))) {
    await stop();
    return;
  }
  if (!setup) return;
  let withdrawnActive = false;
  await serial(async () => {
    const queue = await TrackPlayer.getQueue() as VerseTrack[];
    const active = await TrackPlayer.getActiveTrackIndex();
    if (active !== undefined && queue[active]?.entry && !available(queue[active].entry)) {
      withdrawnActive = true;
      return;
    }
    const removed = queue.flatMap((track, index) => track.entry && !available(track.entry) ? [index] : []);
    if (removed.length) await TrackPlayer.remove(removed);
  });
  if (withdrawnActive) await stop();
}
let setup: Promise<void> | undefined;
let generation = 0;
let readRevision = 0;
let playbackListenersReady = false;
let remoteListenersReady = false;
const commands = new Set<symbol>();
let deadline = 0;
let pending: AudioChapterEntry | undefined;
let appending: number | undefined;
let closing = false;
let savedWrites = Promise.resolve();
let savedAt = 0;
let mutations = Promise.resolve();
const serial = (operation: () => Promise<void>) => { const result = mutations.then(operation); mutations = result.catch(() => {}); return result; };
const POSITION_KEY = "koino.audio.position.v1";

export function adjacent(delta: number) {
  const value = snapshot.session;
  if (!value) return;
  const target = (delta < 0 ? previousBibleChapter : nextBibleChapter)(value.chapter.book, value.chapter.chapter);
  return Object.values(catalog?.chapters ?? {}).find((entry) => entry.book === target?.book && entry.chapter === target.chapter);
}
export async function savePosition() {
  const value = snapshot.session;
  if (!value || closing) return;
  savedAt = Date.now();
  const json = JSON.stringify({ entry: value.entry, index: value.index, offset: snapshot.position, speed: snapshot.speed });
  savedWrites = savedWrites.then(() => AsyncStorage.setItem(POSITION_KEY, json)).catch(() => {});
  await savedWrites;
}
export function ensurePlayer() {
  ensurePlaybackListeners();
  if (!setup) setup = (async () => {
    try { await TrackPlayer.getPlaybackState(); }
    catch { await TrackPlayer.setupPlayer({ autoHandleInterruptions: true, minBuffer: 15, maxBuffer: 60, playBuffer: 0.5 }); }
    await TrackPlayer.updateOptions({ android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification }, capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo], progressUpdateEventInterval: 1 });
  })().catch((error) => { setup = undefined; throw error; });
  return setup;
}

async function getChapter(entry: AudioChapterEntry): Promise<AudioChapter> {
  const key = `koino.audio.manifest.${entry.bookId}.${entry.chapter}.${entry.revision}`;
  const memory = chapters.get(entry.manifestUrl);
  if (memory) return memory;
  let chapter: AudioChapter;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (!cached) throw new Error("No cached manifest");
    chapter = parseChapter(JSON.parse(cached), entry);
  } catch {
    chapter = parseChapter(await fetchAudioJson(entry.manifestUrl), entry);
    await AsyncStorage.setItem(key, JSON.stringify(chapter));
  }
  chapters.set(entry.manifestUrl, chapter);
  return chapter;
}

// Four downloads at a time; playback starts only after every verse is local.
async function downloadChapter(entry: AudioChapterEntry, token: number): Promise<VerseTrack[]> {
  const chapter = await getChapter(entry);
  const directory = `${FileSystem.cacheDirectory}bible-audio/${entry.bookId}-${entry.chapter}-${entry.revision}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const tracks: VerseTrack[] = new Array(chapter.verses.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, tracks.length) }, async () => {
    while (cursor < chapter.verses.length) {
      if (generation !== token) throw new Error("Cancelled chapter download");
      const index = cursor++;
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
      tracks[index] = { id: `${entry.bookId}:${entry.chapter}:${entry.revision}:${index}`, url: uri, title: `${chapter.bookName} ${chapter.chapter}:${verse.verse}`, artist: `Reformationsbibeln · ${chapter.voiceName ?? (chapter.voice === "onyx" ? "Onyx" : "AI")}`, album: "Koino", duration: verse.duration, entry, verseIndex: index };
    }
  }));
  return tracks;
}

async function prepareNext() {
  if (appending === generation || pending || closing || !snapshot.continuous || snapshot.sleep === "chapter" || !snapshot.session) return;
  const entry = adjacent(1);
  if (!entry) return;
  const token = generation;
  appending = token;
  try {
    const queue = await TrackPlayer.getQueue() as VerseTrack[];
    if (queue.some((track) => track.entry?.manifestUrl === entry.manifestUrl)) return;
    const tracks = await downloadChapter(entry, token);
    await serial(async () => {
      if (token === generation && snapshot.continuous && snapshot.sleep !== "chapter" && catalog?.chapters[`${entry.bookId}:${entry.chapter}`]?.manifestUrl === entry.manifestUrl) await TrackPlayer.add(tracks);
    });
  } catch { /* The current chapter remains fully playable offline. */ }
  finally { if (appending === token) appending = undefined; }
}

export async function start(entry: AudioChapterEntry, index = 0, offset = 0, autoplay = true) {
  const current = catalog?.chapters[`${entry.bookId}:${entry.chapter}`];
  if (catalog && !current) { update({ problem: "unavailable" }); return; }
  entry = current ?? entry;
  const token = ++generation;
  ++readRevision;
  closing = false;
  pending = entry;
  commands.clear();
  update({ loading: true, commandPending: false, playing: false, playWhenReady: false, buffering: false, problem: null });
  try {
    await ensurePlayer();
    await serial(async () => { if (token === generation) await TrackPlayer.pause(); });
    const tracks = await downloadChapter(entry, token);
    await serial(async () => {
      if (token !== generation) return;
      await TrackPlayer.reset();
      await TrackPlayer.add(tracks);
      const selected = Math.max(0, Math.min(index, tracks.length - 1));
      await TrackPlayer.skip(selected, Math.max(0, Math.min(offset, tracks[selected].duration! - 0.05)));
      await TrackPlayer.setRate(snapshot.speed);
      if (token !== generation) return;
      pending = undefined;
      update({ session: { chapter: chapters.get(entry.manifestUrl)!, entry, index: selected }, position: Math.max(0, Math.min(offset, tracks[selected].duration! - 0.05)), loading: false });
      if (autoplay) await TrackPlayer.play();
    });
    if (token === generation) { await syncFromNative(); void prepareNext(); }
  } catch { if (token === generation) update({ loading: false, playing: false, problem: "network" }); }
}
export async function stop() {
  ++generation; ++readRevision; pending = undefined; deadline = 0; closing = true;
  commands.clear();
  update({ session: undefined, position: 0, playing: false, playWhenReady: false, loading: false, buffering: false, commandPending: false, problem: null, sleep: 0 });
  await serial(async () => { if (setup) { await ensurePlayer(); await TrackPlayer.reset(); } });
  await savedWrites;
  if (closing) await AsyncStorage.removeItem(POSITION_KEY);
}
// Commands read native intent, so missed events cannot turn Pause into another Play.
async function command(operation: () => Promise<void>) {
  const token = generation;
  if (closing || pending || !snapshot.session) return;
  const id = Symbol();
  commands.add(id);
  update({ commandPending: true });
  try {
    await serial(async () => {
      if (closing || pending || token !== generation) return;
      ++readRevision;
      await operation();
      ++readRevision;
    });
    if (token === generation && !closing) { await syncFromNative(); await savePosition(); }
  } catch { if (token === generation && !closing) update({ problem: "network" }); }
  finally { commands.delete(id); if (token === generation) update({ commandPending: commands.size > 0 }); }
}
export async function toggle() {
  await command(async () => {
    const [state, intent] = await Promise.all([TrackPlayer.getPlaybackState(), TrackPlayer.getPlayWhenReady()]);
    if (state.state === State.Ended) { await TrackPlayer.seekTo(0); await TrackPlayer.play(); }
    else if (intent) await TrackPlayer.pause();
    else await TrackPlayer.play();
    update({ problem: null });
  });
}
async function seekInChapter(seconds: number) {
  const session = snapshot.session;
  if (!session) return;
  const target = locateChapterTime(session.chapter.verses, seconds);
  const queue = await TrackPlayer.getQueue() as VerseTrack[];
  const index = queue.findIndex((track) => track.entry?.manifestUrl === session.entry.manifestUrl && track.verseIndex === target.index);
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
    const index = session.index + delta;
    if (index >= 0 && index < session.chapter.verses.length) await seekInChapter(session.chapter.verses.slice(0, index).reduce((n, verse) => n + verse.duration, 0));
  });
}
export async function moveChapter(delta: number) {
  await syncFromNative();
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
  if (uncachedIntent !== undefined && !closing) await start(entry, 0, 0, uncachedIntent);
}
export async function setSpeed(speed: number) { update({ speed }); if (setup) await TrackPlayer.setRate(speed); await savePosition(); }
async function trimUpcoming() {
  await serial(async () => {
    if (!setup) return;
    const session = snapshot.session;
    const queue = await TrackPlayer.getQueue() as VerseTrack[];
    const active = await TrackPlayer.getActiveTrackIndex();
    const indices = queue.flatMap((track, index) => index > (active ?? -1) && track.entry.manifestUrl !== session?.entry.manifestUrl ? [index] : []);
    if (indices.length) await TrackPlayer.remove(indices);
  });
}
export async function setContinuous(continuous: boolean) { update({ continuous }); if (continuous) await prepareNext(); else await trimUpcoming(); }
export async function setSleep(sleep: number | "chapter") {
  update({ sleep }); deadline = typeof sleep === "number" && sleep > 0 ? Date.now() + sleep * 60000 : 0;
  if (sleep === "chapter") await trimUpcoming(); else await prepareNext();
}
export function retry() { const entry = pending ?? snapshot.session?.entry; if (entry) void start(entry, pending ? 0 : snapshot.session?.index, pending ? 0 : snapshot.position); }

// Events are hints to reconcile native state, never the sole source of UI truth.
// Read the index twice to avoid assigning one track's progress to another track.
export async function syncFromNative(): Promise<boolean> {
  if (closing || pending) return false;
  const token = generation;
  const revision = ++readRevision;
  try {
    const index = await TrackPlayer.getActiveTrackIndex();
    if (index === undefined || index === null) return false;
    const [track, progress, state, intent, rate] = await Promise.all([
      TrackPlayer.getTrack(index), TrackPlayer.getProgress(), TrackPlayer.getPlaybackState(), TrackPlayer.getPlayWhenReady(), TrackPlayer.getRate(),
    ]);
    const verse = track as VerseTrack | undefined;
    if (!verse?.entry || !Number.isInteger(verse.verseIndex)) return false;
    const chapter = await getChapter(verse.entry);
    const active = await TrackPlayer.getActiveTrackIndex();
    if (active !== index || token !== generation || revision !== readRevision || closing || pending) return false;
    const item = chapter.verses[verse.verseIndex];
    if (!item || !Number.isFinite(progress.position)) return false;
    const old = snapshot.session;
    const changed = old?.entry.manifestUrl !== verse.entry.manifestUrl || old.index !== verse.verseIndex;
    update({
      session: changed ? { chapter, entry: verse.entry, index: verse.verseIndex } : old,
      position: Math.max(0, Math.min(progress.position, item.duration)),
      playing: state.state === State.Playing, playWhenReady: intent && state.state !== State.Ended && state.state !== State.Error,
      loading: false, buffering: state.state === State.Loading || state.state === State.Buffering, speed: rate,
      problem: state.state === State.Playing || state.state === State.Paused ? null : snapshot.problem,
    });
    if (changed || Date.now() - savedAt >= 5000) void savePosition();
    if (changed) void prepareNext();
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
    if (closing || pending) return;
    void (async () => {
      await syncFromNative();
      // Ignore delayed end events from a queue that has since changed or resumed.
      if (closing || pending || (await TrackPlayer.getPlaybackState()).state !== State.Ended) return;
      if (snapshot.sleep === "chapter") update({ sleep: 0 });
      else if (snapshot.continuous) { const entry = adjacent(1); if (entry) await start(entry); else update({ problem: "unavailable" }); }
    })().catch(() => {});
  });
}

// Mounted by the provider only while the app is foregrounded; paused sessions also reconcile.
export function observeForeground() {
  ensurePlaybackListeners();
  void syncFromNative();
  let polling = false;
  const timer = setInterval(() => {
    if (polling || closing || pending || (!snapshot.session && !setup)) return;
    polling = true;
    void syncFromNative().finally(() => { polling = false; });
  }, 500);
  return () => clearInterval(timer);
}

export async function playbackService() {
  ensurePlaybackListeners();
  if (remoteListenersReady) return;
  remoteListenersReady = true;
  TrackPlayer.addEventListener(Event.RemotePlay, () => { void syncFromNative().then(() => command(() => TrackPlayer.play())); });
  TrackPlayer.addEventListener(Event.RemotePause, () => { void syncFromNative().then(() => command(() => TrackPlayer.pause())); });
  TrackPlayer.addEventListener(Event.RemoteStop, () => { void stop(); });
  TrackPlayer.addEventListener(Event.RemoteNext, () => { void moveChapter(1); });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => { void moveChapter(-1); });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => { void command(() => TrackPlayer.seekTo(position)); });
  await syncFromNative();
}
