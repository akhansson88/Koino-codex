import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { displayBibleReference } from "@/features/bible-book-names";
import { normalizeBibleVerses } from "@/features/bible-verse-utils";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import type { JournalEntry } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { Card } from "@/ui/app-components";
import { journalEntryHasSharedCopy, journalEntryPresentation } from "@/ui/journal-presentation";
import { colors, typography } from "@/ui/theme";

export function JournalEntryPreview({
  entry,
  onOpen,
  variant = "history",
}: {
  entry: JournalEntry;
  onOpen: () => void;
  variant?: "history" | "journey";
}) {
  const bookLanguage = useBibleBookLanguage();
  const { language, t } = useAppTranslation();
  const presentation = journalEntryPresentation(entry, t);
  const { moodIcon, moodLabel, typeIcon, typeLabel } = presentation;
  const verses = normalizeBibleVerses(entry.verse, entry.verses);
  const scripture = verses.length ? verses : entry.passage ? [entry.passage] : [];
  const references = scripture.map((verse) => displayBibleReference(verse.reference, bookLanguage, verse.translation));
  const title = presentation.title && !references.includes(presentation.title) ? presentation.title : undefined;
  const body = presentation.body !== presentation.title ? presentation.body : undefined;
  const spokenBody = body && body.length > 140 ? `${body.slice(0, 140).trimEnd()}…` : body;
  const createdAt = new Date(entry.createdAt);
  const date = Number.isNaN(createdAt.getTime())
    ? undefined
    : new Intl.DateTimeFormat(language, { month: "short", day: "numeric", year: "numeric" }).format(createdAt);
  const shared = journalEntryHasSharedCopy(entry);
  const heading = date ? t("me.journey.preview.openLabel", { date, type: typeLabel }) : typeLabel;
  const isJourney = variant === "journey";

  const content = (
    <>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6 }}>
            <Feather name={typeIcon} size={15} color={colors.olive} />
            <Text style={[typography.label, { color: colors.textMuted, flexShrink: 1 }]}>{typeLabel}</Text>
          </View>
          {date ? <Text style={[typography.caption, { color: colors.muted, flexShrink: 1 }]}>{date}</Text> : null}
        </View>
        <Feather name="chevron-right" size={16} color={colors.muted} />
      </View>
      {moodLabel ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
          <Feather name={moodIcon} size={15} color={colors.olive} />
          <Text style={[typography.label, { color: colors.olive, flex: 1 }]}>{moodLabel}</Text>
        </View>
      ) : null}
      {title ? (
        <Text numberOfLines={2} style={[typography.title, { color: colors.ink }]}>
          {title}
        </Text>
      ) : null}
      {body ? (
        <Text numberOfLines={isJourney ? 2 : 3} style={[typography.body, { color: colors.textSecondary }]}>
          {body}
        </Text>
      ) : null}
      {references.length ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
          <Feather name="book-open" size={14} color={colors.olive} />
          <Text numberOfLines={2} style={[typography.caption, { color: colors.olive, flex: 1 }]}>
            {references.join(" · ")}
          </Text>
        </View>
      ) : null}
      {shared ? <Text style={[typography.caption, { color: colors.muted }]}>{t("me.journey.preview.sharedCopy")}</Text> : null}
    </>
  );

  return (
    <Pressable
      accessibilityHint={t("me.journey.preview.openHint")}
      accessibilityLabel={[heading, moodLabel, title, spokenBody, ...references, shared ? t("me.journey.preview.sharedCopy") : undefined]
        .filter(Boolean)
        .join(", ")}
      accessibilityRole="button"
      onPress={onOpen}
    >
      {({ pressed }) => isJourney ? (
        <View style={{ borderColor: colors.line, borderTopWidth: 1, gap: 6, opacity: pressed ? 0.7 : 1, paddingVertical: 12 }}>
          {content}
        </View>
      ) : (
        <Card style={{ gap: 10, opacity: pressed ? 0.88 : 1, padding: 14 }}>{content}</Card>
      )}
    </Pressable>
  );
}
