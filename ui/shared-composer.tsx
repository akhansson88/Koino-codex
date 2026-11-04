import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";

import { EntryVisibility, composerPostTypes, postTypes, visibility } from "@/state/product";
import type { BibleVerse, EntryKind, GroupImage } from "@/state/types";
import { AppScreen, Card, FilterChips, FullScreenModal, IconButton, PrimaryButton, RoomImage, SectionHeading, TextInputField } from "@/ui/app-components";
import { BibleVerseField } from "@/ui/bible-verse-field";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

const MAX_BODY_LENGTH = 500;

export type BibleComposerIntent = "reflect" | "pray" | "share";

// Explicit opt-in: journal and other existing callers retain their behavior.
export type CommunityComposerSubmission = {
  status: "idle" | "pending" | "failure" | "unknown";
  inFlight: boolean;
};

function primaryActionKey(context: "journal" | "today" | "room", entryVisibility: EntryVisibility, editing: boolean, kind: EntryKind) {
  if (editing) return "community.composer.action.updateEntry" as const;
  if (context === "room" || entryVisibility === visibility.room) {
    if (kind === "prayer_request") return "community.composer.action.sharePrayer" as const;
    if (kind === "reflection") return "community.composer.action.shareReflection" as const;
    if (kind === "praise") return "community.composer.action.sharePraise" as const;
    if (kind === "scripture") return "community.composer.action.shareScripture" as const;
    return "community.composer.action.share" as const;
  }
  if (context === "journal") {
    if (kind === "prayer_request") return "community.composer.action.savePrayer" as const;
    if (kind === "praise") return "community.composer.journal.action.savePraise" as const;
    if (kind === "update") return "community.composer.journal.action.saveCheckIn" as const;
    if (kind === "scripture") return "community.composer.action.saveScriptureNote" as const;
    return "community.composer.action.saveReflection" as const;
  }
  return "community.composer.action.saveEntry" as const;
}

function headerActionKey(context: "journal" | "today" | "room", entryVisibility: EntryVisibility, editing: boolean, kind: EntryKind) {
  if (editing) return "community.composer.action.updateShort" as const;
  const actionKey = primaryActionKey(context, entryVisibility, editing, kind);
  return actionKey === "community.composer.action.saveEntry" ? "community.composer.action.saveShort" as const : actionKey;
}

