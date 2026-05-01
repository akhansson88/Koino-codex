import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { colors } from "@/ui/theme";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const entries = useMemo(
    () =>
      state.journalEntries
        .filter((entry) => entry.userId === state.currentUserId)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [state.currentUserId, state.journalEntries],
  );
  const editingEntry = entries.find((entry) => entry.id === editingId);

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card tone="moss">
          <SectionTitle>Private Journal</SectionTitle>
          <Body muted>Only you can see this space. Private check-ins are saved here automatically.</Body>
        </Card>

        <Card>
          <SectionTitle>{editingEntry ? "Edit entry" : "New entry"}</SectionTitle>
          <Field
            multiline
            value={body}
            onChangeText={setBody}
            placeholder="Write what you want to keep with God, not with the group."
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <PillButton
              disabled={!body.trim()}
              onPress={() => {
                if (editingEntry) {
                  dispatch({ type: "updateJournalEntry", id: editingEntry.id, body });
                  setEditingId(undefined);
                } else {
                  dispatch({ type: "createJournalEntry", body });
                }
                setBody("");
              }}
            >
              {editingEntry ? "Save changes" : "Save privately"}
            </PillButton>
            {editingEntry ? (
              <PillButton
                variant="ghost"
                onPress={() => {
                  setEditingId(undefined);
                  setBody("");
                }}
              >
                Cancel
              </PillButton>
            ) : null}
          </View>
        </Card>

        <View style={{ gap: 12 }}>
          <SectionTitle>Your entries</SectionTitle>
          {entries.length === 0 ? (
            <Card>
              <Body muted>No private entries yet. The journal is here for the days you do not want to share.</Body>
            </Card>
          ) : (
            entries.map((entry) => (
              <Card key={entry.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text selectable style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>
                      {formatDate(entry.createdAt)}
                    </Text>
                    <Body muted>
                      {entry.source === "private_check_in" ? "Private check-in" : "Manual entry"}
                      {entry.mood ? ` · Mood ${entry.mood}` : ""}
                    </Body>
                  </View>
                  <Pressable
                    onPress={() => {
                      setEditingId(entry.id);
                      setBody(entry.body);
                    }}
                    style={{ padding: 8 }}
                  >
                    <Text style={{ color: colors.olive, fontWeight: "900" }}>Edit</Text>
                  </Pressable>
                </View>
                <Body>{entry.body}</Body>
                <Pressable
                  onPress={() =>
                    Alert.alert("Delete entry?", "This private journal entry will be removed from this device.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => dispatch({ type: "deleteJournalEntry", id: entry.id }) },
                    ])
                  }
                  style={{ alignSelf: "flex-start", paddingVertical: 8 }}
                >
                  <Text style={{ color: colors.clay, fontWeight: "900" }}>Delete</Text>
                </Pressable>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
