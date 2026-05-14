import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { Body, Card, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { confirmAction } from "@/ui/confirm";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
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
            borderRadius: 8,
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
        backgroundColor: colors.mossSurface,
        borderColor: colors.moss,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Feather name={iconName} size={14} color={colors.moss} />
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>{label}</Text>
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
        backgroundColor: selected ? colors.accentSubtle : colors.paper,
        borderColor: selected ? colors.moss : colors.line,
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
      <Feather name="heart" size={20} color={selected ? colors.moss : colors.ink} />
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
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
          <SectionTitle>Private journal</SectionTitle>
          <Body muted>Only you can see this space. Private check-ins are kept here automatically.</Body>
        </Card>

        <Card>
          <SectionTitle>{editingEntry ? "Edit entry" : "Write privately"}</SectionTitle>
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
                      setImages(entry.images ?? []);
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
                <JournalImages images={entry.images} />
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
                      message: "This private journal entry will be removed.",
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
