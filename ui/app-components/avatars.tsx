import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import type { GroupImage } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export function initials(name?: string) {
  return (name || "K")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Avatar({
  image,
  name,
  size = 42,
  tone = "orange",
}: {
  image?: GroupImage;
  name?: string;
  size?: number;
  tone?: "orange" | "green" | "pink" | "blue";
}) {
  const [failed, setFailed] = useState(false);
  const palette = {
    orange: [colors.warmSoft, colors.textMuted],
    green: [colors.rhythmSoft, colors.textMuted],
    pink: [colors.prayerSoft, colors.textMuted],
    blue: [colors.reflectionSoft, colors.textMuted],
  }[tone];

  useEffect(() => {
    setFailed(false);
  }, [image?.url]);

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette[0],
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        width: size,
      }}
    >
      {image?.url && !failed ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={{ uri: image.url }}
          style={{ height: "100%", width: "100%" }}
        />
      ) : (
        <Text style={[typography.label, { color: palette[1], fontSize: Math.max(12, size * 0.36), lineHeight: Math.max(14, size * 0.42) }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function RoomImage({ image, name, size = 64 }: { image?: GroupImage; name?: string; size?: number }) {
  const { t } = useAppTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image?.url]);

  if (image?.url && !failed) {
    return (
      <View
        style={{
          backgroundColor: colors.input,
          borderColor: colors.line,
          borderRadius: 999,
          borderWidth: 1,
          height: size,
          overflow: "hidden",
          width: size,
        }}
      >
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={{ uri: image.url }}
          style={{ height: "100%", width: "100%" }}
        />
      </View>
    );
  }

  return <Avatar name={name ?? t("tabs.community")} size={size} tone="blue" />;
}

export function AvatarStack({ users, size = 42 }: { users: { name: string; image?: GroupImage }[]; size?: number }) {
  return (
    <View style={{ flexDirection: "row", height: size }}>
      {users.slice(0, 4).map((user, index) => (
        <View key={`${user.name}-${index}`} style={{ marginLeft: index === 0 ? 0 : -(size * 0.4) }}>
          <Avatar image={user.image} name={user.name} size={size} tone={index % 2 ? "orange" : "pink"} />
        </View>
      ))}
    </View>
  );
}
