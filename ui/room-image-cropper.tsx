import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { Image, Modal, PanResponder, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { colors, platformShadow, radius } from "@/ui/theme";

export type RoomImageCropSource = {
  uri: string;
  width: number;
  height: number;
};

type Pan = { x: number; y: number };

const outputSize = 512;
const maxScale = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(touches: ArrayLike<{ pageX: number; pageY: number }>) {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function RoomImageCropper({
  onCancel,
  onSave,
  source,
  title = "Crop community image",
  visible,
}: {
  onCancel: () => void;
  onSave: (localUri: string) => Promise<void>;
  source?: RoomImageCropSource;
  title?: string;
  visible: boolean;
}) {
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cropSize = Math.max(240, Math.min(dimensions.width - 36, 360));
  const previewSize = 92;
  const baseScale = source ? Math.max(cropSize / source.width, cropSize / source.height) : 1;
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const gestureStartRef = useRef({ panX: 0, panY: 0, scale: 1, distance: 0 });

  useEffect(() => {
    if (!visible) return;
    setPan({ x: 0, y: 0 });
    setScale(1);
    setError("");
    setSaving(false);
  }, [source?.uri, visible]);

  function clampPan(nextPan: Pan, nextScale = scale) {
    if (!source) return { x: 0, y: 0 };
    const renderWidth = source.width * baseScale * nextScale;
    const renderHeight = source.height * baseScale * nextScale;
    const maxX = Math.max(0, (renderWidth - cropSize) / 2);
    const maxY = Math.max(0, (renderHeight - cropSize) / 2);
    return {
      x: clamp(nextPan.x, -maxX, maxX),
      y: clamp(nextPan.y, -maxY, maxY),
    };
  }

  function setZoom(nextScale: number) {
    const clampedScale = clamp(nextScale, 1, maxScale);
    setScale(clampedScale);
    setPan((current) => clampPan(current, clampedScale));
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          gestureStartRef.current = {
            panX: pan.x,
            panY: pan.y,
            scale,
            distance: touchDistance(event.nativeEvent.touches),
          };
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;
          const start = gestureStartRef.current;

          if (touches.length >= 2 && start.distance > 0) {
            const nextScale = clamp(start.scale * (touchDistance(touches) / start.distance), 1, maxScale);
            setScale(nextScale);
            setPan((current) => clampPan(current, nextScale));
            return;
          }

          setPan(
            clampPan({
              x: start.panX + gestureState.dx,
              y: start.panY + gestureState.dy,
            }),
          );
        },
      }),
    [baseScale, cropSize, pan.x, pan.y, scale, source],
  );

  const frame = useMemo(() => {
    if (!source) return { height: 0, left: 0, top: 0, width: 0 };
    const width = source.width * baseScale * scale;
    const height = source.height * baseScale * scale;
    return {
      height,
      left: (cropSize - width) / 2 + pan.x,
      top: (cropSize - height) / 2 + pan.y,
      width,
    };
  }, [baseScale, cropSize, pan.x, pan.y, scale, source]);

  const cropRect = useMemo(() => {
    if (!source) return { height: outputSize, originX: 0, originY: 0, width: outputSize };
    const displayScale = baseScale * scale;
    const side = Math.max(1, Math.min(Math.round(cropSize / displayScale), source.width, source.height));
    const originX = clamp(Math.round((frame.width / 2 - cropSize / 2 - pan.x) / displayScale), 0, source.width - side);
    const originY = clamp(Math.round((frame.height / 2 - cropSize / 2 - pan.y) / displayScale), 0, source.height - side);
    return { height: side, originX, originY, width: side };
  }, [baseScale, cropSize, frame.height, frame.width, pan.x, pan.y, scale, source]);

  async function handleSave() {
    if (!source || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await ImageManipulator.manipulateAsync(
        source.uri,
        [{ crop: cropRect }, { resize: { height: outputSize, width: outputSize } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.WEBP },
      );
      await onSave(result.uri);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the community image.");
      setSaving(false);
    }
  }

  if (!source) return null;

  const previewScale = previewSize / cropSize;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={saving ? undefined : onCancel}>
      <View style={{ backgroundColor: colors.cream, flex: 1, paddingBottom: Math.max(18, insets.bottom + 12), paddingHorizontal: 18, paddingTop: Math.max(18, insets.top + 14) }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel="Cancel community image crop" icon="x" onPress={onCancel} />
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>{title}</Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={{ alignItems: "center", flex: 1, gap: 18, justifyContent: "center" }}>
          <View
            style={{
              backgroundColor: colors.paper,
              borderColor: colors.line,
              borderRadius: 999,
              borderWidth: 1,
              height: previewSize,
              overflow: "hidden",
              width: previewSize,
              ...platformShadow({
                boxShadow: "0 10px 24px rgba(11, 18, 32, 0.16)",
                offset: { width: 0, height: 10 },
                opacity: 0.16,
                radius: 24,
              }),
            }}
          >
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: source.uri }}
              style={{
                height: frame.height * previewScale,
                left: frame.left * previewScale,
                position: "absolute",
                top: frame.top * previewScale,
                width: frame.width * previewScale,
              }}
            />
          </View>

          <View
            {...panResponder.panHandlers}
            style={{
              backgroundColor: colors.input,
              borderColor: colors.line,
              borderRadius: 999,
              borderWidth: 1,
              height: cropSize,
              overflow: "hidden",
              width: cropSize,
            }}
          >
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: source.uri }}
              style={{
                height: frame.height,
                left: frame.left,
                position: "absolute",
                top: frame.top,
                width: frame.width,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                borderColor: "rgba(255, 255, 255, 0.86)",
                borderRadius: 999,
                borderWidth: 2,
                bottom: 0,
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
              }}
            />
          </View>

          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <Pressable
              accessibilityLabel="Zoom out"
              accessibilityRole="button"
              onPress={() => setZoom(scale - 0.2)}
              style={{
                alignItems: "center",
                backgroundColor: colors.paper,
                borderColor: colors.line,
                borderRadius: radius.md,
                borderWidth: 1,
                height: 46,
                justifyContent: "center",
                width: 46,
              }}
            >
              <Feather name="minus" size={20} color={colors.ink} />
            </Pressable>
            <Text style={{ color: colors.muted, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "900", minWidth: 54, textAlign: "center" }}>{Math.round(scale * 100)}%</Text>
            <Pressable
              accessibilityLabel="Zoom in"
              accessibilityRole="button"
              onPress={() => setZoom(scale + 0.2)}
              style={{
                alignItems: "center",
                backgroundColor: colors.paper,
                borderColor: colors.line,
                borderRadius: radius.md,
                borderWidth: 1,
                height: 46,
                justifyContent: "center",
                width: 46,
              }}
            >
              <Feather name="plus" size={20} color={colors.ink} />
            </Pressable>
          </View>

          {error ? <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "800", textAlign: "center" }}>{error}</Text> : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <SecondaryButton disabled={saving} onPress={onCancel} style={{ flex: 1 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton disabled={saving} icon="check" onPress={handleSave} style={{ flex: 1 }}>
            {saving ? "Saving" : "Save"}
          </PrimaryButton>
        </View>
      </View>
    </Modal>
  );
}
