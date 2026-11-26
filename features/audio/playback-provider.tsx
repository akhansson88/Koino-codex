import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import TrackPlayer from "react-native-track-player";
import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from "expo-audio";

import { prepareAudioClip } from "@/state/audio-storage";
import type { AudioClip } from "@/state/types";

export type AudioPlaybackPhase = "idle" | "loading" | "playing" | "paused" | "error";

type AudioPlaybackContextValue = {
  player: AudioPlayer;
  activeClip: AudioClip | null;
  phase: AudioPlaybackPhase;
  toggle: (clip: AudioClip) => void;
  pause: () => void;
  seek: (seconds: number) => void;
  stop: () => void;
};

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | undefined>(undefined);

export function AudioPlaybackProvider({ children }: PropsWithChildren) {
  const player = useAudioPlayer();
  const [activeClip, setActiveClip] = useState<AudioClip | null>(null);
  const [phase, setPhase] = useState<AudioPlaybackPhase>("idle");
  const activeId = useRef<string | undefined>(undefined);

  useEffect(() => {
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        setPhase("idle");
      }
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        player.pause();
        setPhase((current) => current === "playing" ? "paused" : current);
      }
    });
    return () => subscription.remove();
  }, [player]);

  const pause = useCallback(() => {
    player.pause();
    setPhase((current) => current === "playing" ? "paused" : current);
  }, [player]);

  const seek = useCallback((seconds: number) => {
    void player.seekTo(Math.max(0, seconds)).catch(() => undefined);
  }, [player]);

  const stop = useCallback(() => {
    activeId.current = undefined;
    player.pause();
    void player.seekTo(0).catch(() => undefined);
    setActiveClip(null);
    setPhase("idle");
  }, [player]);

  const toggle = useCallback((clip: AudioClip) => {
    if (activeClip?.id === clip.id) {
      if (phase === "playing") {
        pause();
        return;
      }
      if (phase === "paused") {
        player.play();
        setPhase("playing");
        return;
      }
      if (phase === "error") {
        setPhase("loading");
        void prepareAudioClip(clip)
          .then((uri) => {
            if (activeId.current !== clip.id) return;
            player.replace({ uri });
            player.play();
            setPhase("playing");
          })
          .catch(() => setPhase("error"));
        return;
      }
    }

    activeId.current = clip.id;
    setActiveClip(clip);
    setPhase("loading");

    void (async () => {
      try {
        // Never let a Bible chapter and a spoken prayer play over each other.
        await TrackPlayer.pause().catch(() => undefined);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const uri = await prepareAudioClip(clip);
        if (activeId.current !== clip.id) return;
        player.replace({ uri });
        player.play();
        setPhase("playing");
      } catch {
        if (activeId.current === clip.id) setPhase("error");
      }
    })();
  }, [activeClip?.id, pause, phase, player]);

  return (
    <AudioPlaybackContext.Provider value={{ player, activeClip, phase, toggle, pause, seek, stop }}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

export function useAudioPlayback() {
  const context = useContext(AudioPlaybackContext);
  if (!context) throw new Error("AudioPlaybackProvider is missing.");
  return context;
}
