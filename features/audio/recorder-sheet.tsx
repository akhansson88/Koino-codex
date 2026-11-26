import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Linking, Modal, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import {
  AUDIO_LEVEL_SAMPLE_MS,
  AUDIO_MIN_MS,
  audioPurposeConfig,
  formatAudioTime,
  levelFromMetering,
  neutralPeaks,
  newAudioClipId,
  peaksFromLevels,
  type AudioPurpose,
  type AudioScope,
} from "@/state/audio";
import { uploadAudioDraft, type AudioDraft } from "@/state/audio-storage";
import type { AudioClip } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";
import { useReducedMotion } from "@/ui/use-reduced-motion";
import { speechRecordingFallbackOptions, speechRecordingOptions } from "@/features/audio/recording-options";
import { LiveWaveform, PlaybackWaveform } from "@/features/audio/waveform";

type Phase = "ready" | "permission" | "recording" | "paused" | "review" | "uploading" | "uploadFailed";

function translation(value: string) {
  return value as TranslationKey;
}

function AudioRecorderSheetContent({
  communityName,
  groupId,
  onClose,
  onComplete,
  purpose,
  scope,
  visible,
}: {
  communityName?: string;
  groupId?: string;
  onClose: () => void;
  onComplete: (clip: AudioClip) => void;
  purpose: AudioPurpose;
  scope: AudioScope;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    const tag = "koino-audio-recorder";
    void activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => { void deactivateKeepAwake(tag).catch(() => undefined); };
  }, [visible]);

  const config = audioPurposeConfig[purpose];
  const maxMs = config.maxMs;
  const recorder = useAudioRecorder(speechRecordingOptions);
  const state = useAudioRecorderState(recorder, AUDIO_LEVEL_SAMPLE_MS);
  const [phase, setPhase] = useState<Phase>("ready");
  const [draft, setDraft] = useState<AudioDraft>();
  const [errorKey, setErrorKey] = useState<TranslationKey>();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const levels = useRef<number[]>([]);
  const stopping = useRef(false);
  const started = useRef(false);
  const starting = useRef(false);
  const warned30 = useRef(false);
  const warned10 = useRef(false);
  const reviewPlayer = useAudioPlayer(draft?.localUri ?? null);
  const reviewStatus = useAudioPlayerStatus(reviewPlayer);

  const reset = useCallback(() => {
    setDraft(undefined);
    setErrorKey(undefined);
    levels.current = [];
    stopping.current = false;
    started.current = false;
    warned30.current = false;
    warned10.current = false;
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (!visible) return;
    reset();
  }, [visible, reset]);

  useEffect(() => {
    if (!visible) return;
    void getRecordingPermissionsAsync().then((permission) => {
      if (!permission.granted) setPermissionDenied(!permission.canAskAgain);
    }).catch(() => undefined);
  }, [visible]);

  useEffect(() => {
    if (phase !== "recording") return;
    levels.current = [...levels.current, levelFromMetering(state.metering)];
    const remaining = maxMs - state.durationMillis;
    if (remaining <= 30_000 && !warned30.current) {
      warned30.current = true;
      void Haptics.selectionAsync().catch(() => undefined);
    }
    if (remaining <= 10_000 && !warned10.current) {
      warned10.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
    // The native recorder auto-stops at the hard limit. A pause also reports
    // isRecording=false, so only finalise once the duration has reached it.
    if (started.current && !state.isRecording && state.durationMillis >= maxMs - 300 && !stopping.current) {
      void finishRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.metering, state.durationMillis, state.isRecording, phase, maxMs]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const finishRef = useRef(finishRecording);
  finishRef.current = finishRecording;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" && (phaseRef.current === "recording" || phaseRef.current === "paused")) {
        void finishRef.current();
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => () => {
    if (phaseRef.current === "recording" || phaseRef.current === "paused") {
      void recorder.stop().catch(() => undefined);
    }
  }, [recorder]);

  async function startRecording() {
    if (starting.current) return;
    starting.current = true;
    setErrorKey(undefined);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(!permission.canAskAgain);
        setPhase("permission");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      try {
        await recorder.prepareToRecordAsync(speechRecordingOptions);
      } catch {
        await recorder.prepareToRecordAsync(speechRecordingFallbackOptions);
      }
      levels.current = [];
      warned30.current = false;
      warned10.current = false;
      started.current = true;
      recorder.record({ forDuration: maxMs / 1000 });
      setPhase("recording");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch {
      setErrorKey("audio.record.unavailable");
      setPhase("ready");
    } finally {
      starting.current = false;
    }
  }

  async function finishRecording() {
    if (stopping.current) return;
    stopping.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      // Native auto-stop can land a few milliseconds past the limit; clamp so
      // the stored descriptor always passes the clip validator.
      const durationMs = Math.min(maxMs, Math.round(Math.max(state.durationMillis, recorder.currentTime * 1000)));
      if (!uri || durationMs < AUDIO_MIN_MS) {
        if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        setErrorKey("audio.record.tooShort");
        setPhase("ready");
        return;
      }
      const peaks = peaksFromLevels(levels.current);
      setDraft({
        id: newAudioClipId(),
        localUri: uri,
        durationMs,
        peaks: /^[a-f0-9]{96}$/.test(peaks) ? peaks : neutralPeaks(),
      });
      setPhase("review");
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    } catch {
      setErrorKey("audio.record.unavailable");
      setPhase("ready");
    } finally {
      stopping.current = false;
      started.current = false;
    }
  }

  function pauseRecording() {
    if (phase !== "recording") return;
    recorder.pause();
    setPhase("paused");
  }

  function resumeRecording() {
    if (phase !== "paused") return;
    recorder.record();
    setPhase("recording");
  }

  async function redo() {
    reviewPlayer.pause();
    if (draft) await FileSystem.deleteAsync(draft.localUri, { idempotent: true }).catch(() => undefined);
    reset();
  }

  async function upload() {
    if (!draft) return;
    setPhase("uploading");
    setErrorKey(undefined);
    try {
      const clip = await uploadAudioDraft(draft, scope, groupId);
      await FileSystem.deleteAsync(draft.localUri, { idempotent: true }).catch(() => undefined);
      onComplete(clip);
      onClose();
    } catch {
      setPhase("uploadFailed");
      setErrorKey("audio.record.uploadFailed");
    }
  }

  function discardAndClose() {
    reviewPlayer.pause();
    if (draft) void FileSystem.deleteAsync(draft.localUri, { idempotent: true }).catch(() => undefined);
    if (phase === "recording" || phase === "paused") void recorder.stop().catch(() => undefined);
    reset();
    onClose();
  }

  function requestClose() {
    if (phase === "uploading") return;
    if (phase === "review" || phase === "uploadFailed") {
      Alert.alert(t("audio.record.discardTitle"), t("audio.record.discardBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("audio.record.discardTitle"), style: "destructive", onPress: discardAndClose },
      ]);
      return;
    }
    if (phase === "recording" || phase === "paused") {
      Alert.alert(t("audio.record.discardTitle"), t("audio.record.discardBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("audio.record.discardTitle"), style: "destructive", onPress: discardAndClose },
      ]);
      return;
    }
    onClose();
  }

  const recording = phase === "recording";
  const paused = phase === "paused";
  const reviewing = phase === "review" || phase === "uploadFailed";
  const busy = phase === "uploading";
  const live = recording || paused;
  const elapsed = live ? state.durationMillis : draft?.durationMs ?? 0;
  const fraction = Math.max(0, Math.min(1, elapsed / maxMs));
  const reviewProgress = reviewing && draft
    ? (reviewStatus.duration > 0 ? reviewStatus.currentTime / reviewStatus.duration : 0)
    : 0;
  const scopeHint = scope === "group" && communityName
    ? t("audio.record.sharedHint", { community: communityName })
    : t("audio.record.privateHint");

  return (
    <Modal animationType={reducedMotion ? "none" : "slide"} onRequestClose={requestClose} presentationStyle="fullScreen" statusBarTranslucent visible={visible}>
      <View style={{ backgroundColor: colors.cream, flex: 1 }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 54 }}>
          <Pressable
            accessibilityLabel={t("common.cancel")}
            accessibilityRole="button"
            disabled={busy}
            hitSlop={8}
            onPress={requestClose}
            style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
          >
            <Feather color={colors.ink} name="x" size={22} />
          </Pressable>
          <Text numberOfLines={1} style={[typography.title, { color: colors.ink, flex: 1, textAlign: "center" }]}>
            {t(translation(config.titleKey))}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={{ alignItems: "center", flex: 1, gap: 18, justifyContent: "center", paddingHorizontal: 26, paddingVertical: 18 }}>
          {phase === "permission" || permissionDenied ? (
            <View style={{ alignItems: "center", gap: 16, maxWidth: 340 }}>
              <View style={{ alignItems: "center", backgroundColor: shadcn.brandSoft, borderRadius: 999, height: 84, justifyContent: "center", width: 84 }}>
                <Feather color={colors.accentPrayer} name="mic-off" size={30} />
              </View>
              <Text style={[typography.title, { color: colors.ink, textAlign: "center" }]}>{t("audio.record.permissionTitle")}</Text>
              <Text style={[typography.body, { color: colors.muted, textAlign: "center" }]}>{t("audio.record.permissionBody")}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => { void Linking.openSettings(); }}
                style={{ backgroundColor: shadcn.primary, borderRadius: radius.md, minHeight: 46, justifyContent: "center", paddingHorizontal: 20 }}
              >
                <Text style={[typography.label, { color: shadcn.primaryForeground }]}>{t("audio.record.openSettings")}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{scopeHint}</Text>

              {reviewing && draft ? (
                <View style={{ alignSelf: "stretch", gap: 8 }}>
                  <PlaybackWaveform
                    accessibilityLabel={`${t("audio.record.review")} ${formatAudioTime(draft.durationMs / 1000)}`}
                    interactive
                    onSeek={(fractionValue) => { void reviewPlayer.seekTo(fractionValue * (reviewStatus.duration || draft.durationMs / 1000)); }}
                    onSeekBy={(seconds) => { void reviewPlayer.seekTo(Math.max(0, reviewStatus.currentTime + seconds)); }}
                    peaks={draft.peaks}
                    progress={reviewProgress}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[typography.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]}>{formatAudioTime(reviewStatus.currentTime)}</Text>
                    <Text style={[typography.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]}>{formatAudioTime(draft.durationMs / 1000)}</Text>
                  </View>
                </View>
              ) : (
                <LiveWaveform active={recording && !reducedMotion} level={levelFromMetering(state.metering)} />
              )}

              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.ink, fontFamily: "Montserrat_300Light", fontSize: 46, fontVariant: ["tabular-nums"], letterSpacing: 1 }}
              >
                {formatAudioTime(elapsed / 1000)}
              </Text>
              <Text style={[typography.caption, { color: colors.muted, fontVariant: ["tabular-nums"] }]}>
                {formatAudioTime(maxMs / 1000)} · {t(translation(config.limitKey))}
              </Text>

              <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 4, overflow: "hidden", width: "82%" }}>
                <View style={{ backgroundColor: colors.accentPrayer, borderRadius: 999, height: 4, width: `${fraction * 100}%` }} />
              </View>

              {busy ? (
                <View style={{ alignItems: "center", gap: 10 }}>
                  <ActivityIndicator color={colors.accentPrayer} />
                  <Text style={[typography.caption, { color: colors.muted }]}>{t("audio.record.uploading")}</Text>
                </View>
              ) : reviewing ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
                  <Pressable
                    accessibilityLabel={t(reviewStatus.playing ? "audio.player.pause" : "audio.record.review")}
                    accessibilityRole="button"
                    onPress={() => { if (reviewStatus.playing) reviewPlayer.pause(); else reviewPlayer.play(); }}
                    style={({ pressed }) => ({
                      alignItems: "center",
                      backgroundColor: pressed ? colors.clay : colors.ink,
                      borderRadius: 999,
                      height: 64,
                      justifyContent: "center",
                      width: 64,
                    })}
                  >
                    <Feather color={colors.cream} name={reviewStatus.playing ? "pause" : "play"} size={24} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => { void redo(); }}
                    style={({ pressed }) => ({
                      alignItems: "center",
                      borderColor: colors.line,
                      borderRadius: 999,
                      borderWidth: 1,
                      height: 52,
                      justifyContent: "center",
                      opacity: pressed ? 0.7 : 1,
                      width: 52,
                    })}
                  >
                    <Feather color={colors.ink} name="rotate-ccw" size={20} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable
                    accessibilityLabel={t(recording ? "audio.record.stop" : paused ? "audio.record.resume" : "audio.record.start")}
                    accessibilityRole="button"
                    accessibilityState={{ busy: false, selected: recording }}
                    onPress={() => {
                      if (recording) void finishRecording();
                      else if (paused) resumeRecording();
                      else void startRecording();
                    }}
                    style={({ pressed }) => ({
                      alignItems: "center",
                      backgroundColor: pressed ? colors.clay : recording ? colors.ink : colors.accentPrayer,
                      borderColor: recording ? colors.accentPrayer : "transparent",
                      borderRadius: 999,
                      borderWidth: 4,
                      height: 96,
                      justifyContent: "center",
                      width: 96,
                      ...shadows.raised,
                    })}
                  >
                    <Feather color={colors.cream} name={recording ? "square" : paused ? "play" : "mic"} size={recording ? 26 : 32} />
                  </Pressable>
                  {recording || paused ? (
                    <Pressable
                      accessibilityLabel={t(recording ? "audio.record.pause" : "audio.record.resume")}
                      accessibilityRole="button"
                      onPress={recording ? pauseRecording : resumeRecording}
                      style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 18 }}
                    >
                      <Text style={[typography.label, { color: colors.muted }]}>{t(recording ? "audio.record.pause" : "audio.record.resume")}</Text>
                    </Pressable>
                  ) : (
                    <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("audio.record.ready")}</Text>
                  )}
                </>
              )}

              {errorKey ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger, textAlign: "center" }]}>{t(errorKey)}</Text>
              ) : null}

              {phase === "uploadFailed" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => { void upload(); }}
                    style={{ backgroundColor: shadcn.primary, borderRadius: radius.md, minHeight: 46, justifyContent: "center", paddingHorizontal: 20 }}
                  >
                    <Text style={[typography.label, { color: shadcn.primaryForeground }]}>{t("audio.record.retry")}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => { void redo(); }}
                    style={{ borderColor: colors.line, borderRadius: radius.md, borderWidth: 1, minHeight: 46, justifyContent: "center", paddingHorizontal: 20 }}
                  >
                    <Text style={[typography.label, { color: colors.ink }]}>{t("audio.record.redo")}</Text>
                  </Pressable>
                </View>
              ) : null}

              {reviewing && phase === "review" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { void upload(); }}
                  style={{ backgroundColor: shadcn.primary, borderRadius: radius.md, minHeight: 50, justifyContent: "center", paddingHorizontal: 28, width: "82%" }}
                >
                  <Text style={[typography.label, { color: shadcn.primaryForeground, textAlign: "center" }]}>{t("audio.record.use")}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        <Text style={[typography.caption, { color: colors.muted, paddingBottom: 30, textAlign: "center" }]}>
          {recording ? t("audio.record.recording") : paused ? t("audio.record.paused") : ""}
        </Text>
      </View>
    </Modal>
  );
}

/** Mounts the recorder only while it is open, so a closed composer never polls the microphone. */
export function AudioRecorderSheet(props: Parameters<typeof AudioRecorderSheetContent>[0]) {
  return props.visible ? <AudioRecorderSheetContent {...props} /> : null;
}

