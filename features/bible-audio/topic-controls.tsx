import { Feather } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { ReaderPalette } from "@/features/bible-reader/types";
import { useAppTranslation } from "@/ui/app-language";
import { radius } from "@/ui/theme";
import { snapChapterTime } from "./catalog";
import { useBibleAudio } from "./provider";
import { hasSavedAudioTranslation } from "./saved-passage";
import type { TopicDefinition, TopicSession } from "./topic-playback";

function useTopicState(definition: TopicDefinition) {
  const audio = useBibleAudio();
  const pending = audio.pendingTopic?.definition.id === definition.id ? audio.pendingTopic : undefined;
  const session = !audio.pendingTopic && !audio.pendingRequest && audio.session?.topic?.definition.id === definition.id ? audio.session.topic : undefined;
  const supported = hasSavedAudioTranslation(definition.translation);
  const hasEntry = (item: TopicDefinition["items"][number]) => Object.values(audio.catalog?.chapters ?? {}).some((entry) => entry.book === item.book && entry.chapter === item.chapter);
  const knownUnavailable = new Set(session?.unavailableItemIds ?? []);
  if (audio.catalogState === "ready") definition.items.forEach((item) => { if (!hasEntry(item)) knownUnavailable.add(item.id); });
  return { audio, pending, session, supported, hasEntry, knownUnavailable };
}

