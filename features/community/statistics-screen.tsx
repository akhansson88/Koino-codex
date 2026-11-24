import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useKoino } from "@/state/koino-store";
import { loadGroupStatistics } from "@/state/encryption/session";
import type { GroupStatistics, GroupStatisticsDays } from "@/state/types";
import { AppHeader, AppScreen, Avatar, BodyText, Card, FilterChips, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMoodScaleLabel } from "@/ui/community-copy";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors, shadcn, typography } from "@/ui/theme";
import { canViewGroupStatistics, groupRoleFor, groupRoleLabelKey, groupRoleTone } from "@/features/community/roles";

const rangeOptions: { labelKey: "community.statistics.range.7" | "community.statistics.range.30" | "community.statistics.range.90"; value: "7" | "30" | "90" }[] = [
  { labelKey: "community.statistics.range.7", value: "7" },
  { labelKey: "community.statistics.range.30", value: "30" },
  { labelKey: "community.statistics.range.90", value: "90" },
];

function Metric({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: string;
}) {
  return (
    <Card style={{ flexBasis: 148, flexGrow: 1, gap: 5, padding: 16 }}>
      <Text style={[typography.screenTitle, { color: colors.ink, fontSize: 28, lineHeight: 32 }]}>{value}</Text>
      <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
      {hint ? <Text style={[typography.caption, { color: colors.muted }]}>{hint}</Text> : null}
    </Card>
  );
}

function SectionHeading({ children }: { children: string }) {
  return <Text style={[typography.title, { color: colors.ink }]}>{children}</Text>;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
      <Text style={[typography.body, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text style={[typography.cardTitle, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: shadcn.secondary, borderRadius: 999, height: 7, overflow: "hidden", width: "100%" }}
    >
      <View style={{ backgroundColor: shadcn.brand, borderRadius: 999, height: "100%", width: `${Math.max(0, Math.min(100, value))}%` }} />
    </View>
  );
}

function trendLabel(start: string, bucket: "day" | "week", language: "en" | "sv") {
  const date = new Date(`${start}T12:00:00`);
  if (Number.isNaN(date.getTime())) return start;
  return new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en", bucket === "day"
    ? { weekday: "short" }
    : { day: "numeric", month: "short" }).format(date);
}

