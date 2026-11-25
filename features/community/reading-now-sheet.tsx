import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { bibleBookLanguage, displayBibleBookName } from "@/features/bible-book-names";
import { verseCountForChapter, type BiblePosition } from "@/features/bible-canon";
import type { BibleVersionId } from "@/features/bible-kjv";
import type { CommunityMember } from "@/features/community/types";
import type { ReadingEntry, ReadingStatus } from "@/state/reading-model";
import type { ReadingShareScope } from "@/state/reading-share";
import { AppSheet } from "@/ui/app-sheet";
import { Avatar } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";

const avatarTones = ["orange", "green", "pink", "blue"] as const;

const scopeOptions: ReadingShareScope[] = ["off", "chapter", "verse"];

function scopeLabelKey(scope: ReadingShareScope) {
  if (scope === "chapter") return "reading.share.chapter" as const;
  if (scope === "verse") return "reading.share.verse" as const;
  return "reading.share.off" as const;
}

function hintKey(scope: ReadingShareScope) {
  if (scope === "chapter") return "reading.share.hint.chapter" as const;
  if (scope === "verse") return "reading.share.hint.verse" as const;
  return "reading.share.hint.off" as const;
}

export function ReadingNowSheet({
  currentPosition,
  currentUserId,
  entries,
  members,
  onClose,
  onFollow,
  onScopeChange,
  scope,
  showShare = true,
  visible,
}: {
  currentPosition?: BiblePosition;
  currentUserId?: string;
  entries: ReadingEntry[];
  members: CommunityMember[];
  onClose: () => void;
  onFollow?: (entry: ReadingEntry) => void;
  onScopeChange?: (scope: ReadingShareScope) => void;
  scope?: ReadingShareScope;
  showShare?: boolean;
  visible: boolean;
}) {
  const { language, t } = useAppTranslation();
  const bookLanguage = bibleBookLanguage(language);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  // The member's own row is never shown; the footer states what they share.
  const visibleEntries = currentUserId
    ? entries.filter((entry) => entry.userId !== currentUserId)
    : entries;

  const live = visibleEntries.filter((entry) => entry.status === "live");
  const sameChapter = currentPosition
    ? live.filter((entry) => entry.book === currentPosition.book && entry.chapter === currentPosition.chapter)
    : [];
  const elsewhere = live.filter((entry) => !sameChapter.includes(entry));
  const recent = visibleEntries.filter((entry) => entry.status === "recent");

  const renderRows = (rows: ReadingEntry[]) => rows.map((entry, index) => {
    const member = memberById.get(entry.userId);
    return <ReadingRow
      key={entry.userId}
      entry={entry}
      image={member?.image}
      name={member?.name ?? t("common.someone")}
      tone={avatarTones[index % avatarTones.length]}
      bookName={displayBibleBookName(entry.book, bookLanguage)}
      onFollow={onFollow && entry.status === "live" ? () => onFollow(entry) : undefined}
    />;
  });

  return <AppSheet
    visible={visible}
    onClose={onClose}
    title={t("reading.title")}
    backgroundColor={colors.paper}
    foregroundColor={colors.ink}
    scroll
  >
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
      {t("reading.sheet.subtitle")}
    </Text>

    {visibleEntries.length === 0 ? (
      <View style={{ alignItems: "center", backgroundColor: colors.cream, borderRadius: radius.lg, gap: 8, paddingHorizontal: 20, paddingVertical: 26 }}>
        <View style={{ alignItems: "center", backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 999, borderWidth: 1, height: 46, justifyContent: "center", width: 46 }}>
          <Feather name="book-open" size={20} color={colors.muted} />
        </View>
        <Text style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
          {t("reading.sheet.emptyTitle")}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }}>
          {t("reading.sheet.emptyBody")}
        </Text>
      </View>
    ) : (
      <View style={{ gap: 18 }}>
        {sameChapter.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("reading.sheet.sameChapter")}</Text>
            <View style={{ gap: 4 }}>{renderRows(sameChapter)}</View>
          </View>
        ) : null}

        {elsewhere.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted }]}>
              {sameChapter.length > 0 ? t("reading.sheet.others") : t("reading.title")}
            </Text>
            <View style={{ gap: 4 }}>{renderRows(elsewhere)}</View>
          </View>
        ) : null}

        {recent.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("reading.sheet.recent")}</Text>
            <View style={{ gap: 4 }}>{renderRows(recent)}</View>
          </View>
        ) : null}
      </View>
    )}

    {showShare && onScopeChange && scope ? (
      <View style={{ borderTopColor: colors.line, borderTopWidth: 1, gap: 10, paddingTop: 16 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Feather name="eye" size={15} color={colors.muted} />
          <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{t("reading.share.title")}</Text>
        </View>
        <View accessibilityLabel={t("reading.a11y.share")} style={{ flexDirection: "row", gap: 6 }}>
          {scopeOptions.map((option) => {
            const chosen = scope === option;
            return <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => onScopeChange(option)}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: chosen ? colors.ink : colors.paper,
                borderColor: chosen ? colors.ink : colors.line,
                borderRadius: radius.md,
                borderWidth: 1,
                flex: 1,
                justifyContent: "center",
                minHeight: 42,
                opacity: pressed ? 0.75 : 1,
                paddingHorizontal: 6,
              })}
            >
              <Text numberOfLines={1} style={{ color: chosen ? colors.paper : colors.ink, fontSize: 13, fontWeight: "600" }}>
                {t(scopeLabelKey(option))}
              </Text>
            </Pressable>;
          })}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>{t(hintKey(scope))}</Text>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, opacity: 0.9 }}>{t("reading.share.privacy")}</Text>
      </View>
    ) : null}
  </AppSheet>;
}

