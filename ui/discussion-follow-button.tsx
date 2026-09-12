import { Feather } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";

import { useAppTranslation } from "@/ui/app-language";
import { colors } from "@/ui/theme";

export function DiscussionFollowButton({ following, onPress }: { following: boolean; onPress: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: following ? colors.lavenderSoft : colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 8,
        minHeight: 40,
        paddingHorizontal: 14,
      }}
    >
      <Feather color={colors.olive} name={following ? "bell-off" : "bell"} size={16} />
      <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "800" }}>
        {t(following ? "notifications.unfollowDiscussion" : "notifications.followDiscussion")}
      </Text>
    </Pressable>
  );
}
