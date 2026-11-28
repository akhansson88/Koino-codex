import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { eventKindKey, formatEventDay, formatEventTimeRange, formatEventDateShort, formatEventTime } from "@/state/events";
import type { EventRsvpStatus, GroupEvent } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { localeFor } from "@/ui/localization";

export function EventCard({
  event,
  onPress,
  rsvpStatus,
  compact = false,
}: {
  compact?: boolean;
  event: GroupEvent;
  onPress: () => void;
  rsvpStatus?: EventRsvpStatus;
}) {
  const { t, language } = useAppTranslation();
  const date = new Date(event.startAt);
  const weekday = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(localeFor(language), { weekday: "short" }).format(date).replace(".", "");
  const day = Number.isNaN(date.getTime()) ? "" : String(date.getDate());
  const month = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(localeFor(language), { month: "short" }).format(date).replace(".", "");

  return (
    <Pressable
      accessibilityHint={t("events.card.openHint")}
      accessibilityLabel={`${event.title}. ${formatEventDay(event.startAt, language)} ${formatEventTimeRange(event, language)}. ${t(eventKindKey(event.kind))}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <View
        style={{
          backgroundColor: shadcn.card,
          borderColor: shadcn.border,
          borderRadius: radius.xl,
          borderWidth: 1,
          flexDirection: "row",
          gap: 13,
          padding: compact ? 12 : 14,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: shadcn.brandSoft,
            borderRadius: radius.md,
            height: compact ? 50 : 56,
            justifyContent: "center",
            width: compact ? 50 : 56,
          }}
        >
          <Text style={[typography.caption, { color: shadcn.brand, textTransform: "uppercase" }]}>{weekday}</Text>
          <Text style={[typography.title, { color: colors.ink, fontSize: compact ? 19 : 21, lineHeight: 24 }]}>{day}</Text>
          <Text style={[typography.caption, { color: colors.muted, textTransform: "uppercase" }]}>{month}</Text>
        </View>
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <Text numberOfLines={2} style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{event.title}</Text>
            {rsvpStatus ? <RsvpPill status={rsvpStatus} /> : null}
          </View>
          <Text style={[typography.caption, { color: colors.muted }]}>
            {formatEventTimeRange(event, language)} · {t(eventKindKey(event.kind))}
          </Text>
          {event.location ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Feather color={colors.muted} name="map-pin" size={12} />
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, flex: 1 }]}>{event.location}</Text>
            </View>
          ) : null}
          {event.meetingUrl && !event.location ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Feather color={colors.muted} name="video" size={12} />
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, flex: 1 }]}>{t("events.card.online")}</Text>
            </View>
          ) : null}
        </View>
        <Feather color={colors.disabledText} name="chevron-right" size={17} />
      </View>
    </Pressable>
  );
}

export function RsvpPill({ status }: { status: EventRsvpStatus }) {
  const { t } = useAppTranslation();
  const tone = status === "going"
    ? { background: shadcn.successSoft, text: shadcn.success }
    : status === "maybe"
      ? { background: shadcn.warningSoft, text: shadcn.warning }
      : { background: shadcn.muted, text: shadcn.mutedForeground };
  return (
    <View style={{ backgroundColor: tone.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={[typography.caption, { color: tone.text }]}>{t(`events.rsvp.${status}`)}</Text>
    </View>
  );
}

export function EventDateHeading({ startAt }: { startAt: string }) {
  const { language } = useAppTranslation();
  return (
    <Text style={[typography.sectionLabel, { color: colors.muted }]}>
      {formatEventDateShort(startAt, language)} · {formatEventTime(startAt, language)}
    </Text>
  );
}
