import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, useWindowDimensions, View } from "react-native";

import { FastModeSheet } from "@/features/fasting/fast-mode-sheet";
import { type FastDraft, FastingSetupSheet } from "@/features/fasting/fasting-setup-sheet";
import { FastingTips } from "@/features/fasting/fasting-tips";
import { fastModeTint, fastTint } from "@/features/fasting/fasting-style";
import { formatCountdown, formatFastDate, formatFastRange } from "@/features/fasting/format";
import {
  getFastingAlertStatus,
  openExactAlarmSettings,
  openFastingAlertSettings,
  requestFastingAlertPermission,
  scheduleFastingTestAlert,
  stopFastingAlarm,
  type FastingAlertStatus,
} from "@/features/fasting/reminders";
import { useFastClock } from "@/features/fasting/use-fast-clock";
import { FocusedScreenHeader } from "@/features/community/focused-header";
import { fastHistory, latestFast, openFast } from "@/state/fasting";
import {
  fastPlanDayNumber,
  fastPlanPhase,
  fastPlanProgressPercent,
  fastPlanRemainingMinutes,
  fastPlanStart,
  fastPlanWindowAt,
  fastWindowProgressPercent,
} from "@/state/fasting-plan";
import { fastModeConfig, fastModeOrder, intermittentModeOrder } from "@/state/fasting-modes";
import { activeGroupFast, canJoinGroupFast, groupFastParticipantList, groupFastStart, nextGroupFast, participantCount } from "@/state/group-fasting";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { Fast, FastMode, GroupImage } from "@/state/types";
import { confirmAction } from "@/ui/confirm";
import { AppSheet } from "@/ui/app-sheet";
import {
  AppScreen,
  AvatarStack,
  BodyText,
  Card,
  FullScreenModal,
  PrimaryButton,
  SecondaryButton,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { localeFor, type TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import type { AppLanguage } from "@/ui/localization";

const fastingFields = ["fasts", "fastsReady", "groupFasts", "groupFastsReady", "groups", "currentGroupId", "currentUserId", "users"] as const;

function modeTitle(mode: FastMode, t: (key: TranslationKey) => string) {
  return t(fastModeConfig(mode).titleKey as TranslationKey);
}

function durationLabel(fast: Pick<Fast, "durationDays" | "durationHours">, t: (key: TranslationKey, values?: Record<string, string | number>) => string) {
  if (fast.durationHours) return t("fasting.duration.hours", { hours: fast.durationHours });
  return fast.durationDays === 1 ? t("fasting.duration.one") : t("fasting.duration.other", { days: fast.durationDays });
}

function phaseKey(phase: "scheduled" | "active" | "complete" | "ended"): TranslationKey {
  return phase === "scheduled"
    ? "fasting.phase.scheduled"
    : phase === "active"
      ? "fasting.phase.active"
      : phase === "ended"
        ? "fasting.phase.ended"
        : "fasting.phase.complete";
}

export function FastingScreen() {
  const state = useKoinoFields(fastingFields);
  const { dispatch } = useKoinoActions();
  const { t, language } = useAppTranslation();
  const now = useFastClock(1000);
  const [modeSheet, setModeSheet] = useState<FastMode>();
  const [intermittentVisible, setIntermittentVisible] = useState(false);
  const [setupMode, setSetupMode] = useState<FastMode>();
  const [editing, setEditing] = useState<Fast>();
  const [setupVisible, setSetupVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const [completionId, setCompletionId] = useState<string>();
  const [alertStatus, setAlertStatus] = useState<FastingAlertStatus>();
  const [testAt, setTestAt] = useState<number>();
  const [testBusy, setTestBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  const active = openFast(state.fasts, now);
  const latest = latestFast(state.fasts);
  const latestPhase = latest ? fastPlanPhase(latest, now) : undefined;
  const completionFast = completionId ? state.fasts.find((fast) => fast.id === completionId) : undefined;
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const groupName = group?.name;
  const groupFast = useMemo(
    () => activeGroupFast(state.groupFasts, now) ?? nextGroupFast(state.groupFasts, now),
    [state.groupFasts, now],
  );
  const currentUserId = state.currentUserId;

  const participantUsers = useMemo(() => {
    if (!active?.sourceGroupFastId) return [];
    const shared = state.groupFasts.find((item) => item.id === active.sourceGroupFastId);
    return groupFastParticipantList(shared).map((participant) => {
      const user = state.users.find((item) => item.id === participant.userId);
      return { name: user?.name ?? t("fasting.group.participants"), image: user?.image };
    });
  }, [active?.sourceGroupFastId, state.groupFasts, state.users, t]);

  const refreshAlertStatus = useCallback(() => {
    void getFastingAlertStatus().then(setAlertStatus).catch(() => undefined);
  }, []);

  useFocusEffect(useCallback(() => {
    refreshAlertStatus();
  }, [refreshAlertStatus]));

  useEffect(() => {
    refreshAlertStatus();
  }, [active?.id, active?.alertEnabled, refreshAlertStatus]);

  useEffect(() => {
    if (!latest || latestPhase !== "complete" || latest.acknowledgedAt || completionId) return;
    setCompletionId(latest.id);
    void dispatch({ type: "acknowledgeFast", id: latest.id }).catch(() => undefined);
  }, [completionId, dispatch, latest, latestPhase]);

  useEffect(() => {
    if (!completionFast) return;
    stopFastingAlarm();
  }, [completionFast]);

  useEffect(() => {
    if (testAt && now >= testAt) setTestAt(undefined);
  }, [now, testAt]);

  const history = useMemo(() => fastHistory(state.fasts), [state.fasts]);

  function openMode(mode: FastMode) {
    setModeSheet(mode);
  }

  function chooseMode(mode: FastMode) {
    setModeSheet(undefined);
    setIntermittentVisible(false);
    setEditing(undefined);
    setSetupMode(mode);
    setError(undefined);
    setSetupVisible(true);
  }

  function openSetup(fast: Fast) {
    setEditing(fast);
    setSetupMode(fast.mode);
    setError(undefined);
    setSetupVisible(true);
  }

  function closeSetup() {
    if (saving) return;
    setSetupVisible(false);
    setEditing(undefined);
    setSetupMode(undefined);
    setError(undefined);
  }

  async function saveFast(draft: FastDraft) {
    if (saving || !setupMode) return;
    setSaving(true);
    setError(undefined);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    try {
      if (editing) {
        await dispatch({
          type: "updateFast",
          id: editing.id,
          mode: draft.mode,
          schedule: draft.schedule,
          startDate: draft.startDate,
          startTime: draft.startTime,
          durationDays: draft.durationDays,
          durationHours: draft.durationHours,
          timeZone,
          alertEnabled: draft.alertEnabled,
        });
      } else {
        await dispatch({
          type: "startFast",
          mode: draft.mode,
          schedule: draft.schedule,
          startDate: draft.startDate,
          startTime: draft.startTime,
          durationDays: draft.durationDays,
          durationHours: draft.durationHours,
          timeZone,
          alertEnabled: draft.alertEnabled,
          shareWithGroup: draft.shareWithGroup,
        });
      }
      setSetupVisible(false);
      setEditing(undefined);
      setSetupMode(undefined);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (message.toLowerCase().includes("locked")) setError("fasting.error.locked");
      else if (message.toLowerCase().includes("shared with your community")) setError("fasting.error.joined");
      else if (message.toLowerCase().includes("current fast") || message.toLowerCase().includes("already")) setError("fasting.error.overlap");
      else if (message.toLowerCase().includes("safety")) setError("fasting.error.safety");
      else if (message.toLowerCase().includes("schedule") || message.toLowerCase().includes("duration") || message.toLowerCase().includes("start")) setError("fasting.error.schedule");
      else setError(editing ? "fasting.error.update" : "fasting.error.save");
    } finally {
      setSaving(false);
    }
  }

  function endFast(fast: Fast) {
    const joinedBeforeStart = Boolean(fast.sourceGroupFastId) && now < fastPlanStart(fast);
    if (joinedBeforeStart) {
      confirmAction({
        title: t("fasting.group.leaveTitle"),
        message: t("fasting.group.leaveBody"),
        confirmText: t("fasting.group.leaveConfirm"),
        cancelText: t("common.cancel"),
        destructive: true,
        onConfirm: () => {
          if (!state.currentGroupId || !fast.sourceGroupFastId) return;
          void dispatch({ type: "leaveGroupFast", groupId: state.currentGroupId, fastId: fast.sourceGroupFastId })
            .catch(() => setError("fasting.group.errorLeave"));
        },
      });
      return;
    }
    confirmEnd(
      t("fasting.endTitle"),
      t("fasting.endBody"),
      t("fasting.endConfirm"),
      () => {
        void dispatch({ type: "endFast", id: fast.id }).catch(() => setError("fasting.error.end"));
      },
    );
  }

  function confirmEnd(title: string, message: string, confirmText: string, onConfirm: () => void) {
    confirmAction({ title, message, confirmText, cancelText: t("fasting.keepFasting"), destructive: true, onConfirm });
  }

  async function toggleShare(shared: boolean) {
    if (!active || shareBusy) return;
    if (!shared && participantCount(state.groupFasts.find((item) => item.id === active.id)) > 0) {
      confirmAction({
        title: t("fasting.group.unshareTitle"),
        message: t("fasting.group.unshareBody", { count: participantCount(state.groupFasts.find((item) => item.id === active.id)) }),
        confirmText: t("fasting.group.unshareConfirm"),
        cancelText: t("common.cancel"),
        destructive: true,
        onConfirm: () => void setShare(false),
      });
      return;
    }
    await setShare(shared);
  }

  async function setShare(shared: boolean) {
    if (!active || shareBusy) return;
    setShareBusy(true);
    try {
      await dispatch({ type: "setFastVisibility", id: active.id, shared });
    } catch {
      setError("fasting.group.errorShare");
    } finally {
      setShareBusy(false);
    }
  }

  async function joinGroupFast(groupFastId: string) {
    if (!state.currentGroupId) return;
    const shared = state.groupFasts.find((item) => item.id === groupFastId);
    if (!shared) return;
    if (openFast(state.fasts, now)) {
      confirmAction({
        title: t("fasting.group.conflictTitle"),
        message: t("fasting.group.conflictBody"),
        confirmText: t("fasting.group.conflictConfirm"),
        cancelText: t("common.cancel"),
        destructive: true,
        onConfirm: () => {
          void dispatch({ type: "joinGroupFast", groupId: state.currentGroupId!, fastId: groupFastId, replaceOpenFast: true })
            .catch(() => setError("fasting.group.errorJoin"));
        },
      });
      return;
    }
    try {
      await dispatch({ type: "joinGroupFast", groupId: state.currentGroupId, fastId: groupFastId });
    } catch {
      setError("fasting.group.errorJoin");
    }
  }

  async function enableAlerts() {
    if (alertStatus?.permission !== "granted") {
      const granted = await requestFastingAlertPermission();
      refreshAlertStatus();
      if (!granted) openFastingAlertSettings();
      return;
    }
    if (alertStatus?.exact === false && active?.schedule.kind === "continuous") openExactAlarmSettings();
  }

  async function testAlert() {
    if (!active || testBusy) return;
    setTestBusy(true);
    try {
      const granted = alertStatus?.permission === "granted" || await requestFastingAlertPermission();
      refreshAlertStatus();
      if (!granted) {
        openFastingAlertSettings();
        return;
      }
      const scheduled = await scheduleFastingTestAlert(t("fasting.alert.testBody"));
      if (scheduled) setTestAt(Date.now() + 10_000);
    } finally {
      setTestBusy(false);
    }
  }

  const header = <FocusedScreenHeader onBack={() => router.back()} title={t("fasting.title")} />;

  if (!state.fastsReady) {
    return (
      <AppScreen>
        {header}
        <Card>
          <BodyText muted>{t("fasting.loading")}</BodyText>
        </Card>
      </AppScreen>
    );
  }

  const activeShared = active?.visibility === "group" ? state.groupFasts.find((item) => item.id === active.id) : undefined;
  const sharedGroupName = active?.groupId ? state.groups.find((item) => item.id === active.groupId)?.name : undefined;
  const joinedHost = active?.sourceGroupFastId
    ? state.users.find((user) => user.id === active.sourceUserId)?.name
    : undefined;

  return (
    <AppScreen>
      {header}

      {active ? (
        <FastDashboard
          alertStatus={alertStatus}
          error={error}
          fast={active}
          groupName={activeShared ? sharedGroupName : groupName}
          hostName={joinedHost}
          language={language}
          now={now}
          onEdit={() => openSetup(active)}
          onEnableAlerts={enableAlerts}
          onEnd={() => endFast(active)}
          onTest={testAlert}
          onToggleShare={(value) => void toggleShare(value)}
          participantUsers={participantUsers}
          participants={participantCount(activeShared)}
          shareBusy={shareBusy}
          testAt={testAt}
          testBusy={testBusy}
        />
      ) : (
        <FastStart
          error={error}
          fasts={history}
          groupFast={groupFast}
          groupName={groupName}
          language={language}
          now={now}
          onChooseMode={openMode}
          onJoin={() => {
            if (groupFast) void joinGroupFast(groupFast.id);
          }}
          onOpenIntermittent={() => setIntermittentVisible(true)}
          onStart={() => chooseMode("water")}
        />
      )}

      <FastModeSheet
        mode={modeSheet}
        onChoose={chooseMode}
        onClose={() => setModeSheet(undefined)}
        visible={Boolean(modeSheet)}
      />

      <AppSheet
        onClose={() => setIntermittentVisible(false)}
        title={t("fasting.mode.intermittent.title")}
        visible={intermittentVisible}
      >
        <BodyText muted>{t("fasting.mode.intermittent.short")}</BodyText>
        <View style={{ gap: 8 }}>
          {intermittentModeOrder.map((mode) => {
            const item = fastModeConfig(mode);
            const tint = fastModeTint(mode);
            return (
              <Pressable
                accessibilityRole="button"
                key={mode}
                onPress={() => {
                  setIntermittentVisible(false);
                  setModeSheet(mode);
                }}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: shadcn.card,
                  borderColor: shadcn.border,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: 12,
                  opacity: pressed ? 0.72 : 1,
                  padding: 14,
                })}
              >
                <View style={{ alignItems: "center", backgroundColor: tint.soft, borderRadius: radius.md, height: 42, justifyContent: "center", width: 42 }}>
                  <Feather color={tint.ink} name={item.icon as never} size={18} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t(item.titleKey as TranslationKey)}</Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>{t(item.shortKey as TranslationKey)}</Text>
                </View>
                <Feather color={colors.disabledText} name="chevron-right" size={17} />
              </Pressable>
            );
          })}
        </View>
      </AppSheet>

      <FastingSetupSheet
        error={error}
        groupName={groupName}
        initial={editing}
        locked={Boolean(editing?.visibility === "group" && participantCount(state.groupFasts.find((item) => item.id === editing.id)) > 0)}
        mode={setupMode ?? "water"}
        onClose={closeSetup}
        onSave={(draft) => void saveFast(draft)}
        saving={saving}
        visible={setupVisible}
      />

      <FullScreenModal
        animationType="fade"
        onRequestClose={() => setCompletionId(undefined)}
        visible={Boolean(completionFast)}
      >
        <View style={{ alignItems: "center", backgroundColor: colors.background, flex: 1, gap: 18, justifyContent: "center", padding: 32 }}>
          <View style={{ alignItems: "center", backgroundColor: colors.mossSurface, borderRadius: 999, height: 92, justifyContent: "center", width: 92 }}>
            <Feather color={colors.accentRhythm} name="check" size={42} />
          </View>
          <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink, textAlign: "center" }]}>
            {t("fasting.complete.title")}
          </Text>
          {completionFast ? (
            <>
              <BodyText muted>
                {`${durationLabel(completionFast, t)} · ${formatFastRange(completionFast, language)}`}
              </BodyText>
              <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("fasting.complete.note")}</Text>
            </>
          ) : null}
          <PrimaryButton onPress={() => setCompletionId(undefined)} style={{ minWidth: 220 }}>
            {t("fasting.complete.done")}
          </PrimaryButton>
        </View>
      </FullScreenModal>
    </AppScreen>
  );
}

