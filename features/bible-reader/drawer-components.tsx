import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { SheetTextInput } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { kjvBooks } from "@/features/bible-kjv";
import { displayBibleBookName } from "@/features/bible-search";
import type { BibleHighlightColor } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import type { AppLanguage, TranslationFunction } from "@/ui/localization";
import { colors, radius } from "@/ui/theme";
import { type ReaderPalette, type FeatherName } from "@/features/bible-reader/types";

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

export function DrawerSearchBox({
  onChangeText,
  onSubmit,
  palette,
  placeholder,
  value,
}: {
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  palette: ReaderPalette;
  placeholder: string;
  value: string;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.input,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        minHeight: 50,
        paddingHorizontal: 14,
      }}
    >
      <Feather name="search" size={18} color={palette.muted} />
      <SheetTextInput
        autoCapitalize="sentences"
        autoCorrect={false}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        returnKeyType="search"
        style={{ color: palette.text, flex: 1, fontSize: 15, fontWeight: "700", minHeight: 48 }}
        value={value}
      />
    </View>
  );
}

export function DrawerSection({ children, palette, title }: { children: ReactNode; palette: ReaderPalette; title: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" }}>{title}</Text>
      <View
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function DrawerRow({
  disabled,
  icon,
  onPress,
  palette,
  subtitle,
  title,
}: {
  disabled?: boolean;
  icon: FeatherName;
  onPress: () => void;
  palette: ReaderPalette;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: palette.line,
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 64,
        opacity: disabled ? 0.5 : 1,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.peach,
          borderColor: palette.line,
          borderRadius: 999,
          borderWidth: 1,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Feather name={icon} size={17} color={palette.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>{title}</Text>
        <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 12, fontWeight: "700", lineHeight: 16 }}>
          {subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.muted} />
    </Pressable>
  );
}

export function DrawerBookRow({
  book,
  language,
  onPress,
  palette,
  selected,
  t,
}: {
  book: (typeof kjvBooks)[number];
  language: AppLanguage;
  onPress: () => void;
  palette: ReaderPalette;
  selected: boolean;
  t: TranslationFunction;
}) {
  const bookLanguage = useBibleBookLanguage();
  const chapterCount = book.chapters.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? palette.peach : palette.surface,
        borderColor: selected ? palette.accent : palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 56,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: palette.text, fontSize: 16, fontWeight: "900", lineHeight: 21 }}>
          {displayBibleBookName(book.name, bookLanguage)}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
          {chapterCount === 1
            ? t("bible.navigator.chapter.single")
            : t("bible.navigator.chapter.count", { count: chapterCount })}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.muted} />
    </Pressable>
  );
}

export function DrawerVerseRow({
  action,
  accentColor,
  footer,
  fullText = false,
  meta,
  onPress,
  palette,
  reference,
  showArrow = true,
  text,
}: {
  action?: ReactNode;
  accentColor?: BibleHighlightColor;
  footer?: ReactNode;
  fullText?: boolean;
  meta?: string;
  onPress: () => void;
  palette: ReaderPalette;
  reference: string;
  showArrow?: boolean;
  text?: string;
}) {
  const { t } = useAppTranslation();
  const card = (
    <Pressable
      accessibilityLabel={fullText && text ? `${reference}. ${text}` : t("bible.navigator.openPassage", { reference })}
      accessibilityHint={fullText ? t("bible.navigator.openPassage", { reference }) : undefined}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderBottomLeftRadius: footer ? 0 : radius.lg,
        borderBottomRightRadius: footer ? 0 : radius.lg,
        borderBottomWidth: footer ? 0 : 1,
        gap: 6,
        minHeight: 74,
        padding: 14,
        paddingRight: action && !fullText ? 66 : 14,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: action && fullText ? 40 : undefined, paddingRight: action && fullText ? 52 : undefined }}>
        <Text numberOfLines={fullText ? undefined : 1} style={{ color: palette.text, flex: 1, fontSize: 15, fontWeight: "900" }}>
          {reference}
        </Text>
        {accentColor ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{
              backgroundColor: accentColor,
              borderColor: palette.line,
              borderRadius: 999,
              borderWidth: 1,
              height: 16,
              opacity: 0.72,
              width: 16,
            }}
          />
        ) : null}
        {showArrow ? <Feather name="arrow-right" size={16} color={palette.accent} /> : null}
      </View>
      {text ? (
        <Text numberOfLines={fullText ? undefined : 2} style={{ color: palette.muted, fontSize: 13, fontWeight: "600", lineHeight: 18 }}>
          {text}
        </Text>
      ) : null}
      {meta ? (
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "800" }}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );

  if (!action && !footer) return card;

  return (
    <View style={{ position: "relative" }}>
      {card}
      {footer ? (
        <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 }}>
          {footer}
        </View>
      ) : null}
      {action ? <View style={{ position: "absolute", right: 10, top: 10, zIndex: 1 }}>{action}</View> : null}
    </View>
  );
}

export function DrawerEmptyState({ palette, text }: { palette: ReaderPalette; text: string }) {
  return (
    <View style={{ backgroundColor: palette.input, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 14 }}>
      <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

export function PickerGrid({
  palette,
  onSelect,
  selected,
  values,
}: {
  palette: ReaderPalette;
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
              backgroundColor: isSelected ? palette.peach : palette.surface,
              borderColor: isSelected ? palette.accent : palette.line,
              borderRadius: radius.md,
              borderWidth: 1,
              height: 46,
              justifyContent: "center",
              width: 54,
            }}
          >
            <Text style={{ color: isSelected ? palette.accent : palette.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900" }}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
