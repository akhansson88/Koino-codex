import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from "expo-audio";
import { AppState } from "react-native";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { nextBibleChapter } from "@/features/bible-canon";
import { AUDIO_CATALOG_URL, fetchAudioJson, locateChapterTime, parseCatalog, parseChapter, type AudioCatalog, type AudioChapter, type AudioChapterEntry } from "./catalog";

const CATALOG_KEY = "koino.audio.catalog.v1";
const POSITION_KEY = "koino.audio.position.v1";
export type AudioProblem = "network" | "unavailable" | null;
type Session = { chapter: AudioChapter; entry: AudioChapterEntry; index: number; player: AudioPlayer };
type AudioContextValue = {
  catalog?: AudioCatalog; catalogState: "loading" | "ready" | "error"; session?: Session;
  playing: boolean; loading: boolean; problem: AudioProblem; speed: number; continuous: boolean;
  sleep: number | "chapter"; refresh: () => Promise<void>; start: (entry: AudioChapterEntry) => Promise<void>;
  toggle: () => void; move: (delta: number) => void; seek: (seconds: number) => void;
  setSpeed: (speed: number) => void; setContinuous: (enabled: boolean) => void;
  setSleep: (minutes: number | "chapter") => void; retry: () => void;
};
const AudioContext = createContext<AudioContextValue | null>(null);

