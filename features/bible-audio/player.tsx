import { Feather } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { brandPalette } from "@/ui/theme";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Switch, Text, View } from "react-native";
import { NativeViewGestureHandler } from "react-native-gesture-handler";
import { AppSheet } from "@/ui/app-sheet";
import { useAppTranslation } from "@/ui/app-language";
import type { ReaderPalette } from "@/features/bible-reader/types";
import { AUDIO_TRANSLATION, snapChapterTime, type AudioChapter } from "./catalog";
import { useBibleAudio } from "./provider";
import { TopicPlaybackSettings } from "./topic-controls";

function time(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function Progress({ chapter, index, passage, palette, active = true, inSheet = false, compact = false }: { chapter: AudioChapter; index: number; passage?: { startVerse: number; endVerse: number }; palette: ReaderPalette; active?: boolean; inSheet?: boolean; compact?: boolean }) {
  const { seek, position, loading, commandPending } = useBibleAudio();
  const { t } = useAppTranslation();
  const [dragging, setDragging] = useState<ReturnType<typeof snapChapterTime> | null>(null);
  const [width, setWidth] = useState(0);
  const scrubVerse = useRef<ReturnType<typeof snapChapterTime> | null>(null);
  const enabled = active && !loading && !commandPending;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => {
    if (!enabled) { scrubVerse.current = null; setDragging(null); }
    return () => { scrubVerse.current = null; };
  }, [enabled]);
  const verses = passage ? chapter.verses.filter((verse) => verse.verse >= passage.startVerse && verse.verse <= passage.endVerse) : chapter.verses;
  const relativeIndex = passage ? Math.max(0, verses.findIndex((verse) => verse.verse === chapter.verses[index]?.verse)) : index;
  const total = verses.reduce((sum, v) => sum + v.duration, 0);
  const elapsed = Math.min(total, verses.slice(0, relativeIndex).reduce((sum, v) => sum + v.duration, 0) + position);
  const selected = dragging ?? snapChapterTime(verses, elapsed);
  const preview = (seconds: number) => {
    if (!enabledRef.current) return;
    const target = snapChapterTime(verses, seconds);
    if (scrubVerse.current !== null && scrubVerse.current.verse !== target.verse && Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => undefined);
    }
    scrubVerse.current = target;
    setDragging(target);
  };
  const slider = <Slider disabled={!enabled} accessibilityLabel={t(passage ? "audio.passageProgress" : "audio.progress")} accessibilityValue={{ text: `${t("audio.verse", { verse: selected.verse })}, ${time(dragging?.seconds ?? elapsed)} / ${time(total)}` }} minimumValue={0} maximumValue={total} value={dragging?.seconds ?? elapsed}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (!enabledRef.current) return;
        const direction = event.nativeEvent.actionName === "increment" ? 1 : event.nativeEvent.actionName === "decrement" ? -1 : 0;
        const nextIndex = Math.max(0, Math.min(verses.length - 1, relativeIndex + direction));
        if (!direction || nextIndex === relativeIndex) return;
        if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
        void seek(verses.slice(0, nextIndex).reduce((sum, verse) => sum + verse.duration, 0));
      }}
      onSlidingStart={preview} onValueChange={(v) => { if (scrubVerse.current !== null) preview(v); }} onSlidingComplete={() => {
        const target = scrubVerse.current;
        const canSeek = enabledRef.current && scrubVerse.current !== null;
        scrubVerse.current = null;
        setDragging(null);
        if (canSeek && target) void seek(target.seconds);
      }}
      minimumTrackTintColor={brandPalette.warmPersika} maximumTrackTintColor={palette.line} thumbTintColor={brandPalette.warmPersika} style={{ height: 44 }} />;
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flex: compact ? 1 : undefined, minWidth: 0, paddingTop: compact ? 0 : 30 }}>
    {dragging !== null ? <View pointerEvents="none" testID="audio-verse-tooltip" style={{ position: "absolute", top: compact ? -28 : 0, left: Math.max(0, Math.min(width - 52, 16 + (width - 32) * dragging.seconds / total - 26)), width: 52, minHeight: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: brandPalette.warmPersika }}>
      <Text accessibilityLabel={t("audio.verse", { verse: selected.verse })} style={{ color: brandPalette.deepNavy, fontWeight: "700" }}>{selected.verse}</Text>
    </View> : null}
    {/* Keep the sheet's pan and scroll handlers from taking over a scrub. */}
    {inSheet ? <NativeViewGestureHandler disallowInterruption shouldActivateOnStart>
      <View collapsable={false}>{slider}</View>
    </NativeViewGestureHandler> : slider}
    {!compact ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: palette.muted, fontVariant: ["tabular-nums"] }}>{time(dragging?.seconds ?? elapsed)}</Text><Text style={{ color: palette.muted, fontVariant: ["tabular-nums"] }}>{time(total)}</Text></View> : null}
  </View>;
}
export function BibleAudioPlayer({ visible, onClose, onOpen, palette, book, chapter, version, bottom, follow, onFollow, onChooseTranslation, onMiniHeightChange, onMiniTopChange }: {
  visible: boolean; onClose: () => void; onOpen: () => void; palette: ReaderPalette;
  book: string; chapter: number; version: string; bottom: number; follow: boolean; onFollow: () => void;
  onChooseTranslation: () => void;
  onMiniHeightChange?: (height: number) => void;
  onMiniTopChange?: (top: number | undefined) => void;
}) {
  const audio = useBibleAudio();
  const selection = audio.chapterSelection;
  const miniRef = useRef<View>(null);
  const miniMeasurement = useRef(0);
  const miniVisible = Boolean((selection || audio.session) && !visible && !audio.pendingRequest?.passage && !audio.pendingTopic);
  const measureMini = () => {
    const revision = ++miniMeasurement.current;
    miniRef.current?.measureInWindow((_x, y, _width, height) => {
      if (revision === miniMeasurement.current && height > 0) onMiniTopChange?.(y);
    });
  };
  useEffect(() => {
    if (!onMiniTopChange) return;
    const frame = requestAnimationFrame(() => { if (miniVisible) measureMini(); else onMiniTopChange?.(undefined); });
    return () => { cancelAnimationFrame(frame); miniMeasurement.current++; };
  }, [miniVisible, bottom, follow, onMiniTopChange]);
  const { t } = useAppTranslation();
  const entry = Object.values(audio.catalog?.chapters ?? {}).find((c) => c.book === book && c.chapter === chapter);
  const selectedEntry = selection && Object.values(audio.catalog?.chapters ?? {}).find(c => c.book === selection.book && c.chapter === selection.chapter);
  const pendingPassage = audio.pendingRequest?.passage;
  const pendingTopic = audio.pendingTopic;
  const session = pendingPassage || pendingTopic ? undefined : audio.session;
  const passage = pendingPassage ?? session?.passage;
  const topic = session?.topic;
  const topicDefinition = pendingTopic?.definition ?? topic?.definition;
  const topicItem = topic ? topic.definition.items[topic.itemIndex] : pendingTopic?.definition.items.find((item) => item.id === pendingTopic.options.initialItemId) ?? pendingTopic?.definition.items[0];
  const progressPassage = topicItem ?? passage;
  const topicItems = topic?.definition.items.filter((item) => !topic.unavailableItemIds.includes(item.id)) ?? [];
  const topicIndex = topicItems.findIndex((item) => item.id === topicItem?.id);
  const passageEntry = pendingPassage ? audio.pendingRequest?.entry : session?.entry;
  const currentChapter = selection ?? session?.chapter;
  const matching = currentChapter?.book === book && currentChapter.chapter === chapter && version === AUDIO_TRANSLATION;
  const supported = version === AUDIO_TRANSLATION;
  useEffect(() => { if (visible) void audio.refresh(); }, [visible, audio.refresh]);
  const title = topicDefinition ? topicDefinition.title : passage && passageEntry
    ? `${passageEntry.bookName} ${passageEntry.chapter}:${passage.startVerse}${passage.endVerse > passage.startVerse ? `–${passage.endVerse}` : ""}`
    : selection ? `${selectedEntry?.bookName ?? selection.book} ${selection.chapter}`
    : session ? `${session.chapter.bookName} ${session.chapter.chapter}` : t("audio.title");
  const progressKey = session ? `${session.entry.manifestUrl}:${topicItem?.id ?? session.passage?.savedVerseId ?? "chapter"}:${progressPassage?.startVerse ?? ""}:${progressPassage?.endVerse ?? ""}` : undefined;
  const verse = selection?.verse ?? session?.chapter.verses[session.index].verse;
  const play = selection ? () => void audio.playSelectedChapter() : audio.problem === "network" ? audio.retry : audio.toggle;
  const iconButton = (icon: "play" | "pause" | "skip-back" | "skip-forward" | "x", label: string, action: () => void, disabled = false, primary = false, compact = false) => <Pressable
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action}
    style={{ width: compact ? 44 : primary ? 68 : 48, height: compact ? 44 : primary ? 68 : 48, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: primary ? brandPalette.warmPersika : "transparent", opacity: disabled ? 0.35 : 1 }}>
    {primary && audio.loading ? <ActivityIndicator color={brandPalette.deepNavy} /> : <Feather name={icon} size={primary && !compact ? 28 : 22} color={primary ? brandPalette.deepNavy : palette.accent} />}
  </Pressable>;
  const close = () => { void audio.stop(); onClose(); };
  const dismissToFollow = () => { if (selection || (session && !session.passage && !session.topic)) onFollow(); onClose(); };
  const followAndClose = () => { if (selection || session) onFollow(); onClose(); };
  const controls = <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 24 }}>
    {iconButton("skip-back", t(topic ? "bible.topics.audio.previousPassage" : "audio.previousChapter"), () => { if (topic) void audio.moveTopicPassage(-1); else void audio.moveChapter(-1); }, (topic ? topicIndex <= 0 : !audio.previousChapter) || audio.loading || audio.commandPending)}
    {iconButton(audio.playWhenReady ? "pause" : "play", t(audio.playWhenReady ? "audio.pause" : "audio.play"), play, audio.loading || audio.commandPending, true)}
    {iconButton("skip-forward", t(topic ? "bible.topics.audio.nextPassage" : "audio.nextChapter"), () => { if (topic) void audio.moveTopicPassage(1); else void audio.moveChapter(1); }, (topic ? topicIndex < 0 || topicIndex >= topicItems.length - 1 : !audio.nextChapter) || audio.loading || audio.commandPending)}
  </View>;
  return <>
    {miniVisible ? <View ref={miniRef} collapsable={false} onLayout={(event) => { onMiniHeightChange?.(event.nativeEvent.layout.height); measureMini(); }} style={{ position: "absolute", bottom, left: 22, right: 22, zIndex: 19, backgroundColor: palette.sheet, borderWidth: 1, borderColor: palette.line, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t("audio.open")}, ${title}, ${topicItem?.reference ?? t("audio.verse", { verse: verse ?? 1 })}`} onPress={onOpen} style={{ minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontWeight: "700", flexShrink: 1 }}>{title}</Text><Text numberOfLines={1} style={{ color: palette.muted, flexShrink: 0 }}>{t("audio.verse", { verse: verse ?? 1 })}</Text>
      </Pressable>
      {topicItem ? <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12 }}>{topicItem.reference} · {t("bible.topics.audio.position", { current: topicIndex + 1, count: topicItems.length })}</Text> : null}
      {topic?.phase === "gap" ? <Text style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{t("bible.topics.audio.gap", { seconds: Math.max(0, Math.ceil(topic.gapRemainingSeconds ?? 0)) })}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {session ? <Progress key={progressKey} chapter={session.chapter} index={session.index} passage={progressPassage} palette={palette} active={!visible} compact />
        : <View style={{ flex: 1 }}><Slider disabled accessibilityLabel={t("audio.progress")} minimumValue={0} maximumValue={1} value={0} minimumTrackTintColor={brandPalette.warmPersika} maximumTrackTintColor={palette.line} thumbTintColor={palette.muted} style={{ height: 44 }} /></View>}
      {iconButton(audio.playWhenReady ? "pause" : "play", t(audio.playWhenReady ? "audio.pause" : "audio.play"), play, audio.loading || audio.commandPending, true, true)}
      {iconButton("x", t("audio.close"), close, false, false, true)}
      </View>
      {audio.problem ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>{t(audio.problem === "network" ? "audio.network" : "audio.unavailable")}</Text> : null}
      {!follow || !matching ? <Pressable accessibilityRole="button" accessibilityLabel={t("audio.follow")} accessibilityState={{ selected: false }} onPress={onFollow}
        style={{ marginTop: 4, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", backgroundColor: brandPalette.warmPersika }}>
        <Text style={{ color: brandPalette.deepNavy, fontWeight: "700" }}>{t("audio.follow")}</Text>
      </Pressable> : null}
    </View> : null}
    <AppSheet visible={visible} onClose={dismissToFollow} title={t("audio.title")} backgroundColor={palette.sheet} foregroundColor={palette.text} scroll>
      <View style={{ paddingHorizontal: 24, paddingBottom: 30, gap: 20 }}>
        <View style={{ gap: 6 }}><Text style={{ color: palette.muted, fontSize: 12, letterSpacing: 1.5 }}>REFORMATIONSBIBELN</Text>
          <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 26, fontWeight: "700" }}>{selection || session || passage || topicDefinition ? title : `${entry?.bookName ?? book} ${chapter}`}</Text>
          {topicItem ? <Text style={{ color: palette.text, fontSize: 18, fontWeight: "700" }}>{topicItem.reference}</Text> : null}
          {topic ? <Text style={{ color: palette.muted }}>{t("bible.topics.audio.position", { current: topicIndex + 1, count: topicItems.length })}</Text> : null}
          {topic?.phase === "gap" ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontVariant: ["tabular-nums"] }}>{t("bible.topics.audio.gap", { seconds: Math.max(0, Math.ceil(topic.gapRemainingSeconds ?? 0)) })}</Text> : null}
          {selection || session ? <Text style={{ color: palette.muted }}>{t("audio.verse", { verse: verse ?? 1 })}</Text> : null}
        </View>
        {selection || passage || topicDefinition ? null : !supported ? <View style={{ gap: 12 }}><Text style={{ color: palette.muted }}>{t("audio.translationUnavailable")}</Text><Pressable accessibilityRole="button" onPress={onChooseTranslation} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("audio.chooseTranslation")}</Text></Pressable></View> : !entry ? <Text style={{ color: palette.muted }}>{t(audio.catalogState === "loading" ? "audio.loading" : audio.catalogState === "error" ? "audio.network" : "audio.unavailable")}</Text> : !matching ?
          <Pressable accessibilityRole="button" onPress={() => void audio.start(entry)} style={{ backgroundColor: brandPalette.warmPersika, padding: 16, borderRadius: 14 }}><Text style={{ color: brandPalette.deepNavy, textAlign: "center", fontWeight: "700" }}>{t("audio.startChapter", { chapter: `${entry.bookName} ${chapter}` })}</Text></Pressable> : null}
        <View accessibilityLiveRegion="polite" style={{ minHeight: 24, flexDirection: "row", gap: 10 }}>{audio.loading ? <><ActivityIndicator color={palette.accent} /><Text style={{ color: palette.muted }}>{t("audio.loading")}</Text></> : null}</View>
        {audio.problem ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>{t(audio.problem === "network" ? "audio.network" : topicDefinition ? "bible.topics.audio.unavailable" : passage ? "audio.passageUnavailable" : "audio.nextUnavailable")}</Text> : null}
        {audio.problem === "network" || audio.catalogState === "error" ? <Pressable accessibilityRole="button" onPress={() => { void audio.refresh(); if (audio.problem === "network") audio.retry(); }} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("audio.retry")}</Text></Pressable> : null}
        {selection || session ? <>
          {session ? <Progress key={progressKey} chapter={session.chapter} index={session.index} passage={progressPassage} palette={palette} active={visible} inSheet /> : null}
          {controls}
          {topic ? <TopicPlaybackSettings topic={topic} palette={palette} disabled={audio.loading || audio.commandPending} /> : null}
          <Text style={{ color: palette.muted }}>{t("audio.speed")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{[0.75, 1, 1.25, 1.5, 2].map((speed) => <Pressable key={speed} accessibilityRole="button" accessibilityLabel={`${t("audio.speed")} ${speed}`} accessibilityState={{ selected: audio.speed === speed }} onPress={() => audio.setSpeed(speed)} style={{ minHeight: 44, minWidth: 48, padding: 10, borderRadius: 12, backgroundColor: audio.speed === speed ? brandPalette.warmPersika : palette.surface }}><Text style={{ textAlign: "center", color: audio.speed === speed ? brandPalette.deepNavy : palette.text }}>{speed}×</Text></Pressable>)}</View>
          {!topic ? <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Text style={{ color: palette.text, flex: 1 }}>{t("audio.continuous")}</Text><Switch accessibilityLabel={t("audio.continuous")} accessibilityState={{ disabled: !!session?.passage }} disabled={!!session?.passage} value={!session?.passage && audio.continuous} onValueChange={audio.setContinuous} trackColor={{ true: brandPalette.warmPersika }} /></View> : null}
          <Text style={{ color: palette.muted }}>{t("audio.sleep")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(topic ? [0, 15, 30, 60] as const : [0, 15, 30, 60, "chapter"] as const).map((timer) => <Pressable key={timer} accessibilityRole="button" accessibilityState={{ selected: audio.sleep === timer }} onPress={() => audio.setSleep(timer)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, backgroundColor: audio.sleep === timer ? brandPalette.warmPersika : palette.surface }}><Text style={{ color: audio.sleep === timer ? brandPalette.deepNavy : palette.text }}>{timer === "chapter" ? t("audio.endChapter") : timer === 0 ? t("audio.off") : t("audio.minutes", { minutes: timer })}</Text></Pressable>)}</View>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: follow && !!matching }} onPress={followAndClose} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("audio.follow")}</Text></Pressable>
        </> : null}
      </View>
    </AppSheet>
  </>;
}
