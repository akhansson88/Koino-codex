import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { displayBibleBookName, displayBibleReference } from "@/features/bible-book-names";
import { makeBiblePlanRange } from "@/features/bible-plans";
import { kjvBooks, verseCountForChapter } from "@/features/bible-canon";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import type { BiblePlanRange } from "@/state/types";
import { FullScreenModal, PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { localeFor } from "@/ui/localization";
import type { AppLanguage } from "@/ui/localization";

const OLD_TESTAMENT_BOOKS = 39;

export function PlanPassagePicker({
  initialRange,
  onClose,
  onSelect,
  visible,
}: {
  initialRange?: BiblePlanRange;
  onClose: () => void;
  onSelect: (range: BiblePlanRange) => void;
  visible: boolean;
}) {
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [bookName, setBookName] = useState(initialRange?.start.book ?? "");
  const [anchorChapter, setAnchorChapter] = useState<number | undefined>(initialRange?.start.chapter);
  const [startChapter, setStartChapter] = useState<number | undefined>(initialRange?.start.chapter);
  const [endChapter, setEndChapter] = useState<number | undefined>(initialRange?.end.chapter);
  const [complete, setComplete] = useState(Boolean(initialRange));

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setBookName(initialRange?.start.book ?? "");
    setAnchorChapter(initialRange?.start.chapter);
    setStartChapter(initialRange?.start.chapter);
    setEndChapter(initialRange?.end.chapter);
    setComplete(Boolean(initialRange));
  }, [initialRange, visible]);

  const book = bookName ? kjvBooks.find((item) => item.name === bookName) : undefined;
  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(localeFor(language));
    if (!normalized) return kjvBooks;
    return kjvBooks.filter((item) => {
      const localized = displayBibleBookName(item.name, bookLanguage).toLocaleLowerCase(localeFor(language));
      return localized.includes(normalized) || item.name.toLowerCase().includes(normalized);
    });
  }, [bookLanguage, language, query]);

  const oldTestament = filteredBooks.filter((item) => kjvBooks.indexOf(item) < OLD_TESTAMENT_BOOKS);
  const newTestament = filteredBooks.filter((item) => kjvBooks.indexOf(item) >= OLD_TESTAMENT_BOOKS);
  const selection = book && startChapter && endChapter
    ? makeBiblePlanRange(
        "picker_preview",
        {
          book: book.name,
          chapter: startChapter,
          verse: initialRange && initialRange.start.book === book.name && startChapter === initialRange.start.chapter
            ? initialRange.start.verse
            : 1,
        },
        {
          book: book.name,
          chapter: endChapter,
          verse: initialRange && initialRange.end.book === book.name && endChapter === initialRange.end.chapter
            ? initialRange.end.verse
            : (verseCountForChapter(book.name, endChapter) || 1),
        },
      )
    : undefined;

  function chooseBook(name: string) {
    const nextBook = kjvBooks.find((item) => item.name === name);
    const firstChapter = nextBook?.chapters[0] ?? 1;
    setBookName(name);
    setAnchorChapter(firstChapter);
    setStartChapter(firstChapter);
    setEndChapter(firstChapter);
    setComplete(false);
    setQuery("");
  }

  function chooseChapter(chapter: number) {
    if (complete || anchorChapter === undefined) {
      setAnchorChapter(chapter);
      setStartChapter(chapter);
      setEndChapter(chapter);
      setComplete(false);
      return;
    }
    setStartChapter(Math.min(anchorChapter, chapter));
    setEndChapter(Math.max(anchorChapter, chapter));
    setComplete(true);
  }

  function chooseWholeBook() {
    if (!book) return;
    const first = book.chapters[0] ?? 1;
    const last = book.chapters[book.chapters.length - 1] ?? first;
    setAnchorChapter(first);
    setStartChapter(first);
    setEndChapter(last);
    setComplete(true);
  }

  function finish() {
    if (!selection) return;
    onSelect({ ...selection, id: `plan_range_${Date.now()}` });
    onClose();
  }

  return (
    <FullScreenModal onRequestClose={onClose} visible={visible}>
      <View style={{ backgroundColor: colors.cream, flex: 1, paddingTop: insets.top }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 18, paddingVertical: 14 }}>
          <Pressable
            accessibilityLabel={t("bible.plans.create.cancel")}
            accessibilityRole="button"
            onPress={onClose}
            style={{ alignItems: "center", height: 42, justifyContent: "center", width: 42 }}
          >
            <Feather color={colors.ink} name="x" size={21} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.heading, { color: colors.ink, fontSize: 20, lineHeight: 26 }]}>
              {t("bible.plans.passage.title")}
            </Text>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {book ? displayBibleBookName(book.name, bookLanguage) : t("bible.plans.passage.chooseBook")}
            </Text>
          </View>
          {book ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setBookName("")}
              style={{ borderColor: shadcn.border, borderRadius: radius.md, borderWidth: 1, minHeight: 38, paddingHorizontal: 12, justifyContent: "center" }}
            >
              <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.passage.changeBook")}</Text>
            </Pressable>
          ) : null}
        </View>

        {book ? (
          <ScrollView contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(insets.bottom, 18) + 24 }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.title, { color: colors.ink }]}>
                  {displayBibleBookName(book.name, bookLanguage)}
                </Text>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {t("bible.plans.passage.chaptersHint")}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={chooseWholeBook}
                style={{ borderColor: shadcn.border, borderRadius: radius.md, borderWidth: 1, minHeight: 38, paddingHorizontal: 12, justifyContent: "center" }}
              >
                <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.passage.wholeBook")}</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {book.chapters.map((chapter) => {
                const selected = startChapter !== undefined && endChapter !== undefined && chapter >= startChapter && chapter <= endChapter;
                const edge = chapter === startChapter || chapter === endChapter;
                const anchor = chapter === anchorChapter && !complete;
                return (
                  <Pressable
                    accessibilityLabel={`${chapter}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={chapter}
                    onPress={() => chooseChapter(chapter)}
                    style={{
                      alignItems: "center",
                      backgroundColor: selected ? shadcn.primary : shadcn.card,
                      borderColor: anchor ? shadcn.brand : selected ? shadcn.primary : shadcn.border,
                      borderRadius: radius.md,
                      borderWidth: anchor ? 2 : 1,
                      height: 46,
                      justifyContent: "center",
                      width: 46,
                    }}
                  >
                    <Text style={[typography.label, { color: selected ? shadcn.primaryForeground : colors.ink }]}>
                      {chapter}
                    </Text>
                    {edge && selected ? (
                      <View style={{ backgroundColor: shadcn.brand, borderRadius: 999, bottom: 4, height: 3, position: "absolute", width: 12 }} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                backgroundColor: shadcn.card,
                borderColor: shadcn.border,
                borderRadius: radius.lg,
                borderWidth: 1,
                gap: 4,
                padding: 14,
              }}
            >
              <Text style={[typography.caption, { color: colors.muted }]}>{t("bible.plans.passage.selected")}</Text>
              <Text style={[typography.cardTitle, { color: colors.ink }]}>
                {selection ? displayBibleReference(selection.displayReference, bookLanguage) : t("bible.plans.passage.none")}
              </Text>
              {startChapter !== undefined && endChapter !== undefined ? (
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {t("bible.plans.passage.chapterRange", { from: startChapter, to: endChapter })}
                </Text>
              ) : null}
            </View>

            <PrimaryButton disabled={!selection} icon="check" onPress={finish}>
              {t("bible.plans.passage.done")}
            </PrimaryButton>
          </ScrollView>
        ) : (
          <View style={{ flex: 1, gap: 12, paddingHorizontal: 18 }}>
            <TextInputField
              accessibilityLabel={t("bible.plans.passage.searchBook")}
              onChangeText={setQuery}
              placeholder={t("bible.plans.passage.searchBook")}
              value={query}
            />
            <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: Math.max(insets.bottom, 18) + 24 }} keyboardShouldPersistTaps="handled">
              {oldTestament.length ? (
                <BookSection
                  books={oldTestament}
                  label={t("bible.plans.passage.oldTestament")}
                  onSelect={chooseBook}
                  bookLanguage={bookLanguage}
                />
              ) : null}
              {newTestament.length ? (
                <BookSection
                  books={newTestament}
                  label={t("bible.plans.passage.newTestament")}
                  onSelect={chooseBook}
                  bookLanguage={bookLanguage}
                />
              ) : null}
              {!filteredBooks.length ? (
                <Text style={[typography.body, { color: colors.muted }]}>{t("bible.plans.passage.noBooks")}</Text>
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>
    </FullScreenModal>
  );
}

function BookSection({
  bookLanguage,
  books,
  label,
  onSelect,
}: {
  bookLanguage: AppLanguage;
  books: typeof kjvBooks;
  label: string;
  onSelect: (name: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[typography.sectionLabel, { color: colors.muted }]}>{label}</Text>
      <View style={{ backgroundColor: shadcn.card, borderColor: shadcn.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" }}>
        {books.map((book, index) => (
          <Pressable
            accessibilityLabel={displayBibleBookName(book.name, bookLanguage)}
            accessibilityRole="button"
            key={book.name}
            onPress={() => onSelect(book.name)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: pressed ? shadcn.secondary : "transparent",
              borderTopColor: shadcn.border,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: "row",
              gap: 12,
              minHeight: 48,
              paddingHorizontal: 14,
            })}
          >
            <Text style={[typography.body, { color: colors.ink, flex: 1 }]}>
              {displayBibleBookName(book.name, bookLanguage)}
            </Text>
            <Text style={[typography.caption, { color: colors.muted }]}>{book.chapters.length}</Text>
            <Feather color={colors.disabledText} name="chevron-right" size={16} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
