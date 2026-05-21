import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  bibleChapterVerses,
  BiblePosition,
  kjvBooks,
  nextBibleChapter,
  normalizeBiblePosition,
  previousBibleChapter,
  versesForChapter,
} from "@/features/bible-kjv";
import { useKoino } from "@/state/koino-store";
import { BodyText, Card, IconButton, SecondaryButton, SectionHeading, TextInputField } from "@/ui/app-components";
import { colors, platformShadow, radius } from "@/ui/theme";

const readerFonts = [
  { id: "serif", label: "Serif" },
  { id: "classic", label: "Classic" },
  { id: "humanist", label: "Humanist" },
  { id: "system", label: "System" },
  { id: "mono", label: "Mono" },
] as const;

type BibleReaderFontId = (typeof readerFonts)[number]["id"];
type PickerStage = "book" | "chapter" | "verse";

type BibleReaderPreferences = {
  fontId: BibleReaderFontId;
  fontSize: number;
  position: BiblePosition;
};

const defaultPosition = normalizeBiblePosition();
const defaultFontId: BibleReaderFontId = "serif";
const defaultFontSize = 18;
const minFontSize = 16;
const maxFontSize = 28;
const fontSizeStep = 2;

function readerStorageKey(userId?: string) {
  return userId ? `koino.bibleReader.${userId}` : undefined;
}

function isReaderFontId(value: unknown): value is BibleReaderFontId {
  return typeof value === "string" && readerFonts.some((font) => font.id === value);
}

function normalizeFontSize(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : defaultFontSize;
  const clamped = Math.min(maxFontSize, Math.max(minFontSize, numericValue));
  return minFontSize + Math.round((clamped - minFontSize) / fontSizeStep) * fontSizeStep;
}

