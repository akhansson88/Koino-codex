import { AppSheet, SheetScrollView, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BibleHighlightColor, BibleHighlightPaletteColor } from "@/state/types";
import { PrimaryButton, TextInputField } from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { colors, radius } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";
import { normalizeHexColor, isHexColor } from "@/features/bible-reader/verse-helpers";
import { ReaderCircleButton } from "@/features/bible-reader/header";

const colorWheelColors = [
  "#FF5252",
  "#FF7043",
  "#FF9800",
  "#FFC107",
  "#FFF200",
  "#CDDC39",
  "#8BC34A",
  "#4DF06A",
  "#00C853",
  "#00BFA5",
  "#09C6DF",
  "#03A9F4",
  "#448AFF",
  "#3F51B5",
  "#7C4DFF",
  "#9C27B0",
  "#E040FB",
  "#F48FB1",
  "#FF4081",
  "#FF8A80",
  "#FFC166",
  "#A5D6A7",
  "#80DEEA",
  "#CE93D8",
];

export function HighlightColorManagerSheet({
  colors: highlightColors,
  onClose,
  onDelete,
  onSave,
  palette,
  visible,
}: {
  colors: BibleHighlightPaletteColor[];
  onClose: () => void;
  onDelete: (color: BibleHighlightPaletteColor) => Promise<void>;
  onSave: (color: { hex: BibleHighlightColor; id?: string; label?: string }) => Promise<void>;
  palette: ReaderPalette;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.78), 680);
  const sheetRef = useRef<AppSheetHandle>(null);
  const [editingColor, setEditingColor] = useState<BibleHighlightPaletteColor | undefined>();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draftHex, setDraftHex] = useState("#FFF200");
  const [draftLabel, setDraftLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setEditingColor(undefined);
      setPickerVisible(false);
      setDraftHex(colorWheelColors[4]);
      setDraftLabel("");
    }
  }, [visible]);

  const normalizedDraftHex = normalizeHexColor(draftHex);
  const draftValid = isHexColor(draftHex);

  const closeWithAnimation = useCallback((afterClose?: () => void) => sheetRef.current?.dismiss(afterClose), []);

  function openCreate() {
    setEditingColor(undefined);
    setDraftHex(colorWheelColors[4]);
    setDraftLabel("");
    setPickerVisible(true);
  }

  function openEdit(color: BibleHighlightPaletteColor) {
    setEditingColor(color);
    setDraftHex(color.hex);
    setDraftLabel(color.label);
    setPickerVisible(true);
  }

  async function saveDraft() {
    if (busy || !draftValid) return;
    setBusy(true);
    try {
      await onSave({ hex: normalizedDraftHex, id: editingColor?.id, label: draftLabel.trim() || normalizedDraftHex });
      setPickerVisible(false);
      setEditingColor(undefined);
    } finally {
      setBusy(false);
    }
  }

  function deleteColor(color: BibleHighlightPaletteColor) {
    if (busy) return;
    confirmAction({
      title: "Delete highlight color?",
      message: "This removes the color and deletes highlights that use it.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => {
        setBusy(true);
        void onDelete(color).finally(() => setBusy(false));
      },
    });
  }


  return (
    <AppSheet ref={sheetRef} visible={visible} onClose={onClose} dismissible={!busy} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>
      <View style={{ flex: 1, paddingHorizontal: 18, paddingBottom: insets.bottom }}>
            <SheetScrollView
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingBottom: 12 }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <ReaderCircleButton
                  accessibilityLabel={pickerVisible ? "Back to highlight colors" : "Close highlight colors"}
                  icon={pickerVisible ? "arrow-left" : "x"}
                  onPress={pickerVisible ? () => setPickerVisible(false) : () => closeWithAnimation()}
                  palette={palette}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: palette.text, fontSize: 21, fontWeight: "900" }}>{pickerVisible ? (editingColor ? "Edit color" : "Add color") : "Highlight colors"}</Text>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
                    {pickerVisible ? "Choose a color for your Bible highlights." : "Manage your saved highlight palette."}
                  </Text>
                </View>
                {!pickerVisible ? (
                  <Pressable
                    accessibilityLabel="Add highlight color"
                    accessibilityRole="button"
                    onPress={openCreate}
                    style={{
                      alignItems: "center",
                      backgroundColor: palette.peach,
                      borderColor: palette.line,
                      borderRadius: 999,
                      borderWidth: 1,
                      height: 42,
                      justifyContent: "center",
                      width: 42,
                    }}
                  >
                    <Feather name="plus" size={18} color={palette.accent} />
                  </Pressable>
                ) : null}
              </View>

              {pickerVisible ? (
                <View style={{ gap: 14 }}>
                  <HighlightColorWheel color={normalizedDraftHex} onChange={setDraftHex} palette={palette} />
                  <TextInputField autoCapitalize="words" onChangeText={setDraftLabel} placeholder="Color name" value={draftLabel} />
                  <PrimaryButton disabled={busy} icon="check" onPress={saveDraft}>
                    {busy ? "Saving..." : "Save color"}
                  </PrimaryButton>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {highlightColors.length === 0 ? (
                    <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 14 }}>
                      <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>No highlight colors yet.</Text>
                    </View>
                  ) : (
                    highlightColors.map((color) => (
                      <View
                        key={color.id}
                        style={{
                          alignItems: "center",
                          backgroundColor: palette.surface,
                          borderColor: palette.line,
                          borderRadius: radius.lg,
                          borderWidth: 1,
                          flexDirection: "row",
                          gap: 12,
                          minHeight: 62,
                          padding: 12,
                        }}
                      >
                        <View style={{ backgroundColor: color.hex, borderColor: palette.line, borderRadius: 999, borderWidth: 1, height: 38, width: 38 }} />
                        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
                            {color.label}
                          </Text>
                          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{color.hex}</Text>
                        </View>
                        <Pressable accessibilityLabel={`Edit ${color.label}`} accessibilityRole="button" onPress={() => openEdit(color)} style={{ padding: 10 }}>
                          <Feather name="edit-3" size={17} color={palette.accent} />
                        </Pressable>
                        <Pressable accessibilityLabel={`Delete ${color.label}`} accessibilityRole="button" onPress={() => deleteColor(color)} style={{ padding: 10 }}>
                          <Feather name="trash-2" size={17} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              )}
            </SheetScrollView>
      </View>
    </AppSheet>
  );
}