function FastStart({
  error,
  fasts,
  groupFast,
  groupName,
  language,
  now,
  onChooseMode,
  onJoin,
  onOpenIntermittent,
  onStart,
}: {
  error?: TranslationKey;
  fasts: Fast[];
  groupFast?: ReturnType<typeof nextGroupFast>;
  groupName?: string;
  language: AppLanguage;
  now: number;
  onChooseMode: (mode: FastMode) => void;
  onJoin: () => void;
  onOpenIntermittent: () => void;
  onStart: () => void;
}) {
  const { t } = useAppTranslation();
  const [teachingOpen, setTeachingOpen] = useState(false);
  const latest = latestFast(fasts);
  const latestPhase = latest ? fastPlanPhase(latest, now) : undefined;

  return (
    <>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t("fasting.choose.title")}</Text>
        <BodyText muted>{t("fasting.choose.body")}</BodyText>
      </View>

      <Card style={{ backgroundColor: colors.paper, gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: teachingOpen }}
          onPress={() => setTeachingOpen((value) => !value)}
          style={{ alignItems: "center", flexDirection: "row", gap: 10 }}
        >
          <View style={{ alignItems: "center", backgroundColor: colors.prayerSoft, borderRadius: radius.md, height: 38, justifyContent: "center", width: 38 }}>
            <Feather color={colors.accentPrayer} name="book-open" size={17} />
          </View>
          <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{t("fasting.teaching.title")}</Text>
          <Feather color={colors.muted} name={teachingOpen ? "chevron-up" : "chevron-down"} size={17} />
        </Pressable>
        {teachingOpen ? (
          <>
            <BodyText muted>{t("fasting.teaching.body")}</BodyText>
            <Text style={[typography.caption, { color: colors.muted, fontStyle: "italic" }]}>{t("fasting.teaching.scripture")}</Text>
          </>
        ) : (
          <Text numberOfLines={2} style={[typography.caption, { color: colors.muted }]}>{t("fasting.teaching.body")}</Text>
        )}
      </Card>

      <View style={{ gap: 10 }}>
        <Text style={[typography.heading, { color: colors.ink }]}>{t("fasting.choose.modes")}</Text>
        <ScrollView
          contentContainerStyle={{ gap: 12, paddingRight: 8 }}
          decelerationRate="fast"
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={184}
        >
          {fastModeOrder.map((mode) => {
            if (mode === "if_16_8") {
              return (
                <ModeCard
                  key="intermittent"
                  onPress={onOpenIntermittent}
                  title={t("fasting.mode.intermittent.title")}
                  short={t("fasting.mode.intermittent.short")}
                  icon="clock"
                  tint="reflection"
                  badge={undefined}
                />
              );
            }
            const item = fastModeConfig(mode);
            return (
              <ModeCard
                key={mode}
                badge={item.badge ? t(`fasting.mode.badge.${item.badge}` as TranslationKey) : undefined}
                icon={item.icon}
                onPress={() => onChooseMode(mode)}
                short={t(item.shortKey as TranslationKey)}
                tint={item.tint}
                title={t(item.titleKey as TranslationKey)}
              />
            );
          })}
        </ScrollView>
      </View>

      {groupName && groupFast ? (
        <View style={{ gap: 6 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("fasting.group.entry")}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/group-fasting" as never)}>
              <Text style={[typography.label, { color: shadcn.brand }]}>{t("fasting.group.title")}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/group-fasting" as never)}>
            <Card style={{ gap: 10 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                <View style={{ alignItems: "center", backgroundColor: fastModeTint(groupFast.mode).soft, borderRadius: radius.md, height: 42, justifyContent: "center", width: 42 }}>
                  <Feather color={fastModeTint(groupFast.mode).ink} name={fastModeConfig(groupFast.mode).icon as never} size={18} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.cardTitle, { color: colors.ink }]}>{modeTitle(groupFast.mode, t)}</Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {`${formatFastDate(new Date(groupFastStart(groupFast)), language, { weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${t("fasting.group.joinedCount", { count: participantCount(groupFast) })}`}
                  </Text>
                </View>
              </View>
              {canJoinGroupFast(groupFast) ? (
                <PrimaryButton icon="user-plus" onPress={onJoin}>{t("fasting.group.join")}</PrimaryButton>
              ) : (
                <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.group.joinClosed")}</Text>
              )}
            </Card>
          </Pressable>
        </View>
      ) : null}

      {latest ? (
        <Card style={{ gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("fasting.lastFast")}</Text>
            <Text style={[typography.caption, { color: latestPhase === "ended" ? colors.muted : colors.accentRhythm }]}>
              {t(latestPhase === "ended" ? "fasting.history.ended" : "fasting.history.completed")}
            </Text>
          </View>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{modeTitle(latest.mode, t)}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{durationLabel(latest, t)} · {formatFastRange(latest, language)}</Text>
        </Card>
      ) : (
        <Card style={{ gap: 6 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("fasting.noFast")}</Text>
          <BodyText muted>{t("fasting.noFastBody")}</BodyText>
        </Card>
      )}

      <PrimaryButton icon="plus" onPress={onStart}>{t("fasting.start")}</PrimaryButton>

      {error ? <BodyText muted>{t(error)}</BodyText> : null}

      <FastingTips />

      {fasts.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={[typography.heading, { color: colors.ink }]}>{t("fasting.history.title")}</Text>
          <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
            {fasts.map((fast, index) => {
              const phase = fastPlanPhase(fast, now);
              return (
                <View key={fast.id}>
                  <View style={{ gap: 2, paddingHorizontal: 16, paddingVertical: 13 }}>
                    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text style={[typography.bodyMedium, { color: colors.ink }]}>{modeTitle(fast.mode, t)}</Text>
                      <Text style={[typography.caption, { color: phase === "ended" ? colors.muted : colors.accentRhythm }]}>
                        {t(phase === "ended" ? "fasting.history.ended" : "fasting.history.completed")}
                      </Text>
                    </View>
                    <Text style={[typography.caption, { color: colors.muted }]}>{durationLabel(fast, t)} · {formatFastRange(fast, language)}</Text>
                  </View>
                  {index < fasts.length - 1 ? <View style={{ backgroundColor: colors.line, height: 1, marginHorizontal: 16 }} /> : null}
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}
    </>
  );
}

function ModeCard({
  badge,
  icon,
  onPress,
  short,
  tint,
  title,
}: {
  badge?: string;
  icon: string;
  onPress: () => void;
  short: string;
  tint: import("@/state/fasting-modes").FastModeTint;
  title: string;
}) {
  const palette = fastTint(tint);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, width: 172 })}
    >
      <Card style={{ gap: 10, minHeight: 164 }}>
        <View style={{ alignItems: "center", backgroundColor: palette.soft, borderRadius: radius.lg, height: 44, justifyContent: "center", width: 44 }}>
          <Feather color={palette.ink} name={icon as never} size={19} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{short}</Text>
        </View>
        {badge ? (
          <View style={{ alignSelf: "flex-start", backgroundColor: palette.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={[typography.caption, { color: palette.ink }]}>{badge}</Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

function FastDashboard({
  alertStatus,
  error,
  fast,
  groupName,
  hostName,
  language,
  now,
  onEdit,
  onEnableAlerts,
  onEnd,
  onTest,
  onToggleShare,
  participantUsers,
  participants,
  shareBusy,
  testAt,
  testBusy,
}: {
  alertStatus?: FastingAlertStatus;
  error?: TranslationKey;
  fast: Fast;
  groupName?: string;
  hostName?: string;
  language: AppLanguage;
  now: number;
  onEdit: () => void;
  onEnableAlerts: () => void;
  onEnd: () => void;
  onTest: () => void;
  onToggleShare: (value: boolean) => void;
  participantUsers: { name: string; image?: GroupImage }[];
  participants: number;
  shareBusy: boolean;
  testAt?: number;
  testBusy: boolean;
}) {
  const { t } = useAppTranslation();
  const { fontScale } = useWindowDimensions();
  const config = fastModeConfig(fast.mode);
  const tint = fastModeTint(fast.mode);
  const phase = fastPlanPhase(fast, now);
  const window = fastPlanWindowAt(fast, now);
  const remaining = fastPlanRemainingMinutes(fast, now);
  const percent = fastWindowProgressPercent(fast, now);
  const planPercent = fastPlanProgressPercent(fast, now);
  const day = fastPlanDayNumber(fast, now);
  const stacked = fontScale >= 1.3;
  const isContinuous = fast.schedule.kind === "continuous";
  const isDaniel = fast.mode === "daniel";
  const scheduled = phase === "scheduled";
  const testLeft = testAt ? Math.max(0, Math.ceil((testAt - now) / 1000)) : 0;
  const joined = Boolean(fast.sourceGroupFastId);
  const joinedBeforeStart = joined && now < fastPlanStart(fast);
  const shared = fast.visibility === "group";
  const exactRequired = isContinuous;
  const alertReady = Boolean(alertStatus) && fast.alertEnabled && alertStatus?.permission === "granted" && (!exactRequired || alertStatus?.exact !== false);
  const alertProblem = !fast.alertEnabled
    ? "fasting.alert.disabled"
    : !alertStatus
      ? "fasting.alert.checking"
      : alertStatus.permission !== "granted"
        ? "fasting.alert.permission"
        : exactRequired && alertStatus.exact === false
          ? "fasting.alert.exactOff"
          : "fasting.alert.ready";
  const alertBody = !fast.alertEnabled
    ? "fasting.alert.disabledBody"
    : !alertStatus
      ? "fasting.alert.checkingBody"
      : alertStatus.permission !== "granted"
        ? "fasting.alert.permissionBody"
        : exactRequired && alertStatus.exact === false
          ? "fasting.alert.exactBody"
          : "fasting.alert.readyBody";

  const statusText = isDaniel
    ? t("fasting.status.partial")
    : window?.phase === "fasting"
      ? t("fasting.status.fasting")
      : window?.phase === "eating"
        ? t("fasting.status.eating")
        : phase === "scheduled"
          ? t("fasting.status.scheduled")
          : t("fasting.status.complete");
  const countdownLabel = isDaniel
    ? t("fasting.dashboard.planEnds", { date: formatFastDate(fast.endAt, language) })
    : window?.phase === "fasting"
      ? t("fasting.dashboard.fastEndsIn")
      : fast.schedule.kind === "daily" && window?.phase === "eating"
        ? t("fasting.dashboard.eatingEndsIn")
        : t("fasting.dashboard.nextStartsIn");

  const planText = fast.durationHours
    ? t("fasting.dashboard.hours", { hours: fast.durationHours })
    : t("fasting.dashboard.plan", { days: fast.durationDays });

  const weekdays = fast.schedule.kind === "weekly"
    ? fast.schedule.weekdays.map((value) => new Intl.DateTimeFormat(localeFor(language), { weekday: "short" }).format(new Date(2026, 10, 2 + (value === 0 ? 6 : value - 1)))).join(" · ")
    : undefined;

  return (
    <>
      <View style={{ gap: 4 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <View style={{ alignItems: "center", backgroundColor: tint.soft, borderRadius: radius.lg, height: 46, justifyContent: "center", width: 46 }}>
            <Feather color={tint.ink} name={config.icon as never} size={20} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t(config.titleKey as TranslationKey)}</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>{`${t("fasting.dashboard.dayOf", { day, total: fast.durationDays })} · ${statusText}`}</Text>
          </View>
        </View>
      </View>

      <Card style={{ gap: 16 }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={[typography.label, { color: colors.muted }]}>{planText}</Text>
          <View style={{ backgroundColor: tint.soft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={[typography.caption, { color: tint.ink }]}>{statusText}</Text>
          </View>
        </View>

        {isDaniel ? (
          <View style={{ gap: 8 }}>
            <Text style={[typography.title, { color: colors.ink }]}>{t("fasting.dashboard.dayOf", { day, total: fast.durationDays })}</Text>
            <ProgressBar percent={planPercent} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.progress.percent", { percent: planPercent })}</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{countdownLabel}</Text>
            </View>
          </View>
        ) : isContinuous ? (
          <View style={{ gap: 6 }}>
            <Text style={[typography.label, { color: colors.muted }]}>{t(scheduled ? "fasting.timer.startsIn" : "fasting.timer.remaining")}</Text>
            <Countdown
              minutes={remaining}
              stacked={stacked}
              daysLabel={t("fasting.timer.days")}
              hoursLabel={t("fasting.timer.hours")}
              minutesLabel={t("fasting.timer.minutes")}
            />
            <ProgressBar percent={percent} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.progress.percent", { percent })}</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.progress.percent", { percent: planPercent })}</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={[typography.label, { color: colors.muted }]}>{countdownLabel}</Text>
            <Text style={[typography.title, { color: colors.ink }]}>{formatCountdown(remaining, t)}</Text>
            {window ? (
              <Text style={[typography.caption, { color: colors.muted }]}>
                {t("fasting.dashboard.window", {
                  start: new Intl.DateTimeFormat(localeFor(language), { hour: "2-digit", minute: "2-digit" }).format(new Date(window.start)),
                  end: new Intl.DateTimeFormat(localeFor(language), { hour: "2-digit", minute: "2-digit" }).format(new Date(window.end)),
                })}
              </Text>
            ) : null}
            <ProgressBar percent={percent} />
          </View>
        )}
      </Card>

      {isDaniel ? (
        <Card style={{ gap: 10 }}>
          <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("fasting.dashboard.todayPlate")}</Text>
          <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t("fasting.dashboard.eat")}: {t("fasting.mode.daniel.eat").replace(/^Eat: /, "").replace(/^Ät: /, "")}</Text>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t("fasting.dashboard.avoid")}: {t("fasting.mode.daniel.avoid").replace(/^Avoid: /, "").replace(/^Undvik: /, "")}</Text>
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("fasting.schedule.title")}</Text>
        <ScheduleRow
          label={t(scheduled ? "fasting.schedule.starts" : "fasting.schedule.started")}
          value={formatFastDate(fast.startAt, language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        />
        <View style={{ backgroundColor: colors.line, height: 1 }} />
        <ScheduleRow
          label={t("fasting.schedule.ends")}
          value={formatFastDate(fast.endAt, language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        />
        {weekdays ? (
          <>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <ScheduleRow label={t("fasting.setup.weekdays")} value={weekdays} />
          </>
        ) : null}
        {fast.schedule.kind === "daily" ? (
          <>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <ScheduleRow
              label={t("fasting.setup.window")}
              value={t("fasting.dashboard.window", { start: fast.schedule.fastStart, end: fast.schedule.fastEnd })}
            />
          </>
        ) : null}
      </Card>

      {hostName ? (
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Feather color={colors.accentRhythm} name="users" size={18} />
          <Text style={[typography.bodyMedium, { color: colors.ink, flex: 1 }]}>{t("fasting.dashboard.joinedHost", { name: hostName })}</Text>
        </Card>
      ) : groupName ? (
        <Card style={{ gap: 10 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", backgroundColor: tint.soft, borderRadius: radius.md, height: 38, justifyContent: "center", width: 38 }}>
              <Feather color={tint.ink} name={shared ? "users" : "lock"} size={16} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.bodyMedium, { color: colors.ink }]}>
                {shared ? t("fasting.dashboard.shared", { group: groupName }) : t("fasting.dashboard.private")}
              </Text>
              <Text style={[typography.caption, { color: colors.muted }]}>
                {shared ? t("fasting.dashboard.sharedCount", { count: participants }) : t("fasting.dashboard.privateHint")}
              </Text>
            </View>
            <Switch
              accessibilityLabel={t("fasting.dashboard.share", { group: groupName })}
              disabled={shareBusy}
              onValueChange={onToggleShare}
              thumbColor={shared ? colors.paper : colors.disabledText}
              trackColor={{ false: colors.disabled, true: colors.gold }}
              value={shared}
            />
          </View>
          {shared && participantUsers.length ? <AvatarStack size={30} users={participantUsers} /> : null}
          <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.dashboard.shareHint")}</Text>
        </Card>
      ) : (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" }}>
          <Feather color={colors.muted} name="lock" size={12} />
          <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.privateNote")}</Text>
        </View>
      )}

      <Card style={{ gap: 10 }}>
        <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{exactRequired ? t("fasting.dashboard.alertsExact") : t("fasting.dashboard.alertsReminders")}</Text>
        <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t(alertProblem)}</Text>
        <BodyText muted>{t(alertBody)}</BodyText>
        {!alertReady && fast.alertEnabled ? (
          <SecondaryButton icon="settings" onPress={onEnableAlerts}>
            {t(alertStatus?.permission !== "granted" ? "fasting.alert.enable" : "fasting.alert.exactEnable")}
          </SecondaryButton>
        ) : null}
        {fast.alertEnabled ? (
          <>
            <SecondaryButton disabled={testBusy} icon="bell" onPress={onTest}>{t("fasting.alert.test")}</SecondaryButton>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {testLeft > 0 ? t("fasting.alert.testCountdown", { seconds: testLeft }) : t("fasting.alert.testHint")}
            </Text>
          </>
        ) : null}
      </Card>

      {error ? <BodyText muted>{t(error)}</BodyText> : null}

      {!joined ? (
        <PrimaryButton icon="edit-3" onPress={onEdit}>{t("fasting.edit")}</PrimaryButton>
      ) : null}
      <SecondaryButton icon="x-circle" onPress={onEnd} tone="danger">{joinedBeforeStart ? t("fasting.group.leave") : t("fasting.end")}</SecondaryButton>
      <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>
        {t("fasting.schedule.timeZone", { zone: fast.timeZone })}
      </Text>
    </>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <View
      accessibilityLabel={`${percent}%`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: percent }}
      style={{ backgroundColor: shadcn.secondary, borderRadius: 999, height: 8, overflow: "hidden" }}
    >
      <View style={{ backgroundColor: colors.accentRhythm, borderRadius: 999, height: "100%", width: `${percent}%` }} />
    </View>
  );
}

function Countdown({
  daysLabel,
  hoursLabel,
  minutes,
  minutesLabel,
  stacked,
}: {
  daysLabel: string;
  hoursLabel: string;
  minutes: number;
  minutesLabel: string;
  stacked: boolean;
}) {
  const total = Math.max(0, Math.floor(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  return (
    <View style={{ flexDirection: stacked ? "column" : "row", gap: stacked ? 8 : 4 }}>
      <CountdownUnit label={daysLabel} stacked={stacked} value={String(days)} />
      <CountdownUnit label={hoursLabel} stacked={stacked} value={String(hours).padStart(2, "0")} />
      <CountdownUnit label={minutesLabel} stacked={stacked} value={String(mins).padStart(2, "0")} />
    </View>
  );
}

function CountdownUnit({ label, stacked, value }: { label: string; stacked: boolean; value: string }) {
  return (
    <View
      style={{
        alignItems: stacked ? "center" : "flex-start",
        flex: stacked ? undefined : 1,
        flexDirection: stacked ? "row" : "column",
        gap: stacked ? 10 : 2,
        justifyContent: stacked ? "space-between" : "flex-start",
      }}
    >
      <Text style={{ color: colors.ink, fontFamily: "Montserrat_500Medium", fontSize: 40, fontVariant: ["tabular-nums"], lineHeight: 46 }}>{value}</Text>
      <Text style={[typography.caption, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function ScheduleRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
      <Text style={[typography.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={[typography.bodyMedium, { color: colors.ink, flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}