export function TopicPlaybackSettings({ palette, topic, disabled = false }: { palette: ReaderPalette; topic?: TopicSession; disabled?: boolean }) {
  const audio = useBibleAudio();
  const { t } = useAppTranslation();
  const seconds = topic?.pauseSeconds ?? audio.topicPauseSeconds;
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => { setDraft(null); }, [seconds]);
  const loop = topic?.loop ?? "off";
  const loopLabel = t(loop === "off" ? "bible.topics.audio.loopOff" : loop === "passage" ? "bible.topics.audio.loopPassage" : "bible.topics.audio.loopTopic");
  const adjust = (value: number) => { if (!disabled) void audio.setTopicPause(Math.max(0, Math.min(60, Math.round(value)))); };
  return <View style={{ gap: 8 }}>
    <Text style={{ color: palette.text, fontWeight: "700" }}>{t("bible.topics.audio.pauseBetween", { seconds: draft ?? seconds })}</Text>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("bible.topics.audio.lessPause")} accessibilityState={{ disabled: disabled || seconds <= 0 }} disabled={disabled || seconds <= 0} onPress={() => adjust(seconds - 1)} style={{ alignItems: "center", justifyContent: "center", minWidth: 44, minHeight: 44, borderRadius: 12, backgroundColor: palette.input, opacity: disabled || seconds <= 0 ? 0.45 : 1 }}><Feather name="minus" size={18} color={palette.accent} /></Pressable>
      <Slider accessibilityLabel={t("bible.topics.audio.pauseLabel")} accessibilityValue={{ min: 0, max: 60, now: draft ?? seconds, text: t("bible.topics.audio.seconds", { seconds: draft ?? seconds }) }} minimumValue={0} maximumValue={60} step={1} value={draft ?? seconds} disabled={disabled} onValueChange={setDraft} onSlidingComplete={(value) => { adjust(value); setDraft(null); }} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "increment") adjust(seconds + 1); if (event.nativeEvent.actionName === "decrement") adjust(seconds - 1); }} minimumTrackTintColor={palette.accent} maximumTrackTintColor={palette.line} thumbTintColor={palette.accent} style={{ flex: 1, minWidth: 0, height: 44 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={t("bible.topics.audio.morePause")} accessibilityState={{ disabled: disabled || seconds >= 60 }} disabled={disabled || seconds >= 60} onPress={() => adjust(seconds + 1)} style={{ alignItems: "center", justifyContent: "center", minWidth: 44, minHeight: 44, borderRadius: 12, backgroundColor: palette.input, opacity: disabled || seconds >= 60 ? 0.45 : 1 }}><Feather name="plus" size={18} color={palette.accent} /></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t("bible.topics.audio.loop")}: ${loopLabel}`} accessibilityState={{ disabled: disabled || !topic, selected: loop !== "off" }} disabled={disabled || !topic} onPress={() => { void audio.setTopicLoop(loop === "off" ? "passage" : loop === "passage" ? "topic" : "off"); }} style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor: loop === "off" ? palette.input : palette.peach, borderColor: loop === "off" ? palette.line : palette.accent, borderWidth: 1, borderRadius: 12, flexDirection: "row", gap: 8, minHeight: 44, maxWidth: "100%", paddingHorizontal: 12, opacity: disabled || !topic ? 0.45 : 1 }}>
      <Feather name="repeat" size={18} color={palette.accent} /><Text style={{ color: palette.accent, flexShrink: 1, fontWeight: "700" }}>{loopLabel}</Text>
    </Pressable>
  </View>;
}

export function TopicPlaybackPanel({ definition, palette }: { definition: TopicDefinition; palette: ReaderPalette }) {
  const { audio, pending, session, supported, hasEntry, knownUnavailable } = useTopicState(definition);
  const { t } = useAppTranslation();
  const current = session?.definition.items[session.itemIndex];
  const activeDefinition = session?.definition ?? definition;
  const available = activeDefinition.items.filter((item) => !knownUnavailable.has(item.id));
  const ownProblem = pending?.options.mode === "all" || session?.mode === "all" ? audio.problem : null;
  const skipped = ownProblem === "unavailable" && !session ? definition.unavailableCount + definition.items.length : definition.unavailableCount + knownUnavailable.size;
  const loading = Boolean(pending?.options.mode === "all" && audio.loading);
  const playingAll = Boolean(session && session.mode === "all");
  const retry = ownProblem === "network";
  const playable = supported && definition.items.some(hasEntry);
  const disabled = !playable || loading || Boolean(session && audio.commandPending) || ownProblem === "unavailable";
  const label = t(loading ? "audio.loading" : retry ? "audio.retry" : playingAll ? audio.playWhenReady ? "audio.pause" : "bible.topics.audio.resumeAll" : "bible.topics.audio.playAll");
  const explanation = !supported ? t("bible.topics.audio.translationUnavailable") : retry ? t("audio.network") : ownProblem === "unavailable" ? t("bible.topics.audio.unavailable") : !playable ? t(audio.catalogState === "loading" ? "audio.loading" : audio.catalogState === "error" ? "audio.network" : "bible.topics.audio.unavailable") : undefined;
  const currentIndex = available.findIndex((item) => item.id === current?.id);
  const play = () => {
    if (disabled) return;
    if (retry) audio.retry();
    else if (playingAll) void audio.toggle();
    else void audio.startTopicPlaylist(definition, { mode: "all" });
  };
  return <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, padding: 15, gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${definition.title}`} accessibilityState={{ busy: loading, disabled }} disabled={disabled} onPress={play} style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor: palette.peach, borderRadius: 12, flexDirection: "row", gap: 8, minHeight: 44, minWidth: 44, maxWidth: "100%", paddingHorizontal: 14, opacity: disabled ? 0.55 : 1 }}>
      {loading ? <ActivityIndicator color={palette.accent} /> : <Feather name={retry ? "rotate-cw" : playingAll && audio.playWhenReady ? "pause" : "play"} size={19} color={palette.accent} />}<Text style={{ color: palette.accent, flexShrink: 1, fontWeight: "800" }}>{label}</Text>
    </Pressable>
    {current ? <View accessibilityLiveRegion="polite" style={{ gap: 4 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: "800" }}>{current.reference}</Text><Text style={{ color: palette.muted, fontSize: 13 }}>{t("bible.topics.audio.position", { current: Math.max(1, available.findIndex((item) => item.id === current.id) + 1), count: available.length })}</Text>{session?.phase === "gap" ? <Text style={{ color: palette.muted, fontSize: 13, fontVariant: ["tabular-nums"] }}>{t("bible.topics.audio.gap", { seconds: Math.max(0, Math.ceil(session.gapRemainingSeconds ?? 0)) })}</Text> : null}</View> : null}
    {session ? <>
      <TopicSpeechProgress palette={palette} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([-1, 1] as const).map((direction) => {
          const disabled = audio.loading || audio.commandPending || (direction < 0 ? currentIndex <= 0 : currentIndex < 0 || currentIndex >= available.length - 1);
          const label = t(direction < 0 ? "bible.topics.audio.previousPassage" : "bible.topics.audio.nextPassage");
          return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={() => { void audio.moveTopicPassage(direction); }} style={{ minHeight: 44, minWidth: 44, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.input, maxWidth: "100%", opacity: disabled ? 0.45 : 1 }}><Feather name={direction < 0 ? "skip-back" : "skip-forward"} color={palette.accent} size={17} /><Text style={{ flexShrink: 1, color: palette.accent, fontWeight: "700", fontSize: 12 }}>{label}</Text></Pressable>;
        })}
      </View>
    </> : null}
    {skipped > 0 ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{t("bible.topics.audio.skipped", { count: skipped })}</Text> : null}
    {explanation ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{explanation}</Text> : null}
    {supported && audio.catalogState === "error" && !playable ? <Pressable accessibilityRole="button" accessibilityLabel={`${t("bible.saved.audio.refresh")}: ${definition.title}`} onPress={() => { void audio.refresh(); }} style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.saved.audio.refresh")}</Text></Pressable> : null}
    <TopicPlaybackSettings palette={palette} topic={session} disabled={loading || Boolean(session && audio.commandPending)} />
  </View>;
}

