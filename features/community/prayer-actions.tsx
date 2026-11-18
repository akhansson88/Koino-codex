import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Id } from "@/state/types";
import { AppScreen, Avatar, BodyText, Card, FullScreenModal, IconButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";
import { type CommunityPrayerAssignment, type CommunityMember } from "@/features/community/types";

export function CommunityPrayerActions({
  activeAssignment,
  groupId,
  members,
  onPrayForPerson,
  onPrayForRequests,
}: {
  activeAssignment?: CommunityPrayerAssignment;
  groupId: Id;
  members: CommunityMember[];
  onPrayForPerson: (assignedMember?: CommunityMember) => void;
  onPrayForRequests: () => void;
}) {
  const { t } = useAppTranslation();
  const [assignmentClock, setAssignmentClock] = useState(Date.now);

  useEffect(() => {
    const weekStartsAt = Date.parse(activeAssignment?.weekStartsAt ?? "");
    const weekEndsAt = Date.parse(activeAssignment?.weekEndsAt ?? "");
    if (!Number.isFinite(weekStartsAt) || !Number.isFinite(weekEndsAt)) return;

    let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextBoundary = () => {
      const currentTime = Date.now();
      const nextBoundary = [weekStartsAt, weekEndsAt]
        .filter((boundary) => boundary > currentTime)
        .sort((left, right) => left - right)[0];
      if (!nextBoundary) return;

      boundaryTimer = setTimeout(() => {
        setAssignmentClock(Date.now());
        scheduleNextBoundary();
      }, Math.min(nextBoundary - currentTime + 25, 2_147_000_000));
    };

    scheduleNextBoundary();
    return () => {
      if (boundaryTimer) clearTimeout(boundaryTimer);
    };
  }, [activeAssignment?.weekEndsAt, activeAssignment?.weekStartsAt]);

  const now = Math.max(assignmentClock, Date.now());
  const weekStartsAt = Date.parse(activeAssignment?.weekStartsAt ?? "");
  const weekEndsAt = Date.parse(activeAssignment?.weekEndsAt ?? "");
  const assignmentIsCurrent = Boolean(
    activeAssignment?.groupId === groupId
      && Number.isFinite(weekStartsAt)
      && Number.isFinite(weekEndsAt)
      && weekStartsAt <= now
      && now < weekEndsAt,
  );
  const assignedMember = activeAssignment && assignmentIsCurrent
    ? members.find((member) => member.id === activeAssignment.memberId)
    : undefined;
  const assignedName = assignedMember?.name.trim();
  const activeAssignedMember = assignedName ? assignedMember : undefined;
  const personIsPrimary = Boolean(activeAssignedMember);
  const assignedFirstName = assignedName?.split(/\s+/)[0];

  return (
    <View style={{ alignItems: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <CommunityPrayerAction
        icon="list"
        onPress={onPrayForRequests}
        primary={!personIsPrimary}
        subtitle={t("community.prayer.actions.viewRequests")}
        title={t("community.prayer.actions.prayForRequests")}
      />
      <CommunityPrayerAction
        member={activeAssignedMember}
        icon="users"
        onPress={() => onPrayForPerson(activeAssignedMember)}
        primary={personIsPrimary}
        subtitle={t(activeAssignedMember ? "community.prayer.actions.thisWeeksPerson" : "community.prayer.actions.chooseMember")}
        title={assignedFirstName ? t("community.prayer.actions.prayForPerson", { name: assignedFirstName }) : t("community.prayer.actions.prayForSomeone")}
      />
    </View>
  );
}

function CommunityPrayerAction({
  icon,
  member,
  onPress,
  primary,
  subtitle,
  title,
}: {
  icon: "list" | "users";
  member?: CommunityMember;
  onPress: () => void;
  primary: boolean;
  subtitle: string;
  title: string;
}) {
  const { t } = useAppTranslation();
  const titleColor = primary ? shadcn.primaryForeground : colors.ink;
  const subtitleColor = primary ? shadcn.primaryForeground : colors.muted;

  return (
    <Pressable
      accessibilityLabel={`${member ? t("community.prayer.actions.prayForPerson", { name: member.name }) : title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: primary ? shadcn.primary : shadcn.card,
        borderColor: primary ? shadcn.primary : shadcn.border,
        borderRadius: radius.xl,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: 8,
        minHeight: 70,
        minWidth: 140,
        paddingHorizontal: 9,
        paddingVertical: 9,
        ...shadows.card,
      }}
    >
      {member ? (
        <Avatar image={member.image} name={member.name} size={34} tone="green" />
      ) : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: primary ? "rgba(255, 255, 255, 0.14)" : shadcn.secondary,
            borderRadius: radius.md,
            height: 32,
            justifyContent: "center",
            width: 32,
          }}
        >
          <Feather name={icon} size={16} color={primary ? shadcn.primaryForeground : colors.ink} />
        </View>
      )}
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[typography.label, { color: titleColor }]}>
          {title}
        </Text>
        <Text numberOfLines={2} style={[typography.caption, { color: subtitleColor, fontSize: 11, lineHeight: 14 }]}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export function CommunityPrayerMemberModal({
  members,
  onClose,
  onSelect,
  visible,
}: {
  members: CommunityMember[];
  onClose: () => void;
  onSelect: (member: CommunityMember) => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel={t("common.close")} icon="arrow-left" onPress={onClose} />
          <Text style={[typography.caption, { color: colors.muted }]}>{t("community.prayer.actions.prayForSomeone")}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("community.prayer.memberPromptTitle")}</Text>
          <BodyText muted>{t("community.prayer.memberPromptBody")}</BodyText>
        </View>
        <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
          {members.map((member) => (
            <Pressable accessibilityRole="button" key={member.id} onPress={() => onSelect(member)}>
              <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, padding: 14 }}>
                <Avatar image={member.image} name={member.name} size={46} tone="green" />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[typography.cardTitle, { color: colors.ink }]}>{member.name}</Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>{t("community.prayer.actions.prayForPerson", { name: member.name })}</Text>
                </View>
                <Feather name="heart" size={18} color={shadcn.brand} />
              </Card>
            </Pressable>
          ))}
          {members.length === 0 ? (
            <Card>
              <BodyText muted>{t("community.prayer.noOtherMembers")}</BodyText>
            </Card>
          ) : null}
        </ScrollView>
      </AppScreen>
    </FullScreenModal>
  );
}
