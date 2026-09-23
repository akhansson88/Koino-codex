import { type ReactNode } from "react";
import { View } from "react-native";
import { type ReaderPalette } from "@/features/bible-reader/types";

export const bibleSheetHorizontalPadding = 20;

export const bibleSheetTopPadding = 10;

export const bibleSheetHandleHeight = 28;

export const bibleSheetHeaderBottomPadding = 14;

export const bibleSheetHeaderMinHeight = 42;

export const bibleVersionListTopPadding = 18;

export const bibleVersionRowGap = 10;

export const bibleVersionRowMinHeight = 68;

export function BibleSheetTop({ bordered = false, children, palette }: { bordered?: boolean; children?: ReactNode; palette: ReaderPalette }) {
  if (!children) return null;
  return <View style={{ borderBottomColor: palette.line, borderBottomWidth: bordered ? 1 : 0, paddingHorizontal: bibleSheetHorizontalPadding, paddingBottom: bibleSheetHeaderBottomPadding }}>{children}</View>;
}