function titleKey(context: "journal" | "today" | "room", editing: boolean, bibleIntent?: BibleComposerIntent) {
  if (editing) return "community.composer.title.edit" as const;
  if (bibleIntent === "reflect") return "community.composer.title.bibleReflect" as const;
  if (bibleIntent === "pray") return "community.composer.title.biblePray" as const;
  if (bibleIntent === "share") return "community.composer.title.bibleShare" as const;
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

const journalPostTypes = postTypes.filter((type) => type.value !== "scripture");
const journalScripturePostTypes = postTypes.filter((type) => type.value !== "update");

function composerTypeKey(context: "journal" | "today" | "room", kind: EntryKind) {
  if (context === "journal" && kind === "update") return "community.contentType.checkIn" as const;
  if (context === "journal" && kind === "praise") return "community.composer.journal.type.praise" as const;
  if (kind === "prayer_moment") return "community.composer.type.prayer" as const;
  return composerTypeKeys[kind];
}

function CommunityTypeSelector({
  disabled = false,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: EntryKind) => void;
  options: { label: string; value: EntryKind }[];
  value: EntryKind;
}) {
  const rows = [options.slice(0, 2), options.slice(2, 4)];

  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <View key={row.map((option) => option.value).join("-")} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                accessibilityLabel={option.label}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                key={option.value}
                onPress={() => { if (!disabled) onChange(option.value); }}
                style={{
                  alignItems: "center",
                  backgroundColor: selected ? colors.accentSubtle : colors.paper,
                  borderColor: selected ? colors.gold : colors.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  flex: 1,
                  flexDirection: "row",
                  gap: 6,
                  justifyContent: "center",
                  minHeight: 44,
                  minWidth: 0,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                {selected ? (
                  <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
                    <Feather name="check" size={14} color={colors.olive} />
                  </View>
                ) : null}
                <Text
                  style={[
                    typography.label,
                    {
                      color: selected ? colors.olive : colors.muted,
                      flexShrink: 1,
                      textAlign: "center",
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function SharedComposer({
  audienceLocked = false,
  bibleIntent,
  body,
  context,
  editing = false,
  entryVisibility,
  kind,
  onBody,
  onClose,
  onKind,
  onOpenVerseInBible,
  onSubmit,
  onTitle,
  onVerses,
  onVisibility,
  roomImage,
  roomName,
  submission,
  title,
  verses,
  visible,
}: {
  audienceLocked?: boolean;
  bibleIntent?: BibleComposerIntent;
  body: string;
  context: "journal" | "today" | "room";
  editing?: boolean;
  entryVisibility: EntryVisibility;
  kind: EntryKind;
  onBody: (value: string) => void;
  onClose: () => void;
  onKind: (kind: EntryKind) => void;
  onOpenVerseInBible?: (verse: BibleVerse) => void;
  onSubmit: () => void;
  onTitle: (value: string) => void;
  onVerses: (verses: BibleVerse[]) => void;
  onVisibility: (value: EntryVisibility) => void;
  roomImage?: GroupImage;
  roomName?: string;
  submission?: CommunityComposerSubmission;
  title: string;
  verses: BibleVerse[];
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const { width: viewportWidth } = useWindowDimensions();
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const locked = Boolean(submission && (submission.inFlight || submission.status === "pending" || submission.status === "unknown"));
  const feedbackKey = submission?.status === "unknown"
    ? submission.inFlight ? "community.composer.submission.waiting" : "community.composer.submission.unknown"
    : submission?.inFlight ? "community.composer.submission.pending"
      : submission?.status === "failure" ? "community.composer.submission.failure" : undefined;
  const bibleOrigin = Boolean(bibleIntent);
  const isCommunityShare = context === "room";
  const showVisibility = context !== "room" && !audienceLocked;
  const titleFreeCommunityKind = kind === "reflection" || kind === "praise" || kind === "scripture";
  const showTitle = !bibleOrigin && (!isCommunityShare || !titleFreeCommunityKind);
  const scriptureRequired = isCommunityShare && kind === "scripture";
  const roomAvailable = Boolean(roomName);
  const hasRequiredContent = scriptureRequired ? verses.length > 0 : Boolean(body.trim());
  const canSubmit = hasRequiredContent && (!isCommunityShare || roomAvailable);
  const actionKey = primaryActionKey(context, entryVisibility, editing, kind);
  const actionLabel = t(actionKey);
  const activeRoomName = roomName ?? t("community.composer.communityFallback");
  const journalUsesGrid = context === "journal" && viewportWidth < 360;
  const journalUsesCompactPrivacy = context === "journal" && viewportWidth < 360;
  const typeOptions =
    context === "journal"
      ? bibleOrigin || kind === "scripture"
        ? journalScripturePostTypes
        : journalPostTypes
      : composerPostTypes;

  useEffect(() => {
    setSubmissionAttempted(false);
  }, [kind, visible]);

  function changeKind(nextKind: EntryKind) {
    if (locked) return;
    if (nextKind === kind) return;
    if (isCommunityShare && !bibleOrigin) {
      onTitle("");
      onVerses([]);
    }
    onKind(nextKind);
  }

  function submit() {
    setSubmissionAttempted(true);
    if (!canSubmit || submission?.inFlight) return;
    return onSubmit();
  }

  function close() {
    if (!locked) onClose();
  }

  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={close}>
      <AppScreen>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: Platform.OS === "web" && context === "room" ? 52 : 0,
          }}
        >
          <View
            accessible={locked}
            accessibilityLabel={locked ? t("community.composer.close") : undefined}
            accessibilityRole={locked ? "button" : undefined}
            accessibilityState={locked ? { disabled: true } : undefined}
            pointerEvents={locked ? "none" : "auto"}
          >
            <View accessibilityElementsHidden={locked} importantForAccessibility={locked ? "no-hide-descendants" : "auto"}>
              <IconButton accessibilityLabel={t("community.composer.close")} icon="arrow-left" onPress={close} />
            </View>
          </View>
          {!isCommunityShare && context !== "journal" ? (
            <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>{t(headerActionKey(context, entryVisibility, editing, kind))}</Text>
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900" }}>{t(titleKey(context, editing, bibleIntent))}</Text>
          {isCommunityShare ? (
            <CommunityTypeSelector
              disabled={locked}
              value={kind}
              onChange={changeKind}
              options={typeOptions.map((type) => ({ label: t(composerTypeKey(context, type.value)), value: type.value }))}
            />
          ) : context === "journal" && journalUsesGrid ? (
            <CommunityTypeSelector
              value={kind}
              onChange={changeKind}
              options={typeOptions.map((type) => ({ label: t(composerTypeKey(context, type.value)), value: type.value }))}
            />
          ) : context === "journal" ? (
            <FilterChips
              fit
              minHeight={40}
              value={kind}
              onChange={changeKind}
              options={typeOptions.map((type) => ({ label: t(composerTypeKey(context, type.value)), value: type.value }))}
            />
          ) : (
            <FilterChips
              showSelectionIndicator
              value={kind}
              onChange={changeKind}
              options={typeOptions.map((type) => ({ label: t(composerTypeKey(context, type.value)), value: type.value }))}
            />
          )}
        </View>

        {showTitle ? (
          <TextInputField
            editable={locked ? false : undefined}
            value={title}
            onChangeText={(value) => { if (!locked) onTitle(value); }}
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
            editable={locked ? false : undefined}
            multiline
            maxLength={MAX_BODY_LENGTH}
            value={body}
            onChangeText={(value) => { if (!locked) onBody(value.slice(0, MAX_BODY_LENGTH)); }}
            onSubmitEditing={submit}
            placeholder={kind === "prayer_request"
              ? t("community.composer.placeholder.prayerBody")
              : kind === "praise"
                ? t("community.composer.placeholder.praiseBody")
                : kind === "scripture"
                  ? t(isCommunityShare ? "community.composer.placeholder.scriptureNote" : "community.composer.placeholder.scriptureBody")
                  : t(bibleOrigin ? "community.composer.placeholder.scriptureBody" : "community.composer.placeholder.body")}
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

        <View
          style={{ gap: 8 }}
          pointerEvents={locked ? "none" : "auto"}
          accessibilityElementsHidden={locked}
          importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
        >
          <BibleVerseField
            attachedFromBible={bibleOrigin}
            label={t(bibleOrigin && verses.length > 0
              ? "community.composer.scriptureAttached"
              : scriptureRequired
                ? "community.composer.scriptureRequired"
                : "community.composer.scriptureOptional")}
            verses={verses}
            onChange={(nextVerses) => { if (!locked) onVerses(nextVerses); }}
            onOpenInBible={onOpenVerseInBible ? (verse) => { if (!locked) onOpenVerseInBible(verse); } : undefined}
          />
          {submissionAttempted && scriptureRequired && !canSubmit ? (
            <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.composer.validation.scriptureRequired")}</Text>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          {!isCommunityShare ? (
            <SectionHeading>
              {t(context === "journal" ? "community.composer.journal.privacy" : "community.composer.shareWith")}
            </SectionHeading>
          ) : null}
          {audienceLocked ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("community.composer.checkInAudienceFixed")}</Text>
          ) : null}
          {showVisibility ? (
            <FilterChips
              fit={context === "journal"}
              minHeight={context === "journal" ? 40 : undefined}
              value={entryVisibility}
              onChange={(nextVisibility) => { if (!locked) onVisibility(nextVisibility); }}
              options={[
                {
                  label: t(
                    context === "journal"
                      ? journalUsesCompactPrivacy
                        ? "community.composer.journal.visibility.privateCompact"
                        : "community.composer.journal.visibility.private"
                      : "community.composer.visibility.private"
                  ),
                  value: visibility.private,
                },
                {
                  label: t(
                    context === "journal"
                      ? journalUsesCompactPrivacy
                        ? "community.composer.journal.visibility.communityCompact"
                        : "community.composer.journal.visibility.community"
                      : "community.composer.visibility.community"
                  ),
                  value: visibility.room,
                },
              ]}
            />
          ) : null}
          {context === "journal" && entryVisibility === visibility.private ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 4 }}>
              <Feather name="lock" size={14} color={colors.muted} />
              <Text style={[typography.caption, { color: colors.muted }]}>
                {t("community.composer.journal.privateOnly")}
              </Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={!showVisibility || locked}
              onPress={() => { if (!locked) onVisibility(entryVisibility === visibility.private ? visibility.room : visibility.private); }}
            >
              <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                <RoomImage image={entryVisibility === visibility.room ? roomImage : undefined} name={entryVisibility === visibility.room ? activeRoomName : t("community.composer.privateJournal")} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                    {entryVisibility === visibility.room ? activeRoomName : t("community.composer.privateJournal")}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                    {entryVisibility === visibility.room
                      ? t(isCommunityShare
                        ? roomAvailable
                          ? "community.composer.privateCommunity"
                          : "community.rooms.noneSelected"
                        : "community.composer.sharedWithCommunity")
                      : t("community.composer.privateOnly")}
                  </Text>
                </View>
                {showVisibility ? <Feather name="chevron-down" size={18} color={colors.muted} /> : null}
              </Card>
            </Pressable>
          )}
        </View>

        {feedbackKey ? (
          <View
            accessible
            accessibilityLabel={t(feedbackKey)}
            accessibilityLiveRegion={submission?.inFlight ? "polite" : "assertive"}
            accessibilityRole={submission?.inFlight ? "progressbar" : "alert"}
            accessibilityState={{ busy: Boolean(submission?.inFlight) }}
            style={{ gap: 8 }}
          >
            {submission?.inFlight ? <ActivityIndicator color={colors.olive} /> : null}
            <Text style={[typography.caption, { color: submission?.status === "failure" ? colors.danger : colors.muted }]}>{t(feedbackKey)}</Text>
          </View>
        ) : null}
        <PrimaryButton disabled={!canSubmit || Boolean(submission?.inFlight)} icon={context === "journal" ? "check" : "send"} onPress={submit}>
          {submission?.status === "unknown" && !submission.inFlight ? t("community.composer.submission.retryOriginal") : actionLabel}
        </PrimaryButton>
      </AppScreen>
    </FullScreenModal>
  );
}
