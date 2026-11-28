import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, Share, Text, View } from "react-native";

import { EventFormScreen } from "@/features/events/event-form";
import {
  eventAttendees,
  eventDurationMinutes,
  eventIsPast,
  eventKindKey,
  eventRsvpCounts,
  eventRsvpFor,
  eventShareText,
  formatDuration,
  formatEventDay,
  formatEventTimeRange,
  googleCalendarUrl,
} from "@/state/events";
import type { EventDraft } from "@/state/events";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { EventRsvpStatus, GroupEvent } from "@/state/types";
import { AppScreen, Avatar, BodyText, Card, IconButton, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { openLinkInApp } from "@/ui/open-link";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const detailFields = ["currentGroupId", "currentUserId", "eventRsvps", "groupEvents", "groupEventsReady", "groups", "users"] as const;

type CalendarModule = typeof import("expo-calendar");

function calendarModule(): CalendarModule | null {
  try {
    // The dev client on an older binary does not contain the native module yet.
    return require("expo-calendar") as CalendarModule;
  } catch {
    return null;
  }
}

async function addToDeviceCalendar(event: GroupEvent): Promise<"added" | "permission" | "unavailable" | "failed"> {
  const Calendar = calendarModule();
  if (!Calendar) return "unavailable";
  try {
    const permission = await Calendar.requestCalendarPermissionsAsync();
    if (permission.status !== "granted") return "permission";
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendar = calendars.find((item) => item.allowsModifications);
    if (!calendar) return "unavailable";
    await Calendar.createEventAsync(calendar.id, {
      title: event.title,
      startDate: new Date(event.startAt),
      endDate: new Date(event.endAt),
      ...(event.location ? { location: event.location } : {}),
      ...(event.meetingUrl ? { url: event.meetingUrl } : {}),
      notes: event.description ?? "",
      alarms: event.reminderMinutes.includes(15)
        ? [{ relativeOffset: -15 }]
        : event.reminderMinutes.includes(60)
          ? [{ relativeOffset: -60 }]
          : event.reminderMinutes.includes(1440)
            ? [{ relativeOffset: -1440 }]
            : [],
    });
    return "added";
  } catch {
    return "failed";
  }
}

export function EventDetailScreen() {
  const params = useLocalSearchParams<{ eventId?: string }>();
  const state = useKoinoFields(detailFields);
  const { dispatch } = useKoinoActions();
  const { t, language } = useAppTranslation();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState("");

  const groupId = state.currentGroupId;
  const group = state.groups.find((item) => item.id === groupId);
  const event = useMemo(
    () => state.groupEvents.find((item) => item.id === params.eventId && item.groupId === groupId),
    [groupId, params.eventId, state.groupEvents],
  );
  const rsvp = event ? eventRsvpFor(state.eventRsvps, event.id, state.currentUserId) : undefined;
  const counts = event ? eventRsvpCounts(state.eventRsvps, event.id) : { going: 0, maybe: 0, declined: 0 };
  const attendees = useMemo(() => {
    if (!event) return [];
    const byId = new Map(state.users.map((user) => [user.id, user]));
    const order: Record<EventRsvpStatus, number> = { going: 0, maybe: 1, declined: 2 };
    return eventAttendees(state.eventRsvps, event.id)
      .filter((item) => item.status === "going" || item.status === "maybe")
      .map((item) => ({ rsvp: item, user: byId.get(item.userId) }))
      .sort((left, right) => order[left.rsvp.status] - order[right.rsvp.status] || (left.user?.name ?? "").localeCompare(right.user?.name ?? ""));
  }, [event, state.eventRsvps, state.users]);

  if (!event || !group) {
    return (
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={() => router.back()} />
          <Text style={[typography.title, { color: colors.ink, flex: 1 }]}>
            {event || state.groupEventsReady ? t("events.detail.notFound") : t("events.title")}
          </Text>
        </View>
        <BodyText muted>{event || state.groupEventsReady ? t("events.detail.notFoundBody") : t("events.loading")}</BodyText>
      </AppScreen>
    );
  }

  const isOwner = state.currentUserId === group.ownerId;
  const canEdit = state.currentUserId === event.userId;
  const canDelete = canEdit || isOwner;
  const past = eventIsPast(event);
  const organizer = state.users.find((user) => user.id === event.userId);
  const googleUrl = googleCalendarUrl(event);

  async function updateRsvp(status: EventRsvpStatus) {
    if (!groupId || !event) return;
    try {
      await dispatch({ type: "setEventRsvp", groupId, eventId: event.id, status });
    } catch {
      Alert.alert(t("events.detail.rsvpFailedTitle"), t("events.detail.rsvpFailedBody"));
    }
  }

  function confirmDelete() {
    if (!event || !canDelete || !groupId) return;
    Alert.alert(t("events.detail.delete.title"), t("events.detail.delete.body"), [
      { style: "cancel", text: t("common.cancel") },
      {
        style: "destructive",
        text: t("events.detail.delete.confirm"),
        onPress: () => {
          void dispatch({ type: "deleteEvent", groupId, id: event.id })
            .then(() => router.back())
            .catch(() => Alert.alert(t("events.detail.delete.failedTitle"), t("events.detail.delete.failedBody")));
        },
      },
    ]);
  }

  async function updateEvent(draft: EventDraft) {
    if (!groupId || !event) return;
    setSaving(true);
    try {
      await dispatch({ type: "updateEvent", groupId, id: event.id, draft });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function addToCalendar() {
    if (!event) return;
    setCalendarStatus("");
    const result = await addToDeviceCalendar(event);
    if (result === "added") setCalendarStatus(t("events.detail.deviceCalendarAdded"));
    else if (result === "permission") Alert.alert(t("events.detail.deviceCalendar"), t("events.detail.deviceCalendarDenied"));
    else if (result === "unavailable") Alert.alert(t("events.detail.deviceCalendar"), t("events.detail.deviceCalendarUnavailable"));
    else Alert.alert(t("events.detail.deviceCalendar"), t("events.detail.deviceCalendarFailed"));
  }

  return (
    <>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={() => router.back()} />
          <Text style={[typography.label, { color: colors.muted, flex: 1 }]}>{group.name}</Text>
          {canEdit ? <IconButton accessibilityLabel={t("events.detail.edit")} icon="edit-3" onPress={() => setEditing(true)} /> : null}
          {canDelete ? <IconButton accessibilityLabel={t("events.detail.delete.title")} icon="trash-2" onPress={confirmDelete} tone="danger" /> : null}
        </View>

        <View style={{ gap: 6 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <View style={{ backgroundColor: shadcn.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={[typography.caption, { color: shadcn.brand }]}>{t(eventKindKey(event.kind))}</Text>
            </View>
            {past ? (
              <View style={{ backgroundColor: shadcn.muted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={[typography.caption, { color: shadcn.mutedForeground }]}>{t("events.detail.ended")}</Text>
              </View>
            ) : null}
          </View>
          <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{event.title}</Text>
          <Text style={[typography.bodyMedium, { color: colors.muted }]}>
            {t("events.detail.organizer", { name: organizer?.name ?? t("common.someone") })}
          </Text>
        </View>

        <Card style={{ gap: 14 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <View style={styles.iconTile}>
              <Feather color={shadcn.brand} name="calendar" size={19} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.cardTitle, { color: colors.ink, textTransform: "capitalize" }]}>
                {formatEventDay(event.startAt, language)}
              </Text>
              <Text style={[typography.body, { color: colors.muted }]}>
                {formatEventTimeRange(event, language)} · {formatDuration(eventDurationMinutes(event), t)}
              </Text>
            </View>
          </View>
          {event.location ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View style={styles.iconTile}>
                <Feather color={shadcn.brand} name="map-pin" size={18} />
              </View>
              <Text style={[typography.body, { color: colors.ink, flex: 1 }]}>{event.location}</Text>
            </View>
          ) : null}
          {event.meetingUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void openLinkInApp(event.meetingUrl ?? "")}
              style={({ pressed }) => ({ alignItems: "center", flexDirection: "row", gap: 12, opacity: pressed ? 0.7 : 1 })}
            >
              <View style={styles.iconTile}>
                <Feather color={shadcn.brand} name="video" size={18} />
              </View>
              <Text numberOfLines={1} style={[typography.body, { color: shadcn.brand, flex: 1 }]}>{t("events.detail.joinOnline")}</Text>
              <Feather color={colors.disabledText} name="external-link" size={15} />
            </Pressable>
          ) : null}
        </Card>

        {event.description ? (
          <View style={{ gap: 7 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("events.detail.about")}</Text>
            <BodyText style={{ color: colors.ink }}>{event.description}</BodyText>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("events.detail.yourResponse")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["going", "maybe", "declined"] as const).map((status) => {
              const active = rsvp?.status === status;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={status}
                  onPress={() => void updateRsvp(status)}
                  style={{
                    alignItems: "center",
                    backgroundColor: active ? shadcn.primary : shadcn.card,
                    borderColor: active ? shadcn.primary : shadcn.border,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    flex: 1,
                    gap: 4,
                    minHeight: 64,
                    justifyContent: "center",
                    paddingHorizontal: 6,
                  }}
                >
                  <Feather
                    color={active ? shadcn.primaryForeground : colors.muted}
                    name={status === "going" ? "check" : status === "maybe" ? "help-circle" : "x"}
                    size={17}
                  />
                  <Text style={[typography.caption, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                    {t(`events.rsvp.${status}`)}
                  </Text>
                  <Text style={[typography.caption, { color: active ? shadcn.primaryForeground : colors.muted }]}>
                    {counts[status]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("events.detail.attending", { count: counts.going + counts.maybe })}</Text>
          {attendees.length ? (
            <Card style={{ gap: 0, padding: 14 }}>
              {attendees.map(({ rsvp: attendee, user }, index) => (
                <View key={attendee.userId} style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: 48 }}>
                  <Avatar image={user?.image} name={user?.name ?? "K"} size={34} tone="green" />
                  <Text numberOfLines={1} style={[typography.body, { color: colors.ink, flex: 1 }]}>
                    {user?.name ?? t("common.someone")}
                  </Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>{t(`events.rsvp.${attendee.status}`)}</Text>
                  {index < attendees.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </Card>
          ) : (
            <BodyText muted>{t("events.detail.noAttendees")}</BodyText>
          )}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("events.detail.addToCalendar")}</Text>
          <PrimaryButton icon="calendar" onPress={() => void openLinkInApp(googleUrl)}>
            {t("events.detail.googleCalendar")}
          </PrimaryButton>
          <SecondaryButton icon="smartphone" onPress={() => void addToCalendar()}>
            {t("events.detail.deviceCalendar")}
          </SecondaryButton>
          <SecondaryButton
            icon="share-2"
            onPress={() => {
              void Share.share({
                message: eventShareText(
                  event,
                  group.name,
                  formatEventDay(event.startAt, language),
                  formatEventTimeRange(event, language),
                ),
              }).catch(() => undefined);
            }}
          >
            {t("events.detail.share")}
          </SecondaryButton>
          {calendarStatus ? <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.moss }]}>{calendarStatus}</Text> : null}
        </View>
      </AppScreen>

      <EventFormScreen
        event={event}
        groupName={group.name}
        language={language}
        onClose={() => setEditing(false)}
        onSubmit={updateEvent}
        saving={saving}
        visible={editing}
      />
    </>
  );
}

const styles = {
  iconTile: {
    alignItems: "center",
    backgroundColor: shadcn.brandSoft,
    borderRadius: radius.md,
    height: 38,
    justifyContent: "center",
    width: 38,
  } as const,
  divider: {
    backgroundColor: colors.line,
    bottom: 0,
    height: 1,
    left: 44,
    position: "absolute",
    right: 0,
  } as const,
};
