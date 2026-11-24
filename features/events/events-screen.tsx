import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { EventCard } from "@/features/events/event-card";
import { EventFormScreen } from "@/features/events/event-form";
import { addMonths, dayKeyFor, monthGrid, monthLabel, weekdayLabels } from "@/features/events/calendar";
import { eventIsUpcoming, eventRsvpFor, eventsOnDay, localEventDayKey, sortGroupEvents } from "@/state/events";
import type { EventDraft } from "@/state/events";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { GroupEvent } from "@/state/types";
import { AppScreen, BodyText, Card, IconButton, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const eventScreenFields = ["currentGroupId", "currentUserId", "eventRsvps", "groupEvents", "groupEventsReady", "groups"] as const;

export function EventsScreen() {
  const state = useKoinoFields(eventScreenFields);
  const { dispatch } = useKoinoActions();
  const { t, language } = useAppTranslation();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12, 0, 0, 0));
  const [selectedDay, setSelectedDay] = useState(() => dayKeyFor(new Date()));
  const [formVisible, setFormVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const events = useMemo(() => sortGroupEvents(state.groupEvents.filter((event) => event.groupId === state.currentGroupId)), [state.currentGroupId, state.groupEvents]);
  const upcoming = useMemo(() => events.filter((event) => eventIsUpcoming(event)).slice(0, 24), [events]);
  const selectedEvents = useMemo(() => eventsOnDay(events, selectedDay), [events, selectedDay]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, GroupEvent[]>();
    for (const event of events) {
      const key = dayKeyFor(new Date(event.startAt));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);
  const todayKey = dayKeyFor(new Date());
  const grid = useMemo(() => monthGrid(month.getFullYear(), month.getMonth()), [month]);
  const weekdays = useMemo(() => weekdayLabels(language), [language]);

  useEffect(() => {
    if (!group) return;
    setFormVisible(false);
  }, [group]);

  async function createEvent(draft: EventDraft) {
    if (!group || saving) return;
    setSaving(true);
    try {
      await dispatch({ type: "createEvent", groupId: group.id, draft });
      setFormVisible(false);
      setSelectedDay(localEventDayKey(draft.startAt));
      const start = new Date(draft.startAt);
      setMonth(new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0));
    } finally {
      setSaving(false);
    }
  }

  function openDay(dayKey: string) {
    setSelectedDay(dayKey);
    const date = new Date(`${dayKey}T12:00:00`);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0));
    }
  }

  return (
    <>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={() => router.back()} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t("events.title")}</Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
              {group?.name ?? t("events.noGroupTitle")}
            </Text>
          </View>
          <IconButton accessibilityLabel={t("events.new")} icon="plus" onPress={() => setFormVisible(true)} />
        </View>

        {!group ? (
          <Card style={{ gap: 12 }}>
            <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("events.noGroupTitle")}</Text>
            <BodyText muted>{t("events.noGroupBody")}</BodyText>
            <PrimaryButton icon="users" onPress={() => router.navigate("/(tabs)/community" as never)}>
              {t("events.openCommunity")}
            </PrimaryButton>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10, padding: 14 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                <Pressable
                  accessibilityLabel={t("events.calendar.previousMonth")}
                  accessibilityRole="button"
                  onPress={() => setMonth((current) => addMonths(current, -1))}
                  style={styles.monthButton}
                >
                  <Feather color={colors.ink} name="chevron-left" size={18} />
                </Pressable>
                <Text style={[typography.cardTitle, { color: colors.ink, flex: 1, textAlign: "center", textTransform: "capitalize" }]}>
                  {monthLabel(month, language)}
                </Text>
                <Pressable
                  accessibilityLabel={t("events.calendar.nextMonth")}
                  accessibilityRole="button"
                  onPress={() => setMonth((current) => addMonths(current, 1))}
                  style={styles.monthButton}
                >
                  <Feather color={colors.ink} name="chevron-right" size={18} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row" }}>
                {weekdays.map((day) => (
                  <View key={day} style={{ alignItems: "center", flex: 1, paddingVertical: 3 }}>
                    <Text style={[typography.caption, { color: colors.muted, fontSize: 10, textTransform: "uppercase" }]}>{day}</Text>
                  </View>
                ))}
              </View>
              {Array.from({ length: 6 }, (_, week) => (
                <View key={week} style={{ flexDirection: "row" }}>
                  {grid.slice(week * 7, week * 7 + 7).map((cell) => {
                    const active = cell.dayKey === selectedDay;
                    const isToday = cell.dayKey === todayKey;
                    const dayEvents = eventsByDay.get(cell.dayKey) ?? [];
                    return (
                      <Pressable
                        accessibilityLabel={`${cell.date.getDate()}. ${dayEvents.length ? `${dayEvents.length} ${t("events.calendar.eventCount")}` : t("events.calendar.noEvents")}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        key={cell.dayKey}
                        onPress={() => openDay(cell.dayKey)}
                        style={{ alignItems: "center", flex: 1, height: 42, justifyContent: "center" }}
                      >
                        <View
                          style={{
                            alignItems: "center",
                            backgroundColor: active ? shadcn.primary : "transparent",
                            borderColor: isToday && !active ? shadcn.brand : "transparent",
                            borderRadius: 999,
                            borderWidth: 1,
                            height: 32,
                            justifyContent: "center",
                            width: 32,
                          }}
                        >
                          <Text
                            style={[typography.caption, {
                              color: active ? shadcn.primaryForeground : cell.inMonth ? colors.ink : colors.disabledText,
                              fontSize: 13,
                            }]}
                          >
                            {cell.date.getDate()}
                          </Text>
                        </View>
                        <View style={{ height: 4, marginTop: 1 }}>
                          {dayEvents.length ? (
                            <View style={{ backgroundColor: active ? shadcn.brand : colors.gold, borderRadius: 2, height: 4, width: 4 }} />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </Card>

            <View style={{ gap: 10 }}>
              <Text style={[typography.sectionLabel, { color: colors.muted }]}>
                {new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en", { weekday: "long", month: "long", day: "numeric" })
                  .format(new Date(`${selectedDay}T12:00:00`))}
              </Text>
              {selectedEvents.length ? selectedEvents.map((event) => (
                <EventCard
                  compact
                  event={event}
                  key={event.id}
                  onPress={() => router.push({ pathname: "/event-details", params: { eventId: event.id } } as never)}
                  rsvpStatus={eventRsvpFor(state.eventRsvps, event.id, state.currentUserId)?.status}
                />
              )) : (
                <Card style={{ gap: 8, padding: 14 }}>
                  <BodyText muted>{t("events.calendar.emptyDay")}</BodyText>
                  <PrimaryButton icon="plus" onPress={() => setFormVisible(true)}>{t("events.new")}</PrimaryButton>
                </Card>
              )}
            </View>

            <View style={{ gap: 10 }}>
              <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("events.upcoming")}</Text>
              {!state.groupEventsReady ? (
                <BodyText muted>{t("events.loading")}</BodyText>
              ) : upcoming.length ? upcoming.map((event) => (
                <EventCard
                  event={event}
                  key={event.id}
                  onPress={() => router.push({ pathname: "/event-details", params: { eventId: event.id } } as never)}
                  rsvpStatus={eventRsvpFor(state.eventRsvps, event.id, state.currentUserId)?.status}
                />
              )) : (
                <Card style={{ gap: 6 }}>
                  <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("events.emptyTitle")}</Text>
                  <BodyText muted>{t("events.emptyBody")}</BodyText>
                </Card>
              )}
            </View>

            {group.migrationPending ? <BodyText muted>{t("events.migration")}</BodyText> : (
              <PrimaryButton icon="calendar" onPress={() => setFormVisible(true)}>{t("events.new")}</PrimaryButton>
            )}
          </>
        )}
      </AppScreen>

      {group ? (
        <EventFormScreen
          event={undefined}
          groupName={group.name}
          language={language}
          onClose={() => setFormVisible(false)}
          onSubmit={createEvent}
          saving={saving}
          visible={formVisible}
        />
      ) : null}
    </>
  );
}

const styles = {
  monthButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  } as const,
};
