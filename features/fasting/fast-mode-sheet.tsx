import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { FastMode } from "@/state/types";
import { fastModeConfig } from "@/state/fasting-modes";
import { fastModeTint } from "@/features/fasting/fasting-style";
import { AppSheet } from "@/ui/app-sheet";
import { BodyText, Card, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function FastModeSheet({
  mode,
  onChoose,
  onClose,
  visible,
}: {
  mode?: FastMode;
  onChoose: (mode: FastMode) => void;
  onClose: () => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  if (!mode) return null;
  const config = fastModeConfig(mode);
  const tint = fastModeTint(mode);
  const badge = config.badge ? t(`fasting.mode.badge.${config.badge}` as TranslationKey) : undefined;

  return (
    <AppSheet onClose={onClose} scroll title={t(config.titleKey as TranslationKey)} visible={visible}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: tint.soft,
            borderRadius: radius.xl,
            height: 64,
            justifyContent: "center",
            width: 64,
          }}
        >
          <Feather color={tint.ink} name={config.icon as never} size={27} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t(config.titleKey as TranslationKey)}</Text>
          <Text style={[typography.body, { color: colors.muted }]}>{t(config.shortKey as TranslationKey)}</Text>
          {badge ? (
            <View style={{ alignSelf: "flex-start", backgroundColor: tint.soft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={[typography.caption, { color: tint.ink }]}>{badge}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <BodyText>{t(config.detailKey as TranslationKey)}</BodyText>

      {mode === "daniel" ? (
        <>
          <Card style={{ gap: 8, backgroundColor: colors.mossSurface, borderColor: colors.mossSurface }}>
            <Text style={[typography.sectionLabel, { color: colors.accentRhythm, fontSize: 10 }]}>
              {t("fasting.mode.daniel.note")}
            </Text>
          </Card>
          <Card style={{ gap: 8 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <Feather color={shadcn.success} name="check-circle" size={16} />
              <Text style={[typography.bodyMedium, { color: colors.ink, flex: 1 }]}>{t("fasting.mode.daniel.eat")}</Text>
            </View>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <Feather color={colors.danger} name="slash" size={16} />
              <Text style={[typography.bodyMedium, { color: colors.ink, flex: 1 }]}>{t("fasting.mode.daniel.avoid")}</Text>
            </View>
          </Card>
        </>
      ) : null}

      <Card style={{ gap: 8 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Feather color={tint.ink} name="book-open" size={16} />
          <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("fasting.mode.rhythm")}</Text>
        </View>
        <BodyText muted>{t("fasting.mode.rhythmBody")}</BodyText>
      </Card>

      <Card style={{ gap: 8 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Feather color={mode === "dry" ? colors.danger : colors.muted} name="shield" size={16} />
          <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("fasting.mode.safety")}</Text>
        </View>
        <BodyText muted>{t("fasting.mode.safetyBody")}</BodyText>
        {mode === "dry" ? (
          <Text style={[typography.bodyMedium, { color: colors.danger }]}>{t("fasting.mode.drySafety")}</Text>
        ) : null}
      </Card>

      <PrimaryButton icon="arrow-right" onPress={() => onChoose(mode)}>
        {t("fasting.mode.choose")}
      </PrimaryButton>
    </AppSheet>
  );
}
