import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { confirmAction } from "@/ui/confirm";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { brandPalette, colors } from "@/ui/theme";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function JournalTypeBadge({
  iconName,
  label,
}: {
  iconName: ComponentProps<typeof Feather>["name"];
  label: string;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: colors.moss,
        borderColor: colors.moss,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Feather name={iconName} size={14} color={brandPalette.deepNavy} />
      <Text style={{ color: brandPalette.deepNavy, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function JournalActionButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.gold : colors.paper,
        borderColor: selected ? colors.gold : colors.line,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 54,
        minWidth: 132,
        paddingHorizontal: 18,
        paddingVertical: 13,
      }}
    >
      <Feather name="heart" size={20} color={selected ? brandPalette.deepNavy : colors.ink} />
      <Text style={{ color: selected ? brandPalette.deepNavy : colors.ink, fontSize: 15, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const entries = useMemo(
    () =>
      state.journalEntries
        .filter((entry) => entry.userId === state.currentUserId)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [state.currentUserId, state.journalEntries],
  );
  const editingEntry = entries.find((entry) => entry.id === editingId);
  const canSave = body.trim().length > 0;

  function resetComposer() {
    setEditingId(undefined);
    setBody("");
  }

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card tone="moss">
          <SectionTitle>Private journal</SectionTitle>
          <Body muted>Only you can see this space. Private check-ins are kept here automatically.</Body>
        </Card>

        <Card>
          <SectionTitle>{editingEntry ? "Edit entry" : "Write privately"}</SectionTitle>
          <Field
            multiline
            value={body}
            onChangeText={setBody}
            placeholder="Write what you want to keep with God, not with the group."
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <PillButton
              disabled={!canSave}
              onPress={() => {
                if (editingEntry) {
                  dispatch({ type: "updateJournalEntry", id: editingEntry.id, body });
                } else {
                  dispatch({ type: "createJournalEntry", body });
                }
                resetComposer();
              }}
            >
              {editingEntry ? "Save changes" : "Save privately"}
            </PillButton>
            {editingEntry ? (
              <PillButton
                variant="ghost"
                onPress={resetComposer}
              >
                Cancel
              </PillButton>
            ) : null}
          </View>
        </Card>

        <View style={{ gap: 12 }}>
          <SectionTitle>Kept with God</SectionTitle>
          {state.authError ? (
            <Card>
              <Body muted>{state.authError}</Body>
            </Card>
          ) : null}
          {entries.length === 0 ? (
            <Card>
              <Body muted>No private entries yet. The journal is here for the days you do not want to share.</Body>
            </Card>
          ) : (
            entries.map((entry) => (
              <Card key={entry.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text selectable style={{ color: colors.ink, fontSize: 17, fontWeight: "700" }}>
                      {formatDate(entry.createdAt)}
                    </Text>
                    <Body muted>
                      Private journal
                      {entry.source === "private_check_in" ? " - from check-in" : ""}
                    </Body>
                  </View>
                  <Pressable
                    onPress={() => {
                      setEditingId(entry.id);
                      setBody(entry.body);
                    }}
                    style={{ padding: 8 }}
                  >
                    <Text style={{ color: colors.olive, fontWeight: "700" }}>Edit</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <JournalTypeBadge iconName="lock" label="Private journal" />
                  {entry.source === "private_check_in" ? <JournalTypeBadge iconName="check-circle" label="Check-in" /> : null}
                </View>
                <Body>{entry.body}</Body>
                <JournalActionButton
                  label={
                    state.prayerSessions.some(
                      (session) => session.targetType === "journal_entry" && session.targetId === entry.id && session.status === "completed",
                    )
                      ? "Prayed"
                      : "Pray"
                  }
                  selected={state.prayerSessions.some(
                    (session) => session.targetType === "journal_entry" && session.targetId === entry.id && session.status === "completed",
                  )}
                  onPress={() => setPrayerTarget({ targetType: "journal_entry", targetId: entry.id, body: entry.body })}
                />
                <Pressable
                  onPress={() =>
                    confirmAction({
                      title: "Delete entry?",
                      message:
                        entry.source === "private_check_in"
                          ? "This private journal entry and its check-in will be removed."
                          : "This private journal entry will be removed.",
                      confirmText: "Delete",
                      destructive: true,
                      onConfirm: () => dispatch({ type: "deleteJournalEntry", id: entry.id }),
                    })
                  }
                  style={{ alignSelf: "flex-start", paddingVertical: 8 }}
                >
                  <Text style={{ color: colors.clay, fontWeight: "700" }}>Delete</Text>
                </Pressable>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
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
    </Screen>
  );
}
