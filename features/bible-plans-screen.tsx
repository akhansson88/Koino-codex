import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  biblePlanReadingRoute,
  completionPercent,
  formatPlanDate,
  planDayMinutes,
  planPace,
  todayDateKey,
} from "@/features/bible-plans";
import {
  biblePlanTemplates,
  displayAnnouncementTitle,
  displayPlanTitle,
  announcementCoverKey,
  localizedPlanText,
  matchesPlanSearch,
  planCategoryOrder,
  planCategoryTranslationKeys,
  planCoverKey,
  planTemplateDays,
  planTemplateRanges,
  type BiblePlanCategory,
  type BiblePlanTemplate,
} from "@/features/bible-plan-library";
import { CreatePlanModal } from "@/features/bible-plan-create";
import { PlanDetailModal, PlanTemplateModal } from "@/features/bible-plan-modals";
import {
  PlanCoverCard,
  PlanCoverImage,
  PlanProgressBar,
  PlanProgressRing,
  PlanThumbnail,
  PlanWeekStrip,
  completionForPlan,
  planReferencesLabel,
} from "@/features/bible-plan-ui";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { scheduledPlanDate } from "@/state/bible-plan-schedule";
import { useKoino } from "@/state/koino-store";
import type { BiblePlan, GroupBiblePlanAnnouncement, GroupBiblePlanParticipation, User } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  FilterChips,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  SectionHeading,
  TextInputField,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { confirmAction } from "@/ui/confirm";
import { SheetMenuGroup, SheetMenuItem } from "@/ui/sheet-menu";
import { colors, radius, shadcn, typography } from "@/ui/theme";

type PlanTab = "today" | "mine" | "library" | "group";
type MineFilter = "active" | "completed";
type LibraryFilter = "all" | BiblePlanCategory;

function mapTab(value?: string): PlanTab {
  if (value === "library") return "library";
  if (value === "group") return "group";
  if (value === "today") return "today";
  if (value === "active" || value === "saved" || value === "mine" || value === "completed") return "mine";
  return "today";
}

