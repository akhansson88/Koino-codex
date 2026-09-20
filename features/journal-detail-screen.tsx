import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { EntryVisibility, journalEntryTypeFor, visibility } from "@/state/product";
import type { BibleVerse, EntryKind, JournalEntry, JournalEntryType } from "@/state/types";
import { AppScreen, BodyText, BottomSheet, Card, IconButton, RoomImage, SecondaryButton, SectionHeading, VerseList } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { normalizeBibleVerses, primaryBibleVerse } from "@/features/bible-verse-utils";
import { journalEntryPresentation } from "@/ui/journal-presentation";
import { LinkPreview } from "@/ui/link-preview";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, platformShadow, radius, typography } from "@/ui/theme";

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

type DetailEntry = JournalEntry & { displaySource: string; isSharedCheckIn?: boolean };

export function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routeId = routeParam(id);
  const { state, dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const [composerVisible, setComposerVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [entryMenuVisible, setEntryMenuVisible] = useState(false);
  const [entryKind, setEntryKind] = useState<EntryKind>("reflection");
  const [entryVisibility, setEntryVisibility] = useState<EntryVisibility>(visibility.private);
  const [journalType, setJournalType] = useState<JournalEntryType>("reflection");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const detailScrollRef = useRef<ScrollView>(null);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const entry = useMemo<DetailEntry | undefined>(() => {
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
          journalType: "heart_checkin" as const,
          entryKind: "reflection" as EntryKind,
          mood: sharedCheckIn.mood,
          heartMood: undefined,
          verse: sharedCheckIn.verse,
          verses: sharedCheckIn.verses,
          sharedPostId: undefined,
          isPrivate: false,
          createdAt: sharedCheckIn.createdAt,
          updatedAt: sharedCheckIn.createdAt,
          displaySource: "Shared check-in",
          isSharedCheckIn: true,
        }
      : undefined;
  }, [routeId, state.checkIns, state.currentGroupId, state.currentUserId, state.journalEntries]);

  useEffect(() => {
    detailScrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, [routeId]);

  if (!entry) {
    return (
      <AppScreen scrollRef={detailScrollRef}>
        <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={() => router.back()} />
        <Card>
          <BodyText muted>{t("me.journey.detail.unavailable")}</BodyText>
        </Card>
      </AppScreen>
    );
  }

  const currentEntry = entry;
  const storedType = journalEntryTypeFor(currentEntry);
  const presentation = journalEntryPresentation(currentEntry, t);
  const isSharedCheckIn = Boolean(currentEntry.isSharedCheckIn);

  function openEditor() {
    setJournalType(storedType);
    setEntryKind(currentEntry.entryKind ?? (storedType === "prayer" ? "prayer_request" : storedType === "answered_prayer" ? "praise" : storedType === "scripture_note" ? "scripture" : "reflection"));
    setEntryVisibility(currentEntry.sharedPostId ? visibility.room : visibility.private);
    setTitle(currentEntry.title ?? "");
    setBody(currentEntry.body);
    setVerses(normalizeBibleVerses(currentEntry.verse, currentEntry.verses));
    setComposerVisible(true);
  }

  async function submitEdit() {
    if (!body.trim()) return;
    await dispatch({
      type: "updateJournalEntry",
      id: currentEntry.id,
      body,
      entryKind,
      journalType,
      title,
      verse: primaryBibleVerse(verses),
      verses,
      sharedPostId: entryVisibility === visibility.room ? currentEntry.sharedPostId : undefined,
    });
    setComposerVisible(false);
  }

  function confirmDelete() {
    setEntryMenuVisible(false);
    setDeleteConfirmVisible(true);
  }

  function deleteEntry() {
    setDeleteConfirmVisible(false);
    dispatch({ type: isSharedCheckIn ? "deleteCheckIn" : "deleteJournalEntry", id: currentEntry.id });
    router.back();
  }

  return (
    <AppScreen scrollRef={detailScrollRef}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", position: "relative", zIndex: 50 }}>
        <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={() => router.back()} />
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Feather
            name={presentation.typeIcon}
            size={15}
            color={colors.gold}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[typography.label, { color: colors.olive }]}>{presentation.typeLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel={t(isSharedCheckIn ? "community.card.checkInOptions" : "me.journey.detail.entryOptions")}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setEntryMenuVisible((current) => !current)}
          style={{ alignItems: "center", height: 38, justifyContent: "center", width: 38 }}
        >
          <Feather name="more-horizontal" size={20} color={colors.ink} />
        </Pressable>
        {entryMenuVisible ? (
          <View
            style={{
              backgroundColor: colors.paper,
              borderColor: colors.line,
              borderRadius: radius.md,
              borderWidth: 1,
              minWidth: 132,
              paddingVertical: 4,
              position: "absolute",
              right: 0,
              top: 44,
              zIndex: 60,
              ...platformShadow({
                boxShadow: "0 10px 24px rgba(11, 18, 32, 0.14)",
                elevation: 12,
                offset: { width: 0, height: 10 },
                opacity: 0.14,
                radius: 24,
              }),
            }}
          >
            <Pressable
              accessibilityLabel={t("me.journey.detail.openDelete")}
              accessibilityRole="button"
              onPress={confirmDelete}
              style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 }}
            >
              <Feather name="trash-2" size={14} color={colors.danger} />
              <Text style={[typography.label, { color: colors.danger }]}>{t("common.delete")}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 12 }}>
        <Text style={[typography.caption, { color: colors.muted }]}>{formatDate(currentEntry.createdAt, language)}</Text>
        {presentation.moodLabel ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <Feather name={presentation.moodIcon} size={17} color={colors.olive} />
            <Text style={[typography.label, { color: colors.olive }]}>{presentation.moodLabel}</Text>
          </View>
        ) : null}
        {presentation.title ? (
          <Text style={[typography.screenTitle, { color: colors.ink, fontSize: 25, lineHeight: 31 }]}>{presentation.title}</Text>
        ) : null}
        {presentation.body ? <BodyText style={{ fontSize: 17, lineHeight: 25 }}>{presentation.body}</BodyText> : null}
        {presentation.body ? <LinkPreview text={presentation.body} /> : null}
      </View>
      <VerseList verse={currentEntry.verse} verses={currentEntry.verses} maxLines={99} showFullText />
      <View style={{ gap: 8 }}>
        <SectionHeading>{t(isSharedCheckIn ? "me.journey.detail.sharedWith" : "me.journey.detail.privacy")}</SectionHeading>
        {isSharedCheckIn ? (
          <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
            <RoomImage image={group?.image} name={group?.name ?? t("tabs.community")} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.label, { color: colors.ink }]}>{group?.name ?? t("tabs.community")}</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{t("me.journey.detail.sharedWithCommunity")}</Text>
            </View>
          </Card>
        ) : (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 4 }}>
            <Feather name="lock" size={14} color={colors.muted} />
            <Text style={[typography.caption, { color: colors.muted }]}>{t("me.journey.detail.privateOnly")}</Text>
          </View>
        )}
      </View>
      {isSharedCheckIn ? null : (
        <SecondaryButton icon="edit-2" onPress={openEditor}>
          {t("common.edit")}
        </SecondaryButton>
      )}
      <SharedComposer
        visible={composerVisible}
        context="journal"
        kind={entryKind}
        entryVisibility={entryVisibility}
        title={title}
        body={body}
        verses={verses}
        editing
        onKind={setEntryKind}
        onVisibility={setEntryVisibility}
        onTitle={setTitle}
        onBody={setBody}
        onVerses={setVerses}
        onClose={() => setComposerVisible(false)}
        onSubmit={submitEdit}
        roomName={group?.name}
        roomImage={group?.image}
      />
      <BottomSheet
        title={t(isSharedCheckIn ? "community.card.deleteCheckInTitle" : "me.journey.detail.deleteTitle")}
        visible={deleteConfirmVisible}
        onClose={() => setDeleteConfirmVisible(false)}
      >
        <BodyText muted>{t(isSharedCheckIn ? "community.card.deleteCheckInBody" : "me.journey.detail.deleteMessage")}</BodyText>
        <SecondaryButton
          accessibilityLabel={t("me.journey.detail.confirmDelete")}
          icon="trash-2"
          tone="danger"
          onPress={deleteEntry}
        >
          {t("common.delete")}
        </SecondaryButton>
        <SecondaryButton onPress={() => setDeleteConfirmVisible(false)}>{t("common.cancel")}</SecondaryButton>
      </BottomSheet>
    </AppScreen>
  );
}
