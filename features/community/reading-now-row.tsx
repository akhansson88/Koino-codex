import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { bibleBookLanguage, displayBibleBookName } from "@/features/bible-book-names";
import type { CommunityMember } from "@/features/community/types";
import { useGroupReading } from "@/state/reading-share";
import { Avatar } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";
import { ReadingNowSheet } from "@/features/community/reading-now-sheet";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The community room strip: only live readers, and nothing when the room is quiet. */
export function ReadingNowRow({
  currentUserId,
  groupId,
  members,
}: {
  currentUserId?: string;
  groupId?: string;
  members: CommunityMember[];
}) {
  const { language, t } = useAppTranslation();
  const bookLanguage = bibleBookLanguage(language);
  const { entries } = useGroupReading(groupId);
  const [visible, setVisible] = useState(false);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const live = entries.filter((entry) => entry.status === "live" && entry.userId !== currentUserId);
  if (!groupId || live.length === 0) return null;

  const first = live[0];
  const firstNameLabel = memberById.get(first.userId)?.name ?? t("common.someone");
  const label = `${firstName(firstNameLabel)} · ${displayBibleBookName(first.book, bookLanguage)} ${first.chapter}`;

  return <>
    <Pressable
      accessibilityLabel={`${t("reading.title")}. ${label}`}
      accessibilityRole="button"
      onPress={() => setVisible(true)}
      style={({ pressed }) => ({
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: pressed ? colors.cream : colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 9,
        maxWidth: "100%",
        minHeight: 40,
        paddingHorizontal: 10,
        paddingVertical: 6,
      })}
    >
      <View style={{ flexDirection: "row", height: 24, paddingLeft: 2 }}>
        {live.slice(0, 3).map((entry, index) => (
          <View key={entry.userId} style={{ marginLeft: index === 0 ? 0 : -8 }}>
            <Avatar
              image={memberById.get(entry.userId)?.image}
              name={memberById.get(entry.userId)?.name ?? "K"}
              size={24}
              status="online"
              tone={index % 2 ? "green" : "orange"}
            />
          </View>
        ))}
        {live.length > 3 ? (
          <View style={{ alignItems: "center", backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 999, borderWidth: 1, height: 24, justifyContent: "center", marginLeft: -8, minWidth: 24, paddingHorizontal: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{t("reading.row.more", { count: live.length - 3 })}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[typography.caption, { color: colors.ink, flexShrink: 1 }]}>{label}</Text>
      <Feather name="chevron-right" size={15} color={colors.muted} />
    </Pressable>
    <ReadingNowSheet
      currentUserId={currentUserId}
      entries={entries}
      members={members}
      onClose={() => setVisible(false)}
      visible={visible}
    />
  </>;
}

/**
 * Home gets one quiet card, and only when at least two others are reading, so a
 * single reader never turns the home screen into a status board.
 */
export function ReadingNowHomeCard({
  currentUserId,
  groupId,
  members,
}: {
  currentUserId?: string;
  groupId?: string;
  members: CommunityMember[];
}) {
  const { language, t } = useAppTranslation();
  const bookLanguage = bibleBookLanguage(language);
  const { entries } = useGroupReading(groupId);
  const [visible, setVisible] = useState(false);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const live = entries.filter((entry) => entry.status === "live" && entry.userId !== currentUserId);
  if (!groupId || live.length < 2) return null;

  const preview = live.slice(0, 2)
    .map((entry) => `${firstName(memberById.get(entry.userId)?.name ?? t("common.someone"))} ${displayBibleBookName(entry.book, bookLanguage)} ${entry.chapter}`)
    .join(" · ");

  return <>
    <Pressable
      accessibilityLabel={`${t("reading.home.title", { count: live.length })}. ${preview}`}
      accessibilityRole="button"
      onPress={() => setVisible(true)}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? colors.cream : colors.paper,
        borderColor: colors.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 64,
        paddingHorizontal: 14,
        paddingVertical: 12,
      })}
    >
      <View style={{ flexDirection: "row", height: 32 }}>
        {live.slice(0, 3).map((entry, index) => (
          <View key={entry.userId} style={{ marginLeft: index === 0 ? 0 : -10 }}>
            <Avatar
              image={memberById.get(entry.userId)?.image}
              name={memberById.get(entry.userId)?.name ?? "K"}
              size={32}
              status="online"
              tone={index % 2 ? "pink" : "orange"}
            />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink }]}>
          {t("reading.home.title", { count: live.length })}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{preview}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.muted} />
    </Pressable>
    <ReadingNowSheet
      currentUserId={currentUserId}
      entries={entries}
      members={members}
      onClose={() => setVisible(false)}
      visible={visible}
    />
  </>;
}