export function BibleAudioProvider({ children }: PropsWithChildren) {
  const [catalog, setCatalog] = useState<AudioCatalog>();
  const [catalogState, setCatalogState] = useState<AudioContextValue["catalogState"]>("loading");
  const [session, setSession] = useState<Session>();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<AudioProblem>(null);
  const [speed, updateSpeed] = useState(1);
  const [continuous, setContinuous] = useState(true);
  const [sleep, updateSleep] = useState<number | "chapter">(0);
  const current = useRef<Session | undefined>(undefined);
  const epoch = useRef(0);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const pendingEntry = useRef<AudioChapterEntry | undefined>(undefined);
  const latest = useRef({ catalog, speed, continuous, sleep });
  latest.current = { catalog, speed, continuous, sleep };
  const sleepDeadline = useRef(0);
  const savedAt = useRef(0);
  const mounted = useRef(true);
  const refreshId = useRef(0);
  const advance = useRef<() => void>(() => {});

  const save = useCallback(() => {
    const value = current.current;
    if (!value) return;
    void AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ entry: value.entry, index: value.index, offset: value.player.currentTime, speed: latest.current.speed })).catch(() => {});
  }, []);
  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    try {
      const next = parseCatalog(await fetchAudioJson(AUDIO_CATALOG_URL));
      if (!mounted.current || id !== refreshId.current) return;
      setCatalog(next); setCatalogState("ready");
      void AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
    } catch { if (mounted.current && id === refreshId.current) setCatalogState("error"); }
  }, []);

  const loadVerse = useCallback((chapter: AudioChapter, entry: AudioChapterEntry, index: number, offset = 0, autoplay = true) => {
    const token = ++epoch.current;
    pendingEntry.current = undefined;
    const previousCleanup = cleanup.current;
    current.current?.player.pause();
    setPlaying(false); setLoading(true); setProblem(null);
    let created: AudioPlayer | undefined;
    try {
      created = createAudioPlayer(chapter.verses[index].url, { updateInterval: 500, keepAudioSessionActive: true });
      // Attach the replacement before releasing the old player. Clearing the active
      // media session between verses can stop Android's foreground playback service.
      created.setActiveForLockScreen(true, { title: `${chapter.bookName} ${chapter.chapter}:${chapter.verses[index].verse}`, artist: "Reformationsbibeln · Onyx", albumTitle: "Koino" });
    } catch {
      created?.remove();
      pendingEntry.current = entry;
      setLoading(false); setProblem("network");
      return;
    }
    const player = created;
    previousCleanup?.();
    const value = { chapter, entry, index, player };
    current.current = value; setSession(value);
    let initialized = false;
    let ready = false;
    let finished = false;
    let mayAdvance = autoplay;
    let stalledSince = Date.now();
    let failed = false;
    const fail = () => {
      if (epoch.current !== token || failed) return;
      failed = true;
      player.pause(); setPlaying(false); setLoading(false); setProblem("network"); save();
    };
    const timer = setInterval(() => {
      if (epoch.current !== token || failed) return;
      if (sleepDeadline.current && Date.now() >= sleepDeadline.current) {
        player.pause(); sleepDeadline.current = 0; updateSleep(0); save();
      }
      if (!player.isLoaded || player.isBuffering) {
        if (!stalledSince) stalledSince = Date.now();
        if (Date.now() - stalledSince > 30000) fail();
      } else stalledSince = 0;
    }, 1000);
    const onStatus = (status: AudioStatus) => {
      if (epoch.current !== token) {
        if (status.playing) player.pause();
        return;
      }
      if (failed) return;
      setPlaying(status.playing); setLoading(!status.isLoaded || status.isBuffering);
      if (status.playing) mayAdvance = true;
      if (status.playbackState === "error" || status.playbackState === "failed") { fail(); return; }
      if (status.isLoaded && !initialized) {
        initialized = true;
        void (async () => {
          try {
            await player.seekTo(Math.min(offset, Math.max(0, chapter.verses[index].duration - 0.05)));
            if (epoch.current !== token) return;
            ready = true;
            player.setPlaybackRate(latest.current.speed);
            if (autoplay) player.play();
          } catch { fail(); }
        })();
      }
      if (ready && Date.now() - savedAt.current > 5000) { savedAt.current = Date.now(); save(); }
      if (status.didJustFinish && !finished && mayAdvance) { finished = true; advance.current(); }
    };
    const listener = player.addListener("playbackStatusUpdate", onStatus);
    cleanup.current = () => { clearInterval(timer); listener.remove(); player.clearLockScreenControls(); player.remove(); };
    if (player.isLoaded) onStatus(player.currentStatus);
  }, [save]);

  const start = useCallback(async (entry: AudioChapterEntry, index = 0, offset = 0, autoplay = true) => {
    const token = ++epoch.current;
    pendingEntry.current = entry;
    current.current?.player.pause();
    setPlaying(false); setLoading(true); setProblem(null);
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix", interruptionModeAndroid: "doNotMix" });
      const chapter = parseChapter(await fetchAudioJson(entry.manifestUrl), entry);
      if (!mounted.current || epoch.current !== token) return;
      pendingEntry.current = undefined;
      loadVerse(chapter, entry, Math.max(0, Math.min(index, chapter.verses.length - 1)), Math.max(0, offset), autoplay);
    } catch {
      if (mounted.current && epoch.current === token) { setLoading(false); setProblem("network"); }
    }
  }, [loadVerse]);

  advance.current = () => {
    const value = current.current;
    if (!value) return;
    const timerExpired = sleepDeadline.current > 0 && Date.now() >= sleepDeadline.current;
    if (timerExpired) { sleepDeadline.current = 0; updateSleep(0); value.player.pause(); return; }
    if (value.index + 1 < value.chapter.verses.length) {
      loadVerse(value.chapter, value.entry, value.index + 1); return;
    }
    if (latest.current.sleep === "chapter") { updateSleep(0); setPlaying(false); save(); return; }
    if (!latest.current.continuous) { setPlaying(false); save(); return; }
    const next = nextBibleChapter(value.chapter.book, value.chapter.chapter);
    const entry = Object.values(latest.current.catalog?.chapters ?? {}).find((c) => c.book === next?.book && c.chapter === next.chapter);
    if (entry) void start(entry);
    else { setPlaying(false); setProblem("unavailable"); save(); }
  };

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(CATALOG_KEY);
        if (cached && mounted.current && !latest.current.catalog) setCatalog(parseCatalog(JSON.parse(cached)));
      } catch { /* A malformed cache is replaced by the network response. */ }
      void refresh();
      try {
        const stored = await AsyncStorage.getItem(POSITION_KEY);
        if (!stored || !mounted.current || epoch.current) return;
        const saved = JSON.parse(stored);
        parseCatalog({ schemaVersion: 1, translation: "reformationsbibeln2026", chapters: { [`${saved.entry.bookId}:${saved.entry.chapter}`]: saved.entry } });
        if (!Number.isInteger(saved.index) || !Number.isFinite(saved.offset) || saved.offset < 0) return;
        if ([0.75, 1, 1.25, 1.5, 2].includes(saved.speed)) updateSpeed(saved.speed);
        await start(saved.entry, saved.index, saved.offset, false);
      } catch { /* Playback is always restored paused; invalid state is ignored. */ }
    })();
    const subscription = AppState.addEventListener("change", (state) => { save(); if (state === "active") void refresh(); });
    return () => { mounted.current = false; save(); ++epoch.current; cleanup.current?.(); subscription.remove(); };
  }, [refresh, save, start]);

  const toggle = () => {
    const value = current.current;
    if (!value) return;
    if (value.player.playing) value.player.pause();
    else if (value.player.currentTime >= value.chapter.verses[value.index].duration - 0.15) loadVerse(value.chapter, value.entry, value.index);
    else { setProblem(null); value.player.play(); }
    save();
  };
  const move = (delta: number) => {
    const value = current.current;
    if (!value) return;
    const index = value.index + delta;
    if (index >= 0 && index < value.chapter.verses.length) loadVerse(value.chapter, value.entry, index, 0, true);
  };
  const seek = (seconds: number) => {
    const value = current.current;
    if (!value) return;
    const target = locateChapterTime(value.chapter.verses, seconds);
    loadVerse(value.chapter, value.entry, target.index, target.offset, value.player.playing);
  };
  const setSpeed = (rate: number) => { updateSpeed(rate); latest.current.speed = rate; current.current?.player.setPlaybackRate(rate); save(); };
  const setSleep = (minutes: number | "chapter") => { updateSleep(minutes); sleepDeadline.current = typeof minutes === "number" && minutes > 0 ? Date.now() + minutes * 60000 : 0; };
  const retry = () => {
    if (pendingEntry.current) { void start(pendingEntry.current); return; }
    const value = current.current;
    if (value) loadVerse(value.chapter, value.entry, value.index, value.player.currentTime);
    else void refresh();
  };
  return <AudioContext.Provider value={{ catalog, catalogState, session, playing, loading, problem, speed, continuous, sleep, refresh, start, toggle, move, seek, setSpeed, setContinuous, setSleep, retry }}>{children}</AudioContext.Provider>;
}
export function useBibleAudio() {
  const value = useContext(AudioContext);
  if (!value) throw new Error("BibleAudioProvider is missing");
  return value;
}
