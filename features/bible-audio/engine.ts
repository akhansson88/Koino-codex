import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, State, type Track } from "react-native-track-player";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { nextBibleChapter, previousBibleChapter } from "../bible-canon";
import { fetchAudioJson, locateChapterTime, parseChapter, type AudioCatalog, type AudioChapter, type AudioChapterEntry } from "./catalog";

type VerseTrack = Track & { entry: AudioChapterEntry; verseIndex: number };
// Keep each manifest once; embedding it in every native track makes long queues quadratic.
const chapters = new Map<string, AudioChapter>();
export type AudioSession = { chapter: AudioChapter; entry: AudioChapterEntry; index: number };
type Snapshot = { session?: AudioSession; playing: boolean; loading: boolean; position: number; problem: "network" | "unavailable" | null; speed: number; continuous: boolean; sleep: number | "chapter" };
let snapshot: Snapshot = { playing: false, loading: false, position: 0, problem: null, speed: 1, continuous: true, sleep: 0 };
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSnapshot = () => snapshot;
function update(value: Partial<Snapshot>) { snapshot = { ...snapshot, ...value }; listeners.forEach((listener) => listener()); }
let catalog: AudioCatalog | undefined;
export function setAudioCatalog(value: AudioCatalog) { catalog = value; }
let setup: Promise<void> | undefined;
let generation = 0;
let deadline = 0;
let pending: AudioChapterEntry | undefined;
let appending: number | undefined;
let closing = false;
let savedWrites = Promise.resolve();
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
  const json = JSON.stringify({ entry: value.entry, index: value.index, offset: snapshot.position, speed: snapshot.speed });
  savedWrites = savedWrites.then(() => AsyncStorage.setItem(POSITION_KEY, json)).catch(() => {});
  await savedWrites;
}
export function ensurePlayer() {
  if (!setup) setup = (async () => {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: true, minBuffer: 15, maxBuffer: 60, playBuffer: 0.5 });
    await TrackPlayer.updateOptions({ android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification }, capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo], progressUpdateEventInterval: 1 });
  })().catch((error) => { setup = undefined; throw error; });
  return setup;
}

// Four downloads at a time; playback starts only after every verse is local.
async function downloadChapter(entry: AudioChapterEntry, token: number): Promise<VerseTrack[]> {
  const key = `koino.audio.manifest.${entry.bookId}.${entry.chapter}.${entry.revision}`;
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
      tracks[index] = { id: `${entry.bookId}:${entry.chapter}:${entry.revision}:${index}`, url: uri, title: `${chapter.bookName} ${chapter.chapter}:${verse.verse}`, artist: "Reformationsbibeln · Onyx", album: "Koino", duration: verse.duration, entry, verseIndex: index };
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
      if (token === generation && snapshot.continuous && snapshot.sleep !== "chapter") await TrackPlayer.add(tracks);
    });
  } catch { /* The current chapter remains fully playable offline. */ }
  finally { if (appending === token) appending = undefined; }
}

export async function start(entry: AudioChapterEntry, index = 0, offset = 0, autoplay = true) {
  const token = ++generation;
  closing = false;
  pending = entry;
  update({ loading: true, playing: false, problem: null });
  try {
    await ensurePlayer();
    await TrackPlayer.pause();
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
      update({ session: { chapter: chapters.get(entry.manifestUrl)!, entry, index: selected }, position: offset, loading: false });
      if (autoplay) await TrackPlayer.play();
    });
    if (token === generation) void prepareNext();
  } catch { if (token === generation) update({ loading: false, playing: false, problem: "network" }); }
}
export async function stop() {
  ++generation; pending = undefined; deadline = 0; closing = true;
  update({ session: undefined, position: 0, playing: false, loading: false, problem: null, sleep: 0 });
  await serial(async () => { if (setup) { await ensurePlayer(); await TrackPlayer.reset(); } });
  await savedWrites;
  if (closing) await AsyncStorage.removeItem(POSITION_KEY);
}
export async function toggle() {
  if (!snapshot.session || snapshot.loading) return;
  if (snapshot.playing) await TrackPlayer.pause();
  else { update({ problem: null }); if ((await TrackPlayer.getPlaybackState()).state === State.Ended) await TrackPlayer.seekTo(0); await TrackPlayer.play(); }
  await savePosition();
}
export async function seek(seconds: number) {
  const session = snapshot.session;
  if (!session) return;
  const target = locateChapterTime(session.chapter.verses, seconds);
  const queue = await TrackPlayer.getQueue() as VerseTrack[];
  const index = queue.findIndex((track) => track.entry.manifestUrl === session.entry.manifestUrl && track.verseIndex === target.index);
  if (index >= 0) await TrackPlayer.skip(index, target.offset);
}
export async function move(delta: number) {
  const session = snapshot.session;
  if (!session) return;
  const index = session.index + delta;
  if (index >= 0 && index < session.chapter.verses.length) { await seek(session.chapter.verses.slice(0, index).reduce((n, verse) => n + verse.duration, 0)); await TrackPlayer.play(); }
}
export async function moveChapter(delta: number) {
  const entry = adjacent(delta);
  if (!entry) return;
  const queue = await TrackPlayer.getQueue() as VerseTrack[];
  const index = queue.findIndex((track) => track.entry.manifestUrl === entry.manifestUrl && track.verseIndex === 0);
  if (index >= 0) { await TrackPlayer.skip(index); await TrackPlayer.play(); }
  else await start(entry);
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

// The service owns lock-screen events even while the reader UI is suspended.
export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => { void TrackPlayer.play(); });
  TrackPlayer.addEventListener(Event.RemotePause, () => { void TrackPlayer.pause(); });
  TrackPlayer.addEventListener(Event.RemoteStop, () => { void stop(); });
  TrackPlayer.addEventListener(Event.RemoteNext, () => { void moveChapter(1); });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => { void moveChapter(-1); });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => { void TrackPlayer.seekTo(position); });
  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => update({ playing: state === State.Playing, loading: !!pending || state === State.Loading || state === State.Buffering }));
  TrackPlayer.addEventListener(Event.PlaybackError, () => update({ problem: "network", playing: false, loading: false }));
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, ({ track }) => {
    if (!track || closing) return;
    const verse = track as VerseTrack;
    const chapter = chapters.get(verse.entry.manifestUrl);
    if (!chapter) return;
    update({ session: { chapter, entry: verse.entry, index: verse.verseIndex }, position: 0 });
    void savePosition(); void prepareNext();
  });
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position }) => {
    update({ position }); void savePosition();
    if (deadline && Date.now() >= deadline) { deadline = 0; update({ sleep: 0 }); void TrackPlayer.pause(); }
  });
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (closing || pending) return;
    update({ playing: false });
    if (snapshot.sleep === "chapter") update({ sleep: 0 });
    else if (snapshot.continuous) { const entry = adjacent(1); if (entry) void start(entry); else update({ problem: "unavailable" }); }
  });
}
