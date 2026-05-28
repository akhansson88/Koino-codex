import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { BodyText, Card, PrimaryButton } from "@/ui/app-components";
import { colors } from "@/ui/theme";

export function BiblePlanCard({
  completed,
  dayLabel,
  onMarkRead,
  passageReference,
  planTitle,
  progressLabel,
  rhythmLabel,
}: {
  completed: boolean;
  dayLabel: string;
  onMarkRead: () => void;
  passageReference: string;
  planTitle: string;
  progressLabel: string;
  rhythmLabel: string;
}) {
  return (
    <Card style={{ gap: 13, padding: 16 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Feather name="book-open" size={16} color={colors.olive} />
        <Text style={{ color: colors.olive, flex: 1, fontSize: 12, fontWeight: "900" }}>{rhythmLabel}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{progressLabel}</Text>
      </View>
      <View style={{ gap: 5 }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900", lineHeight: 24 }}>{planTitle}</Text>
        <BodyText muted>{dayLabel}</BodyText>
      </View>
      <View style={{ alignItems: "center", backgroundColor: colors.accentSubtle, borderRadius: 8, flexDirection: "row", gap: 10, padding: 12 }}>
        <Feather name="bookmark" size={17} color={colors.gold} />
        <Text style={{ color: colors.ink, flex: 1, fontSize: 16, fontWeight: "900" }}>{passageReference}</Text>
      </View>
      <PrimaryButton disabled={completed} icon="check-circle" onPress={onMarkRead}>
        {completed ? "Read today" : "Mark as read"}
      </PrimaryButton>
    </Card>
  );
}
