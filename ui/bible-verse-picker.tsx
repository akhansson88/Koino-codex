import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { bibleVersionFor, buildBibleVerse, kjvBooks, type BibleVersionId, versesForChapter } from "@/features/bible-kjv";
import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse } from "@/state/types";
import { AppScreen, IconButton, PrimaryButton, SecondaryButton, SectionHeading, TextInputField, VersePreviewCard } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export function BibleVerseField({
  label,
  onChange,
  verses,
}: {
  label?: string;
  onChange: (verses: BibleVerse[]) => void;
  verses: BibleVerse[];
}) {
  const { state } = useKoino();
  const { t } = useAppTranslation();
  const preferredBibleVersion = usePreferredBibleVersion(state.currentUserId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const selectedVerses = verses.slice(0, 5);
  const canAddVerse = selectedVerses.length < 5;

  function removeVerse(reference: string) {
    onChange(selectedVerses.filter((item) => item.reference !== reference));
  }

  function addVerse(nextVerse: BibleVerse) {
    const withoutDuplicate = selectedVerses.filter((item) => item.reference !== nextVerse.reference);
    onChange([...withoutDuplicate, nextVerse].slice(0, 5));
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <SectionHeading>{label || t("shared.scripturePicker.fieldLabel")}</SectionHeading>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{selectedVerses.length}/5</Text>
      </View>
      {selectedVerses.length > 0 ? (
        <View style={{ gap: 8 }}>
          {selectedVerses.map((verse) => (
            <View key={`${verse.reference}-${verse.text}`} style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <VersePreviewCard verse={verse} compact />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("shared.scripturePicker.removeReference", { reference: verse.reference })}
                onPress={() => removeVerse(verse.reference)}
                style={{ padding: 8 }}
              >
                <Feather name="x" size={18} color={colors.olive} />
              </Pressable>
            </View>
          ))}
          {canAddVerse ? (
            <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
              {t("shared.scripturePicker.addAnother")}
            </SecondaryButton>
          ) : null}
        </View>
      ) : (
        <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
          {t("shared.scripturePicker.addBibleVerse")}
        </SecondaryButton>
      )}
      {!canAddVerse ? (
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("shared.scripturePicker.maxReferences")}</Text>
      ) : null}
      {canAddVerse ? (
        <BibleVersePicker
          bibleVersionId={preferredBibleVersion}
          visible={pickerVisible}
          onBack={() => setPickerVisible(false)}
          onSelect={(nextVerse) => {
            addVerse(nextVerse);
            setPickerVisible(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function normalizeBibleVerses(verse?: BibleVerse, verses?: BibleVerse[]) {
  if (verses?.length) return verses.slice(0, 5);
  return verse ? [verse] : [];
}

export function primaryBibleVerse(verses: BibleVerse[]) {
  return verses[0];
}

export function BibleVersePicker({
  bibleVersionId,
  onBack,
  onSelect,
  visible,
}: {
  bibleVersionId: BibleVersionId;
  onBack: () => void;
  onSelect: (verse: BibleVerse) => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const firstBook = kjvBooks[0];
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState(firstBook?.name ?? "Genesis");
  const [selectedChapter, setSelectedChapter] = useState(firstBook?.chapters[0] ?? 1);
  const initialVerse = versesForChapter(firstBook?.name ?? "Genesis", firstBook?.chapters[0] ?? 1)[0] ?? 1;
  const [startVerse, setStartVerse] = useState(initialVerse);
  const [endVerse, setEndVerse] = useState(initialVerse);
  const book = kjvBooks.find((item) => item.name === selectedBook) ?? firstBook;
  const chapterVerses = versesForChapter(selectedBook, selectedChapter);
  const selectableBooks = kjvBooks.filter((item) => item.name.toLowerCase().includes(bookQuery.trim().toLowerCase()));
  const bibleVersion = bibleVersionFor(bibleVersionId);
  const preview = buildBibleVerse(selectedBook, selectedChapter, startVerse, endVerse, bibleVersionId);

  function chooseBook(name: string) {
    const nextBook = kjvBooks.find((item) => item.name === name);
    const nextChapter = nextBook?.chapters[0] ?? 1;
    const nextVerse = versesForChapter(name, nextChapter)[0] ?? 1;
    setSelectedBook(name);
    setSelectedChapter(nextChapter);
    setStartVerse(nextVerse);
    setEndVerse(nextVerse);
  }

  function chooseChapter(chapter: number) {
    const nextVerse = versesForChapter(selectedBook, chapter)[0] ?? 1;
    setSelectedChapter(chapter);
    setStartVerse(nextVerse);
    setEndVerse(nextVerse);
  }

  function chooseStartVerse(verseNumber: number) {
    setStartVerse(verseNumber);
    setEndVerse((current) => Math.max(current, verseNumber));
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onBack}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.heading, { color: colors.ink, fontSize: 20, lineHeight: 26 }]}>{t("shared.scripturePicker.title")}</Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
              {bibleVersion.label}
            </Text>
          </View>
          <IconButton accessibilityLabel={t("shared.scripturePicker.close")} icon="x" onPress={onBack} />
        </View>
        <TextInputField value={bookQuery} onChangeText={setBookQuery} placeholder={t("shared.scripturePicker.searchBooks")} />
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.book")}</SectionHeading>
          <PickerPills values={selectableBooks.map((item) => item.name)} selected={selectedBook} onSelect={chooseBook} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.chapter")}</SectionHeading>
          <PickerPills values={book?.chapters.map(String) ?? []} selected={String(selectedChapter)} onSelect={(value) => chooseChapter(Number(value))} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.startVerse")}</SectionHeading>
          <PickerPills values={chapterVerses.map(String)} selected={String(startVerse)} onSelect={(value) => chooseStartVerse(Number(value))} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.endVerse")}</SectionHeading>
          <PickerPills
            values={chapterVerses.filter((verseNumber) => verseNumber >= startVerse).map(String)}
            selected={String(endVerse)}
            onSelect={(value) => setEndVerse(Number(value))}
          />
        </View>
        <VersePreviewCard verse={preview} showOpenIndicator={false} />
        <PrimaryButton disabled={!preview} icon="book-open" onPress={() => preview && onSelect(preview)}>
          {t("shared.scripturePicker.addReference", { reference: preview?.reference ?? t("shared.scripturePicker.verseFallback") })}
        </PrimaryButton>
      </AppScreen>
    </Modal>
  );
}

function PickerPills<T extends string>({
  onSelect,
  selected,
  values,
}: {
  onSelect: (value: T) => void;
  selected: T;
  values: T[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {values.map((value) => {
        const isSelected = value === selected;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={value}
            onPress={() => onSelect(value)}
            style={{
              alignItems: "center",
              backgroundColor: isSelected ? colors.accentSubtle : colors.paper,
              borderColor: isSelected ? colors.gold : colors.line,
              borderRadius: 999,
              borderWidth: 1,
              justifyContent: "center",
              minHeight: 38,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: isSelected ? colors.olive : colors.muted, fontSize: 14, fontWeight: "800" }}>{value}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
