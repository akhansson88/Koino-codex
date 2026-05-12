import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { colors } from "@/ui/theme";

const MAX_JOURNAL_IMAGES = 6;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function JournalImages({
  images,
  onRemove,
}: {
  images?: string[];
  onRemove?: (index: number) => void;
}) {
  if (!images?.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {images.map((image, index) => (
        <View
          key={`${index}-${image.slice(0, 24)}`}
          style={{
            backgroundColor: colors.input,
            borderColor: colors.line,
            borderRadius: 14,
            borderWidth: 1,
            height: images.length === 1 ? 190 : 132,
            overflow: "hidden",
            width: images.length === 1 ? 260 : 132,
          }}
        >
          <Image source={{ uri: image }} style={{ height: "100%", width: "100%" }} />
          {onRemove ? (
            <Pressable
              accessibilityLabel={`Remove journal image ${index + 1}`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onRemove(index)}
              style={{
                alignItems: "center",
                backgroundColor: "rgba(36,38,43,0.78)",
                borderRadius: 999,
                height: 26,
                justifyContent: "center",
                position: "absolute",
                right: 6,
                top: 6,
                width: 26,
              }}
            >
              <Feather name="x" size={15} color={colors.paper} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const entries = useMemo(
    () =>
      state.journalEntries
        .filter((entry) => entry.userId === state.currentUserId)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [state.currentUserId, state.journalEntries],
  );
  const editingEntry = entries.find((entry) => entry.id === editingId);
  const canSave = body.trim().length > 0 || images.length > 0;

  async function pickImages() {
    const remainingSlots = MAX_JOURNAL_IMAGES - images.length;
    if (remainingSlots <= 0) {
      Alert.alert("Image limit reached", `You can add up to ${MAX_JOURNAL_IMAGES} images to a journal entry.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photos permission needed", "Allow photo access to add images to your journal entry.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      base64: true,
      mediaTypes: ["images"],
      orderedSelection: true,
      quality: 0.55,
      selectionLimit: remainingSlots,
    });

    if (result.canceled) return;

    const selectedImages = result.assets
      .map((asset) => (asset.base64 ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}` : asset.uri))
      .filter(Boolean)
      .slice(0, remainingSlots);

    setImages([...images, ...selectedImages].slice(0, MAX_JOURNAL_IMAGES));
  }

  function resetComposer() {
    setEditingId(undefined);
    setBody("");
    setImages([]);
  }

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card tone="moss">
          <SectionTitle>Private Journal</SectionTitle>
          <Body muted>Only you can see this space. Private check-ins are saved here automatically.</Body>
        </Card>

        <Card>
          <SectionTitle>{editingEntry ? "Edit entry" : "New entry"}</SectionTitle>
          <View style={{ position: "relative" }}>
            <Field
              multiline
              value={body}
              onChangeText={setBody}
              placeholder="Write what you want to keep with God, not with the group."
              style={{ paddingBottom: 52 }}
            />
            <Pressable
              accessibilityLabel="Add images"
              accessibilityRole="button"
              hitSlop={10}
              onPress={pickImages}
              style={{ alignItems: "center", bottom: 12, height: 36, justifyContent: "center", left: 12, position: "absolute", width: 36 }}
            >
              <Feather name="image" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <JournalImages
            images={images}
            onRemove={(index) => setImages(images.filter((_, imageIndex) => imageIndex !== index))}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <PillButton
              disabled={!canSave}
              onPress={() => {
                if (editingEntry) {
                  dispatch({ type: "updateJournalEntry", id: editingEntry.id, body, images });
                } else {
                  dispatch({ type: "createJournalEntry", body, images });
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
                      setImages(entry.images ?? []);
                    }}
                    style={{ padding: 8 }}
                  >
                    <Text style={{ color: colors.olive, fontWeight: "900" }}>Edit</Text>
                  </Pressable>
                </View>
                <Body>{entry.body}</Body>
                <JournalImages images={entry.images} />
                <Pressable
                  onPress={() =>
                    Alert.alert("Delete entry?", "This private journal entry will be removed from Firebase.", [
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
