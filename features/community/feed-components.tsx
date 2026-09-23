import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { FeedItem } from "@/state/types";
import { Card } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { colors, typography } from "@/ui/theme";
import { type RoomDetailTab } from "@/features/community/types";
import { communityFeedEndpointBody } from "@/features/community/feed-helpers";

export const MemoCommunityFeedCard = memo(function MemoCommunityFeedCard({
  item, renderRef, version: _version,
}: {
  item: FeedItem;
  renderRef: { current: (item: FeedItem) => ReactNode };
  version: object;
}) {
  return <>{renderRef.current(item)}</>;
});

export function CommunityFilterChips<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: "center",
              alignSelf: "stretch",
              backgroundColor: selected ? colors.accentSubtle : colors.paper,
              borderColor: selected ? colors.gold : colors.line,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              flexShrink: 0,
              gap: 6,
              justifyContent: "center",
              maxWidth: "100%",
              minHeight: 44,
              paddingHorizontal: 13,
              paddingVertical: 8,
            }}
          >
            {selected ? (
              <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
                <Feather name="check" size={14} color={colors.olive} />
              </View>
            ) : null}
            <Text style={[typography.label, { color: selected ? colors.olive : colors.muted, flexShrink: 1, textAlign: "center" }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CommunityFeedEndpoint({
  communityName,
  detailTab,
  onViewEarlier,
  variant,
}: {
  communityName: string;
  detailTab: RoomDetailTab;
  onViewEarlier?: () => void;
  variant: "caught-up" | "no-recent";
}) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", gap: 5, paddingBottom: 6, paddingHorizontal: 16, paddingTop: 14 }}>
      <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
        <BrandWaveMotif height={12} opacity={0.65} variant="accent" width={58} />
      </View>
      <Text style={[typography.cardTitle, { color: colors.ink, fontSize: 15, lineHeight: 20, textAlign: "center" }]}>
        {t(variant === "caught-up" ? "community.feed.caughtUpTitle" : "community.feed.noRecentTitle")}
      </Text>
      <Text style={[typography.caption, { color: colors.muted, maxWidth: 260, textAlign: "center" }]}>
        {communityFeedEndpointBody(detailTab, communityName, variant, t)}
      </Text>
      {onViewEarlier ? (
        <Pressable
          accessibilityLabel={t("community.feed.viewEarlierIn", { name: communityName })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onViewEarlier}
          style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 }}
        >
          <Text style={[typography.label, { color: colors.olive }]}>{t("community.feed.viewEarlier")}</Text>
          <Feather name="chevron-down" size={16} color={colors.olive} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function CommunityFeedLoadingState() {
  const { t } = useAppTranslation();
  return (
    <View
      accessibilityLabel={t("community.feed.loading")}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={{ alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 24 }}
    >
      <ActivityIndicator color={colors.olive} size="small" />
      <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("community.feed.loading")}</Text>
    </View>
  );
}

export function CommunityFeedOfflineState() {
  const { t } = useAppTranslation();
  return (
    <View accessibilityLabel={t("community.feed.unavailable")} accessibilityLiveRegion="polite">
      <Card style={{ alignItems: "center", gap: 6, padding: 18 }}>
        <Feather name="wifi-off" size={20} color={colors.muted} />
        <Text style={[typography.cardTitle, { color: colors.ink, fontSize: 15, textAlign: "center" }]}>{t("community.feed.unavailable")}</Text>
      </Card>
    </View>
  );
}

export function CommunityFeedErrorState() {
  const { t } = useAppTranslation();
  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <Card style={{ alignItems: "center", gap: 6, padding: 18 }}>
        <Feather name="cloud-off" size={20} color={colors.muted} />
        <Text style={[typography.cardTitle, { color: colors.ink, fontSize: 15, textAlign: "center" }]}>{t("community.feed.unavailable")}</Text>
        <Text style={[typography.caption, { color: colors.muted, maxWidth: 260, textAlign: "center" }]}>
          {t("community.feed.loadError")}
        </Text>
      </Card>
    </View>
  );
}

export function CommunityActivityDivider({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 4 }}>
      <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
      <Text style={[typography.caption, { color: colors.muted }]}>{label}</Text>
      <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
    </View>
  );
}

export function CommunityEarlierActivityAction({ loading = false, onPress }: { loading?: boolean; onPress: () => void | Promise<void> }) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityLabel={t("community.feed.viewMoreEarlier")}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={{ alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 }}
    >
      <Text style={[typography.label, { color: colors.olive }]}>{t(loading ? "community.feed.loadingEarlier" : "common.viewMore")}</Text>
      {loading ? <ActivityIndicator color={colors.olive} size="small" /> : <Feather name="chevron-down" size={16} color={colors.olive} />}
    </Pressable>
  );
}