function TopicSpeechProgress({ palette }: { palette: ReaderPalette }) {
  const audio = useBibleAudio();
  const { t } = useAppTranslation();
  const topic = audio.session?.topic;
  const item = topic?.definition.items[topic.itemIndex];
  const chapter = audio.session?.chapter;
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => { setDraft(null); }, [item?.id]);
  const enabled = Boolean(item && chapter && !audio.loading && !audio.commandPending && !audio.pendingTopic && !audio.pendingRequest);
  const scope = item ? `${topic?.definition.id}:${item.id}:${audio.session?.entry.manifestUrl}` : undefined;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => { scopeRef.current = scope; return () => { scopeRef.current = undefined; }; }, [scope]);
  const canSeek = () => enabledRef.current && scopeRef.current === scope;
  useEffect(() => { if (!enabled) setDraft(null); }, [enabled]);
  if (!item || !chapter || !audio.session) return null;
  const verses = chapter.verses.filter((verse) => verse.verse >= item.startVerse && verse.verse <= item.endVerse);
  if (!verses.length) return null;
  const relativeIndex = Math.max(0, verses.findIndex((verse) => verse.verse === chapter.verses[audio.session!.index]?.verse));
  const total = verses.reduce((sum, verse) => sum + verse.duration, 0);
  const elapsed = Math.min(total, verses.slice(0, relativeIndex).reduce((sum, verse) => sum + verse.duration, 0) + audio.position);
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const selected = snapChapterTime(verses, draft ?? elapsed);
  return <View>
    <Slider accessibilityLabel={`${t("audio.passageProgress")}: ${item.reference}`} accessibilityValue={{ text: `${t("audio.verse", { verse: selected.verse })}, ${clock(draft ?? elapsed)} / ${clock(total)}` }} minimumValue={0} maximumValue={total} value={draft ?? elapsed} disabled={!enabled} onValueChange={(value) => { if (canSeek()) setDraft(value); }} onSlidingComplete={(value) => { setDraft(null); if (canSeek()) void audio.seek(snapChapterTime(verses, value).seconds); }} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(event) => {
      if (!canSeek()) return;
      const direction = event.nativeEvent.actionName === "increment" ? 1 : event.nativeEvent.actionName === "decrement" ? -1 : 0;
      const nextIndex = Math.max(0, Math.min(verses.length - 1, relativeIndex + direction));
      if (direction && nextIndex !== relativeIndex) void audio.seek(verses.slice(0, nextIndex).reduce((sum, verse) => sum + verse.duration, 0));
    }} minimumTrackTintColor={palette.accent} maximumTrackTintColor={palette.line} thumbTintColor={palette.accent} style={{ height: 44 }} />
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{clock(draft ?? elapsed)}</Text><Text style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{clock(total)}</Text></View>
  </View>;
}

