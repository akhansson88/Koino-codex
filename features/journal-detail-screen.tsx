import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { actionLabels, entryKindLabel } from "@/state/product";
import type { EntryKind } from "@/state/types";
import { AppScreen, Avatar, BodyText, Card, IconButton, PrimaryButton, RoomImage, SectionHeading, VerseList } from "@/ui/app-components";
import { LinkPreview } from "@/ui/link-preview";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { colors } from "@/ui/theme";

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

export function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routeId = routeParam(id);
  const { state, dispatch } = useKoino();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const entry = useMemo(() => {
    if (!routeId) return undefined;
    const privateEntry = state.journalEntries.find((item) => item.id === routeId && item.userId === state.currentUserId);
    if (privateEntry) return { ...privateEntry, displaySource: privateEntry.source === "private_check_in" ? "Check-in" : "Journal" };
    const sharedCheckIn = state.checkIns.find((item) => item.id === routeId && item.userId === state.currentUserId && item.groupId === state.currentGroupId);
    return sharedCheckIn
      ? {
          id: sharedCheckIn.id,
          userId: sharedCheckIn.userId,
          body: sharedCheckIn.reflectionText || "Shared check-in",
          source: "manual" as const,
          entryKind: "reflection" as EntryKind,
          mood: sharedCheckIn.mood,
          verse: sharedCheckIn.verse,
          verses: sharedCheckIn.verses,
          createdAt: sharedCheckIn.createdAt,
          updatedAt: sharedCheckIn.createdAt,
          displaySource: "Shared check-in",
        }
      : undefined;
  }, [routeId, state.checkIns, state.currentGroupId, state.currentUserId, state.journalEntries]);

  if (!entry) {
    return (
      <AppScreen>
        <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => router.back()} />
        <Card>
          <BodyText muted>This journal entry is no longer available.</BodyText>
        </Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => router.back()} />
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Feather name={entry.displaySource === "Shared check-in" ? "check-circle" : "book-open"} size={15} color={colors.gold} />
          <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{entry.displaySource}</Text>
        </View>
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <Avatar image={user?.image} name={user?.name ?? "K"} size={48} tone="green" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{user?.name ?? "You"}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{formatDate(entry.createdAt)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 25, fontWeight: "900", lineHeight: 31 }}>{entry.title || entryKindLabel(entry.entryKind)}</Text>
        <BodyText style={{ fontSize: 17, lineHeight: 25 }}>{entry.body}</BodyText>
        <LinkPreview text={entry.body} />
      </View>
      <VerseList verse={entry.verse} verses={entry.verses} />
      <View style={{ gap: 8 }}>
        <SectionHeading>Shared with</SectionHeading>
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
          <RoomImage image={entry.displaySource === "Shared check-in" ? group?.image : undefined} name={entry.displaySource === "Shared check-in" ? group?.name : "Private journal"} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
              {entry.displaySource === "Shared check-in" ? group?.name ?? "Room" : "Private journal"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
              {entry.displaySource === "Shared check-in" ? "Shared with your room" : "Only you can see this"}
            </Text>
          </View>
        </Card>
      </View>
      <PrimaryButton icon="heart" onPress={() => setPrayerTarget({ targetType: "journal_entry", targetId: entry.id, body: entry.body })}>
        {actionLabels[entry.entryKind ?? "reflection"]}
      </PrimaryButton>
      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
          if (prayerTarget) {
            dispatch({ type: "finishPrayer", targetType: prayerTarget.targetType, targetId: prayerTarget.targetId, status, startedAt });
          }
          setPrayerTarget(undefined);
        }}
      />
    </AppScreen>
  );
}
