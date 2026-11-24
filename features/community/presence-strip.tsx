import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { CommunityMember } from "@/features/community/types";
import { useCommunityPresence } from "@/state/presence";
import { Avatar } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export function CommunityPresenceStrip({
  groupId,
  members,
  onPress,
}: {
  groupId: string;
  members: CommunityMember[];
  onPress: () => void;
}) {
  const { t } = useAppTranslation();
  const { presence } = useCommunityPresence(groupId);
  const online = members
    .filter((member) => presence[member.id]?.status === "online")
    .sort((left, right) => left.name.localeCompare(right.name));
  const visible = online.slice(0, 5);
  const overflow = Math.max(0, online.length - visible.length);
  const label = online.length > 0
    ? t("presence.strip.online", { count: online.length })
    : t("presence.strip.none");

  return (
    <Pressable
      accessibilityLabel={`${t("presence.strip.open")}. ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: pressed ? colors.cream : colors.input,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        maxWidth: "100%",
        minHeight: 40,
        paddingHorizontal: 10,
        paddingVertical: 6,
      })}
    >
      {visible.length > 0 ? (
        <View style={{ flexDirection: "row", height: 26, paddingLeft: 3 }}>
          {visible.map((member, index) => (
            <View key={member.id} style={{ marginLeft: index === 0 ? 0 : -9 }}>
              <Avatar image={member.image} name={member.name} size={26} status="online" tone={index % 2 ? "orange" : "green"} />
            </View>
          ))}
          {overflow > 0 ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.paper,
                borderColor: colors.line,
                borderRadius: 999,
                borderWidth: 1,
                height: 26,
                justifyContent: "center",
                marginLeft: -9,
                minWidth: 26,
                paddingHorizontal: 5,
              }}
            >
              <Text style={[typography.caption, { color: colors.muted, fontSize: 10 }]}>{`+${overflow}`}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 8, marginLeft: 2, width: 8 }} />
      )}
      <Text numberOfLines={1} style={[typography.caption, { color: online.length > 0 ? colors.ink : colors.muted, flexShrink: 1 }]}>
        {label}
      </Text>
      <Feather name="chevron-right" size={15} color={colors.muted} />
    </Pressable>
  );
}
