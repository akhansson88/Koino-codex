import { Feather } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { brandPalette } from "@/ui/theme";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import { AppSheet } from "@/ui/app-sheet";
import { useAppTranslation } from "@/ui/app-language";
import type { ReaderPalette } from "@/features/bible-reader/types";
import { AUDIO_TRANSLATION, type AudioChapter } from "./catalog";
import { useBibleAudio } from "./provider";

function time(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function Progress({ chapter, index, palette }: { chapter: AudioChapter; index: number; palette: ReaderPalette }) {
  const { seek, position } = useBibleAudio();
  const { t } = useAppTranslation();
  const [dragging, setDragging] = useState<number | null>(null);
  const total = chapter.verses.reduce((sum, v) => sum + v.duration, 0);
  const elapsed = chapter.verses.slice(0, index).reduce((sum, v) => sum + v.duration, 0) + position;
  return <View>
    <Slider accessibilityLabel={t("audio.progress")} accessibilityValue={{ text: `${time(dragging ?? elapsed)} / ${time(total)}` }} minimumValue={0} maximumValue={total} value={dragging ?? elapsed}
      onSlidingStart={(v) => setDragging(v)} onValueChange={(v) => setDragging(v)} onSlidingComplete={(v) => { setDragging(null); seek(v); }}
      minimumTrackTintColor={brandPalette.warmPersika} maximumTrackTintColor={palette.line} thumbTintColor={brandPalette.warmPersika} style={{ height: 44 }} />
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: palette.muted, fontVariant: ["tabular-nums"] }}>{time(dragging ?? elapsed)}</Text><Text style={{ color: palette.muted, fontVariant: ["tabular-nums"] }}>{time(total)}</Text></View>
  </View>;
}
export function BibleAudioPlayer({ visible, onClose, onOpen, palette, book, chapter, version, bottom, follow, onFollow, onChooseTranslation }: {
  visible: boolean; onClose: () => void; onOpen: () => void; palette: ReaderPalette;
  book: string; chapter: number; version: string; bottom: number; follow: boolean; onFollow: () => void;
  onChooseTranslation: () => void;
}) {
  const audio = useBibleAudio();
  const { t } = useAppTranslation();
  const entry = Object.values(audio.catalog?.chapters ?? {}).find((c) => c.book === book && c.chapter === chapter);
  const session = audio.session;
  const matching = session?.chapter.book === book && session.chapter.chapter === chapter && version === AUDIO_TRANSLATION;
  const supported = version === AUDIO_TRANSLATION;
  useEffect(() => { if (visible) void audio.refresh(); }, [visible, audio.refresh]);
  const title = session ? `${session.chapter.bookName} ${session.chapter.chapter}` : t("audio.title");
  const verse = session?.chapter.verses[session.index].verse;
  const iconButton = (icon: "play" | "pause" | "skip-back" | "skip-forward" | "x" | "chevrons-left" | "chevrons-right", label: string, action: () => void, disabled = false, primary = false) => <Pressable
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action}
    style={{ width: primary ? 68 : 48, height: primary ? 68 : 48, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: primary ? brandPalette.warmPersika : palette.surface, opacity: disabled ? 0.35 : 1 }}>
    <Feather name={icon} size={primary ? 28 : 22} color={primary ? brandPalette.deepNavy : palette.accent} />
  </Pressable>;
  const close = () => { void audio.stop(); onClose(); };
  return <>
    {session && !visible ? <View style={{ position: "absolute", bottom, left: 22, right: 22, zIndex: 19, backgroundColor: palette.sheet, borderWidth: 1, borderColor: palette.line, borderRadius: 18, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("audio.open")} onPress={onOpen} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
        <Text style={{ color: palette.text, fontWeight: "700" }}>{title}</Text><Text style={{ color: palette.muted }}>{t("audio.verse", { verse: verse ?? 1 })}</Text>
      </Pressable>
      <View style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>{audio.loading ? <ActivityIndicator color={palette.accent} /> : iconButton(audio.playing ? "pause" : "play", t(audio.playing ? "audio.pause" : "audio.play"), audio.problem === "network" ? audio.retry : audio.toggle)}</View>
      {iconButton("x", t("audio.close"), close)}
    </View> : null}
    <AppSheet visible={visible} onClose={close} title={t("audio.title")} backgroundColor={palette.sheet} foregroundColor={palette.text} scroll>
      <View style={{ paddingHorizontal: 24, paddingBottom: 30, gap: 20 }}>
        <View style={{ gap: 6 }}><Text style={{ color: palette.muted, fontSize: 12, letterSpacing: 1.5 }}>REFORMATIONSBIBELN</Text>
          <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 26, fontWeight: "700" }}>{session ? title : `${entry?.bookName ?? book} ${chapter}`}</Text>
          <Text style={{ color: palette.muted }}>{t("audio.ai")}{session ? ` · ${t("audio.verse", { verse: verse ?? 1 })}` : ""}</Text>
        </View>
        {!supported ? <View style={{ gap: 12 }}><Text style={{ color: palette.muted }}>{t("audio.translationUnavailable")}</Text><Pressable accessibilityRole="button" onPress={onChooseTranslation} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("audio.chooseTranslation")}</Text></Pressable></View> : !entry ? <Text style={{ color: palette.muted }}>{t(audio.catalogState === "loading" ? "audio.loading" : audio.catalogState === "error" ? "audio.network" : "audio.unavailable")}</Text> : !matching ?
          <Pressable accessibilityRole="button" onPress={() => void audio.start(entry)} style={{ backgroundColor: brandPalette.warmPersika, padding: 16, borderRadius: 14 }}><Text style={{ color: brandPalette.deepNavy, textAlign: "center", fontWeight: "700" }}>{t("audio.startChapter", { chapter: `${entry.bookName} ${chapter}` })}</Text></Pressable> : null}
        <View accessibilityLiveRegion="polite" style={{ minHeight: 24, flexDirection: "row", gap: 10 }}>{audio.loading ? <><ActivityIndicator color={palette.accent} /><Text style={{ color: palette.muted }}>{t("audio.loading")}</Text></> : null}</View>
        {audio.problem ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>{t(audio.problem === "network" ? "audio.network" : "audio.nextUnavailable")}</Text> : null}
        {audio.problem === "network" || audio.catalogState === "error" ? <Pressable accessibilityRole="button" onPress={() => { void audio.refresh(); if (audio.problem === "network") audio.retry(); }} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("audio.retry")}</Text></Pressable> : null}
        {session ? <>
          <Progress chapter={session.chapter} index={session.index} palette={palette} />
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 24 }}>
            {iconButton("skip-back", t("audio.previousVerse"), () => audio.move(-1), session.index === 0)}
            {iconButton(audio.playing ? "pause" : "play", t(audio.playing ? "audio.pause" : "audio.play"), audio.problem === "network" ? audio.retry : audio.toggle, audio.loading, true)}
            {iconButton("skip-forward", t("audio.nextVerse"), () => audio.move(1), session.index === session.chapter.verses.length - 1)}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            {iconButton("chevrons-left", t("audio.previousChapter"), () => { void audio.moveChapter(-1); }, !audio.previousChapter || audio.loading)}
            <Text style={{ color: palette.muted }}>{t("audio.chapter")}</Text>
            {iconButton("chevrons-right", t("audio.nextChapter"), () => { void audio.moveChapter(1); }, !audio.nextChapter || audio.loading)}
          </View>
          <Text style={{ color: palette.muted }}>{t("audio.speed")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{[0.75, 1, 1.25, 1.5, 2].map((speed) => <Pressable key={speed} accessibilityRole="button" accessibilityLabel={`${t("audio.speed")} ${speed}`} accessibilityState={{ selected: audio.speed === speed }} onPress={() => audio.setSpeed(speed)} style={{ minHeight: 44, minWidth: 48, padding: 10, borderRadius: 12, backgroundColor: audio.speed === speed ? brandPalette.warmPersika : palette.surface }}><Text style={{ textAlign: "center", color: audio.speed === speed ? brandPalette.deepNavy : palette.text }}>{speed}×</Text></Pressable>)}</View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Text style={{ color: palette.text, flex: 1 }}>{t("audio.continuous")}</Text><Switch accessibilityLabel={t("audio.continuous")} value={audio.continuous} onValueChange={audio.setContinuous} trackColor={{ true: brandPalette.warmPersika }} /></View>
          <Text style={{ color: palette.muted }}>{t("audio.sleep")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{([0, 15, 30, 60, "chapter"] as const).map((timer) => <Pressable key={timer} accessibilityRole="button" accessibilityState={{ selected: audio.sleep === timer }} onPress={() => audio.setSleep(timer)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, backgroundColor: audio.sleep === timer ? brandPalette.warmPersika : palette.surface }}><Text style={{ color: audio.sleep === timer ? brandPalette.deepNavy : palette.text }}>{timer === "chapter" ? t("audio.endChapter") : timer === 0 ? t("audio.off") : t("audio.minutes", { minutes: timer })}</Text></Pressable>)}</View>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: follow && !!matching }} onPress={() => { onFollow(); onClose(); }} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("audio.follow")}</Text></Pressable>
        </> : null}
      </View>
    </AppSheet>
  </>;
}