function HighlightColorWheel({
  color,
  onChange,
  palette,
}: {
  color: BibleHighlightColor;
  onChange: (color: BibleHighlightColor) => void;
  palette: ReaderPalette;
}) {
  const wheelSize = 252;
  const swatchSize = 42;
  const center = wheelSize / 2;
  const radiusDistance = 96;

  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View style={{ height: wheelSize, width: wheelSize }}>
        {colorWheelColors.map((wheelColor, index) => {
          const angle = (index / colorWheelColors.length) * Math.PI * 2 - Math.PI / 2;
          const selected = normalizeHexColor(color) === wheelColor;
          return (
            <Pressable
              accessibilityLabel={`Choose highlight color ${index + 1}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={wheelColor}
              onPress={() => onChange(wheelColor)}
              style={{
                alignItems: "center",
                backgroundColor: wheelColor,
                borderColor: selected ? palette.text : palette.line,
                borderRadius: 999,
                borderWidth: selected ? 3 : 1,
                height: swatchSize,
                justifyContent: "center",
                left: center + Math.cos(angle) * radiusDistance - swatchSize / 2,
                position: "absolute",
                top: center + Math.sin(angle) * radiusDistance - swatchSize / 2,
                width: swatchSize,
              }}
            >
              {selected ? <Feather name="check" size={16} color={palette.text} /> : null}
            </Pressable>
          );
        })}
        <View
          pointerEvents="none"
          style={{
            alignItems: "center",
            backgroundColor: color,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 86,
            justifyContent: "center",
            left: center - 43,
            position: "absolute",
            top: center - 43,
            width: 86,
          }}
        >
          <View style={{ backgroundColor: "rgba(255, 255, 255, 0.72)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "900" }}>Selected</Text>
          </View>
        </View>
      </View>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>Tap the wheel to choose a highlight color.</Text>
    </View>
  );
}
