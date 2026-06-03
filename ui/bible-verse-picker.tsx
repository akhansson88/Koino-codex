import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { bibleVersionFor, buildBibleVerse, kjvBooks, type BibleVersionId, versesForChapter } from "@/features/bible-kjv";
import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse } from "@/state/types";
import { AppScreen, IconButton, PrimaryButton, SecondaryButton, SectionHeading, TextInputField, VersePreviewCard } from "@/ui/app-components";
import { colors } from "@/ui/theme";

export function BibleVerseField({
  label = "Add verses (optional)",
  onChange,
  verses,
}: {
  label?: string;
  onChange: (verses: BibleVerse[]) => void;
  verses: BibleVerse[];
}) {
  const { state } = useKoino();
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
        <SectionHeading>{label}</SectionHeading>
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "800" }}>{selectedVerses.length}/5</Text>
      </View>
      {selectedVerses.length > 0 ? (
        <View style={{ gap: 8 }}>
          {selectedVerses.map((verse) => (
            <View key={`${verse.reference}-${verse.text}`} style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <VersePreviewCard verse={verse} compact />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${verse.reference}`} onPress={() => removeVerse(verse.reference)} style={{ padding: 8 }}>
                <Feather name="x" size={18} color={colors.text.primary} />
              </Pressable>
            </View>
          ))}
          {canAddVerse ? (
            <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
              Add another verse
            </SecondaryButton>
          ) : null}
        </View>
      ) : (
        <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
          Add Bible verse
        </SecondaryButton>
      )}
      {!canAddVerse ? (
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "700" }}>Maximum 5 Bible references</Text>
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
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: "900" }}>Choose a {bibleVersion.label} verse</Text>
          <IconButton accessibilityLabel="Close verse picker" icon="x" onPress={onBack} />
        </View>
        <TextInputField value={bookQuery} onChangeText={setBookQuery} placeholder="Search books" />
        <View style={{ gap: 10 }}>
          <SectionHeading muted>Book</SectionHeading>
          <PickerPills values={selectableBooks.map((item) => item.name)} selected={selectedBook} onSelect={chooseBook} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>Chapter</SectionHeading>
          <PickerPills values={book?.chapters.map(String) ?? []} selected={String(selectedChapter)} onSelect={(value) => chooseChapter(Number(value))} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>Start verse</SectionHeading>
          <PickerPills values={chapterVerses.map(String)} selected={String(startVerse)} onSelect={(value) => chooseStartVerse(Number(value))} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>End verse</SectionHeading>
          <PickerPills
            values={chapterVerses.filter((verseNumber) => verseNumber >= startVerse).map(String)}
            selected={String(endVerse)}
            onSelect={(value) => setEndVerse(Number(value))}
          />
        </View>
        <VersePreviewCard verse={preview} showOpenIndicator={false} />
        <PrimaryButton disabled={!preview} icon="book-open" onPress={() => preview && onSelect(preview)}>
          Add {preview?.reference ?? "verse"}
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
              backgroundColor: isSelected ? colors.semantic.reflectionSoft : colors.background.surface,
              borderColor: isSelected ? colors.border.soft : colors.border.subtle,
              borderRadius: 999,
              borderWidth: 1,
              justifyContent: "center",
              minHeight: 38,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: isSelected ? colors.text.primary : colors.text.secondary, fontSize: 14, fontWeight: "800" }}>{value}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
