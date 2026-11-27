import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EntryVisibility, communityPostTypes, normalizePostKind, visibility } from "@/state/product";
import type { PostKind } from "@/state/types";
import { deleteAudioClip } from "@/state/audio-storage";
import type { AudioPurpose, AudioScope } from "@/state/audio";
import type { AudioClip, BibleVerse, GroupImage } from "@/state/types";
import { AppScreen, Card, FilterChips, FullScreenModal, IconButton, PrimaryButton, TextInputField } from "@/ui/app-components";
import { AmbientBackground } from "@/ui/ambient-background";
import { BibleVerseField } from "@/ui/bible-verse-field";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { tabContentClearance } from "@/ui/navigation-layout";
import { FieldLabel } from "@/ui/shadcn";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { VoiceNoteField } from "@/features/audio/voice-note-field";
import { VisibilityToggle } from "@/ui/visibility-toggle";

const MAX_BODY_LENGTH = 500;

// Keep native keyboard adjustment local to Community; other composer callers
// continue to use AppScreen. Native insets also reveal the focused text region.
function CommunityComposerScreen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.cream, flex: 1 }}>
      <AmbientBackground />
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

function primaryActionKey(context: "journal" | "today" | "room", entryVisibility: EntryVisibility, editing: boolean, kind: PostKind) {
  if (editing) return "community.composer.action.updateEntry" as const;
  if (entryVisibility === visibility.room) {
    return kind === "prayer_request" ? "community.composer.action.sharePrayer" as const : "community.composer.action.sharePost" as const;
  }
  if (context === "today") return "community.composer.action.saveEntry" as const;
  return kind === "prayer_request" ? "community.composer.action.savePrayerPrivate" as const : "community.composer.action.savePostPrivate" as const;
}

function titleKey(context: "journal" | "today" | "room", editing: boolean, bibleIntent?: BibleComposerIntent) {
  if (editing) return "community.composer.title.edit" as const;
  if (bibleIntent === "reflect") return "community.composer.title.bibleReflect" as const;
  if (bibleIntent === "pray") return "community.composer.title.biblePray" as const;
  if (bibleIntent === "share") return "community.composer.title.bibleShare" as const;
  if (context === "room") return "community.composer.title.shareCommunity" as const;
  return "community.composer.title.write" as const;
}

const composerTypeKeys: Record<PostKind, TranslationKey> = {
  post: "community.composer.type.post",
  prayer_request: "community.composer.type.prayer",
} as const;