export function TopicPassageAudioControl({ definition, itemId, reference, palette }: { definition: TopicDefinition; itemId: string; reference: string; palette: ReaderPalette }) {
  const { audio, pending, session, supported, hasEntry, knownUnavailable } = useTopicState(definition);
  const { t } = useAppTranslation();
  const item = definition.items.find((value) => value.id === itemId);
  const matching = session?.definition.items[session.itemIndex]?.id === itemId;
  const ownPending = Boolean(pending && (pending.options.initialItemId ?? pending.definition.items[0]?.id) === itemId);
  const ownProblem = ownPending || matching ? audio.problem : null;
  const loading = ownPending && audio.loading;
  const retry = ownProblem === "network";
  const missing = !item || knownUnavailable.has(itemId) || ownProblem === "unavailable";
  const entry = item && hasEntry(item);
  const disabled = !supported || missing || !entry || loading || Boolean(matching && audio.commandPending);
  const paused = !matching || !audio.playWhenReady;
  const currentVerse = audio.session?.chapter.verses[audio.session.index];
  const completed = Boolean(matching && session?.loop === "off" && session.phase === "verse" && currentVerse && currentVerse.verse === item?.endVerse && !audio.playWhenReady && audio.position >= currentVerse.duration - 0.05);
  const label = t(loading ? "bible.topics.audio.loadingPassage" : retry ? "bible.topics.audio.retryPassage" : paused ? "bible.topics.audio.playPassage" : "bible.topics.audio.pausePassage");
  const explanation = !supported ? t("bible.topics.audio.translationUnavailable") : missing ? t("bible.topics.audio.unavailable") : retry ? t("audio.network") : !entry ? t(audio.catalogState === "loading" ? "audio.loading" : audio.catalogState === "error" ? "audio.network" : "bible.topics.audio.unavailable") : undefined;
  return <View style={{ gap: 6 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${reference}`} accessibilityState={{ busy: loading, disabled }} disabled={disabled} onPress={() => { if (disabled) return; if (retry) audio.retry(); else if (matching && !completed) void audio.toggle(); else void audio.startTopicPlaylist(definition, { mode: "single", initialItemId: itemId }); }} style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor: palette.input, borderColor: palette.line, borderWidth: 1, borderRadius: 12, flexDirection: "row", gap: 8, maxWidth: "100%", minHeight: 44, minWidth: 44, opacity: disabled ? 0.55 : 1, paddingHorizontal: 12 }}>
      {loading ? <ActivityIndicator color={palette.accent} /> : <Feather name={retry ? "rotate-cw" : paused ? "play" : "pause"} size={17} color={palette.accent} />}<Text style={{ color: palette.accent, fontSize: 13, fontWeight: "800", flexShrink: 1 }}>{label}</Text>
    </Pressable>
    {explanation ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>{explanation}</Text> : null}
    {supported && item && !entry && audio.catalogState === "error" ? <Pressable accessibilityRole="button" accessibilityLabel={`${t("bible.saved.audio.refresh")}: ${reference}`} onPress={() => { void audio.refresh(); }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.saved.audio.refresh")}</Text></Pressable> : null}
  </View>;
}
