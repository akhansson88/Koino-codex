import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { ReaderPalette } from "@/features/bible-reader/types";
import type { SavedVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { useBibleAudio } from "./provider";
import { hasSavedAudioTranslation, savedAudioPassage } from "./saved-passage";

export function SavedVerseAudioControl({ verse, reference, palette }: {
  verse: SavedVerse;
  reference: string;
  palette: ReaderPalette;
}) {
  const audio = useBibleAudio();
  const { t } = useAppTranslation();
  const supported = hasSavedAudioTranslation(verse.translation);
  const passage = savedAudioPassage(verse);
  const entry = passage ? Object.values(audio.catalog?.chapters ?? {}).find((item) => item.book === passage.book && item.chapter === passage.chapter) : undefined;
  const pending = audio.pendingRequest?.passage?.savedVerseId === verse.id;
  const matching = !audio.pendingRequest && audio.session?.passage?.savedVerseId === verse.id;
  const ownProblem = (pending || matching) ? audio.problem : null;
  const loading = pending && audio.loading;
  const retryPlayback = ownProblem === "network";
  const retryCatalog = Boolean(supported && passage && !entry && audio.catalogState === "error");
  const paused = !matching || !audio.playWhenReady;
  const disabled = !passage || !entry || loading || (matching && audio.commandPending) || ownProblem === "unavailable";
  const label = t(loading ? "bible.saved.audio.loading" : retryPlayback ? "bible.saved.audio.retry" : paused ? "bible.saved.audio.play" : "bible.saved.audio.pause");
  const explanation = !supported ? t("bible.saved.audio.translationUnavailable")
    : !passage || ownProblem === "unavailable" ? t("audio.passageUnavailable")
    : retryPlayback || retryCatalog ? t("audio.network")
    : !entry ? t(audio.catalogState === "loading" ? "audio.loading" : "bible.saved.audio.unavailable")
    : undefined;

  const play = () => {
    if (disabled || !entry || !passage) return;
    if (retryPlayback) audio.retry();
    else if (matching) void audio.toggle();
    else void audio.startPassage(entry, passage);
  };

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityLabel={`${label}: ${reference}`}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled }}
        disabled={disabled}
        onPress={play}
        style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor: palette.input, borderColor: palette.line, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, maxWidth: "100%", minHeight: 44, minWidth: 44, opacity: disabled ? 0.55 : 1, paddingHorizontal: 12 }}
      >
        {loading ? <ActivityIndicator color={palette.accent} /> : <Feather name={retryPlayback ? "rotate-cw" : paused ? "play" : "pause"} size={17} color={palette.accent} />}
        <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "800", flexShrink: 1 }}>{label}</Text>
      </Pressable>
      {explanation ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>{explanation}</Text> : null}
      {retryCatalog ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("bible.saved.audio.refresh")}: ${reference}`} onPress={() => { void audio.refresh(); }} style={{ minHeight: 44, maxWidth: "100%", justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "800" }}>{t("bible.saved.audio.refresh")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