function TrendChart({ data, language }: { data: GroupStatistics; language: "en" | "sv" }) {
  const { t } = useAppTranslation();
  const maximum = Math.max(
    1,
    ...data.trend.points.map((point) => point.checkIns + point.posts + point.replies + point.prayers),
  );
  const segmentHeight = (value: number) => (value / maximum) * 88;
  const legend = [
    { color: shadcn.brand, label: t("community.statistics.trendCheckIns") },
    { color: colors.gold, label: t("community.statistics.trendPosts") },
    { color: colors.moss, label: t("community.statistics.trendReplies") },
    { color: colors.rose, label: t("community.statistics.trendPrayers") },
  ];
  const labelEvery = data.trend.points.length > 8 ? 2 : 1;

  return (
    <Card>
      <SectionHeading>{t("community.statistics.trendTitle")}</SectionHeading>
      <View style={{ flexDirection: "row", gap: 4, height: 126 }}>
        {data.trend.points.map((point, index) => {
          const total = point.checkIns + point.posts + point.replies + point.prayers;
          return (
            <View key={point.start} style={{ alignItems: "center", flex: 1, gap: 5, justifyContent: "flex-end" }}>
              <View
                accessibilityLabel={t("community.statistics.trendValue", {
                  checkIns: point.checkIns,
                  posts: point.posts,
                  prayers: point.prayers,
                  replies: point.replies,
                })}
                style={{ height: 94, justifyContent: "flex-end", width: "100%" }}
              >
                <View
                  style={{
                    backgroundColor: shadcn.secondary,
                    borderRadius: 4,
                    height: total > 0 ? Math.max(4, (total / maximum) * 88) : 2,
                    overflow: "hidden",
                    width: "100%",
                  }}
                >
                  {point.prayers > 0 ? <View style={{ backgroundColor: colors.rose, height: segmentHeight(point.prayers) }} /> : null}
                  {point.replies > 0 ? <View style={{ backgroundColor: colors.moss, height: segmentHeight(point.replies) }} /> : null}
                  {point.posts > 0 ? <View style={{ backgroundColor: colors.gold, height: segmentHeight(point.posts) }} /> : null}
                  {point.checkIns > 0 ? <View style={{ backgroundColor: shadcn.brand, height: segmentHeight(point.checkIns) }} /> : null}
                </View>
              </View>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, fontSize: 10 }]}>
                {index % labelEvery === 0 ? trendLabel(point.start, data.trend.bucket, language) : ""}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {legend.map((item) => (
          <View key={item.label} style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            <View style={{ backgroundColor: item.color, borderRadius: 999, height: 8, width: 8 }} />
            <Text style={[typography.caption, { color: colors.muted }]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function CommunityStatisticsScreen() {
  const { state } = useKoino();
  const { language, t } = useAppTranslation();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const membership = state.memberships.find((item) => item.userId === state.currentUserId);
  const role = groupRoleFor(group, membership, state.currentUserId);
  const allowed = canViewGroupStatistics(role);
  const [days, setDays] = useState<GroupStatisticsDays>(30);
  const [data, setData] = useState<GroupStatistics>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!allowed || !group) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    setData(undefined);
    void loadGroupStatistics(group.id, days)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed, days, group?.id, attempt]);

  const rangeOptionsWithLabels = useMemo(
    () => rangeOptions.map((option) => ({ label: t(option.labelKey), value: option.value })),
    [t],
  );

  if (!group) {
    return (
      <AppScreen>
        <AppHeader showBack onBack={() => router.back()} />
        <Card>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.statistics.noCommunity")}</Text>
          <SecondaryButton icon="arrow-left" onPress={() => router.back()}>
            {t("common.back")}
          </SecondaryButton>
        </Card>
      </AppScreen>
    );
  }

  if (!allowed) {
    return (
      <AppScreen>
        <AppHeader showBack onBack={() => router.back()} />
        <Card>
          <View style={{ alignItems: "center", backgroundColor: shadcn.secondary, borderRadius: 999, height: 52, justifyContent: "center", width: 52 }}>
            <Feather name="lock" size={22} color={colors.muted} />
          </View>
          <Text style={[typography.title, { color: colors.ink }]}>{t("community.statistics.restrictedTitle")}</Text>
          <BodyText muted>{t("community.statistics.restrictedBody")}</BodyText>
          <SecondaryButton icon="arrow-left" onPress={() => router.back()}>
            {t("common.back")}
          </SecondaryButton>
        </Card>
      </AppScreen>
    );
  }

  const updatedTime = data
    ? new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.generatedAt))
    : "";

  return (
    <AppScreen>
      <AppHeader showBack onBack={() => router.back()} />
      <View style={{ gap: 6 }}>
        <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("community.statistics.title")}</Text>
        <BodyText muted>{t("community.statistics.subtitle", { name: group.name })}</BodyText>
      </View>

      <FilterChips
        fit
        options={rangeOptionsWithLabels}
        value={String(days) as "7" | "30" | "90"}
        onChange={(value) => setDays(Number(value) as GroupStatisticsDays)}
      />

      {loading && !data ? (
        <Card style={{ alignItems: "center", gap: 10, paddingVertical: 32 }}>
          <ActivityIndicator color={colors.ink} />
          <BodyText muted>{t("community.statistics.loading")}</BodyText>
        </Card>
      ) : null}

      {failed && !data ? (
        <Card>
          <Text style={[typography.cardTitle, { color: colors.danger }]}>{t("community.statistics.error")}</Text>
          <SecondaryButton icon="refresh-cw" onPress={() => setAttempt((value) => value + 1)}>
            {t("community.statistics.retry")}
          </SecondaryButton>
        </Card>
      ) : null}

      {data ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Metric
              hint={t("community.statistics.ofMembers", { total: data.members.total })}
              label={t("community.statistics.activeMembers")}
              value={String(data.members.active)}
            />
            <Metric
              hint={t("community.statistics.leaderCount", { count: data.members.leaders })}
              label={t("community.statistics.members")}
              value={String(data.members.total)}
            />
            <Metric
              label={t("community.statistics.checkInRate")}
              value={`${data.checkIns.rate}%`}
            />
            <Metric
              label={t("community.statistics.prayerRequests")}
              value={String(data.prayers.requests)}
            />
          </View>

          {data.members.active === 0 && data.checkIns.total === 0 && data.posts.total === 0 && data.replies.total === 0 && data.prayers.offered === 0 ? (
            <Card>
              <BodyText muted>{t("community.statistics.empty")}</BodyText>
            </Card>
          ) : null}

          <Card>
            <SectionHeading>{t("community.statistics.checkInsTitle")}</SectionHeading>
            <MetricRow label={t("community.statistics.checkIns")} value={String(data.checkIns.total)} />
            <MetricRow label={t("community.statistics.uniqueMembers")} value={String(data.checkIns.uniqueMembers)} />
            <MetricRow label={t("community.statistics.readToday")} value={`${data.checkIns.readTodayRate}%`} />
            <MetricRow
              label={t("community.statistics.moodAverage")}
              value={data.checkIns.mood.average === null ? "–" : String(data.checkIns.mood.average)}
            />
            <Text style={[typography.sectionLabel, { color: colors.muted, marginTop: 4 }]}>
              {t("community.statistics.moodDistribution")}
            </Text>
            {data.checkIns.total === 0 ? (
              <BodyText muted>{t("community.statistics.noCheckIns")}</BodyText>
            ) : (
              data.checkIns.mood.distribution.map((bucket) => {
                const maximum = Math.max(1, ...data.checkIns.mood.distribution.map((item) => item.count));
                return (
                  <View key={bucket.mood} style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                    <Text style={[typography.caption, { color: colors.ink, width: 82 }]}>
                      {communityMoodScaleLabel(bucket.mood, t)}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <ProgressBar value={(bucket.count / maximum) * 100} />
                    </View>
                    <Text style={[typography.caption, { color: colors.muted, textAlign: "right", width: 24 }]}>
                      {bucket.count}
                    </Text>
                  </View>
                );
              })
            )}
          </Card>

          <Card>
            <SectionHeading>{t("community.statistics.prayerTitle")}</SectionHeading>
            <MetricRow label={t("community.statistics.requests")} value={String(data.prayers.requests)} />
            <MetricRow label={t("community.statistics.answered")} value={String(data.prayers.answered)} />
            <MetricRow label={t("community.statistics.answeredRate")} value={`${data.prayers.answeredRate}%`} />
            <MetricRow label={t("community.statistics.prayersOffered")} value={String(data.prayers.offered)} />
            <MetricRow label={t("community.statistics.prayerMembers")} value={String(data.prayers.uniqueMembers)} />
          </Card>

          <Card>
            <SectionHeading>{t("community.statistics.biblePlansTitle")}</SectionHeading>
            <MetricRow label={t("community.statistics.activePlans")} value={String(data.biblePlans.active)} />
            <MetricRow label={t("community.statistics.planParticipants")} value={String(data.biblePlans.participants)} />
            <MetricRow label={t("community.statistics.completionRate")} value={`${data.biblePlans.completionRate}%`} />
            {data.biblePlans.plans.length === 0 ? (
              <BodyText muted>{t("community.statistics.noPlans")}</BodyText>
            ) : (
              data.biblePlans.plans.map((plan) => (
                <View key={plan.id} style={{ gap: 5 }}>
                  <View style={{ alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
                    <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{plan.title}</Text>
                    <Text style={[typography.caption, { color: colors.muted }]}>
                      {t("community.statistics.planLine", { participants: plan.participants, rate: plan.completionRate })}
                    </Text>
                  </View>
                  <ProgressBar value={plan.completionRate} />
                </View>
              ))
            )}
          </Card>

          <TrendChart data={data} language={language} />

          <Card>
            <SectionHeading>{t("community.statistics.memberTitle")}</SectionHeading>
            <BodyText muted>{t("community.statistics.memberHint")}</BodyText>
            {data.memberActivity.map((member) => (
              <View key={member.userId} style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                <Avatar name={member.name} size={34} tone={groupRoleTone(member.role)} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, fontSize: 14 }]}>
                    {member.name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {t(groupRoleLabelKey(member.role))} · {member.lastActiveAt
                      ? formatRelativeTime(member.lastActiveAt, language)
                      : t("community.statistics.neverActive")}
                  </Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {t("community.statistics.activityCounts", {
                      checkIns: member.checkIns,
                      posts: member.posts,
                      prayers: member.prayers,
                    })}
                  </Text>
                </View>
              </View>
            ))}
          </Card>

          <Card style={{ backgroundColor: shadcn.secondary, borderColor: "transparent", padding: 16 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <Feather name="shield" size={16} color={colors.muted} />
              <Text style={[typography.caption, { color: colors.muted, flex: 1 }]}>
                {t("community.statistics.privacy")}
              </Text>
            </View>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {t("community.statistics.updated", { time: updatedTime })}
            </Text>
            {data.truncated ? (
              <Text style={[typography.caption, { color: colors.muted }]}>
                {t("community.statistics.truncated", { count: 20000 })}
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}
    </AppScreen>
  );
}
