import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

import { EntryVisibility, composerPostTypes, postTypes, visibility } from "@/state/product";
import type { BibleVerse, EntryKind, GroupImage } from "@/state/types";
import { AppScreen, Card, FilterChips, IconButton, PrimaryButton, RoomImage, SectionHeading, TextInputField } from "@/ui/app-components";
import { BibleVerseField } from "@/ui/bible-verse-picker";
import { colors } from "@/ui/theme";

const MAX_BODY_LENGTH = 500;

function primaryActionLabel(context: "journal" | "today" | "room", entryVisibility: EntryVisibility, editing: boolean, kind: EntryKind) {
  if (editing) return "Update entry";
  if (context === "room" || entryVisibility === visibility.room) {
    if (kind === "prayer_request") return "Share prayer";
    if (kind === "reflection") return "Share reflection";
    return "Share";
  }
  if (context === "journal" && kind === "prayer_request") return "Save prayer";
  if (context === "journal" && kind === "praise") return "Save answered prayer";
  if (context === "journal" && kind === "scripture") return "Save Scripture note";
  if (context === "journal") return "Save reflection";
  return "Save entry";
}

function titleFor(context: "journal" | "today" | "room", editing: boolean) {
  if (editing) return "Edit your entry";
  if (context === "room") return "Share with your community";
  return "Write your entry";
}

export function SharedComposer({
  body,
  context,
  editing = false,
  entryVisibility,
  kind,
  onBody,
  onClose,
  onKind,
  onSubmit,
  onTitle,
  onVerses,
  onVisibility,
  roomImage,
  roomName,
  title,
  verses,
  visible,
}: {
  body: string;
  context: "journal" | "today" | "room";
  editing?: boolean;
  entryVisibility: EntryVisibility;
  kind: EntryKind;
  onBody: (value: string) => void;
  onClose: () => void;
  onKind: (kind: EntryKind) => void;
  onSubmit: () => void;
  onTitle: (value: string) => void;
  onVerses: (verses: BibleVerse[]) => void;
  onVisibility: (value: EntryVisibility) => void;
  roomImage?: GroupImage;
  roomName?: string;
  title: string;
  verses: BibleVerse[];
  visible: boolean;
}) {
  const showVisibility = context !== "room";
  const actionLabel = primaryActionLabel(context, entryVisibility, editing, kind);
  const activeRoomName = roomName ?? "Community";
  const typeOptions = context === "journal" ? postTypes : composerPostTypes;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel="Close composer" icon="arrow-left" onPress={onClose} />
          <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>{actionLabel.replace(" entry", "")}</Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900" }}>{titleFor(context, editing)}</Text>
          <FilterChips
            value={kind}
            onChange={onKind}
            options={typeOptions.map((type) => ({ label: type.composerLabel, value: type.value }))}
          />
        </View>

        <TextInputField
          value={title}
          onChangeText={onTitle}
          onSubmitEditing={onSubmit}
          placeholder={kind === "prayer_request" ? "Prayer title (optional)" : kind === "praise" ? "Answered prayer title" : kind === "scripture" ? "Scripture note title" : "Title (optional)"}
          returnKeyType="send"
        />

        <View style={{ gap: 8 }}>
          <TextInputField
            multiline
            maxLength={MAX_BODY_LENGTH}
            value={body}
            onChangeText={(value) => onBody(value.slice(0, MAX_BODY_LENGTH))}
            onSubmitEditing={onSubmit}
            placeholder={kind === "prayer_request" ? "Write your prayer..." : kind === "praise" ? "How did God answer?" : kind === "scripture" ? "What is this Scripture stirring in you?" : "Share, reflect, or write one honest sentence..."}
            returnKeyType="send"
            style={{ minHeight: 170 }}
            submitBehavior="submit"
          />
          <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>
            {body.length}/{MAX_BODY_LENGTH}
          </Text>
        </View>

        <BibleVerseField verses={verses} onChange={onVerses} />

        <View style={{ gap: 8 }}>
          <SectionHeading>Share with</SectionHeading>
          {showVisibility ? (
            <FilterChips
              value={entryVisibility}
              onChange={onVisibility}
              options={[
                { label: "Private", value: visibility.private },
                { label: "Share with community", value: visibility.room },
              ]}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!showVisibility}
            onPress={() => onVisibility(entryVisibility === visibility.private ? visibility.room : visibility.private)}
          >
            <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
              <RoomImage image={entryVisibility === visibility.room ? roomImage : undefined} name={entryVisibility === visibility.room ? activeRoomName : "Private journal"} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                  {entryVisibility === visibility.room ? activeRoomName : "Private journal"}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {entryVisibility === visibility.room ? "Shared with your community" : "Only you can see this"}
                </Text>
              </View>
              {showVisibility ? <Feather name="chevron-down" size={18} color={colors.muted} /> : null}
            </Card>
          </Pressable>
        </View>

        <PrimaryButton disabled={!body.trim()} icon="send" onPress={onSubmit}>
          {actionLabel}
        </PrimaryButton>
      </AppScreen>
    </Modal>
  );
}
