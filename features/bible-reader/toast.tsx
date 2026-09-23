import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { colors, platformShadow, radius } from "@/ui/theme";
import { type ReaderPalette, type ReaderToast } from "@/features/bible-reader/types";

export function ReaderToastMessage({ bottom, palette, toast }: { bottom: number; palette: ReaderPalette; toast?: ReaderToast }) {
  if (!toast) return null;

  const isError = toast.tone === "error";
  const icon = isError ? "alert-circle" : "check";
  const detail = toast.detail ?? (isError ? "Du hittar den redan under sparade verser." : "Du hittar den under sparade verser.");

  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: "center",
        bottom,
        left: 18,
        position: "absolute",
        right: 18,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.sheet,
          borderColor: palette.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          flexDirection: "row",
          gap: 12,
          maxWidth: 360,
          paddingHorizontal: 14,
          paddingVertical: 12,
          ...platformShadow({
            boxShadow: "0 12px 28px rgba(11, 18, 32, 0.18)",
            color: palette.shadow,
            offset: { width: 0, height: 10 },
            opacity: 0.16,
            radius: 22,
          }),
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette.peach,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather name={icon} size={18} color={isError ? colors.danger : palette.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>{toast.message}</Text>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}
