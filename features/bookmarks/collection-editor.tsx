import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { BookmarkCollection, BookmarkCollectionColor } from "@/state/types";
import { bookmarkCollectionColors } from "@/state/bookmarks";
import { BottomSheet, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { bookmarkColor } from "@/features/bookmarks/bookmark-ui";

const colourLabelKeys = {
  ember: "bookmarks.colour.ember",
  clay: "bookmarks.colour.clay",
  moss: "bookmarks.colour.moss",
  rose: "bookmarks.colour.rose",
  gold: "bookmarks.colour.gold",
  violet: "bookmarks.colour.violet",
} as const;

export function CollectionEditor({
  collection,
  onClose,
  onDelete,
  onSave,
  visible,
}: {
  collection?: BookmarkCollection;
  onClose: () => void;
  onDelete?: (collection: BookmarkCollection) => void;
  onSave: (name: string, color: BookmarkCollectionColor) => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState<BookmarkCollectionColor>("ember");

  useEffect(() => {
    if (!visible) return;
    setName(collection?.name ?? "");
    setColor(collection?.color ?? "ember");
  }, [collection, visible]);

  const save = () => {
    const next = name.trim().slice(0, 40);
    if (!next) return;
    onSave(next, color);
  };

  return (
    <BottomSheet
      onClose={onClose}
      title={collection ? t("bookmarks.collection.rename") : t("bookmarks.collection.new")}
      visible={visible}
    >
      <View style={{ gap: 18, paddingBottom: 28, paddingHorizontal: 20 }}>
        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.muted }]}>{t("bookmarks.collection.name")}</Text>
          <TextInput
            accessibilityLabel={t("bookmarks.collection.name")}
            autoFocus
            maxLength={40}
            onChangeText={setName}
            placeholder={t("bookmarks.collection.namePlaceholder")}
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            onSubmitEditing={save}
            style={[
              typography.body,
              {
                backgroundColor: shadcn.input,
                borderColor: colors.line,
                borderRadius: radius.lg,
                borderWidth: 1,
                color: colors.ink,
                minHeight: 52,
                paddingHorizontal: 14,
              },
            ]}
            value={name}
          />
        </View>

        <View style={{ gap: 9 }}>
          <Text style={[typography.label, { color: colors.muted }]}>{t("bookmarks.collection.colour")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {bookmarkCollectionColors.map((option) => (
              <Pressable
                accessibilityLabel={t(colourLabelKeys[option])}
                accessibilityRole="button"
                accessibilityState={{ selected: color === option }}
                key={option}
                onPress={() => setColor(option)}
                style={{
                  alignItems: "center",
                  borderColor: color === option ? colors.ink : colors.line,
                  borderRadius: 999,
                  borderWidth: color === option ? 2 : 1,
                  height: 42,
                  justifyContent: "center",
                  width: 42,
                }}
              >
                <View style={{ backgroundColor: bookmarkColor(option), borderRadius: 999, height: 26, width: 26 }} />
              </Pressable>
            ))}
          </View>
        </View>

        <PrimaryButton disabled={!name.trim()} icon="check" onPress={save}>
          {collection ? t("bookmarks.collection.save") : t("bookmarks.collection.create")}
        </PrimaryButton>
        {collection && onDelete ? (
          <SecondaryButton icon="trash-2" onPress={() => onDelete(collection)} tone="danger">
            {t("bookmarks.collection.delete")}
          </SecondaryButton>
        ) : null}
      </View>
    </BottomSheet>
  );
}