export function BiblePlansScreen() {
  const { state, dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const params = useLocalSearchParams<{ filter?: string; tab?: string }>();
  const [tab, setTab] = useState<PlanTab>(() => mapTab(params.tab));
  const [mineFilter, setMineFilter] = useState<MineFilter>(
    params.filter === "completed" || params.tab === "completed" ? "completed" : "active",
  );
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [createVisible, setCreateVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<BiblePlan | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState<BiblePlanTemplate | undefined>();
  const [detailPlanId, setDetailPlanId] = useState<string | undefined>();
  const [menuPlan, setMenuPlan] = useState<BiblePlan | undefined>();
  const [banner, setBanner] = useState<string | undefined>();

  const today = todayDateKey();
  const plans = useMemo(
    () => state.biblePlans.filter((plan) => plan.userId === state.currentUserId),
    [state.biblePlans, state.currentUserId],
  );
  const activePlans = useMemo(() => plans.filter((plan) => plan.status !== "completed"), [plans]);
  const completedPlans = useMemo(() => plans.filter((plan) => plan.status === "completed"), [plans]);
  const highlight = useMemo(() => highlightedPlan(plans, today), [plans, today]);
  const detailPlan = plans.find((plan) => plan.id === detailPlanId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const featured = biblePlanTemplates.filter((template) => template.featured);
  const libraryTemplates = useMemo(
    () => biblePlanTemplates.filter((template) =>
      (libraryFilter === "all" || template.category === libraryFilter) && matchesPlanSearch(template, libraryQuery),
    ),
    [libraryFilter, libraryQuery],
  );

  useEffect(() => {
    setTab(mapTab(params.tab));
    if (params.filter === "completed" || params.tab === "completed") setMineFilter("completed");
  }, [params.filter, params.tab]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(undefined), 6000);
    return () => clearTimeout(timer);
  }, [banner]);

  const tabOptions = useMemo(
    () => [
      { label: t("bible.plans.tab.today"), value: "today" as const },
      { label: t("bible.plans.tab.mine"), value: "mine" as const },
      { label: t("bible.plans.tab.library"), value: "library" as const },
      { label: t("bible.plans.tab.group"), value: "group" as const },
    ],
    [t],
  );

  async function startTemplate(template: BiblePlanTemplate, startDate: string) {
    const days = planTemplateDays(template);
    await dispatch({
      type: "createBiblePlan",
      title: localizedPlanText(template.title, language),
      ranges: planTemplateRanges(template),
      dayCount: template.dayCount,
      startDate,
      days,
      coverKey: template.coverKey,
      templateId: template.id,
    });
    setBanner(t("bible.plans.library.started", { title: localizedPlanText(template.title, language) }));
    setTab("today");
  }

  function openCreate(plan?: BiblePlan) {
    setEditingPlan(plan);
    setCreateVisible(true);
  }

  function openDetail(plan: BiblePlan) {
    setDetailPlanId(plan.id);
  }

  function openReader(plan: BiblePlan, dayNumber: number) {
    router.push(biblePlanReadingRoute(plan.id, dayNumber));
  }

  function continuePlan(plan: BiblePlan) {
    const pace = planPace(plan, today);
    const day = pace.next ?? pace.today;
    if (day) openReader(plan, day.dayNumber);
    else openDetail(plan);
  }

  function confirmAnnounce(plan: BiblePlan) {
    confirmAction({
      title: t("bible.plans.group.announceTitle"),
      message: t("bible.plans.group.announceMessage"),
      confirmText: t("bible.plans.plan.share"),
      cancelText: t("bible.plans.create.cancel"),
      onConfirm: () => {
        void dispatch({ type: "announceBiblePlan", planId: plan.id }).then(() => {
          setMenuPlan(undefined);
          setDetailPlanId(undefined);
          setBanner(t("bible.plans.group.announced"));
          setTab("group");
        });
      },
    });
  }

  function confirmRestart(plan: BiblePlan) {
    confirmAction({
      title: t("bible.plans.plan.restartTitle"),
      message: t("bible.plans.plan.restartMessage"),
      confirmText: t("bible.plans.plan.restartConfirm"),
      cancelText: t("bible.plans.create.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "restartBiblePlan", planId: plan.id, startDate: today }).then(() => {
          setMenuPlan(undefined);
          setDetailPlanId(undefined);
          setBanner(t("bible.plans.plan.restarted"));
        });
      },
    });
  }

  function confirmDelete(plan: BiblePlan) {
    confirmAction({
      title: t("bible.plans.plan.deleteTitle"),
      message: t("bible.plans.plan.deleteMessage"),
      confirmText: t("bible.plans.plan.deleteConfirm"),
      cancelText: t("bible.plans.create.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteBiblePlan", id: plan.id }).then(() => {
          setMenuPlan(undefined);
          setDetailPlanId(undefined);
          setBanner(t("bible.plans.plan.deleted"));
        });
      },
    });
  }

  function togglePause(plan: BiblePlan) {
    setMenuPlan(undefined);
    if (plan.pausedAt) {
      void dispatch({ type: "rescheduleBiblePlan", planId: plan.id, startDate: today });
    } else {
      void dispatch({ type: "pauseBiblePlan", planId: plan.id });
    }
  }

  return (
    <AppScreen>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <IconButton accessibilityLabel={t("bible.plans.back")} icon="arrow-left" onPress={() => router.back()} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("bible.plans.title")}</Text>
          <BodyText muted>{t("bible.plans.description")}</BodyText>
        </View>
        <IconButton
          accessibilityLabel={t("bible.plans.create.title")}
          icon="plus"
          onPress={() => openCreate()}
        />
      </View>

      {banner ? (
        <View
          accessibilityRole="alert"
          style={{
            alignItems: "center",
            backgroundColor: shadcn.successSoft,
            borderColor: "#BBF7D0",
            borderRadius: radius.lg,
            borderWidth: 1,
            flexDirection: "row",
            gap: 10,
            padding: 12,
          }}
        >
          <Feather color={shadcn.success} name="check-circle" size={18} />
          <Text style={[typography.label, { color: shadcn.success, flex: 1 }]}>{banner}</Text>
          <Pressable accessibilityLabel={t("bible.plans.create.cancel")} accessibilityRole="button" onPress={() => setBanner(undefined)} style={{ padding: 4 }}>
            <Feather color={shadcn.success} name="x" size={16} />
          </Pressable>
        </View>
      ) : null}

      <FilterChips options={tabOptions} value={tab} onChange={setTab} />
      {state.authError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{state.authError}</Text> : null}

      {tab === "today" ? (
        <TodayTab
          activePlans={activePlans}
          featured={featured}
          highlight={highlight}
          onCreate={() => openCreate()}
          onContinue={continuePlan}
          onExplore={() => setTab("library")}
          onJump={(plan, dayNumber) => openReader(plan, dayNumber)}
          onOpen={openDetail}
          onOpenTemplate={setSelectedTemplate}
          onViewAll={() => setTab("mine")}
        />
      ) : null}

      {tab === "mine" ? (
        <View style={{ gap: 12 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <SectionHeading>{t("bible.plans.section.mine")}</SectionHeading>
            <Pressable accessibilityRole="button" onPress={() => openCreate()} style={{ minHeight: 36, justifyContent: "center" }}>
              <Text style={[typography.label, { color: shadcn.brand }]}>{t("bible.plans.create.title")}</Text>
            </Pressable>
          </View>
          <FilterChips
            minHeight={34}
            options={[
              { label: t("bible.plans.filter.active"), value: "active" as const },
              { label: t("bible.plans.filter.completed"), value: "completed" as const },
            ]}
            value={mineFilter}
            onChange={setMineFilter}
          />
          {(mineFilter === "active" ? activePlans : completedPlans).length === 0 ? (
            <EmptyPlansCard
              completed={mineFilter === "completed"}
              onCreate={() => openCreate()}
              onExplore={() => setTab("library")}
            />
          ) : (
            (mineFilter === "active" ? activePlans : completedPlans).map((plan) => (
              <PlanCard
                key={plan.id}
                onContinue={() => continuePlan(plan)}
                onMore={() => setMenuPlan(plan)}
                onOpen={() => openDetail(plan)}
                plan={plan}
              />
            ))
          )}
        </View>
      ) : null}

      {tab === "library" ? (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <SectionHeading>{t("bible.plans.library.title")}</SectionHeading>
            <BodyText muted>{t("bible.plans.library.description")}</BodyText>
          </View>
          <TextInputField
            accessibilityLabel={t("bible.plans.library.searchPlaceholder")}
            onChangeText={setLibraryQuery}
            placeholder={t("bible.plans.library.searchPlaceholder")}
            value={libraryQuery}
          />
          <FilterChips
            minHeight={34}
            options={[
              { label: t("bible.plans.library.all"), value: "all" as const },
              ...planCategoryOrder.map((category) => ({
                label: t(planCategoryTranslationKeys[category]),
                value: category,
              })),
            ]}
            value={libraryFilter}
            onChange={setLibraryFilter}
          />
          {!libraryQuery && libraryFilter === "all" ? (
            <View style={{ gap: 8 }}>
              <SectionHeading>{t("bible.plans.library.featured")}</SectionHeading>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {featured.map((template) => (
                  <PlanCoverCard
                    coverKey={template.coverKey}
                    eyebrow={t(planCategoryTranslationKeys[template.category])}
                    key={template.id}
                    meta={t("bible.plans.library.cardMeta", {
                      days: template.dayCount,
                      minutes: template.minutesPerDay,
                    })}
                    onPress={() => setSelectedTemplate(template)}
                    title={localizedPlanText(template.title, language)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <SectionHeading>{t("bible.plans.library.allPlans")}</SectionHeading>
            {libraryTemplates.length === 0 ? (
              <Card>
                <BodyText muted>{t("bible.plans.library.noResults")}</BodyText>
              </Card>
            ) : (
              libraryTemplates.map((template) => (
                <TemplateRow
                  key={template.id}
                  onPress={() => setSelectedTemplate(template)}
                  template={template}
                />
              ))
            )}
          </View>
        </View>
      ) : null}

      {tab === "group" ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>{t("bible.plans.section.group")}</SectionHeading>
          {!group ? (
            <Card>
              <BodyText muted>{t("bible.plans.group.noGroup")}</BodyText>
            </Card>
          ) : state.groupBiblePlanAnnouncements.length === 0 ? (
            <Card style={{ gap: 12 }}>
              <BodyText muted>{t("bible.plans.empty.group")}</BodyText>
              {ownsGroup ? (
                <SecondaryButton icon="users" onPress={() => setTab("mine")}>
                  {t("bible.plans.group.sharePrompt")}
                </SecondaryButton>
              ) : null}
            </Card>
          ) : (
            state.groupBiblePlanAnnouncements.map((announcement) => {
              const joinedPlan = plans.find((plan) => plan.announcementId === announcement.id);
              return (
                <GroupAnnouncementCard
                  announcement={announcement}
                  joined={Boolean(joinedPlan)}
                  key={announcement.id}
                  onJoin={() => dispatch({ type: "joinGroupBiblePlan", announcementId: announcement.id })}
                  onOpenJoined={joinedPlan ? () => openDetail(joinedPlan) : undefined}
                  onUnannounce={
                    ownsGroup
                      ? () =>
                          confirmAction({
                            title: t("bible.plans.group.removeTitle"),
                            message: t("bible.plans.group.removeMessage"),
                            confirmText: t("bible.plans.group.removeConfirm"),
                            cancelText: t("bible.plans.create.cancel"),
                            destructive: true,
                            onConfirm: () => dispatch({ type: "unannounceBiblePlan", announcementId: announcement.id }),
                          })
                      : undefined
                  }
                  participations={state.groupBiblePlanParticipations.filter((item) => item.announcementId === announcement.id)}
                  users={state.users}
                />
              );
            })
          )}
        </View>
      ) : null}

      <CreatePlanModal
        initialPlan={editingPlan}
        onClose={() => {
          setCreateVisible(false);
          setEditingPlan(undefined);
        }}
        onSaved={() => setBanner(t("bible.plans.create.saved"))}
        visible={createVisible}
      />

      <PlanTemplateModal
        onClose={() => setSelectedTemplate(undefined)}
        onStart={startTemplate}
        template={selectedTemplate}
        visible={Boolean(selectedTemplate)}
      />

      <PlanDetailModal
        canAnnounce={Boolean(ownsGroup && detailPlan?.source === "personal" && !detailPlan?.announcementId)}
        onAnnounce={confirmAnnounce}
        onClose={() => setDetailPlanId(undefined)}
        onEdit={(plan) => {
          setDetailPlanId(undefined);
          openCreate(plan);
        }}
        onJump={(dayNumber) => {
          if (detailPlan) openReader(detailPlan, dayNumber);
        }}
        plan={detailPlan}
        visible={Boolean(detailPlan)}
      />

      <BottomSheet
        height={menuPlan ? 500 : undefined}
        onClose={() => setMenuPlan(undefined)}
        title={menuPlan ? displayPlanTitle(menuPlan, language) : undefined}
        visible={Boolean(menuPlan)}
      >
        {menuPlan ? (
          <View style={{ gap: 16, padding: 16 }}>
            <SheetMenuGroup>
              <SheetMenuItem
                icon="eye"
                onPress={() => {
                  const plan = menuPlan;
                  setMenuPlan(undefined);
                  if (plan) openDetail(plan);
                }}
                title={t("bible.plans.plan.view")}
              />
              {menuPlan.source === "personal" && !menuPlan.templateId && !menuPlan.announcementId ? (
                <SheetMenuItem
                  icon="edit-3"
                  onPress={() => {
                    const plan = menuPlan;
                    setMenuPlan(undefined);
                    if (plan) openCreate(plan);
                  }}
                  showDivider
                  title={t("bible.plans.plan.edit")}
                />
              ) : null}
              {menuPlan.status !== "completed" ? (
                <SheetMenuItem
                  icon={menuPlan.pausedAt ? "play" : "pause"}
                  onPress={() => togglePause(menuPlan)}
                  showDivider
                  title={t(menuPlan.pausedAt ? "bible.plans.resume" : "bible.plans.pause")}
                />
              ) : null}
              {ownsGroup && menuPlan.source === "personal" && !menuPlan.announcementId ? (
                <SheetMenuItem
                  icon="users"
                  onPress={() => confirmAnnounce(menuPlan)}
                  showDivider
                  title={t("bible.plans.plan.share")}
                />
              ) : null}
              <SheetMenuItem
                icon="rotate-ccw"
                onPress={() => confirmRestart(menuPlan)}
                showDivider
                title={t("bible.plans.plan.restart")}
              />
              <SheetMenuItem
                icon="trash-2"
                onPress={() => confirmDelete(menuPlan)}
                showDivider
                title={t("bible.plans.plan.deleteConfirm")}
                tone="danger"
              />
            </SheetMenuGroup>
          </View>
        ) : null}
      </BottomSheet>
    </AppScreen>
  );
}

function highlightedPlan(plans: BiblePlan[], date: string) {
  const active = plans.filter((plan) => plan.status !== "completed");
  let catchUp: { plan: BiblePlan; day: BiblePlan["days"][number] } | undefined;
  for (const plan of active) {
    if (plan.pausedAt) continue;
    const today = plan.days.find((day) => scheduledPlanDate(plan, day.dayNumber) === date && !day.completedAt);
    if (today) return { plan, day: today };
    const next = plan.days.find((day) => !day.completedAt && day.ranges.length > 0);
    if (!catchUp && next) catchUp = { plan, day: next };
  }
  if (catchUp) return catchUp;
  const plan = active.find((item) => !item.pausedAt) ?? active[0];
  return plan ? { plan, day: undefined } : undefined;
}

function TodayTab({
  activePlans,
  featured,
  highlight,
  onContinue,
  onCreate,
  onExplore,
  onJump,
  onOpen,
  onOpenTemplate,
  onViewAll,
}: {
  activePlans: BiblePlan[];
  featured: BiblePlanTemplate[];
  highlight?: { plan: BiblePlan; day?: BiblePlan["days"][number] };
  onContinue: (plan: BiblePlan) => void;
  onCreate: () => void;
  onExplore: () => void;
  onJump: (plan: BiblePlan, dayNumber: number) => void;
  onOpen: (plan: BiblePlan) => void;
  onOpenTemplate: (template: BiblePlanTemplate) => void;
  onViewAll: () => void;
}) {
  const { language, t } = useAppTranslation();
  const otherPlans = highlight ? activePlans.filter((plan) => plan.id !== highlight.plan.id) : activePlans;

  return (
    <View style={{ gap: 14 }}>
      {highlight ? (
        <TodayHero
          day={highlight.day}
          onContinue={() => onContinue(highlight.plan)}
          onJump={(dayNumber) => onJump(highlight.plan, dayNumber)}
          onOpen={() => onOpen(highlight.plan)}
          plan={highlight.plan}
        />
      ) : (
        <EmptyTodayCard onCreate={onCreate} onExplore={onExplore} />
      )}

      {otherPlans.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <SectionHeading>{t("bible.plans.section.otherActive")}</SectionHeading>
            <Pressable accessibilityRole="button" onPress={onViewAll} style={{ minHeight: 32, justifyContent: "center" }}>
              <Text style={[typography.caption, { color: shadcn.brand }]}>{t("bible.plans.viewAll")}</Text>
            </Pressable>
          </View>
          {otherPlans.map((plan) => (
            <PlanCard
              compact
              key={plan.id}
              onContinue={() => onContinue(plan)}
              onMore={() => {}}
              onOpen={() => onOpen(plan)}
              plan={plan}
            />
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <SectionHeading>{t("bible.plans.library.featured")}</SectionHeading>
          <Pressable accessibilityRole="button" onPress={onExplore} style={{ minHeight: 32, justifyContent: "center" }}>
            <Text style={[typography.caption, { color: shadcn.brand }]}>{t("bible.plans.library.seeAll")}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {featured.slice(0, 6).map((template) => (
            <PlanCoverCard
              coverKey={template.coverKey}
              eyebrow={t(planCategoryTranslationKeys[template.category])}
              key={template.id}
              meta={t("bible.plans.library.cardMeta", {
                days: template.dayCount,
                minutes: template.minutesPerDay,
              })}
              onPress={() => onOpenTemplate(template)}
              title={localizedPlanText(template.title, language)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function TodayHero({
  day,
  onContinue,
  onJump,
  onOpen,
  plan,
}: {
  day?: BiblePlan["days"][number];
  onContinue: () => void;
  onJump: (dayNumber: number) => void;
  onOpen: () => void;
  plan: BiblePlan;
}) {
  const { dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const today = todayDateKey();
  const pace = planPace(plan, today);
  const { percent } = completionForPlan(plan);
  const title = displayPlanTitle(plan, language);
  const reference = planReferencesLabel(day, bookLanguage);
  const dayDate = day ? scheduledPlanDate(plan, day.dayNumber) : undefined;
  const isCatchUp = Boolean(day && dayDate && dayDate < today);
  const isToday = Boolean(dayDate) && dayDate === today;

  return (
    <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
      <PlanCoverImage coverKey={planCoverKey(plan)} style={{ height: 196 }}>
        <LinearGradient
          colors={["rgba(20, 12, 6, 0)", "rgba(20, 12, 6, 0.18)", "rgba(20, 12, 6, 0.84)"]}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ bottom: 0, left: 0, padding: 18, position: "absolute", right: 0 }}
        >
          <Text style={[typography.sectionLabel, { color: "#FFD9BA", fontSize: 10, letterSpacing: 1.4 }]}>
            {plan.pausedAt
              ? t("bible.plans.paused")
              : isCatchUp
                ? t("bible.plans.today.catchUpLabel")
                : t("bible.plans.today.todayLabel")}
          </Text>
          <Text style={[typography.heading, { color: "#FFFFFF" }]}>{title}</Text>
          <Text style={[typography.caption, { color: "rgba(255,255,255,0.82)" }]}>
            {day ? t("bible.plans.today.dayOf", { day: day.dayNumber, total: plan.days.length }) : t("bible.plans.today.noReading")}
            {day ? `  ·  ${formatPlanDate(dayDate ?? today, language, { weekday: "short", month: "short", day: "numeric" })}` : ""}
          </Text>
        </LinearGradient>
        <View style={{ backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, height: 58, position: "absolute", right: 14, top: 14, width: 58 }}>
          <PlanProgressRing percent={percent} size={58} />
        </View>
      </PlanCoverImage>

      <View style={{ gap: 14, padding: 16 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <PlanStatusPill tone={plan.pausedAt ? "paused" : pace.behind > 0 ? "warning" : pace.todayCompleted ? "success" : "accent"}>
            {plan.pausedAt
              ? t("bible.plans.paused")
              : pace.behind > 0
                ? t("bible.plans.today.behind", { count: pace.behind })
                : pace.todayCompleted
                  ? t("bible.plans.today.completed")
                  : pace.notStarted
                    ? t("bible.plans.today.starts", { date: formatPlanDate(plan.startDate, language, { month: "short", day: "numeric" }) })
                    : t("bible.plans.today.onTrack")}
          </PlanStatusPill>
          <Text style={[typography.caption, { color: colors.muted }]}>
            {t("bible.plans.progress", { percent })}
          </Text>
        </View>

        {day && reference ? (
          <View style={{ gap: 4 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("bible.plans.today.reading")}</Text>
            <Text style={[typography.title, { color: colors.ink }]}>{reference}</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {[t("bible.plans.library.minutesShort", { minutes: planDayMinutes(day) }), isCatchUp ? t("bible.plans.today.catchUpHint") : isToday ? t("bible.plans.today.todayHint") : ""]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          </View>
        ) : (
          <BodyText muted>{plan.pausedAt ? t("bible.plans.paused") : t("bible.plans.noToday")}</BodyText>
        )}

        <PlanWeekStrip
          date={today}
          onSelectDay={onJump}
          plan={plan}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <PrimaryButton icon="book-open" onPress={day ? onContinue : onOpen} style={{ flex: 1 }}>
            {day ? (isCatchUp ? t("bible.plans.today.catchUp") : t("bible.plans.today.continue")) : t("bible.plans.plan.view")}
          </PrimaryButton>
          {plan.pausedAt ? (
            <SecondaryButton
              icon="play"
              onPress={() => void dispatch({ type: "rescheduleBiblePlan", planId: plan.id, startDate: today })}
              style={{ flex: 1 }}
            >
              {t("bible.plans.resume")}
            </SecondaryButton>
          ) : (
            <SecondaryButton icon="list" onPress={onOpen} style={{ flex: 1 }}>
              {t("bible.plans.plan.view")}
            </SecondaryButton>
          )}
        </View>
      </View>
    </Card>
  );
}

function EmptyTodayCard({ onCreate, onExplore }: { onCreate: () => void; onExplore: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 14, overflow: "hidden", padding: 0 }}>
      <PlanCoverImage coverKey="story-30" style={{ height: 172 }}>
        <LinearGradient
          colors={["rgba(20, 12, 6, 0.06)", "rgba(20, 12, 6, 0.42)", "rgba(20, 12, 6, 0.86)"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, justifyContent: "flex-end", padding: 18 }}
        >
          <Text style={[typography.sectionLabel, { color: "#FFD9BA", fontSize: 10, letterSpacing: 1.4 }]}>
            {t("bible.plans.today.startHere")}
          </Text>
          <Text style={[typography.heading, { color: "#FFFFFF" }]}>{t("bible.plans.today.emptyTitle")}</Text>
          <Text style={[typography.caption, { color: "rgba(255,255,255,0.86)" }]}>{t("bible.plans.today.emptyBody")}</Text>
        </LinearGradient>
      </PlanCoverImage>
      <View style={{ gap: 10, padding: 16, paddingTop: 0 }}>
        <PrimaryButton icon="compass" onPress={onExplore}>
          {t("bible.plans.today.findPlan")}
        </PrimaryButton>
        <SecondaryButton icon="plus" onPress={onCreate}>
          {t("bible.plans.create.title")}
        </SecondaryButton>
      </View>
    </Card>
  );
}

function PlanCard({
  compact = false,
  onContinue,
  onMore,
  onOpen,
  plan,
}: {
  compact?: boolean;
  onContinue: () => void;
  onMore?: () => void;
  onOpen: () => void;
  plan: BiblePlan;
}) {
  const { language, t } = useAppTranslation();
  const today = todayDateKey();
  const pace = planPace(plan, today);
  const { percent } = completionForPlan(plan);
  const title = displayPlanTitle(plan, language);
  const nextDay = pace.next ?? pace.today;
  const completed = plan.status === "completed";

  return (
    <Card style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => ({ flexDirection: "row", gap: 12, opacity: pressed ? 0.82 : 1 })}>
        <PlanThumbnail coverKey={planCoverKey(plan)} />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text numberOfLines={2} style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>
            {completed
              ? t("bible.plans.plan.completedOn", {
                  date: formatPlanDate(plan.completedAt?.slice(0, 10) ?? today, language, { month: "short", day: "numeric" }),
                })
              : nextDay
                ? t("bible.plans.today.dayOf", { day: nextDay.dayNumber, total: plan.days.length })
                : t("bible.plans.noUnread")}
          </Text>
          {!compact ? (
            <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
              {t("bible.plans.plan.metaShort", { days: plan.days.length, progress: t("bible.plans.progress", { percent }) })}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <PlanProgressRing percent={percent} size={44} />
          {completed ? <Feather color={shadcn.success} name="check-circle" size={15} /> : null}
        </View>
      </Pressable>

      <PlanProgressBar percent={percent} />

      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <PlanStatusPill tone={plan.pausedAt ? "paused" : pace.behind > 0 ? "warning" : completed ? "success" : "accent"}>
            {plan.pausedAt
              ? t("bible.plans.paused")
              : completed
                ? t("bible.plans.plan.completed")
                : pace.notStarted
                  ? t("bible.plans.today.starts", { date: formatPlanDate(plan.startDate, language, { month: "short", day: "numeric" }) })
                  : pace.behind > 0
                    ? t("bible.plans.today.behind", { count: pace.behind })
                    : pace.todayCompleted
                      ? t("bible.plans.today.completed")
                      : t("bible.plans.today.onTrack")}
          </PlanStatusPill>
        </View>
        {!compact ? (
          <Pressable
            accessibilityLabel={t("bible.plans.plan.more", { title })}
            accessibilityRole="button"
            onPress={onMore}
            style={{ alignItems: "center", borderColor: shadcn.border, borderRadius: radius.md, borderWidth: 1, height: 40, justifyContent: "center", width: 40 }}
          >
            <Feather color={colors.muted} name="more-horizontal" size={18} />
          </Pressable>
        ) : null}
      </View>

      <PrimaryButton icon={completed || plan.pausedAt ? "eye" : "arrow-right"} onPress={completed || plan.pausedAt ? onOpen : onContinue}>
        {completed || plan.pausedAt
          ? t("bible.plans.plan.view")
          : pace.behind > 0
            ? t("bible.plans.today.catchUp")
            : t("bible.plans.today.continue")}
      </PrimaryButton>
    </Card>
  );
}

function EmptyPlansCard({
  completed,
  onCreate,
  onExplore,
}: {
  completed: boolean;
  onCreate: () => void;
  onExplore: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
      <View style={{ alignItems: "center", backgroundColor: shadcn.brandSoft, borderRadius: 999, height: 56, justifyContent: "center", width: 56 }}>
        <Feather color={shadcn.brand} name={completed ? "award" : "book-open"} size={24} />
      </View>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={[typography.cardTitle, { color: colors.ink }]}>
          {t(completed ? "bible.plans.empty.completedTitle" : "bible.plans.empty.mineTitle")}
        </Text>
        <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>
          {t(completed ? "bible.plans.empty.completed" : "bible.plans.empty.start")}
        </Text>
      </View>
      {!completed ? (
        <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
          <PrimaryButton onPress={onExplore} style={{ flex: 1 }}>
            {t("bible.plans.library.explore")}
          </PrimaryButton>
          <SecondaryButton onPress={onCreate} style={{ flex: 1 }}>
            {t("bible.plans.create.title")}
          </SecondaryButton>
        </View>
      ) : null}
    </Card>
  );
}

function TemplateRow({ onPress, template }: { onPress: () => void; template: BiblePlanTemplate }) {
  const { language, t } = useAppTranslation();
  return (
    <Pressable
      accessibilityLabel={template.title[language]}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? "#FFF7ED" : shadcn.card,
        borderColor: shadcn.border,
        borderRadius: radius.xl,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 10,
      })}
    >
      <PlanThumbnail coverKey={template.coverKey} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink }]}>
          {template.title[language]}
        </Text>
        <Text numberOfLines={2} style={[typography.caption, { color: colors.muted, lineHeight: 17 }]}>
          {template.description[language]}
        </Text>
        <Text style={[typography.caption, { color: colors.muted, fontSize: 11 }]}>
          {t("bible.plans.library.cardMeta", { days: template.dayCount, minutes: template.minutesPerDay })}
        </Text>
      </View>
      <Feather color={colors.disabledText} name="chevron-right" size={18} />
    </Pressable>
  );
}

function GroupAnnouncementCard({
  announcement,
  joined,
  onJoin,
  onOpenJoined,
  onUnannounce,
  participations,
  users,
}: {
  announcement: GroupBiblePlanAnnouncement;
  joined: boolean;
  onJoin: () => void;
  onOpenJoined?: () => void;
  onUnannounce?: () => void;
  participations: GroupBiblePlanParticipation[];
  users: User[];
}) {
  const { language, t } = useAppTranslation();
  const joinedCount = participations.length;
  const totalSlots = Math.max(1, joinedCount * announcement.dayCount);
  const completedSlots = participations.reduce((sum, item) => sum + Object.keys(item.completedDayNumbers ?? {}).length, 0);
  const percent = joinedCount ? completionPercent(completedSlots, totalSlots) : 0;
  const title = displayAnnouncementTitle(announcement, language);
  const visibleParticipants = participations.slice(0, 5);
  const participantsLabel = joinedCount === 1
    ? t("bible.plans.participant.single")
    : t("bible.plans.participant.count", { count: joinedCount });

  return (
    <Card style={{ gap: 12, overflow: "hidden", padding: 0 }}>
      <PlanCoverImage coverKey={announcementCoverKey(announcement)} style={{ height: 158 }}>
        <LinearGradient
          colors={["rgba(20, 12, 6, 0.06)", "rgba(20, 12, 6, 0.4)", "rgba(20, 12, 6, 0.86)"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, justifyContent: "flex-end", padding: 16 }}
        >
          <Text style={[typography.sectionLabel, { color: "#FFD9BA", fontSize: 10, letterSpacing: 1.4 }]}>
            {t("bible.plans.group.communityPlan")}
          </Text>
          <Text style={[typography.title, { color: "#FFFFFF" }]}>{title}</Text>
        </LinearGradient>
        {onUnannounce ? (
          <Pressable
            accessibilityLabel={t("bible.plans.group.removeAccessibility", { title })}
            accessibilityRole="button"
            onPress={onUnannounce}
            style={{ alignItems: "center", backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 999, height: 38, justifyContent: "center", position: "absolute", right: 12, top: 12, width: 38 }}
          >
            <Feather color={colors.danger} name="x" size={17} />
          </Pressable>
        ) : null}
      </PlanCoverImage>

      <View style={{ gap: 12, padding: 16, paddingTop: 0 }}>
        <Text style={[typography.caption, { color: colors.muted }]}>
          {t("bible.plans.group.metadata", {
            date: formatPlanDate(announcement.startDate, language, { month: "short", day: "numeric" }),
            participants: participantsLabel,
            progress: t("bible.plans.progress", { percent }),
          })}
        </Text>
        <PlanProgressBar percent={percent} />
        {visibleParticipants.length ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <View style={{ flexDirection: "row" }}>
              {visibleParticipants.map((participation, index) => {
                const user = users.find((item) => item.id === participation.userId);
                return (
                  <View key={participation.id} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                    <Avatar image={user?.image} name={user?.name} size={28} />
                  </View>
                );
              })}
            </View>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {t("bible.plans.group.participantCount", { count: joinedCount })}
            </Text>
          </View>
        ) : null}
        <PrimaryButton disabled={joined && !onOpenJoined} icon={joined ? (onOpenJoined ? "arrow-right" : "check") : "plus"} onPress={joined ? onOpenJoined : onJoin}>
          {joined ? (onOpenJoined ? t("bible.plans.group.openJoined") : t("bible.plans.group.joined")) : t("bible.plans.group.join")}
        </PrimaryButton>
      </View>
    </Card>
  );
}

function PlanStatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "accent" | "warning" | "success" | "paused";
}) {
  const palette = tone === "warning"
    ? { background: shadcn.warningSoft, border: "#FDE68A", color: shadcn.warning }
    : tone === "success"
      ? { background: shadcn.successSoft, border: "#BBF7D0", color: shadcn.success }
      : tone === "paused"
        ? { background: shadcn.secondary, border: shadcn.border, color: colors.muted }
        : { background: shadcn.brandSoft, border: "#FED7AA", color: shadcn.brand };
  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: palette.background,
        borderColor: palette.border,
        borderRadius: 999,
        borderWidth: 1,
        minHeight: 26,
        paddingHorizontal: 9,
        justifyContent: "center",
      }}
    >
      <Text style={[typography.caption, { color: palette.color, fontSize: 11, fontWeight: "700" }]}>{children}</Text>
    </View>
  );
}