function CommunityTypeSelector({
  disabled = false,
  onChange,
  options,
  singleColumn = false,
  value,
}: {
  disabled?: boolean;
  onChange: (value: PostKind) => void;
  options: { label: string; value: PostKind }[];
  singleColumn?: boolean;
  value: PostKind;
}) {
  const { t } = useAppTranslation();
  const rows = singleColumn ? options.map((option) => [option]) : [options];

  return (
    <View accessibilityLabel={t("community.composer.share.typeLabel")} accessibilityRole="radiogroup" style={{ gap: 8 }}>
      {rows.map((row) => (
        <View key={row.map((option) => option.value).join("-")} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                accessibilityLabel={option.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                key={option.value}
                onPress={() => { if (!disabled) onChange(option.value); }}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: selected ? shadcn.primary : pressed ? shadcn.secondary : shadcn.card,
                  borderColor: selected ? shadcn.primary : shadcn.border,
                  borderCurve: "continuous",
                  borderRadius: radius.md,
                  borderWidth: 1,
                  flex: 1,
                  flexDirection: "row",
                  gap: 6,
                  justifyContent: "center",
                  minHeight: 44,
                  minWidth: 0,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                })}
              >
                <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
                  <Feather name={selected ? "check" : option.value === "prayer_request" ? "heart" : "edit-3"} size={14} color={selected ? shadcn.primaryForeground : colors.clay} />
                </View>
                <Text
                  style={[
                    typography.label,
                    {
                      color: selected ? shadcn.primaryForeground : colors.clay,
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
  audioGroupId,
  audioPurpose,
  audioReadOnly = false,
  audioScope,
  audienceLocked = false,
  bibleIntent,
  body,
  communityAudienceAvailable = true,
  context,
  editing = false,
  entryVisibility,
  initialAudio,
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
  audioGroupId?: string;
  audioPurpose?: AudioPurpose;
  audioReadOnly?: boolean;
  audioScope?: AudioScope;
  audienceLocked?: boolean;
  bibleIntent?: BibleComposerIntent;
  body: string;
  communityAudienceAvailable?: boolean;
  context: "journal" | "today" | "room";
  editing?: boolean;
  entryVisibility: EntryVisibility;
  initialAudio?: AudioClip;
  kind: PostKind;
  onBody: (value: string) => void;
  onClose: () => void;
  onKind: (kind: PostKind) => void;
  onOpenVerseInBible?: (verse: BibleVerse) => void;
  onSubmit: (audio: AudioClip | null) => void;
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
  const [attemptedKind, setAttemptedKind] = useState<PostKind | undefined>(undefined);
  const [audio, setAudio] = useState<AudioClip | undefined>(initialAudio);
  const audioRef = useRef<AudioClip | undefined>(audio);
  const initialAudioId = useRef<string | undefined>(initialAudio?.id);
  const submittedAudioId = useRef<string | undefined>(undefined);
  audioRef.current = audio;
  const lastAnnouncement = useRef<string | undefined>(undefined);
  const locked = Boolean(submission && (submission.inFlight || submission.status === "pending" || submission.status === "unknown"));
  const feedbackKey = submissionFeedback ?? (submission?.status === "unknown"
    ? submission.inFlight ? "community.composer.submission.waiting" : "community.composer.submission.unknown"
    : submission?.inFlight ? "community.composer.submission.pending"
      : submission?.status === "failure" ? "community.composer.submission.failure" : undefined);
  const bibleOrigin = Boolean(bibleIntent);
  const isCommunityShare = context === "room";
  const normalizedKind = normalizePostKind(kind);
  // Do not briefly display or announce a new type's error while the reset
  // effect is clearing a previous Community validation attempt.
  const submissionAttempted = attemptedKind !== undefined && (!isCommunityShare || attemptedKind === normalizedKind);
  const showVisibility = !audienceLocked && communityAudienceAvailable;
  const showTitle = !bibleOrigin && normalizedKind === "prayer_request";
  const roomAvailable = Boolean(roomName);
  const hasRequiredContent = Boolean(body.trim()) || Boolean(audio) || (normalizedKind === "post" && verses.length > 0);
  const audienceAvailable = editing || entryVisibility !== visibility.room || communityAudienceAvailable;
  const canSubmit = hasRequiredContent && audienceAvailable && (!isCommunityShare || roomAvailable);
  const actionKey = primaryActionKey(context, entryVisibility, editing, normalizedKind);
  const actionLabel = t(actionKey);
  const activeRoomName = roomName ?? t("community.composer.communityFallback");
  const communityDescriptionKey = normalizedKind === "prayer_request"
    ? "community.composer.share.description.prayer_request"
    : "community.composer.share.description.post";
  const journalUsesGrid = context === "journal" && viewportWidth < 360;
  const validationKey = submissionAttempted && !canSubmit ? "community.composer.validation.bodyRequired" : undefined;
  const announcementKey = visible ? isCommunityShare ? validationKey ?? feedbackKey : feedbackKey : undefined;
  const bodyLabelKey = normalizedKind === "prayer_request" ? "community.composer.share.field.prayer" : "community.composer.share.field.post";
  const Screen = isCommunityShare ? CommunityComposerScreen : AppScreen;
  const typeOptions = communityPostTypes;

  useEffect(() => {
    setAttemptedKind(undefined);
  }, [kind, visible]);

  useEffect(() => {
    if (!visible) return;
    setAudio(initialAudio);
    initialAudioId.current = initialAudio?.id;
    submittedAudioId.current = undefined;
  }, [visible, initialAudio?.id]);

  useEffect(() => {
    if (visible) return;
    const current = audioRef.current;
    if (current && current.id !== initialAudioId.current && current.id !== submittedAudioId.current) {
      void deleteAudioClip(current);
    }
  }, [visible]);

  useEffect(() => () => {
    const current = audioRef.current;
    if (current && current.id !== initialAudioId.current && current.id !== submittedAudioId.current) {
      void deleteAudioClip(current);
    }
  }, []);

  useEffect(() => {
    const message = announcementKey ? t(announcementKey) : undefined;
    // iOS does not support live regions. Use one announcement path per platform,
    // without moving focus or replaying the same status on every draft render.
    if (Platform.OS === "ios" && message && message !== lastAnnouncement.current) {
      AccessibilityInfo.announceForAccessibility(message);
    }
    lastAnnouncement.current = message;
  }, [announcementKey, t]);

  function changeKind(nextKind: PostKind) {
    if (locked) return;
    if (nextKind === normalizedKind) return;
    onKind(nextKind);
  }

  function submit() {
    setAttemptedKind(normalizedKind);
    if (!canSubmit || submission?.inFlight) return;
    submittedAudioId.current = audio?.id;
    return onSubmit(audio ?? null);
  }

  function close() {
    if (!locked) onClose();
  }

  function changeAudio(next: AudioClip | undefined) {
    const previous = audio;
    if (previous && previous.id !== next?.id && previous.id !== initialAudioId.current) {
      void deleteAudioClip(previous);
    }
    setAudio(next);
  }

  const titleField = (
    <TextInputField
      accessibilityLabel={isCommunityShare ? t("community.composer.share.field.title") : undefined}
      accessibilityState={isCommunityShare ? { disabled: locked } : undefined}
      editable={locked ? false : undefined}
      value={title}
      onChangeText={(value) => { if (!locked) onTitle(value); }}
      onSubmitEditing={isCommunityShare ? undefined : submit}
      placeholder={t("community.composer.placeholder.prayerTitle")}
      returnKeyType={isCommunityShare ? "done" : "send"}
    />
  );

  const bodyField = (
    <View key="body" style={{ gap: 8 }}>
      {isCommunityShare ? <FieldLabel>{t(bodyLabelKey)}</FieldLabel> : null}
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
        placeholder={normalizedKind === "prayer_request"
          ? t(isCommunityShare ? "community.composer.share.prompt.prayer" : "community.composer.placeholder.prayerBody")
          : t(bibleOrigin ? "community.composer.placeholder.scriptureBody" : "community.composer.placeholder.body")}
        returnKeyType={isCommunityShare ? "default" : "send"}
        style={{ minHeight: 170 }}
        submitBehavior={isCommunityShare ? "newline" : "submit"}
      />
      <Text accessibilityLabel={isCommunityShare ? t("community.composer.share.field.characterCount", { count: body.length, max: MAX_BODY_LENGTH }) : undefined} style={[typography.caption, { alignSelf: "flex-end", color: colors.muted }]}>
        {body.length}/{MAX_BODY_LENGTH}
      </Text>
      {validationKey ? (
        <Text accessibilityLiveRegion={isCommunityShare && Platform.OS === "android" ? "polite" : undefined} style={[typography.caption, { color: colors.danger }]}>{t(validationKey)}</Text>
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
          : "community.composer.scriptureOptional")}
        verses={verses}
        onChange={(nextVerses) => { if (!locked) onVerses(nextVerses); }}
        onOpenInBible={onOpenVerseInBible ? (verse) => { if (!locked) onOpenVerseInBible(verse); } : undefined}
      />
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
            <Text style={[typography.caption, { color: colors.muted }]}>{actionLabel}</Text>
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <Text accessibilityRole={isCommunityShare ? "header" : undefined} style={[typography.screenTitle, { color: colors.ink }]}>{t(titleKey(context, editing, bibleIntent))}</Text>
          {isCommunityShare || (context === "journal" && journalUsesGrid) ? (
            <CommunityTypeSelector
              disabled={locked}
              singleColumn={viewportWidth < 360 || fontScale >= 1.5}
              value={normalizedKind}
              onChange={changeKind}
              options={typeOptions.map((type) => ({ label: t(composerTypeKeys[type.value]), value: type.value }))}
            />
          ) : context === "journal" ? (
            <FilterChips
              fit
              minHeight={40}
              value={normalizedKind}
              onChange={changeKind}
              options={typeOptions.map((type) => ({ label: t(composerTypeKeys[type.value]), value: type.value }))}
            />
          ) : (
            <FilterChips
              showSelectionIndicator
              value={normalizedKind}
              onChange={changeKind}
              options={typeOptions.map((type) => ({ label: t(composerTypeKeys[type.value]), value: type.value }))}
            />
          )}
          {isCommunityShare ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t(communityDescriptionKey)}</Text>
          ) : null}
        </View>

        {context !== "today" ? (
          <VoiceNoteField
            clip={audio}
            communityName={roomName}
            disabled={locked}
            groupId={audioGroupId}
            label={t(context === "journal" ? "audio.field.add" : "audio.field.addPrayer")}
            onClip={changeAudio}
            purpose={audioPurpose ?? (context === "journal" ? "journal" : "prayer")}
            readOnly={audioReadOnly}
            scope={audioScope ?? (context === "room" ? "group" : "user")}
          />
        ) : null}

        {showTitle ? isCommunityShare ? (
          <View style={{ gap: 8 }}>
            <FieldLabel>{t("community.composer.share.field.title")}</FieldLabel>
            {titleField}
          </View>
        ) : titleField : null}

        {bodyField}
        {scriptureField}

        <View style={{ gap: 8 }}>
          {audienceLocked ? (
            <Text style={[typography.caption, { color: colors.muted }]}>
              {t(context === "journal" ? "me.journey.composer.editAudienceFixed" : "community.composer.editVisibilityHint")}
            </Text>
          ) : editing && !communityAudienceAvailable ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("me.journey.composer.editAudienceFixed")}</Text>
          ) : (
            <VisibilityToggle
              value={entryVisibility === visibility.room ? "group" : "private"}
              communityName={roomName}
              disabled={!showVisibility && !(context === "room" && roomAvailable)}
              busy={locked}
              onChange={(next) => { if (!locked) onVisibility(next === "group" ? visibility.room : visibility.private); }}
            />
          )}
        </View>

        {feedbackKey ? (
          <View
            accessible
            accessibilityLabel={t(feedbackKey)}
            accessibilityLiveRegion={isCommunityShare ? Platform.OS === "android" ? "polite" : "none" : submission?.inFlight ? "polite" : "assertive"}
            accessibilityRole={submission?.inFlight ? "progressbar" : isCommunityShare ? undefined : "alert"}
            accessibilityState={{ busy: Boolean(submission?.inFlight) }}
            style={{ gap: 8 }}
          >
            {submission?.inFlight ? <ActivityIndicator accessible={isCommunityShare ? false : undefined} color={colors.ink} /> : null}
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
