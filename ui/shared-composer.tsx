import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Platform, Pressable, Text, View } from "react-native";

import { EntryVisibility, composerPostTypes, postTypes, visibility } from "@/state/product";
import type { BibleVerse, EntryKind, GroupImage } from "@/state/types";
import { AppScreen, Card, FilterChips, FullScreenModal, IconButton, PrimaryButton, RoomImage, SectionHeading, TextInputField } from "@/ui/app-components";
import { BibleVerseField } from "@/ui/bible-verse-picker";
import { useAppTranslation } from "@/ui/app-language";
import { colors } from "@/ui/theme";

const MAX_BODY_LENGTH = 500;

function primaryActionKey(context: "journal" | "today" | "room", entryVisibility: EntryVisibility, editing: boolean, kind: EntryKind) {
  if (editing) return "community.composer.action.updateEntry" as const;
  if (context === "room" || entryVisibility === visibility.room) {
    if (kind === "prayer_request") return "community.composer.action.sharePrayer" as const;
    if (kind === "reflection") return "community.composer.action.shareReflection" as const;
    if (kind === "praise") return "community.composer.action.sharePraise" as const;
    if (kind === "scripture") return "community.composer.action.shareScripture" as const;
    return "community.composer.action.share" as const;
  }
  if (context === "journal" && kind === "prayer_request") return "community.composer.action.savePrayer" as const;
  if (context === "journal" && kind === "praise") return "community.composer.action.saveAnsweredPrayer" as const;
  if (context === "journal" && kind === "scripture") return "community.composer.action.saveScriptureNote" as const;
  if (context === "journal") return "community.composer.action.saveReflection" as const;
  return "community.composer.action.saveEntry" as const;
}

function headerActionKey(context: "journal" | "today" | "room", entryVisibility: EntryVisibility, editing: boolean, kind: EntryKind) {
  if (editing) return "community.composer.action.updateShort" as const;
  const actionKey = primaryActionKey(context, entryVisibility, editing, kind);
  return actionKey === "community.composer.action.saveEntry" ? "community.composer.action.saveShort" as const : actionKey;
}

function titleKey(context: "journal" | "today" | "room", editing: boolean) {
  if (editing) return "community.composer.title.edit" as const;
  if (context === "room") return "community.composer.title.shareCommunity" as const;
  return "community.composer.title.write" as const;
}

const composerTypeKeys = {
  reflection: "community.composer.type.reflection",
  prayer_request: "community.composer.type.prayer",
  praise: "community.composer.type.praise",
  update: "community.composer.type.update",
  scripture: "community.composer.type.scripture",
} as const;

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
  const { t } = useAppTranslation();
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const isCommunityShare = context === "room";
  const showVisibility = context !== "room";
  const titleFreeCommunityKind = kind === "reflection" || kind === "praise" || kind === "scripture";
  const showTitle = !isCommunityShare || !titleFreeCommunityKind;
  const scriptureRequired = isCommunityShare && kind === "scripture";
  const canSubmit = scriptureRequired ? verses.length > 0 : Boolean(body.trim());
  const actionKey = primaryActionKey(context, entryVisibility, editing, kind);
  const actionLabel = t(actionKey);
  const activeRoomName = roomName ?? t("community.composer.communityFallback");
  const typeOptions = context === "journal" ? postTypes : composerPostTypes;

  useEffect(() => {
    setSubmissionAttempted(false);
  }, [kind, visible]);

  function changeKind(nextKind: EntryKind) {
    if (nextKind === kind) return;
    if (isCommunityShare) {
      onTitle("");
      onVerses([]);
    }
    onKind(nextKind);
  }

  function submit() {
    setSubmissionAttempted(true);
    if (!canSubmit) return;
    onSubmit();
  }

  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: Platform.OS === "web" && context === "room" ? 52 : 0,
          }}
        >
          <IconButton accessibilityLabel={t("community.composer.close")} icon="arrow-left" onPress={onClose} />
          <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>{t(headerActionKey(context, entryVisibility, editing, kind))}</Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900" }}>{t(titleKey(context, editing))}</Text>
          <FilterChips
            minHeight={context === "room" ? 44 : undefined}
            showSelectionIndicator
            value={kind}
            onChange={changeKind}
            options={typeOptions.map((type) => ({ label: t(composerTypeKeys[type.value]), value: type.value }))}
          />
        </View>

        {showTitle ? (
          <TextInputField
            value={title}
            onChangeText={onTitle}
            onSubmitEditing={submit}
            placeholder={kind === "prayer_request"
              ? t("community.composer.placeholder.prayerTitle")
              : kind === "praise"
                ? t("community.composer.placeholder.praiseTitle")
                : kind === "scripture"
                  ? t("community.composer.placeholder.scriptureTitle")
                  : t("community.composer.placeholder.title")}
            returnKeyType="send"
          />
        ) : null}

        <View style={{ gap: 8 }}>
          <TextInputField
            multiline
            maxLength={MAX_BODY_LENGTH}
            value={body}
            onChangeText={(value) => onBody(value.slice(0, MAX_BODY_LENGTH))}
            onSubmitEditing={submit}
            placeholder={kind === "prayer_request"
              ? t("community.composer.placeholder.prayerBody")
              : kind === "praise"
                ? t("community.composer.placeholder.praiseBody")
                : kind === "scripture"
                  ? t(isCommunityShare ? "community.composer.placeholder.scriptureNote" : "community.composer.placeholder.scriptureBody")
                  : t("community.composer.placeholder.body")}
            returnKeyType="send"
            style={{ minHeight: 170 }}
            submitBehavior="submit"
          />
          <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>
            {body.length}/{MAX_BODY_LENGTH}
          </Text>
          {submissionAttempted && !scriptureRequired && !canSubmit ? (
            <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.composer.validation.bodyRequired")}</Text>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <BibleVerseField
            label={t(scriptureRequired ? "community.composer.scriptureRequired" : "community.composer.scriptureOptional")}
            verses={verses}
            onChange={onVerses}
          />
          {submissionAttempted && scriptureRequired && !canSubmit ? (
            <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.composer.validation.scriptureRequired")}</Text>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <SectionHeading>{t("community.composer.shareWith")}</SectionHeading>
          {showVisibility ? (
            <FilterChips
              value={entryVisibility}
              onChange={onVisibility}
              options={[
                { label: t("community.composer.visibility.private"), value: visibility.private },
                { label: t("community.composer.visibility.community"), value: visibility.room },
              ]}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!showVisibility}
            onPress={() => onVisibility(entryVisibility === visibility.private ? visibility.room : visibility.private)}
          >
            <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
              <RoomImage image={entryVisibility === visibility.room ? roomImage : undefined} name={entryVisibility === visibility.room ? activeRoomName : t("community.composer.privateJournal")} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                  {entryVisibility === visibility.room ? activeRoomName : t("community.composer.privateJournal")}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {entryVisibility === visibility.room ? t("community.composer.sharedWithCommunity") : t("community.composer.privateOnly")}
                </Text>
              </View>
              {showVisibility ? <Feather name="chevron-down" size={18} color={colors.muted} /> : null}
            </Card>
          </Pressable>
        </View>

        <PrimaryButton disabled={!canSubmit} icon="send" onPress={submit}>
          {actionLabel}
        </PrimaryButton>
      </AppScreen>
    </FullScreenModal>
  );
}