function parsePreferences(value: string | null): BibleReaderPreferences {
  if (!value) {
    return {
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<BibleReaderPreferences> | null;
    return {
      fontId: isReaderFontId(parsed?.fontId) ? parsed.fontId : defaultFontId,
      fontSize: normalizeFontSize(parsed?.fontSize),
      position: normalizeBiblePosition(parsed?.position),
    };
  } catch {
    return {
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
    };
  }
}

function fontFamilyFor(fontId: BibleReaderFontId) {
  if (fontId === "system") return undefined;
  if (fontId === "mono") {
    if (Platform.OS === "ios") return "Menlo";
    if (Platform.OS === "android") return "monospace";
    return "Menlo, Consolas, monospace";
  }
  if (fontId === "humanist") {
    if (Platform.OS === "ios") return "Avenir Next";
    if (Platform.OS === "android") return "sans-serif-light";
    return "Avenir Next, Segoe UI, sans-serif";
  }
  if (fontId === "classic") {
    if (Platform.OS === "ios") return "Palatino";
    if (Platform.OS === "android") return "serif";
    return "Palatino Linotype, Palatino, Georgia, serif";
  }
  if (Platform.OS === "ios") return "Georgia";
  if (Platform.OS === "android") return "serif";
  return "Georgia, serif";
}

function referenceLabel(position: BiblePosition) {
  return `${position.book} ${position.chapter}:${position.verse}`;
}

export function BibleScreen() {
  const { state } = useKoino();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const pendingScrollVerseRef = useRef<number | undefined>(undefined);
  const positionRef = useRef<BiblePosition>(defaultPosition);
  const lastScrollCommitRef = useRef(0);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [position, setPosition] = useState<BiblePosition>(defaultPosition);
  const [highlightedPosition, setHighlightedPosition] = useState<BiblePosition | undefined>();
  const [fontId, setFontId] = useState<BibleReaderFontId>(defaultFontId);
  const [fontSize, setFontSize] = useState(defaultFontSize);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const storageKey = useMemo(() => readerStorageKey(state.currentUserId), [state.currentUserId]);
  const chapterVerses = useMemo(() => bibleChapterVerses(position.book, position.chapter), [position.book, position.chapter]);
  const previousChapter = useMemo(() => previousBibleChapter(position.book, position.chapter), [position.book, position.chapter]);
  const nextChapter = useMemo(() => nextBibleChapter(position.book, position.chapter), [position.book, position.chapter]);
  const readerFontFamily = fontFamilyFor(fontId);
  const readerLineHeight = Math.round(fontSize * 1.62);
  const contentWidth = width >= 780 ? 720 : undefined;

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const showTemporaryHighlight = useCallback((nextPosition: BiblePosition) => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedPosition(nextPosition);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedPosition(undefined);
      highlightTimeoutRef.current = undefined;
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!storageKey) {
      setPreferencesReady(true);
      return () => {
        active = false;
      };
    }

    setPreferencesReady(false);
    void AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (!active) return;
        const nextPreferences = parsePreferences(value);
        verseOffsetsRef.current = {};
        pendingScrollVerseRef.current = nextPreferences.position.verse;
        positionRef.current = nextPreferences.position;
        setPosition(nextPreferences.position);
        showTemporaryHighlight(nextPreferences.position);
        setFontId(nextPreferences.fontId);
        setFontSize(nextPreferences.fontSize);
      })
      .finally(() => {
        if (active) setPreferencesReady(true);
      });

    return () => {
      active = false;
    };
  }, [showTemporaryHighlight, storageKey]);

  useEffect(() => {
    if (!storageKey || !preferencesReady) return;

    const timeout = setTimeout(() => {
      const payload: BibleReaderPreferences = { fontId, fontSize, position };
      void AsyncStorage.setItem(storageKey, JSON.stringify(payload));
    }, 250);

    return () => clearTimeout(timeout);
  }, [fontId, fontSize, position, preferencesReady, storageKey]);

  const tryScrollToVerse = useCallback((verse: number, animated: boolean) => {
    const offset = verseOffsetsRef.current[verse];
    if (typeof offset !== "number") return false;
    pendingScrollVerseRef.current = undefined;
    scrollRef.current?.scrollTo({ animated, y: Math.max(0, offset - 18) });
    return true;
  }, []);

  const jumpToPosition = useCallback(
    (nextPosition: Partial<BiblePosition>, shouldScroll = true, shouldHighlight = true) => {
      const normalized = normalizeBiblePosition(nextPosition);
      const current = positionRef.current;
      const sameChapter = current.book === normalized.book && current.chapter === normalized.chapter;

      if (!sameChapter) {
        verseOffsetsRef.current = {};
      }

      if (shouldScroll) {
        pendingScrollVerseRef.current = normalized.verse;
        if (sameChapter) {
          requestAnimationFrame(() => tryScrollToVerse(normalized.verse, true));
        }
      }

      positionRef.current = normalized;
      setPosition(normalized);
      if (shouldHighlight) {
        showTemporaryHighlight(normalized);
      }
    },
    [showTemporaryHighlight, tryScrollToVerse],
  );

  const handleVerseLayout = useCallback(
    (verse: number, offset: number) => {
      verseOffsetsRef.current[verse] = offset;
      if (pendingScrollVerseRef.current === verse) {
        requestAnimationFrame(() => tryScrollToVerse(verse, true));
      }
    },
    [tryScrollToVerse],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pendingScrollVerseRef.current) return;
      const now = Date.now();
      if (now - lastScrollCommitRef.current < 140) return;

      const topOffset = event.nativeEvent.contentOffset.y + 24;
      let visibleVerse = chapterVerses[0]?.verse;

      for (const item of chapterVerses) {
        const offset = verseOffsetsRef.current[item.verse];
        if (typeof offset !== "number") continue;
        if (offset <= topOffset) {
          visibleVerse = item.verse;
          continue;
        }
        break;
      }

      const current = positionRef.current;
      if (!visibleVerse || visibleVerse === current.verse) return;

      lastScrollCommitRef.current = now;
      const nextPosition = { ...current, verse: visibleVerse };
      positionRef.current = nextPosition;
      setPosition(nextPosition);
    },
    [chapterVerses],
  );

  function changeFontSize(delta: number) {
    setFontSize((current) => normalizeFontSize(current + delta));
  }

  const readerTextStyle: TextStyle = {
    color: colors.ink,
    fontFamily: readerFontFamily,
    fontSize,
    fontWeight: "400",
    lineHeight: readerLineHeight,
  };

  return (
    <View style={{ backgroundColor: colors.cream, flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignSelf: "stretch",
          gap: 16,
          padding: 18,
          paddingBottom: Math.max(112, insets.bottom + 92),
        }}
      >
        <View style={{ alignSelf: "center", gap: 16, maxWidth: contentWidth, width: "100%" }}>
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.ink, fontSize: 30, fontWeight: "900", lineHeight: 36 }}>Bible</Text>
            <BodyText muted selectable>
              {referenceLabel(position)} - KJV
            </BodyText>
          </View>

          <Card style={{ gap: 16, padding: 16 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" }}>Current place</Text>
                <Text selectable style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>
                  {referenceLabel(position)}
                </Text>
              </View>
              <SecondaryButton icon="search" onPress={() => setPickerVisible(true)} style={{ minHeight: 44, paddingHorizontal: 14 }}>
                Choose
              </SecondaryButton>
            </View>

            <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
              <ChapterButton disabled={!previousChapter} icon="chevron-left" label="Previous" onPress={() => previousChapter && jumpToPosition(previousChapter)} />
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.input,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  flex: 1,
                  minHeight: 46,
                  justifyContent: "center",
                  paddingHorizontal: 10,
                }}
              >
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                  {position.book} {position.chapter}
                </Text>
              </View>
              <ChapterButton disabled={!nextChapter} icon="chevron-right" label="Next" onPress={() => nextChapter && jumpToPosition(nextChapter)} />
            </View>
          </Card>

          <Card style={{ gap: 14, padding: 16 }}>
            <SectionHeading>Reading style</SectionHeading>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {readerFonts.map((font) => {
                const selected = font.id === fontId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={font.id}
                    onPress={() => setFontId(font.id)}
                    style={{
                      alignItems: "center",
                      backgroundColor: selected ? colors.accentSubtle : colors.paper,
                      borderColor: selected ? colors.gold : colors.line,
                      borderRadius: 999,
                      borderWidth: 1,
                      justifyContent: "center",
                      minHeight: 40,
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.olive : colors.muted,
                        fontFamily: fontFamilyFor(font.id),
                        fontSize: 14,
                        fontWeight: "900",
                      }}
                    >
                      {font.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, flex: 1, fontSize: 15, fontWeight: "900" }}>Font size</Text>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.input,
                  borderColor: colors.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: 10,
                  padding: 5,
                }}
              >
                <StepperButton disabled={fontSize <= minFontSize} icon="minus" label="Decrease font size" onPress={() => changeFontSize(-fontSizeStep)} />
                <Text style={{ color: colors.ink, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900", minWidth: 28, textAlign: "center" }}>
                  {fontSize}
                </Text>
                <StepperButton disabled={fontSize >= maxFontSize} icon="plus" label="Increase font size" onPress={() => changeFontSize(fontSizeStep)} />
              </View>
            </View>
          </Card>

          <View
            style={{
              backgroundColor: colors.paper,
              borderColor: colors.line,
              borderRadius: radius.xl,
              borderWidth: 1,
              gap: 14,
              padding: 18,
              ...platformShadow({
                boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
                offset: { width: 0, height: 10 },
                opacity: 0.055,
                radius: 24,
              }),
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>{position.book}</Text>
              <Text style={{ color: colors.gold, fontSize: 22, fontWeight: "900" }}>{position.chapter}</Text>
            </View>

            <View style={{ gap: 2 }}>
              {chapterVerses.map((item) => {
                const highlighted =
                  highlightedPosition?.book === position.book &&
                  highlightedPosition.chapter === position.chapter &&
                  highlightedPosition.verse === item.verse;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: highlighted }}
                    key={item.reference}
                    onLayout={(event) => handleVerseLayout(item.verse, event.nativeEvent.layout.y)}
                    onPress={() => jumpToPosition({ ...position, verse: item.verse }, false)}
                    style={{
                      backgroundColor: highlighted ? colors.accentSubtle : "transparent",
                      borderRadius: radius.md,
                      flexDirection: "row",
                      gap: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 7,
                    }}
                  >
                    <Text
                      style={{
                        color: highlighted ? colors.olive : colors.muted,
                        fontSize: Math.max(12, fontSize - 5),
                        fontVariant: ["tabular-nums"],
                        fontWeight: "900",
                        lineHeight: readerLineHeight,
                        textAlign: "right",
                        width: 30,
                      }}
                    >
                      {item.verse}
                    </Text>
                    <Text selectable style={[readerTextStyle, { flex: 1 }]}>
                      {item.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <BibleReferencePicker
        initialPosition={position}
        onClose={() => setPickerVisible(false)}
        onSelect={(nextPosition) => {
          setPickerVisible(false);
          jumpToPosition(nextPosition);
        }}
        visible={pickerVisible}
      />
    </View>
  );
}

function ChapterButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: "chevron-left" | "chevron-right";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} chapter`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.disabled : colors.paper,
        borderColor: disabled ? colors.disabled : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 5,
        justifyContent: "center",
        minHeight: 46,
        opacity: disabled ? 0.7 : 1,
        paddingHorizontal: 11,
      }}
    >
      {icon === "chevron-left" ? <Feather name={icon} size={17} color={disabled ? colors.disabledText : colors.olive} /> : null}
      <Text style={{ color: disabled ? colors.disabledText : colors.olive, fontSize: 13, fontWeight: "900" }}>{label}</Text>
      {icon === "chevron-right" ? <Feather name={icon} size={17} color={disabled ? colors.disabledText : colors.olive} /> : null}
    </Pressable>
  );
}

function StepperButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: "minus" | "plus";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.disabled : colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 34,
        justifyContent: "center",
        width: 34,
      }}
    >
      <Feather name={icon} size={16} color={disabled ? colors.disabledText : colors.olive} />
    </Pressable>
  );
}

function BibleReferencePicker({
  initialPosition,
  onClose,
  onSelect,
  visible,
}: {
  initialPosition: BiblePosition;
  onClose: () => void;
  onSelect: (position: BiblePosition) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<PickerStage>("book");
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState(initialPosition.book);
  const [selectedChapter, setSelectedChapter] = useState(initialPosition.chapter);

  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeBiblePosition(initialPosition);
    setStage("book");
    setBookQuery("");
    setSelectedBook(normalized.book);
    setSelectedChapter(normalized.chapter);
  }, [initialPosition, visible]);

  const book = kjvBooks.find((item) => item.name === selectedBook) ?? kjvBooks[0];
  const selectableBooks = kjvBooks.filter((item) => item.name.toLowerCase().includes(bookQuery.trim().toLowerCase()));
  const selectableVerses = versesForChapter(selectedBook, selectedChapter);
  const title = stage === "book" ? "Choose book" : stage === "chapter" ? selectedBook : `${selectedBook} ${selectedChapter}`;

  function goBack() {
    if (stage === "verse") {
      setStage("chapter");
      return;
    }
    if (stage === "chapter") {
      setStage("book");
      return;
    }
    onClose();
  }

  function chooseBook(bookName: string) {
    const nextBook = kjvBooks.find((item) => item.name === bookName);
    const nextChapter = nextBook?.chapters[0] ?? 1;
    setSelectedBook(bookName);
    setSelectedChapter(nextChapter);
    setStage("chapter");
  }

  function chooseChapter(chapter: number) {
    setSelectedChapter(chapter);
    setStage("verse");
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={goBack}>
      <View style={{ backgroundColor: colors.cream, flex: 1 }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(28, insets.bottom + 18), paddingTop: insets.top + 18 }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <IconButton accessibilityLabel={stage === "book" ? "Close reference picker" : "Back"} icon={stage === "book" ? "x" : "arrow-left"} onPress={goBack} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>{title}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>KJV</Text>
            </View>
          </View>

          {stage === "book" ? (
            <>
              <TextInputField autoCapitalize="words" autoCorrect={false} onChangeText={setBookQuery} placeholder="Search books" value={bookQuery} />
              <View style={{ gap: 8 }}>
                {selectableBooks.length > 0 ? (
                  selectableBooks.map((item) => (
                    <Pressable
                      accessibilityRole="button"
                      key={item.name}
                      onPress={() => chooseBook(item.name)}
                      style={{
                        alignItems: "center",
                        backgroundColor: item.name === selectedBook ? colors.accentSubtle : colors.paper,
                        borderColor: item.name === selectedBook ? colors.gold : colors.line,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        flexDirection: "row",
                        gap: 12,
                        minHeight: 54,
                        paddingHorizontal: 14,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{item.name}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                          {item.chapters.length} {item.chapters.length === 1 ? "chapter" : "chapters"}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.muted} />
                    </Pressable>
                  ))
                ) : (
                  <Card>
                    <BodyText muted>No books match that search.</BodyText>
                  </Card>
                )}
              </View>
            </>
          ) : null}

          {stage === "chapter" ? (
            <View style={{ gap: 10 }}>
              <SectionHeading muted>Chapter</SectionHeading>
              <PickerGrid
                selected={selectedChapter}
                values={book?.chapters ?? []}
                onSelect={chooseChapter}
              />
            </View>
          ) : null}

          {stage === "verse" ? (
            <View style={{ gap: 10 }}>
              <SectionHeading muted>Verse</SectionHeading>
              <PickerGrid
                selected={initialPosition.book === selectedBook && initialPosition.chapter === selectedChapter ? initialPosition.verse : undefined}
                values={selectableVerses}
                onSelect={(verse) => onSelect(normalizeBiblePosition({ book: selectedBook, chapter: selectedChapter, verse }))}
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PickerGrid({
  onSelect,
  selected,
  values,
}: {
  onSelect: (value: number) => void;
  selected?: number;
  values: number[];
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
              borderRadius: radius.md,
              borderWidth: 1,
              height: 46,
              justifyContent: "center",
              width: 54,
            }}
          >
            <Text style={{ color: isSelected ? colors.olive : colors.ink, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900" }}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
