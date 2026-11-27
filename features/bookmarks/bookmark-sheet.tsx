import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Share, Text, TextInput, View } from "react-native";

import { SavedVerseAudioControl } from "@/features/bible-audio/saved-verse-audio";
import type { BookmarkCollection, SavedVerse } from "@/state/types";
import { BottomSheet, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { bookmarkColor, bookmarkPalette } from "@/features/bookmarks/bookmark-ui";

export function BookmarkSheet({
  collections,
  onClose,
  onCreateCollection,
  onDelete,
  onOpen,
  onPray,
  onReflect,
  onShareToCommunity,
  onUpdate,
  reference,
  verse,
}: {
  collections: BookmarkCollection[];
  onClose: () => void;
  onCreateCollection: () => void;
  onDelete: (verse: SavedVerse) => void;
  onOpen: (verse: SavedVerse) => void;
  onPray: (verse: SavedVerse) => void;
  onReflect: (verse: SavedVerse) => void;
  onShareToCommunity: (verse: SavedVerse) => void;
  onUpdate: (id: string, patch: { collectionId?: string | null; note?: string }) => void;
  reference: string;
  verse?: SavedVerse;
}) {
  const { t } = useAppTranslation();
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSaved = useRef("");
  const lastVerseId = useRef<string | undefined>(undefined);
  const palette = useMemo(bookmarkPalette, []);

  useEffect(() => {
    if (!verse) {
      lastVerseId.current = undefined;
      return;
    }
    if (verse.id === lastVerseId.current) return;
    lastVerseId.current = verse.id;
    const next = verse.note ?? "";
    setNote(next);
    lastSaved.current = next;
    setNoteState("idle");
    if (timer.current) clearTimeout(timer.current);
  }, [verse?.id]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!verse) return null;

  const saveNote = (value: string) => {
    if (value === lastSaved.current) {
      setNoteState("idle");
      return;
    }
    lastSaved.current = value;
    setNoteState("saving");
    onUpdate(verse.id, { note: value });
    setNoteState("saved");
  };

  const changeNote = (value: string) => {
    const next = value.slice(0, 500);
    setNote(next);
    setNoteState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNote(next), 600);
  };

  const share = () => {
    void Share.share({
      message: `${reference}\n\n"${verse.text}"\n\n${verse.translation ? `${verse.translation} · ` : ""}KOINO`,
    });
  };

  const copy = () => {
    void Clipboard.setStringAsync(`${reference}\n"${verse.text}"`);
  };

  const remove = () => {
    Alert.alert(t("bookmarks.deleteTitle"), t("bookmarks.deleteBody"), [
      { text: t("bookmarks.cancel"), style: "cancel" },
      { text: t("bookmarks.delete"), style: "destructive", onPress: () => onDelete(verse) },
    ]);
  };

  return (
    <BottomSheet
      height={680}
      onClose={onClose}
      title={reference}
      visible={Boolean(verse)}
    >
      <View style={{ gap: 18, paddingBottom: 28, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[typography.caption, { color: colors.muted }]}>
            {t("bookmarks.savedFrom", { version: verse.translation ?? t("bookmarks.unknownVersion") })}
          </Text>
          {verse.collectionId ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
              <View
                style={{
                  backgroundColor: bookmarkColor(collections.find((collection) => collection.id === verse.collectionId)?.color),
                  borderRadius: 999,
                  height: 6,
                  width: 6,
                }}
              />
              <Text style={[typography.caption, { color: colors.muted }]}>
                {collections.find((collection) => collection.id === verse.collectionId)?.name}
              </Text>
            </View>
          ) : null}
        </View>

        <Text selectable style={[typography.body, { color: colors.ink, fontSize: 17, lineHeight: 27 }]}>
          {verse.text}
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <PrimaryButton icon="book-open" onPress={() => onOpen(verse)} style={{ flex: 1 }}>
            {t("bookmarks.readInBible")}
          </PrimaryButton>
          <SecondaryButton icon="share-2" onPress={share} style={{ flex: 1 }}>
            {t("bookmarks.share")}
          </SecondaryButton>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ActionPill icon="users" label={t("bookmarks.shareCommunity")} onPress={() => onShareToCommunity(verse)} />
          <ActionPill icon="heart" label={t("bookmarks.pray")} onPress={() => onPray(verse)} />
          <ActionPill icon="edit-3" label={t("bookmarks.reflect")} onPress={() => onReflect(verse)} />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.muted }]}>{t("bookmarks.listen")}</Text>
          <SavedVerseAudioControl palette={palette} reference={reference} verse={verse} />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[typography.label, { color: colors.muted }]}>{t("bookmarks.collection.label")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            <CollectionOption
              label={t("bookmarks.collection.none")}
              onPress={() => onUpdate(verse.id, { collectionId: null })}
              selected={!verse.collectionId}
            />
            {collections.map((collection) => (
              <CollectionOption
                color={bookmarkColor(collection.color)}
                key={collection.id}
                label={collection.name}
                onPress={() => onUpdate(verse.id, { collectionId: collection.id })}
                selected={verse.collectionId === collection.id}
              />
            ))}
            <Pressable
              accessibilityLabel={t("bookmarks.collection.new")}
              accessibilityRole="button"
              onPress={onCreateCollection}
              style={{
                alignItems: "center",
                borderColor: colors.line,
                borderRadius: 999,
                borderStyle: "dashed",
                borderWidth: 1,
                flexDirection: "row",
                gap: 5,
                minHeight: 34,
                paddingHorizontal: 10,
              }}
            >
              <Feather name="plus" size={13} color={colors.gold} />
              <Text style={[typography.label, { color: colors.gold }]}>{t("bookmarks.collection.new")}</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[typography.label, { color: colors.muted }]}>{t("bookmarks.note.label")}</Text>
            <Text style={[typography.caption, { color: note.length > 400 ? colors.gold : colors.muted, fontSize: 11 }]}>
              {t("bookmarks.note.limit", { count: note.length })}
            </Text>
          </View>
          <TextInput
            accessibilityLabel={t("bookmarks.note.label")}
            maxLength={500}
            multiline
            onBlur={() => saveNote(note)}
            onChangeText={changeNote}
            placeholder={t("bookmarks.note.placeholder")}
            placeholderTextColor={colors.muted}
            style={[
              typography.body,
              {
                backgroundColor: shadcn.input,
                borderColor: colors.line,
                borderRadius: radius.lg,
                borderWidth: 1,
                color: colors.ink,
                minHeight: 96,
                paddingHorizontal: 14,
                paddingVertical: 12,
                textAlignVertical: "top",
              },
            ]}
            value={note}
          />
          <Text style={[typography.caption, { color: colors.muted, minHeight: 18 }]}>
            {noteState === "saving" ? t("bookmarks.note.saving") : noteState === "saved" ? t("bookmarks.note.saved") : ""}
          </Text>
        </View>

        <Pressable accessibilityRole="button" onPress={copy} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={[typography.label, { color: colors.gold }]}>{t("bookmarks.copy")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={remove} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={[typography.label, { color: colors.danger }]}>{t("bookmarks.delete")}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function ActionPill({ icon, label, onPress }: { icon: "users" | "heart" | "edit-3"; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? shadcn.secondary : colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        minHeight: 38,
        paddingHorizontal: 12,
      })}
    >
      <Feather name={icon} size={14} color={colors.gold} />
      <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function CollectionOption({
  color,
  label,
  onPress,
  selected,
}: {
  color?: string;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.ink : shadcn.card,
        borderColor: selected ? colors.ink : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 5,
        minHeight: 34,
        paddingHorizontal: 10,
      }}
    >
      {color ? <View style={{ backgroundColor: color, borderRadius: 999, height: 6, width: 6 }} /> : null}
      <Text style={[typography.label, { color: selected ? shadcn.primaryForeground : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}
