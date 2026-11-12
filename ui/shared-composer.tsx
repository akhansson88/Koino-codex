import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EntryVisibility, composerPostTypes, postTypes, visibility } from "@/state/product";
import type { BibleVerse, EntryKind, GroupImage } from "@/state/types";
import { AppScreen, Card, FilterChips, FullScreenModal, IconButton, PrimaryButton, RoomImage, SectionHeading, TextInputField } from "@/ui/app-components";
import { BibleVerseField } from "@/ui/bible-verse-field";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { tabContentClearance } from "@/ui/navigation-layout";
import { colors, typography } from "@/ui/theme";

const MAX_BODY_LENGTH = 500;

// Keep native keyboard adjustment local to Community; other composer callers
// continue to use AppScreen. Native insets also reveal the focused text region.
function CommunityComposerScreen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.cream, flex: 1 }}>
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: tabContentClearance(insets.bottom), paddingTop: insets.top + 18 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

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
  if (context === "room" && kind === "prayer_request") return "community.composer.share.type.prayerRequest" as const;
  if (context === "journal" && kind === "update") return "community.contentType.checkIn" as const;
  if (context === "journal" && kind === "praise") return "community.composer.journal.type.praise" as const;
  if (kind === "prayer_moment") return "community.composer.type.prayer" as const;
  return composerTypeKeys[kind];
}

