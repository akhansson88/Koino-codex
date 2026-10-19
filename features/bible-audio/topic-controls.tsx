import { Feather } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import type { ReaderPalette } from "@/features/bible-reader/types";
import { useAppTranslation } from "@/ui/app-language";
import { radius } from "@/ui/theme";
import { snapChapterTime } from "./catalog";
import { useBibleAudio } from "./provider";
import { hasSavedAudioTranslation } from "./saved-passage";
import type { TopicDefinition, TopicLoop, TopicSession } from "./topic-playback";

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

export const TOPIC_PAUSE_OPTIONS = [0, 2, 5, 10, 15] as const;

export function TopicPlaybackSettings({ palette, topic, disabled = false, compact = false }: { palette: ReaderPalette; topic?: TopicSession; disabled?: boolean; compact?: boolean }) {
  const audio = useBibleAudio();
  const { t } = useAppTranslation();
  const seconds = topic?.pauseSeconds ?? audio.topicPauseSeconds;
  const [draft, setDraft] = useState<number>(seconds);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setDraft(seconds);
  }, [seconds]);

  const selectPause = (val: number) => {
    if (disabled) return;
    setDraft(val);
    void audio.setTopicPause(val);
  };

  const loop = topic?.loop ?? "off";
  const [loopDraft, setLoopDraft] = useState<TopicLoop | null>(null);
  useEffect(() => { setLoopDraft(null); }, [loop]);
  const currentLoop = loopDraft ?? loop;
  const loopLabel = t(currentLoop === "off" ? "bible.topics.audio.loopOff" : currentLoop === "passage" ? "bible.topics.audio.loopPassage" : "bible.topics.audio.loopTopic");

  const toggleLoop = () => {
    if (disabled || !topic) return;
    const next: TopicLoop = currentLoop === "off" ? "passage" : currentLoop === "passage" ? "topic" : "off";
    setLoopDraft(next);
    void audio.setTopicLoop(next);
  };

  const pauseLabel = draft === 0 ? t("bible.topics.audio.pauseNone") : t("bible.topics.audio.pauseShort", { seconds: draft });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("bible.topics.audio.pauseDropdownTitle")}: ${pauseLabel}`}
        accessibilityValue={{ text: pauseLabel }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => setDropdownOpen(true)}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          flexDirection: "row",
          backgroundColor: palette.input,
          borderColor: palette.line,
          borderWidth: 1,
          borderRadius: 12,
          minHeight: 40,
          paddingHorizontal: 12,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
          <Feather name="clock" size={14} color={palette.accent} />
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "700" }}>
            {pauseLabel}
          </Text>
        </View>
        <Feather name="chevron-down" size={14} color={palette.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("bible.topics.audio.loop")}: ${loopLabel}`}
        accessibilityState={{ disabled: disabled || !topic, selected: currentLoop !== "off" }}
        disabled={disabled || !topic}
        hitSlop={8}
        onPress={toggleLoop}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: currentLoop === "off" ? palette.input : palette.peach,
          borderColor: currentLoop === "off" ? palette.line : palette.accent,
          borderWidth: 1,
          opacity: disabled || !topic ? 0.45 : 1,
        }}
      >
        <Feather name="repeat" size={16} color={currentLoop === "off" ? palette.muted : palette.accent} />
        {currentLoop === "passage" ? (
          <View
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: palette.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: palette.surface, fontSize: 8, fontWeight: "900", lineHeight: 9 }}>1</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        animationType="fade"
        transparent
        visible={dropdownOpen}
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable
          accessibilityLabel={t("common.close")}
          onPress={() => setDropdownOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 320,
              backgroundColor: palette.surface,
              borderColor: palette.line,
              borderWidth: 1,
              borderRadius: radius.lg,
              padding: 18,
              gap: 12,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.15,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>
                {t("bible.topics.audio.pauseDropdownTitle")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                hitSlop={8}
                onPress={() => setDropdownOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: palette.input }}
              >
                <Feather name="x" size={16} color={palette.muted} />
              </Pressable>
            </View>
            <View style={{ gap: 6 }}>
              {TOPIC_PAUSE_OPTIONS.map((val) => {
                const isSelected = draft === val;
                return (
                  <Pressable
                    key={val}
                    accessibilityRole="button"
                    accessibilityLabel={val === 0 ? t("bible.topics.audio.pauseNone") : t("bible.topics.audio.seconds", { seconds: val })}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      selectPause(val);
                      setDropdownOpen(false);
                    }}
                    style={{
                      alignItems: "center",
                      backgroundColor: isSelected ? palette.peach : palette.input,
                      borderColor: isSelected ? palette.accent : palette.line,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      minHeight: 46,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Text style={{ color: isSelected ? palette.accent : palette.text, fontSize: 15, fontWeight: isSelected ? "900" : "600" }}>
                      {val === 0 ? t("bible.topics.audio.pauseNone") : t("bible.topics.audio.seconds", { seconds: val })}
                    </Text>
                    {isSelected ? <Feather name="check" size={18} color={palette.accent} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function TopicPlaylistProgress({
  definition,
  palette,
  available,
  currentIndex,
}: {
  definition: TopicDefinition;
  palette: ReaderPalette;
  available: TopicDefinition["items"];
  currentIndex: number;
}) {
  const audio = useBibleAudio();
  const { t } = useAppTranslation();
  const currentItem = available[currentIndex];
  const chapter = audio.session?.chapter;
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const verses = currentItem && chapter
    ? chapter.verses.filter((v) => v.verse >= currentItem.startVerse && v.verse <= currentItem.endVerse)
    : [];
  const relativeIndex = verses.length > 0 && chapter && audio.session
    ? Math.max(0, verses.findIndex((v) => v.verse === chapter.verses[audio.session!.index]?.verse))
    : 0;
  const passageTotal = verses.reduce((sum, v) => sum + v.duration, 0);
  const passageElapsed = verses.length > 0
    ? Math.min(passageTotal, verses.slice(0, relativeIndex).reduce((sum, v) => sum + v.duration, 0) + audio.position)
    : 0;
  const fraction = passageTotal > 0 ? Math.min(1, Math.max(0, passageElapsed / passageTotal)) : 0;

  const totalPassages = Math.max(1, available.length);
  const currentSafeIndex = Math.max(0, currentIndex);
  const playlistProgress = currentSafeIndex + fraction;

  const displayedIndex = scrubIndex ?? currentSafeIndex;
  const displayedItem = available[displayedIndex] ?? currentItem;

  const enabled = Boolean(!audio.loading && !audio.commandPending && !audio.pendingTopic && available.length > 0);

  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {t("bible.topics.audio.position", { current: displayedIndex + 1, count: totalPassages })}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.accent, fontSize: 11, fontWeight: "800", maxWidth: 190 }}>
          {displayedItem?.reference ?? ""}
        </Text>
      </View>
      <Slider
        accessibilityLabel={t("bible.topics.audio.playlistProgress")}
        accessibilityValue={{
          min: 0,
          max: totalPassages,
          now: scrubIndex ?? playlistProgress,
          text: `${t("bible.topics.audio.position", { current: displayedIndex + 1, count: totalPassages })}: ${displayedItem?.reference ?? ""}`,
        }}
        minimumValue={0}
        maximumValue={totalPassages}
        step={0.01}
        value={scrubIndex !== null ? scrubIndex + 0.5 : playlistProgress}
        disabled={!enabled || available.length <= 1}
        onValueChange={(val) => {
          const target = Math.max(0, Math.min(available.length - 1, Math.floor(val)));
          setScrubIndex(target);
        }}
        onSlidingComplete={(val) => {
          setScrubIndex(null);
          const target = Math.max(0, Math.min(available.length - 1, Math.floor(val)));
          if (target !== currentSafeIndex) {
            void audio.moveTopicPassage(target - currentSafeIndex);
          }
        }}
        minimumTrackTintColor={palette.accent}
        maximumTrackTintColor={palette.line}
        thumbTintColor={palette.accent}
        style={{ height: 32 }}
      />
    </View>
  );
}

export function TopicPlaybackPanel({ definition, palette, insets }: { definition: TopicDefinition; palette: ReaderPalette; insets?: { bottom?: number; top?: number } }) {
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
  const disabled = !playable || loading || ownProblem === "unavailable";
  const label = t(loading ? "audio.loading" : retry ? "audio.retry" : playingAll ? audio.playWhenReady ? "audio.pause" : "bible.topics.audio.resumeAll" : "bible.topics.audio.playAll");
  const explanation = !supported ? t("bible.topics.audio.translationUnavailable") : retry ? t("audio.network") : ownProblem === "unavailable" ? t("bible.topics.audio.unavailable") : !playable ? t(audio.catalogState === "loading" ? "audio.loading" : audio.catalogState === "error" ? "audio.network" : "bible.topics.audio.unavailable") : undefined;
  const currentIndex = available.findIndex((item) => item.id === current?.id);

  const play = () => {
    if (disabled) return;
    if (retry) audio.retry();
    else if (playingAll) void audio.toggle();
    else void audio.startTopicPlaylist(definition, { mode: "all" });
  };

  const bottomPadding = Math.max(12, (insets?.bottom ?? 0) + 8);

  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderTopWidth: 1,
        borderWidth: 1,
        borderRadius: radius.lg,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: bottomPadding,
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      {session ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View accessibilityLiveRegion="polite" style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>
                {current?.reference ?? definition.title}
              </Text>
              {session.phase === "gap" ? (
                <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {t("bible.topics.audio.gap", { seconds: Math.max(0, Math.ceil(session.gapRemainingSeconds ?? 0)) })}
                </Text>
              ) : (
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
                  {t("bible.topics.audio.position", { current: Math.max(1, currentIndex + 1), count: available.length })}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {([-1, 1] as const).map((direction) => {
                const navDisabled = audio.loading || (direction < 0 ? currentIndex <= 0 : currentIndex < 0 || currentIndex >= available.length - 1);
                const navLabel = t(direction < 0 ? "bible.topics.audio.previousPassage" : "bible.topics.audio.nextPassage");
                return (
                  <Pressable
                    key={direction}
                    accessibilityRole="button"
                    accessibilityLabel={navLabel}
                    accessibilityState={{ disabled: navDisabled }}
                    disabled={navDisabled}
                    hitSlop={8}
                    onPress={() => { void audio.moveTopicPassage(direction); }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: palette.input,
                      opacity: navDisabled ? 0.35 : 1,
                    }}
                  >
                    <Feather name={direction < 0 ? "skip-back" : "skip-forward"} color={palette.accent} size={18} />
                  </Pressable>
                );
              })}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${definition.title}`}
                accessibilityState={{ busy: loading, disabled }}
                disabled={disabled}
                hitSlop={8}
                onPress={play}
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: palette.peach,
                  borderColor: palette.accent,
                  borderWidth: 1,
                  borderRadius: 22,
                  minHeight: 44,
                  minWidth: 44,
                  width: 44,
                  height: 44,
                  opacity: disabled ? 0.55 : 1,
                }}
              >
                {loading ? <ActivityIndicator color={palette.accent} size="small" /> : <Feather name={retry ? "rotate-cw" : playingAll && audio.playWhenReady ? "pause" : "play"} size={22} color={palette.accent} />}
              </Pressable>
            </View>
          </View>

          <TopicPlaybackSettings palette={palette} topic={session} disabled={loading} compact />
        </>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>
                {definition.title}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
                {t(available.length === 1 ? "bible.topics.passage.one" : "bible.topics.passage.count", { count: available.length })}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${definition.title}`}
              accessibilityState={{ busy: loading, disabled }}
              disabled={disabled}
              hitSlop={8}
              onPress={play}
              style={{
                alignItems: "center",
                backgroundColor: palette.peach,
                borderColor: palette.accent,
                borderWidth: 1,
                borderRadius: 14,
                flexDirection: "row",
                gap: 8,
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: 16,
                opacity: disabled ? 0.55 : 1,
              }}
            >
              {loading ? <ActivityIndicator color={palette.accent} size="small" /> : <Feather name={retry ? "rotate-cw" : "play"} size={19} color={palette.accent} />}
              <Text style={{ color: palette.accent, fontWeight: "800", fontSize: 14 }}>{label}</Text>
            </Pressable>
          </View>

          <TopicPlaybackSettings palette={palette} topic={session} disabled={loading} compact />
        </View>
      )}

      {skipped > 0 ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>{t("bible.topics.audio.skipped", { count: skipped })}</Text> : null}
      {explanation ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>{explanation}</Text> : null}
      {supported && audio.catalogState === "error" && !playable ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("bible.saved.audio.refresh")}: ${definition.title}`} onPress={() => { void audio.refresh(); }} style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}>
          <Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.saved.audio.refresh")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TopicSpeechProgress({ palette }: { palette: ReaderPalette }) {
  const audio = useBibleAudio();
  const { t } = useAppTranslation();
  const topic = audio.session?.topic;
  const item = topic?.definition.items[topic.itemIndex];
  const chapter = audio.session?.chapter;
  const [draft, setDraft] = useState<ReturnType<typeof snapChapterTime> | null>(null);
  const scrubTarget = useRef<ReturnType<typeof snapChapterTime> | null>(null);
  useEffect(() => { setDraft(null); scrubTarget.current = null; }, [item?.id]);
  const enabled = Boolean(item && chapter && !audio.loading && !audio.commandPending && !audio.pendingTopic && !audio.pendingRequest);
  const scope = item ? `${topic?.definition.id}:${item.id}:${audio.session?.entry.manifestUrl}` : undefined;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => { scopeRef.current = scope; return () => { scopeRef.current = undefined; }; }, [scope]);
  const canSeek = () => enabledRef.current && scopeRef.current === scope;
  useEffect(() => { if (!enabled) { setDraft(null); scrubTarget.current = null; } }, [enabled]);
  if (!item || !chapter || !audio.session) return null;
  const verses = chapter.verses.filter((verse) => verse.verse >= item.startVerse && verse.verse <= item.endVerse);
  if (!verses.length) return null;
  const relativeIndex = Math.max(0, verses.findIndex((verse) => verse.verse === chapter.verses[audio.session!.index]?.verse));
  const total = verses.reduce((sum, verse) => sum + verse.duration, 0);
  const elapsed = Math.min(total, verses.slice(0, relativeIndex).reduce((sum, verse) => sum + verse.duration, 0) + audio.position);
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const selected = draft ?? snapChapterTime(verses, elapsed);
  return (
    <View style={{ gap: 2 }}>
      <Slider
        accessibilityLabel={`${t("audio.passageProgress")}: ${item.reference}`}
        accessibilityValue={{ text: `${t("audio.verse", { verse: selected.verse })}, ${clock(draft?.seconds ?? elapsed)} / ${clock(total)}` }}
        minimumValue={0}
        maximumValue={total}
        value={draft?.seconds ?? elapsed}
        disabled={!enabled}
        onValueChange={(value) => { if (canSeek()) { const target = snapChapterTime(verses, value); scrubTarget.current = target; setDraft(target); } }}
        onSlidingComplete={(value) => { const target = scrubTarget.current ?? snapChapterTime(verses, value); scrubTarget.current = null; setDraft(null); if (canSeek()) void audio.seek(target.seconds); }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (!canSeek()) return;
          const direction = event.nativeEvent.actionName === "increment" ? 1 : event.nativeEvent.actionName === "decrement" ? -1 : 0;
          const nextIndex = Math.max(0, Math.min(verses.length - 1, relativeIndex + direction));
          if (direction && nextIndex !== relativeIndex) void audio.seek(verses.slice(0, nextIndex).reduce((sum, verse) => sum + verse.duration, 0));
        }}
        minimumTrackTintColor={palette.accent}
        maximumTrackTintColor={palette.line}
        thumbTintColor={palette.accent}
        style={{ height: 28 }}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: palette.muted, fontSize: 11, fontVariant: ["tabular-nums"] }}>{t("audio.verse", { verse: selected.verse })} · {clock(draft?.seconds ?? elapsed)}</Text>
        <Text style={{ color: palette.muted, fontSize: 11, fontVariant: ["tabular-nums"] }}>{clock(total)}</Text>
      </View>
    </View>
  );
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
  const disabled = !supported || missing || !entry || loading;
  const paused = !matching || !audio.playWhenReady;
  const currentVerse = audio.session?.chapter.verses[audio.session.index];
  const completed = Boolean(matching && session?.loop === "off" && session.phase === "verse" && currentVerse && currentVerse.verse === item?.endVerse && !audio.playWhenReady && audio.position >= currentVerse.duration - 0.05);
  const label = t(loading ? "bible.topics.audio.loadingPassage" : retry ? "bible.topics.audio.retryPassage" : paused ? "bible.topics.audio.playPassage" : "bible.topics.audio.pausePassage");
  const explanation = !supported ? t("bible.topics.audio.translationUnavailable") : missing ? t("bible.topics.audio.unavailable") : retry ? t("audio.network") : !entry ? t(audio.catalogState === "loading" ? "audio.loading" : audio.catalogState === "error" ? "audio.network" : "bible.topics.audio.unavailable") : undefined;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${reference}`}
        accessibilityState={{ busy: loading, disabled }}
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          if (retry) audio.retry();
          else if (matching && !completed) void audio.toggle();
          else void audio.startTopicPlaylist(definition, { mode: "single", initialItemId: itemId });
        }}
        style={{
          alignItems: "center",
          alignSelf: "flex-start",
          backgroundColor: palette.input,
          borderColor: palette.line,
          borderWidth: 1,
          borderRadius: 12,
          flexDirection: "row",
          gap: 8,
          maxWidth: "100%",
          minHeight: 44,
          minWidth: 44,
          opacity: disabled ? 0.55 : 1,
          paddingHorizontal: 12,
        }}
      >
        {loading ? <ActivityIndicator color={palette.accent} /> : <Feather name={retry ? "rotate-cw" : paused ? "play" : "pause"} size={17} color={palette.accent} />}
        <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "800", flexShrink: 1 }}>{label}</Text>
      </Pressable>
      {explanation ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>{explanation}</Text> : null}
      {supported && item && !entry && audio.catalogState === "error" ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("bible.saved.audio.refresh")}: ${reference}`} onPress={() => { void audio.refresh(); }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.saved.audio.refresh")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

