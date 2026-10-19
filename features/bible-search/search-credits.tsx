import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ReaderPalette } from "@/features/bible-reader/types";
import { useAppTranslation } from "@/ui/app-language";

type Credit = { id: string; title: string; body: string };

function CreditSection({ credit, palette }: { credit: Credit; palette: ReaderPalette }) {
  const [expanded, setExpanded] = useState(false);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={credit.title} accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
      <Text style={{ flex: 1, color: palette.text, fontSize: 13, lineHeight: 20, fontWeight: "600" }}>{credit.title}</Text>
      <Feather name={expanded ? "chevron-up" : "chevron-down"} color={palette.muted} size={16} />
    </Pressable>
    {expanded ? <Text selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 19, paddingBottom: 16 }}>{credit.body}</Text> : null}
  </View>;
}

function CreditsDetails({ palette }: { palette: ReaderPalette }) {
  const { t } = useAppTranslation();
  // Keep all attribution and complete licenses offline, without parsing them on
  // the normal search path. Large legal sections render only when selected.
  const credits = require("../../assets/bible/search/search-credits.json") as { sections: Credit[] };
  return <View style={{ paddingBottom: 8 }}>
    <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 19, paddingBottom: 8 }}>{t("bible.search.creditsDescription")}</Text>
    {credits.sections.map((credit) => <CreditSection key={credit.id} credit={credit} palette={palette} />)}
  </View>;
}

export function SearchSourceCredits({ palette }: { palette: ReaderPalette }) {
  const { t } = useAppTranslation();
  const [expanded, setExpanded] = useState(false);
  return <View style={{ borderTopColor: palette.line, borderTopWidth: 1, marginTop: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={t("bible.search.credits")}
      accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }}>
      <Text style={{ flex: 1, color: palette.muted, fontSize: 12, lineHeight: 19 }}>{t("bible.search.credits")}</Text>
      <Feather name={expanded ? "chevron-up" : "chevron-down"} color={palette.muted} size={16} />
    </Pressable>
    {expanded ? <CreditsDetails palette={palette} /> : null}
  </View>;
}
