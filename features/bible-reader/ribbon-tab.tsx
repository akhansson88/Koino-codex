import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { displayBibleReference } from "@/features/bible-book-names";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import type { BibleRibbon } from "@/state/types";
import { BottomSheet, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function BibleRibbonTab({
  active,
  onLongPress,
  onPress,
  top,
}: {
  active: boolean;
  onLongPress: () => void;
  onPress: () => void;
  top: number;
}) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityHint={t("ribbons.set")}
      accessibilityLabel={active ? t("ribbons.title") : t("ribbons.set")}
      accessibilityRole="button"
      delayLongPress={320}
      hitSlop={{ bottom: 8, left: 8, top: 8 }}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        height: 62,
        justifyContent: "flex-start",
        opacity: pressed ? 0.75 : 1,
        position: "absolute",
        right: 0,
        top,
        width: 18,
        zIndex: 16,
      })}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: active ? colors.gold : colors.paper,
          borderBottomLeftRadius: 4,
          borderColor: active ? colors.gold : colors.line,
          borderTopLeftRadius: 4,
          borderWidth: 1,
          height: 56,
          justifyContent: "center",
          width: 14,
        }}
      >
        <View
          style={{
            backgroundColor: active ? "rgba(255,253,249,0.9)" : colors.gold,
            borderRadius: 999,
            height: 16,
            width: 2,
          }}
        />
      </View>
    </Pressable>
  );
}

export function BibleRibbonSheet({
  currentId,
  onClose,
  onContinue,
  onMove,
  onRemove,
  onRename,
  onSet,
  ribbons,
  visible,
}: {
  currentId?: string;
  onClose: () => void;
  onContinue: (ribbon: BibleRibbon) => void;
  onMove: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onSet: () => void;
  ribbons: BibleRibbon[];
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const [editingId, setEditingId] = useState<string>();
  const [label, setLabel] = useState("");
  const atLimit = ribbons.length >= 5;

  const referenceFor = (ribbon: BibleRibbon) => displayBibleReference(
    `${ribbon.book} ${ribbon.chapter}:${ribbon.verse}`,
    bookLanguage,
  );

  return (
    <BottomSheet onClose={onClose} title={t("ribbons.title")} visible={visible}>
      <View style={{ gap: 8, paddingBottom: 28, paddingHorizontal: 20 }}>
        {ribbons.map((ribbon) => {
          const reference = referenceFor(ribbon);
          const editing = editingId === ribbon.id;
          return (
            <View
              key={ribbon.id}
              style={{
                backgroundColor: shadcn.card,
                borderColor: ribbon.id === currentId ? colors.gold : colors.line,
                borderRadius: radius.md,
                borderWidth: 1,
                gap: 8,
                padding: 12,
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: 9 }}>
                <View
                  style={{
                    backgroundColor: colors.gold,
                    borderBottomLeftRadius: 2,
                    borderBottomRightRadius: 2,
                    height: 26,
                    marginLeft: 2,
                    width: 13,
                  }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  {editing ? (
                    <TextInput
                      accessibilityLabel={t("ribbons.rename")}
                      autoFocus
                      maxLength={40}
                      onChangeText={setLabel}
                      onSubmitEditing={() => {
                        onRename(ribbon.id, label);
                        setEditingId(undefined);
                      }}
                      style={[typography.cardTitle, { color: colors.ink, borderBottomColor: colors.line, borderBottomWidth: 1, paddingVertical: 4 }]}
                      value={label}
                    />
                  ) : (
                    <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink }]}>
                      {ribbon.label ?? reference}
                    </Text>
                  )}
                  <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, fontSize: 12 }]}>
                    {ribbon.label ? reference : t("ribbons.continue")}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={t("ribbons.rename")}
                  accessibilityRole="button"
                  onPress={() => {
                    if (editing) {
                      onRename(ribbon.id, label);
                      setEditingId(undefined);
                      return;
                    }
                    setEditingId(ribbon.id);
                    setLabel(ribbon.label ?? reference);
                  }}
                  style={{ alignItems: "center", height: 40, justifyContent: "center", width: 36 }}
                >
                  <Feather name={editing ? "check" : "edit-3"} size={15} color={colors.muted} />
                </Pressable>
                <Pressable
                  accessibilityLabel={t("ribbons.remove")}
                  accessibilityRole="button"
                  onPress={() => onRemove(ribbon.id)}
                  style={{ alignItems: "center", height: 40, justifyContent: "center", width: 32 }}
                >
                  <Feather name="trash-2" size={15} color={colors.muted} />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel={atLimit && !currentId ? t("ribbons.move") : t("ribbons.continue")}
                accessibilityRole="button"
                onPress={() => {
                  if (atLimit && !currentId) onMove(ribbon.id);
                  else onContinue(ribbon);
                }}
                style={{
                  alignItems: "center",
                  alignSelf: "flex-start",
                  backgroundColor: colors.accentSubtle,
                  borderRadius: 999,
                  minHeight: 34,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                }}
              >
                <Text style={[typography.label, { color: colors.gold }]}>
                  {atLimit && !currentId ? t("ribbons.move") : t("ribbons.continue")}
                </Text>
              </Pressable>
            </View>
          );
        })}

        {!ribbons.length ? (
          <Text style={[typography.body, { color: colors.muted }]}>{t("ribbons.setHere")}</Text>
        ) : null}

        <View style={{ gap: 8, paddingTop: 4 }}>
          {currentId ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("ribbons.exists")}</Text>
          ) : atLimit ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("ribbons.limitBody")}</Text>
          ) : (
            <PrimaryButton icon="bookmark" onPress={onSet}>
              {t("ribbons.setHere")}
            </PrimaryButton>
          )}
        </View>
      </View>
    </BottomSheet>
  );
}
