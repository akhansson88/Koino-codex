import { Feather } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { ReaderPalette } from "@/features/bible-reader/types";
import type { BookmarkCollection, BookmarkCollectionColor, SavedVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, getColorScheme, radius, shadows, shadcn, typography } from "@/ui/theme";

const lightCollectionColors: Record<BookmarkCollectionColor, string> = {
  ember: "#A64B21",
  clay: "#6A5A4C",
  moss: "#47624A",
  rose: "#8C3A56",
  gold: "#B07A2A",
  violet: "#4B4879",
};

const darkCollectionColors: Record<BookmarkCollectionColor, string> = {
  ember: "#E8A45C",
  clay: "#C8B49F",
  moss: "#A9C3A9",
  rose: "#E7A8BD",
  gold: "#E8C07A",
  violet: "#B9B3E8",
};

export function bookmarkColor(color: BookmarkCollectionColor | undefined) {
  if (!color) return colors.line;
  return (getColorScheme() === "dark" ? darkCollectionColors : lightCollectionColors)[color];
}

export function bookmarkPalette(): ReaderPalette {
  return {
    accent: colors.gold,
    background: colors.background,
    buttonText: colors.onAccent,
    danger: colors.danger,
    dim: colors.muted,
    input: shadcn.input,
    line: colors.line,
    muted: colors.muted,
    peach: colors.accentSubtle,
    shadow: "#1D1611",
    sheet: colors.paper,
    surface: colors.surface,
    text: colors.ink,
  };
}

export function BookmarkGlyph({ color, size = 18 }: { color?: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        backgroundColor: color ?? colors.gold,
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
        height: size,
        width: Math.max(9, Math.round(size * 0.56)),
      }}
    >
      <View
        style={{
          borderLeftColor: "transparent",
          borderLeftWidth: Math.max(4, Math.round(size * 0.28)),
          borderRightColor: "transparent",
          borderRightWidth: Math.max(4, Math.round(size * 0.28)),
          borderTopColor: colors.paper,
          borderTopWidth: Math.max(4, Math.round(size * 0.24)),
          bottom: 0,
          left: 0,
          position: "absolute",
          right: 0,
        }}
      />
    </View>
  );
}

export function BookmarkChip({
  count,
  label,
  onPress,
  selected,
  tone,
}: {
  count?: number;
  label: string;
  onPress: () => void;
  selected: boolean;
  tone?: BookmarkCollectionColor;
}) {
  return (
    <Pressable
      accessibilityLabel={typeof count === "number" ? `${label}, ${count}` : label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: selected ? colors.ink : pressed ? shadcn.secondary : shadcn.card,
        borderColor: selected ? colors.ink : colors.line,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
        ...(selected ? {} : shadows.control),
      })}
    >
      {tone ? <View style={{ backgroundColor: bookmarkColor(tone), borderRadius: 999, height: 7, width: 7 }} /> : null}
      <Text
        numberOfLines={1}
        style={[typography.label, { color: selected ? shadcn.primaryForeground : colors.ink, fontWeight: "700" }]}
      >
        {label}
      </Text>
      {typeof count === "number" ? (
        <Text style={[typography.label, { color: selected ? "rgba(255,253,249,0.72)" : colors.muted, fontSize: 12 }]}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function BookmarkRow({
  collection,
  onLongPress,
  onMore,
  onPress,
  reference,
  selected,
  selectionMode,
  verse,
}: {
  collection?: BookmarkCollection;
  onLongPress: () => void;
  onMore: () => void;
  onPress: () => void;
  reference: string;
  selected: boolean;
  selectionMode: boolean;
  verse: SavedVerse;
}) {
  const { t } = useAppTranslation();
  const color = collection ? bookmarkColor(collection.color) : colors.line;
  return (
    <Pressable
      accessibilityHint={selectionMode ? undefined : t("bookmarks.rowHint")}
      accessibilityLabel={`${reference}. ${verse.text.slice(0, 100)}${verse.note ? `. ${t("bookmarks.hasNote")}` : ""}${collection ? `. ${collection.name}` : ""}`}
      accessibilityRole="button"
      accessibilityState={{ selected: selectionMode ? selected : undefined }}
      delayLongPress={280}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: selected ? colors.accentSubtle : pressed ? shadcn.secondary : shadcn.card,
        borderColor: colors.line,
        borderCurve: "continuous",
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        minHeight: 82,
        overflow: "hidden",
        ...(selected ? {} : shadows.control),
      })}
    >
      <View style={{ backgroundColor: color, width: 3 }} />
      <View style={{ flex: 1, gap: 5, paddingHorizontal: 13, paddingVertical: 12 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          {selectionMode ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: selected ? colors.ink : "transparent",
                borderColor: selected ? colors.ink : colors.line,
                borderRadius: 999,
                borderWidth: 1.5,
                height: 22,
                justifyContent: "center",
                width: 22,
              }}
            >
              {selected ? <Feather name="check" size={13} color={shadcn.primaryForeground} /> : null}
            </View>
          ) : (
            <BookmarkGlyph color={collection ? color : colors.gold} size={17} />
          )}
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, flex: 1, fontWeight: "700" }]}>
            {reference}
          </Text>
        </View>
        <Text numberOfLines={2} style={[typography.subtitle, { color: colors.ink, lineHeight: 21 }]}>
          {verse.text}
        </Text>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 18 }}>
          {collection ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
              <View style={{ backgroundColor: color, borderRadius: 999, height: 6, width: 6 }} />
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, fontSize: 12 }]}>
                {collection.name}
              </Text>
            </View>
          ) : null}
          {verse.note ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Feather name="edit-3" size={12} color={colors.muted} />
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, flexShrink: 1, fontSize: 12 }]}>
                {verse.note}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {!selectionMode ? (
        <Pressable
          accessibilityLabel={t("bookmarks.moreFor", { reference })}
          accessibilityRole="button"
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation();
            onMore();
          }}
          style={{
            alignItems: "center",
            alignSelf: "center",
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          <Feather name="more-horizontal" size={19} color={colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function BookmarkEmpty({ onOpenBible }: { onOpenBible: () => void }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 44 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.accentSubtle,
          borderColor: colors.line,
          borderRadius: 28,
          borderWidth: 1,
          height: 112,
          justifyContent: "center",
          width: 112,
        }}
      >
        <View style={{ flexDirection: "row", gap: 7 }}>
          <BookmarkGlyph color={colors.gold} size={34} />
          <BookmarkGlyph color={colors.clay} size={34} />
          <BookmarkGlyph color={colors.rose} size={34} />
        </View>
      </View>
      <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink, textAlign: "center" }]}>
        {t("bookmarks.empty.title")}
      </Text>
      <Text style={[typography.body, { color: colors.muted, textAlign: "center" }]}>
        {t("bookmarks.empty.body")}
      </Text>
      <View style={{ gap: 6, marginTop: 4 }}>
        {[t("bookmarks.empty.example1"), t("bookmarks.empty.example2"), t("bookmarks.empty.example3")].map((example) => (
          <View key={example} style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <View style={{ backgroundColor: colors.gold, borderRadius: 999, height: 5, width: 5 }} />
            <Text style={[typography.caption, { color: colors.muted }]}>{example}</Text>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenBible}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: colors.ink,
          borderColor: colors.ink,
          borderRadius: radius.md,
          borderWidth: 1,
          flexDirection: "row",
          gap: 8,
          marginTop: 8,
          minHeight: 48,
          opacity: pressed ? 0.82 : 1,
          paddingHorizontal: 18,
        })}
      >
        <Feather name="book-open" size={17} color={shadcn.primaryForeground} />
        <Text style={[typography.button, { color: shadcn.primaryForeground }]}>{t("bookmarks.empty.action")}</Text>
      </Pressable>
    </View>
  );
}

