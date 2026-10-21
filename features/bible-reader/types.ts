import type { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { View } from "react-native";
import type { BibleHistory } from "@/features/bible-history";
import type { BibleFootnote, BiblePosition, BibleVersionId } from "@/features/bible-kjv";
import type { BibleVerse } from "@/state/types";
import type { TranslationKey } from "@/ui/localization";
import type { ThemeName } from "@/ui/theme";
import type { readerFonts, readerThemes } from "@/features/bible-reader/preferences";

export type FeatherName = ComponentProps<typeof Feather>["name"];

export type BibleReaderFontId = (typeof readerFonts)[number]["id"];

export type BibleReaderThemeId = (typeof readerThemes)[number]["id"];

export type PickerStage = "home" | "myPlaces" | "search" | "book" | "chapter" | "saved" | "highlights" | "reflections";

export type TestamentFilter = "all" | "old" | "new";

export type VerseQuickAction = "highlight" | "journal" | "pray" | "save" | "share";

export type BibleReaderPreferences = {
  appTheme?: ThemeName;
  bibleVersionId: BibleVersionId;
  fontId: BibleReaderFontId;
  fontSize: number;
  position: BiblePosition;
  history: BibleHistory;
  readerTheme: BibleReaderThemeId;
  showVerseNumbers: boolean;
  flowingParagraphText: boolean;
};

export type BibleReaderThemePreference = Pick<BibleReaderPreferences, "appTheme" | "readerTheme">;

export type BibleTopicResult = {
  count: number;
  references: BibleTopicReference[];
  source: "openbible" | "text-search";
  sourceUrl: string;
  topic: string;
};

export type BibleTopicReference = {
  reference: string;
  votes: number;
  voteId?: string;
};

export type BibleTopicIndexItem = {
  letter: string;
  name: string;
  passageCount: number;
  slug: string;
  verseCount: number;
};

export type BibleTopicVoteValue = -1 | 1;

export type SuggestedTopic = {
  apiTopic: string;
  icon: FeatherName;
  subtitleKey: TranslationKey;
  titleKey: TranslationKey;
  tone: "peach" | "green" | "rose" | "blue";
};

export type ReaderToast = {
  detail?: string;
  message: string;
  tone: "success" | "error";
};

export type PendingVerseComposerAction = {
  action: "journal" | "pray" | "share";
  verse: BibleVerse;
};

export type ChapterSwipeDirection = "idle" | "previous" | "next";

export type SelectedBibleFootnote = {
  footnote: BibleFootnote;
  marker: string;
  position: BiblePosition;
};

export type SelectedVerseRange = {
  end: number;
  start: number;
};

// Paragraph verses share a native text node; expose their own line bounds while
// retaining a real native view for accessibility focus restoration.
export type MeasurableView = View | {
  measureInWindow: View["measureInWindow"];
  focusTarget: View | null;
};

export type ReaderPalette = {
  accent: string;
  background: string;
  buttonText: string;
  danger: string;
  dim: string;
  input: string;
  line: string;
  muted: string;
  peach: string;
  shadow: string;
  sheet: string;
  surface: string;
  text: string;
};