function CommunityTypeSelector({
  community = false,
  disabled = false,
  onChange,
  options,
  singleColumn = false,
  value,
}: {
  community?: boolean;
  disabled?: boolean;
  onChange: (value: EntryKind) => void;
  options: { label: string; value: EntryKind }[];
  singleColumn?: boolean;
  value: EntryKind;
}) {
  const { t } = useAppTranslation();
  const rows = singleColumn ? options.map((option) => [option]) : [options.slice(0, 2), options.slice(2, 4)];

  return (
    <View accessibilityRole={community ? "radiogroup" : undefined} accessibilityLabel={community ? t("community.composer.share.typeLabel") : undefined} style={{ gap: 8 }}>
      {rows.map((row) => (
        <View key={row.map((option) => option.value).join("-")} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                accessibilityLabel={option.label}
                accessibilityRole={community ? "radio" : "button"}
                accessibilityState={community ? { checked: selected, disabled } : { selected, disabled }}
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
  communityAudienceAvailable = true,
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
  submissionFeedback,
  title,
  verses,
  visible,
}: {
  audienceLocked?: boolean;
  bibleIntent?: BibleComposerIntent;
  body: string;
  communityAudienceAvailable?: boolean;
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
  submissionFeedback?: TranslationKey;
  title: string;
  verses: BibleVerse[];
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const [attemptedKind, setAttemptedKind] = useState<EntryKind | undefined>(undefined);
  const lastAnnouncement = useRef<string | undefined>(undefined);
  const locked = Boolean(submission && (submission.inFlight || submission.status === "pending" || submission.status === "unknown"));
  const feedbackKey = submissionFeedback ?? (submission?.status === "unknown"
    ? submission.inFlight ? "community.composer.submission.waiting" : "community.composer.submission.unknown"
    : submission?.inFlight ? "community.composer.submission.pending"
      : submission?.status === "failure" ? "community.composer.submission.failure" : undefined);
  const bibleOrigin = Boolean(bibleIntent);
  const isCommunityShare = context === "room";
  // Do not briefly display or announce a new type's error while the reset
  // effect is clearing a previous Community validation attempt.
  const submissionAttempted = attemptedKind !== undefined && (!isCommunityShare || attemptedKind === kind);
  const showVisibility = context !== "room" && !audienceLocked && communityAudienceAvailable;
  const titleFreeCommunityKind = kind === "reflection" || kind === "praise" || kind === "scripture";
  const showTitle = !bibleOrigin && (!isCommunityShare || !titleFreeCommunityKind);
  const scriptureRequired = isCommunityShare && kind === "scripture";
  const roomAvailable = Boolean(roomName);
  const hasRequiredContent = scriptureRequired ? verses.length > 0 : Boolean(body.trim());
  const audienceAvailable = editing || entryVisibility !== visibility.room || communityAudienceAvailable;
  const canSubmit = hasRequiredContent && audienceAvailable && (!isCommunityShare || roomAvailable);
  const actionKey = primaryActionKey(context, entryVisibility, editing, kind);
  const actionLabel = t(actionKey);
  const activeRoomName = roomName ?? t("community.composer.communityFallback");
  const communityDescriptionKey = kind === "prayer_request" ? "community.composer.share.description.prayer_request"
    : kind === "reflection" ? "community.composer.share.description.reflection"
      : kind === "praise" ? "community.composer.share.description.praise"
        : kind === "scripture" ? "community.composer.share.description.scripture" : undefined;
  const communityAudience = roomAvailable
    ? t("community.composer.share.audience", { community: roomName! })
    : t("community.rooms.noneSelected");
  const journalUsesGrid = context === "journal" && viewportWidth < 360;
  const journalUsesCompactPrivacy = context === "journal" && viewportWidth < 360;
  const validationKey = submissionAttempted && !canSubmit
    ? scriptureRequired ? "community.composer.validation.scriptureRequired" : "community.composer.validation.bodyRequired"
    : undefined;
  const announcementKey = visible ? isCommunityShare ? validationKey ?? feedbackKey : submissionFeedback : undefined;
  const bodyLabelKey = kind === "prayer_request" ? "community.composer.share.field.prayer"
    : kind === "praise" ? "community.composer.share.field.praise"
      : kind === "scripture" ? "community.composer.share.field.note" : "community.composer.share.field.reflection";
  const Screen = isCommunityShare ? CommunityComposerScreen : AppScreen;
  const typeOptions =
    context === "journal"
      ? bibleOrigin || kind === "scripture"
        ? journalScripturePostTypes
        : journalPostTypes
      : composerPostTypes;

  useEffect(() => {
    setAttemptedKind(undefined);
  }, [kind, visible]);

  useEffect(() => {
    const message = announcementKey ? t(announcementKey) : undefined;
    // iOS does not support live regions. Use one announcement path per platform,
    // without moving focus or replaying the same status on every draft render.
    if (Platform.OS === "ios" && message && message !== lastAnnouncement.current) {
      AccessibilityInfo.announceForAccessibility(message);
    }
    lastAnnouncement.current = message;
  }, [announcementKey, t]);

  function changeKind(nextKind: EntryKind) {
    if (locked) return;
    if (nextKind === kind) return;
    onKind(nextKind);
  }

  function submit() {
    setAttemptedKind(kind);
    if (!canSubmit || submission?.inFlight) return;
    return onSubmit();
  }

  function close() {
    if (!locked) onClose();
  }

  const titleField = (
    <TextInputField
      accessibilityLabel={isCommunityShare ? t("community.composer.share.field.title") : undefined}
      accessibilityState={isCommunityShare ? { disabled: locked } : undefined}
      editable={locked ? false : undefined}
      value={title}
      onChangeText={(value) => { if (!locked) onTitle(value); }}
      onSubmitEditing={isCommunityShare ? undefined : submit}
      placeholder={kind === "prayer_request"
        ? t("community.composer.placeholder.prayerTitle")
        : kind === "praise"
          ? t("community.composer.placeholder.praiseTitle")
          : kind === "scripture"
            ? t("community.composer.placeholder.scriptureTitle")
            : t("community.composer.placeholder.title")}
      returnKeyType={isCommunityShare ? "done" : "send"}
    />
  );

  const bodyField = (
    <View key="body" style={{ gap: 8 }}>
      {isCommunityShare ? <Text accessible={false} style={[typography.label, { color: colors.ink }]}>{t(bodyLabelKey)}</Text> : null}
      <TextInputField
        accessibilityLabel={isCommunityShare ? t(bodyLabelKey) : undefined}
        accessibilityHint={isCommunityShare ? t("community.composer.share.field.writingHint", { max: MAX_BODY_LENGTH }) : undefined}
        accessibilityState={isCommunityShare ? { disabled: locked } : undefined}
        editable={locked ? false : undefined}
        multiline
        maxLength={MAX_BODY_LENGTH}
        value={body}
        onChangeText={(value) => { if (!locked) onBody(value.slice(0, MAX_BODY_LENGTH)); }}
        onSubmitEditing={isCommunityShare ? undefined : submit}
        placeholder={kind === "prayer_request"
          ? t(isCommunityShare ? "community.composer.share.prompt.prayer" : "community.composer.placeholder.prayerBody")
          : kind === "praise"
            ? t(isCommunityShare ? "community.composer.share.prompt.praise" : "community.composer.placeholder.praiseBody")
            : kind === "scripture"
              ? t(isCommunityShare ? "community.composer.placeholder.scriptureNote" : "community.composer.placeholder.scriptureBody")
              : t(bibleOrigin ? "community.composer.placeholder.scriptureBody" : "community.composer.placeholder.body")}
        returnKeyType={isCommunityShare ? "default" : "send"}
        style={{ minHeight: 170 }}
        submitBehavior={isCommunityShare ? "newline" : "submit"}
      />
      <Text accessibilityLabel={isCommunityShare ? t("community.composer.share.field.characterCount", { count: body.length, max: MAX_BODY_LENGTH }) : undefined} style={isCommunityShare ? [typography.caption, { alignSelf: "flex-end", color: colors.muted }] : { alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>
        {body.length}/{MAX_BODY_LENGTH}
      </Text>
      {submissionAttempted && !scriptureRequired && !canSubmit ? (
        <Text accessibilityLiveRegion={isCommunityShare && Platform.OS === "android" ? "polite" : undefined} style={isCommunityShare ? [typography.caption, { color: colors.danger }] : { color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.composer.validation.bodyRequired")}</Text>
      ) : null}
    </View>
  );

  const scriptureField = (
    <View
      key="scripture"
      style={{ gap: 8 }}
      pointerEvents={locked ? "none" : "auto"}
      accessibilityElementsHidden={locked}
      importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
    >
      <BibleVerseField
        attachedFromBible={bibleOrigin}
        communityComposer={isCommunityShare || undefined}
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
        <Text accessibilityLiveRegion={Platform.OS === "android" ? "polite" : undefined} style={[typography.caption, { color: colors.danger }]}>{t("community.composer.validation.scriptureRequired")}</Text>
      ) : null}
    </View>
  );

  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={close}>
      <Screen>
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
          <Text accessibilityRole={isCommunityShare ? "header" : undefined} style={isCommunityShare ? [typography.heading, { color: colors.ink }] : { color: colors.ink, fontSize: 24, fontWeight: "900" }}>{t(titleKey(context, editing, bibleIntent))}</Text>
          {isCommunityShare ? (
            <CommunityTypeSelector
              community
              disabled={locked}
              singleColumn={viewportWidth < 360 || fontScale >= 1.5}
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
          {isCommunityShare && communityDescriptionKey ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t(communityDescriptionKey)}</Text>
          ) : null}
        </View>

        {isCommunityShare ? (
          <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
            <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
              <RoomImage image={roomImage} name={activeRoomName} size={34} />
            </View>
            <Text style={[typography.bodyMedium, { color: colors.ink, flex: 1, minWidth: 0 }]}>{communityAudience}</Text>
          </Card>
        ) : null}

        {showTitle ? isCommunityShare ? (
          <View style={{ gap: 8 }}>
            <Text accessible={false} style={[typography.label, { color: colors.ink }]}>{t("community.composer.share.field.title")}</Text>
            {titleField}
          </View>
        ) : titleField : null}

        {scriptureRequired ? scriptureField : bodyField}
        {scriptureRequired ? bodyField : scriptureField}

        {!isCommunityShare ? (
        <View style={{ gap: 8 }}>
          <SectionHeading>
            {t(context === "journal" ? "community.composer.journal.privacy" : "community.composer.shareWith")}
          </SectionHeading>
          {audienceLocked ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("community.composer.checkInAudienceFixed")}</Text>
          ) : context === "journal" && editing && !communityAudienceAvailable ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("me.journey.composer.editAudienceFixed")}</Text>
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
          ) : context === "journal" && editing && !communityAudienceAvailable ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("me.journey.preview.sharedCopy")}</Text>
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
                      ? t("community.composer.sharedWithCommunity")
                      : t("community.composer.privateOnly")}
                  </Text>
                </View>
                {showVisibility ? <Feather name="chevron-down" size={18} color={colors.muted} /> : null}
              </Card>
            </Pressable>
          )}
        </View>
        ) : null}

        {feedbackKey ? (
          <View
            accessible
            accessibilityLabel={t(feedbackKey)}
            accessibilityLiveRegion={isCommunityShare ? Platform.OS === "android" ? "polite" : "none" : submission?.inFlight ? "polite" : "assertive"}
            accessibilityRole={submission?.inFlight ? "progressbar" : isCommunityShare ? undefined : "alert"}
            accessibilityState={{ busy: Boolean(submission?.inFlight) }}
            style={{ gap: 8 }}
          >
            {submission?.inFlight ? <ActivityIndicator accessible={isCommunityShare ? false : undefined} color={colors.olive} /> : null}
            <Text style={[typography.caption, { color: submission?.status === "failure" ? colors.danger : colors.muted }]}>{t(feedbackKey)}</Text>
          </View>
        ) : null}
        <PrimaryButton disabled={!canSubmit || Boolean(submission?.inFlight)} icon={context === "journal" ? "check" : "send"} onPress={submit}>
          {submission?.status === "unknown" && !submission.inFlight ? t("community.composer.submission.retryOriginal") : actionLabel}
        </PrimaryButton>
      </Screen>
    </FullScreenModal>
  );
}