export function BookmarkSelectionBar({
  count,
  onCancel,
  onDelete,
  onMove,
}: {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        backgroundColor: colors.ink,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        bottom: 0,
        flexDirection: "row",
        gap: 8,
        left: 0,
        paddingBottom: 18,
        paddingHorizontal: 16,
        paddingTop: 12,
        position: "absolute",
        right: 0,
      }}
    >
      <View style={{ justifyContent: "center", minWidth: 84 }}>
        <Text style={[typography.caption, { color: "rgba(255,253,249,0.7)" }]}>{t("bookmarks.selected")}</Text>
        <Text style={[typography.cardTitle, { color: shadcn.primaryForeground }]}>{count}</Text>
      </View>
      <SelectionAction icon="folder" label={t("bookmarks.move")} onPress={onMove} />
      <SelectionAction icon="trash-2" label={t("bookmarks.delete")} onPress={onDelete} />
      <SelectionAction icon="x" label={t("bookmarks.cancel")} onPress={onCancel} />
    </View>
  );
}

function SelectionAction({ icon, label, onPress }: { icon: "folder" | "trash-2" | "x"; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)",
        borderRadius: radius.md,
        flex: 1,
        gap: 3,
        justifyContent: "center",
        minHeight: 46,
      })}
    >
      <Feather name={icon} size={17} color={shadcn.primaryForeground} />
      <Text style={[typography.label, { color: shadcn.primaryForeground, fontSize: 11 }]}>{label}</Text>
    </Pressable>
  );
}

export function BookmarkCollectionStrip({
  collections,
  counts,
  onSelect,
  selectedId,
  total,
  unsorted,
}: {
  collections: BookmarkCollection[];
  counts: Record<string, number>;
  onSelect: (id: string | null | undefined) => void;
  selectedId: string | null | undefined;
  total: number;
  unsorted: number;
}) {
  const { t } = useAppTranslation();
  return (
    <ScrollView
      contentContainerStyle={{ gap: 8, paddingRight: 12 }}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
    >
      <BookmarkChip count={total} label={t("bookmarks.collection.all")} onPress={() => onSelect(undefined)} selected={selectedId === undefined} />
      {collections.map((collection) => (
        <BookmarkChip
          count={counts[collection.id] ?? 0}
          key={collection.id}
          label={collection.name}
          onPress={() => onSelect(collection.id)}
          selected={selectedId === collection.id}
          tone={collection.color}
        />
      ))}
      {unsorted > 0 ? (
        <BookmarkChip count={unsorted} label={t("bookmarks.collection.unsorted")} onPress={() => onSelect(null)} selected={selectedId === null} />
      ) : null}
    </ScrollView>
  );
}
