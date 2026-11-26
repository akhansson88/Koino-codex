import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAudioPlayerStatus } from "expo-audio";

import { formatAudioDuration } from "@/state/audio";
import type { AudioClip } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { useAudioPlayback } from "@/features/audio/playback-provider";
import { PlaybackWaveform } from "@/features/audio/waveform";

export type AudioCardKind = "prayer" | "journal";

function StaticClip({ clip, label }: { clip: AudioClip; label: string }) {
  return (
    <PlaybackWaveform
      accessibilityLabel={`${label} ${formatAudioDuration(clip.durationMs)}`}
      peaks={clip.peaks}
      progress={0}
    />
  );
}

function ActiveClip({ clip, label }: { clip: AudioClip; label: string }) {
  const { player, seek } = useAudioPlayback();
  const status = useAudioPlayerStatus(player);
  const duration = status.duration > 0 ? status.duration : clip.durationMs / 1000;
  const progress = duration > 0 ? status.currentTime / duration : 0;

  return (
    <PlaybackWaveform
      accessibilityLabel={`${label} ${formatAudioDuration(clip.durationMs)}`}
      interactive
      onSeek={(fraction) => seek(fraction * duration)}
      onSeekBy={(seconds) => seek(status.currentTime + seconds)}
      peaks={clip.peaks}
      progress={progress}
    />
  );
}

export function AudioCard({
  clip,
  kind = "prayer",
  title,
}: {
  clip: AudioClip;
  kind?: AudioCardKind;
  title?: string;
}) {
  const { t } = useAppTranslation();
  const { activeClip, pause, phase, toggle } = useAudioPlayback();
  const active = activeClip?.id === clip.id;
  const playing = active && phase === "playing";
  const loading = active && phase === "loading";
  const failed = active && phase === "error";
  const label = title ?? t(kind === "prayer" ? "audio.player.voicePrayer" : "audio.player.voiceJournal");
  const activeRef = useRef(active);
  activeRef.current = active;

  // Leaving the screen stops this clip, but never a different clip that the
  // reader started elsewhere.
  useEffect(() => () => {
    if (activeRef.current) pause();
  }, [pause]);

  return (
    <View
      style={{
        backgroundColor: shadcn.secondary,
        borderCurve: "continuous",
        borderRadius: radius.lg,
        gap: 10,
        padding: 12,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Pressable
          accessibilityLabel={`${t(playing ? "audio.player.pause" : "audio.player.play")}, ${label}, ${formatAudioDuration(clip.durationMs)}`}
          accessibilityRole="button"
          accessibilityState={{ busy: loading, selected: playing }}
          disabled={loading}
          hitSlop={6}
          onPress={() => toggle(clip)}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: pressed ? colors.clay : colors.accentPrayer,
            borderRadius: 999,
            height: 42,
            justifyContent: "center",
            opacity: loading ? 0.7 : 1,
            width: 42,
          })}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Feather color={colors.white} name={playing ? "pause" : "play"} size={18} />
          )}
        </Pressable>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            <Feather color={colors.muted} name="mic" size={12} />
            <Text numberOfLines={1} style={[typography.sectionLabel, { color: colors.muted, flex: 1, fontSize: 10 }]}>
              {label.toUpperCase()}
            </Text>
            <Text style={[typography.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]}>
              {formatAudioDuration(clip.durationMs)}
            </Text>
          </View>
          {active && !failed ? <ActiveClip clip={clip} label={label} /> : <StaticClip clip={clip} label={label} />}
        </View>
        <Feather color={failed ? colors.danger : colors.muted} name={failed ? "alert-circle" : "headphones"} size={16} />
      </View>
      {failed ? (
        <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
          {t("audio.player.error")}
        </Text>
      ) : null}
    </View>
  );
}
