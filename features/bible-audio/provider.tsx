import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { AUDIO_CATALOG_URL, fetchAudioJson, parseCatalog, type AudioCatalog } from "./catalog";
import * as engine from "./engine";

function useController() {
  const playback = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [catalog, setCatalog] = useState<AudioCatalog>();
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const refresh = useCallback(async () => {
    try {
      const value = parseCatalog(await fetchAudioJson(AUDIO_CATALOG_URL));
      setCatalog(value); await engine.applyAudioCatalog(value); setCatalogState("ready");
      await AsyncStorage.setItem("koino.audio.catalog.v1", JSON.stringify(value));
      return value;
    } catch { setCatalogState("error"); }
  }, []);
  useEffect(() => {
    let mounted = true;
    const initialGeneration = engine.getSessionGeneration();
    let stopObserving: (() => void) | undefined;
    const observe = () => { stopObserving?.(); stopObserving = engine.observeForeground(); };
    if (AppState.currentState === "active") observe();
    void (async () => {
      let available: AudioCatalog | undefined;
      try {
        const cached = await AsyncStorage.getItem("koino.audio.catalog.v1");
        if (cached && mounted) { const value = parseCatalog(JSON.parse(cached)); available = value; setCatalog(value); engine.setAudioCatalog(value); }
      } catch { /* Replace malformed cache from network. */ }
      if (mounted) available = await refresh() ?? available;
      try {
        if (await engine.hasNativeQueue()) {
          await engine.ensurePlayer();
          await engine.syncFromNative();
          if (available) await engine.applyAudioCatalog(available);
          return;
        }
        const stored = await AsyncStorage.getItem("koino.audio.position.v1");
        if (!stored || !mounted || initialGeneration !== 0 || engine.getSessionGeneration() !== initialGeneration || engine.getSnapshot().session || engine.getSnapshot().loading) return;
        const saved = JSON.parse(stored);
        parseCatalog({ schemaVersion: 1, translation: "reformationsbibeln2026", chapters: { [`${saved.entry.bookId}:${saved.entry.chapter}`]: saved.entry } });
        if (!Number.isInteger(saved.index) || !Number.isFinite(saved.offset) || saved.offset < 0) return;
        if ([0.75, 1, 1.25, 1.5, 2].includes(saved.speed)) await engine.setSpeed(saved.speed);
        const entry = available?.chapters[`${saved.entry.bookId}:${saved.entry.chapter}`];
        if (entry && mounted && engine.getSessionGeneration() === initialGeneration) await engine.start(entry, saved.index, saved.offset, false);
      } catch { /* Playback restores paused; invalid state is ignored. */ }
    })();
    const subscription = AppState.addEventListener("change", (state) => {
      void engine.savePosition();
      if (state === "active") { observe(); void refresh(); }
      else { stopObserving?.(); stopObserving = undefined; }
    });
    return () => { mounted = false; stopObserving?.(); subscription.remove(); };
  }, [refresh]);
  return { ...playback, catalog, catalogState, refresh, start: engine.start, stop: engine.stop, toggle: engine.toggle, move: engine.move, moveChapter: engine.moveChapter, previousChapter: engine.adjacent(-1), nextChapter: engine.adjacent(1), seek: engine.seek, setSpeed: engine.setSpeed, setContinuous: engine.setContinuous, setSleep: engine.setSleep, retry: engine.retry };
}
const AudioContext = createContext<ReturnType<typeof useController> | null>(null);
export function BibleAudioProvider({ children }: PropsWithChildren) { return <AudioContext.Provider value={useController()}>{children}</AudioContext.Provider>; }
export function useBibleAudio() { const value = useContext(AudioContext); if (!value) throw new Error("BibleAudioProvider is missing"); return value; }