function ReadingRow({
  bookName,
  entry,
  image,
  name,
  onFollow,
  tone,
}: {
  bookName: string;
  entry: ReadingEntry;
  image?: CommunityMember["image"];
  name: string;
  onFollow?: () => void;
  tone: (typeof avatarTones)[number];
}) {
  const { t } = useAppTranslation();
  const libraryStatus: ReadingStatus = entry.status === "live" ? "live" : "recent";
  const chapterOnly = entry.scope === "chapter";
  const total = chapterOnly
    ? undefined
    : verseCountForChapter(entry.book, entry.chapter, (entry.versionId ?? "kjv") as BibleVersionId);
  const progress = total && entry.verse ? Math.min(1, Math.max(0.04, entry.verse / total)) : undefined;

  return <View style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: 54, paddingVertical: 2 }}>
    <View>
      <Avatar image={image} name={name} size={38} status={libraryStatus === "live" ? "online" : "inactive"} tone={tone} />
    </View>
    <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: "600" }}>{name}</Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 6, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: libraryStatus === "live" ? colors.textSecondary : colors.muted, flexShrink: 1, fontSize: 12 }}>
          {chapterOnly
            ? `${bookName} ${entry.chapter}`
            : `${bookName} ${entry.chapter}:${entry.verse}`}
        </Text>
        {chapterOnly ? (
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>· {t("reading.sheet.chapterOnly")}</Text>
        ) : null}
        {libraryStatus === "recent" ? (
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>· {t("reading.sheet.recent")}</Text>
        ) : null}
      </View>
      {progress !== undefined ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ backgroundColor: colors.line, borderRadius: 999, height: 3, overflow: "hidden", width: "100%" }}>
          <View style={{ backgroundColor: colors.ink, height: 3, opacity: 0.32, width: `${Math.round(progress * 100)}%` }} />
        </View>
      ) : null}
    </View>
    {onFollow ? (
      <Pressable
        accessibilityLabel={`${t("reading.follow")} ${name}`}
        accessibilityRole="button"
        onPress={onFollow}
        style={({ pressed }) => ({
          alignItems: "center",
          borderColor: colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 4,
          minHeight: 34,
          opacity: pressed ? 0.7 : 1,
          paddingHorizontal: 10,
        })}
      >
        <Feather name="corner-down-right" size={13} color={colors.ink} />
        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "600" }}>{t("reading.follow")}</Text>
      </Pressable>
    ) : null}
  </View>;
}
