import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { PresenceInfo, PresenceStatus } from "@/state/presence-model";
import { comparePresenceMembers, presenceCounts } from "@/state/presence-model";
import { useCommunityPresence } from "@/state/presence";
import type { FeedItem, Group, GroupImage, GroupRole, Id } from "@/state/types";
import { Avatar, BodyText, Card, PrimaryButton, RoomImage, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount, communityMoodScaleLabel } from "@/ui/community-copy";
import { groupRoleIcon, groupRoleLabelKey, groupRoleTone } from "@/features/community/roles";
import {
  presenceAccessibilityLabel,
  presenceDotColor,
  presenceStatusText,
} from "@/ui/presence-copy";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { colors, radius, shadcn, typography } from "@/ui/theme";

type PresenceFilter = "all" | Exclude<PresenceStatus, "hidden">;

type Member = { id: Id; image?: GroupImage; name: string; role: GroupRole };

const statusRank: Record<PresenceStatus, number> = { online: 0, inactive: 1, offline: 2, hidden: 3 };

export function MembersPanel({
  currentUserId,
  group,
  latestCheckInByUser,
  memberCount,
  members,
  offline,
  onInvite,
  onManage,
  onSwitchRoom,
}: {
  currentUserId?: Id;
  group: Group;
  latestCheckInByUser: Map<Id, Extract<FeedItem, { type: "check_in" }>>;
  memberCount: number;
  members: Member[];
  offline?: boolean;
  onInvite: () => void;
  onManage: () => void;
  onSwitchRoom: () => void;
}) {
  const { t, language } = useAppTranslation();
  const { now, presence } = useCommunityPresence(group.id);
  const [filter, setFilter] = useState<PresenceFilter>("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => presenceCounts(presence, members.map((member) => member.id)), [members, presence]);

  const prepared = useMemo(() => {
    const search = query.trim().toLocaleLowerCase(language);
    return members
      .map((member) => {
        const info = presence[member.id];
        return { ...member, info, status: info?.status ?? ("offline" as PresenceStatus) };
      })
      .filter((member) => !search || member.name.toLocaleLowerCase(language).includes(search))
      .sort((left, right) => {
        if (left.id === currentUserId) return -1;
        if (right.id === currentUserId) return 1;
        if (statusRank[left.status] !== statusRank[right.status]) return statusRank[left.status] - statusRank[right.status];
        return comparePresenceMembers(
          { id: left.id, name: left.name, lastSeen: left.info?.lastSeen },
          { id: right.id, name: right.name, lastSeen: right.info?.lastSeen },
          left.status,
          language,
        );
      });
  }, [currentUserId, language, members, presence, query]);

  const visible = useMemo(
    () => (filter === "all" ? prepared : prepared.filter((member) => member.status === filter)),
    [filter, prepared],
  );
  const sections = useMemo(() => {
    const order: PresenceStatus[] = filter === "all" ? ["online", "inactive", "offline", "hidden"] : [filter];
    return order
      .map((status) => ({
        status,
        members: visible.filter((member) => member.status === status),
      }))
      .filter((section) => section.members.length > 0);
  }, [filter, visible]);

  const filters: { value: PresenceFilter; label: string; count: number }[] = [
    { value: "all", label: t("presence.filter.all"), count: members.length },
    { value: "online", label: t("presence.filter.online"), count: counts.online },
    { value: "inactive", label: t("presence.filter.inactive"), count: counts.inactive },
    { value: "offline", label: t("presence.filter.offline"), count: counts.offline },
  ];

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <RoomImage image={group.image} name={group.name} size={58} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={[typography.title, { color: colors.ink }]}>{group.name}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{communityMemberCount(memberCount, t)}</Text>
        </View>
      </Card>

      {members.length > 15 ? (
        <View style={{ justifyContent: "center" }}>
          <Feather
            name="search"
            size={16}
            color={colors.muted}
            style={{ left: 14, position: "absolute", top: 14, zIndex: 1 }}
          />
          <TextInput
            accessibilityLabel={t("presence.search.placeholder")}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            onChangeText={setQuery}
            placeholder={t("presence.search.placeholder")}
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={{
              backgroundColor: colors.input,
              borderColor: colors.line,
              borderRadius: radius.md,
              borderWidth: 1,
              color: colors.ink,
              fontFamily: typography.body.fontFamily,
              fontSize: 15,
              minHeight: 44,
              paddingHorizontal: 38,
              paddingVertical: 10,
            }}
            value={query}
          />
          {query ? (
            <Pressable
              accessibilityLabel={t("presence.search.clear")}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setQuery("")}
              style={{ padding: 10, position: "absolute", right: 2, top: 2 }}
            >
              <Feather name="x" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {filters.map((option) => {
          const selected = option.value === filter;
          return (
            <Pressable
              accessibilityLabel={`${option.label} ${option.count}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => setFilter(option.value)}
              style={{
                alignItems: "center",
                backgroundColor: selected ? shadcn.primary : shadcn.card,
                borderColor: selected ? shadcn.primary : shadcn.border,
                borderRadius: radius.md,
                borderWidth: 1,
                flexDirection: "row",
                gap: 6,
                minHeight: 38,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              {option.value === "online" ? (
                <View style={{ backgroundColor: selected ? colors.white : colors.moss, borderRadius: 999, height: 7, width: 7 }} />
              ) : option.value === "inactive" ? (
                <View style={{ backgroundColor: selected ? colors.white : colors.gold, borderRadius: 999, height: 7, width: 7 }} />
              ) : null}
              <Text style={[typography.caption, { color: selected ? shadcn.primaryForeground : colors.muted }]}>
                {`${option.label} ${option.count}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {offline ? (
        <Text style={[typography.caption, { color: colors.muted }]}>{t("presence.offlineNotice")}</Text>
      ) : null}

      {sections.length > 0 ? (
        sections.map((section) => {
          const label = t(
            section.status === "online"
              ? "presence.section.online"
              : section.status === "inactive"
                ? "presence.section.inactive"
                : section.status === "hidden"
                  ? "presence.section.hidden"
                  : "presence.section.offline",
          );
          return (
            <View key={section.status} style={{ gap: 6 }}>
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
                  <View style={{ backgroundColor: presenceDotColor(section.status), borderRadius: 999, height: 7, width: 7 }} />
                  <Text style={[typography.sectionLabel, { color: colors.muted }]}>{label}</Text>
                </View>
                <Text style={[typography.caption, { color: colors.muted }]}>{section.members.length}</Text>
              </View>
              <Card style={{ gap: 0, padding: 0 }}>
                {section.members.map((member, index) => (
                  <MemberRow
                    checkIn={latestCheckInByUser.get(member.id)}
                    divider={index < section.members.length - 1}
                    info={member.info}
                    isCurrentUser={member.id === currentUserId}
                    key={member.id}
                    member={member}
                    now={now}
                  />
                ))}
              </Card>
            </View>
          );
        })
      ) : (
        <Card>
          <BodyText muted>{t("presence.empty.filter")}</BodyText>
        </Card>
      )}

      <PrimaryButton icon="share-2" onPress={onInvite}>
        {t("community.members.invite")}
      </PrimaryButton>
      <Card>
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.rooms.code")}</Text>
        <RoomCodeCopy code={group.inviteCode} />
      </Card>
      <SecondaryButton icon="settings" onPress={onManage}>
        {t("community.management.title")}
      </SecondaryButton>
      <SecondaryButton icon="repeat" onPress={onSwitchRoom}>
        {t("community.rooms.joinOrCreate")}
      </SecondaryButton>
    </View>
  );
}

function MemberRow({
  checkIn,
  divider,
  info,
  isCurrentUser,
  member,
  now,
}: {
  checkIn?: Extract<FeedItem, { type: "check_in" }>;
  divider: boolean;
  info?: PresenceInfo;
  isCurrentUser: boolean;
  member: Member;
  now: number;
}) {
  const { t, language } = useAppTranslation();
  const status = info?.status ?? "offline";
  const roleIcon = groupRoleIcon(member.role);
  return (
    <View
      accessibilityLabel={presenceAccessibilityLabel(member.name, info, now, t, language)}
      accessible
      style={{
        alignItems: "center",
        borderBottomColor: colors.line,
        borderBottomWidth: divider ? 1 : 0,
        flexDirection: "row",
        gap: 12,
        padding: 14,
      }}
    >
      <Avatar
        image={member.image}
        name={member.name}
        size={40}
        status={status}
        tone={groupRoleTone(member.role)}
      />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6, minWidth: 0 }}>
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, flexShrink: 1, fontSize: 15 }]}>
            {member.name}
          </Text>
          {roleIcon ? (
            <Feather name={roleIcon} size={13} color={member.role === "leader" ? colors.rose : colors.muted} />
          ) : null}
          {isCurrentUser ? (
            <View style={{ backgroundColor: colors.input, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={[typography.caption, { color: colors.muted, fontSize: 11 }]}>{t("presence.you")}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[typography.caption, { color: member.role === "leader" ? colors.ink : colors.muted }]}>
          {t(groupRoleLabelKey(member.role))}
        </Text>
        {checkIn ? (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
            {t("community.members.lastCheckIn", { mood: communityMoodScaleLabel(checkIn.mood, t) })}
          </Text>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        style={[
          typography.caption,
          {
            color: status === "online" ? colors.moss : status === "inactive" ? colors.gold : colors.muted,
            maxWidth: "42%",
            textAlign: "right",
          },
        ]}
      >
        {presenceStatusText(info, now, t, language)}
      </Text>
    </View>
  );
}
