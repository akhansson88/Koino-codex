import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { developmentMode } from "@/state/store/firebase";
import { Card, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { useOpenExternalLink } from "@/ui/in-app-browser";
import { colors, shadcn, typography } from "@/ui/theme";

const FEEDBACK_BASE_URL = "https://koinolabs.com/feedback/";
const FEEDBACK_DISMISS_KEY = "koino.feedback.dismissedUntil";
const FEEDBACK_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export function useOpenFeedback(placement: "me" | "identity") {
  const openExternalLink = useOpenExternalLink();
  return useCallback(() => {
    const url = `${FEEDBACK_BASE_URL}?source=app&placement=${placement}`;
    if (developmentMode) {
      void Linking.openURL(url).catch(() => undefined);
      return;
    }
    openExternalLink(url);
  }, [openExternalLink, placement]);
}

export function FeedbackCard() {
  const { t } = useAppTranslation();
  const openFeedback = useOpenFeedback("me");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FEEDBACK_DISMISS_KEY)
      .then((value) => {
        if (!active) return;
        const until = Number(value || 0);
        setVisible(!(Number.isFinite(until) && until > Date.now()));
      })
      .catch(() => {
        if (active) setVisible(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function dismiss() {
    setVisible(false);
    void AsyncStorage.setItem(FEEDBACK_DISMISS_KEY, String(Date.now() + FEEDBACK_DISMISS_MS)).catch(() => undefined);
  }

  if (!visible) return null;

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: shadcn.brandSoft,
            borderRadius: 14,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Feather name="message-circle" size={19} color={shadcn.brand} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("feedback.card.title")}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{t("feedback.card.body")}</Text>
        </View>
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <PrimaryButton
          icon="edit-3"
          onPress={() => {
            dismiss();
            openFeedback();
          }}
          style={{ flex: 1 }}
        >
          {t("feedback.card.action")}
        </PrimaryButton>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={dismiss}
          style={{ justifyContent: "center", minHeight: 44, paddingHorizontal: 10 }}
        >
          <Text style={[typography.caption, { color: colors.muted }]}>{t("feedback.card.dismiss")}</Text>
        </Pressable>
      </View>
    </Card>
  );
}
