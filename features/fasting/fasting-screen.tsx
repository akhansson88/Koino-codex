import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { formatFastDate, formatFastDuration, formatFastRange, splitFastMinutes } from "@/features/fasting/format";
import { FastingSetupSheet, type FastDraft } from "@/features/fasting/fasting-setup-sheet";
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
import {
  fastElapsedMinutes,
  fastHistory,
  fastPhase,
  fastProgressPercent,
  fastRemainingMinutes,
  latestFast,
  openFast,
} from "@/state/fasting";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { Fast, FastPhase } from "@/state/types";
import { confirmAction } from "@/ui/confirm";
import {
  AppScreen,
  BodyText,
  Card,
  FullScreenModal,
  PrimaryButton,
  SecondaryButton,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const fastingFields = ["fasts", "fastsReady"] as const;

function phaseKey(phase: FastPhase): TranslationKey {
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
  const [setupVisible, setSetupVisible] = useState(false);
  const [editing, setEditing] = useState<Fast>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const [completionId, setCompletionId] = useState<string>();
  const [alertStatus, setAlertStatus] = useState<FastingAlertStatus>();
  const [testAt, setTestAt] = useState<number>();
  const [testBusy, setTestBusy] = useState(false);

  const active = openFast(state.fasts, now);
  const latest = latestFast(state.fasts);
  const latestPhase = latest ? fastPhase(latest, now) : undefined;
  const completionFast = completionId ? state.fasts.find((fast) => fast.id === completionId) : undefined;

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

  function openSetup(fast?: Fast) {
    setError(undefined);
    setEditing(fast);
    setSetupVisible(true);
  }

  function closeSetup() {
    if (saving) return;
    setSetupVisible(false);
    setEditing(undefined);
    setError(undefined);
  }

  async function saveFast(draft: FastDraft) {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    try {
      if (editing) {
        await dispatch({
          type: "updateFast",
          id: editing.id,
          startDate: draft.startDate,
          durationDays: draft.durationDays,
          timeZone,
          alertEnabled: draft.alertEnabled,
        });
      } else {
        await dispatch({
          type: "startFast",
          startDate: draft.startDate,
          durationDays: draft.durationDays,
          timeZone,
          alertEnabled: draft.alertEnabled,
        });
      }
      setSetupVisible(false);
      setEditing(undefined);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message.toLowerCase().includes("current fast") || message.toLowerCase().includes("already")
        ? "fasting.error.overlap"
        : editing ? "fasting.error.update" : "fasting.error.save");
    } finally {
      setSaving(false);
    }
  }

  function endFast(fast: Fast) {
    confirmAction({
      title: t("fasting.endTitle"),
      message: t("fasting.endBody"),
      confirmText: t("fasting.endConfirm"),
      cancelText: t("fasting.keepFasting"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "endFast", id: fast.id }).catch(() => setError("fasting.error.end"));
      },
    });
  }

  async function enableAlerts() {
    if (alertStatus?.permission !== "granted") {
      const granted = await requestFastingAlertPermission();
      refreshAlertStatus();
      if (!granted) openFastingAlertSettings();
      return;
    }
    if (alertStatus?.exact === false) openExactAlarmSettings();
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

  return (
    <AppScreen>
      {header}

      {active ? (
        <FastDashboard
          alertStatus={alertStatus}
          error={error}
          fast={active}
          language={language}
          now={now}
          onEdit={() => openSetup(active)}
          onEnableAlerts={enableAlerts}
          onEnd={() => endFast(active)}
          onTest={testAlert}
          testAt={testAt}
          testBusy={testBusy}
        />
      ) : (
        <FastStart
          error={error}
          fasts={history}
          language={language}
          now={now}
          onStart={() => openSetup()}
        />
      )}

      <FastingSetupSheet
        error={error}
        initial={editing}
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
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.background,
            flex: 1,
            gap: 18,
            justifyContent: "center",
            padding: 32,
          }}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.mossSurface,
              borderRadius: 999,
              height: 92,
              justifyContent: "center",
              width: 92,
            }}
          >
            <Feather color={colors.accentRhythm} name="check" size={42} />
          </View>
          <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink, textAlign: "center" }]}>
            {t("fasting.complete.title")}
          </Text>
          {completionFast ? (
            <>
              <BodyText muted>{t("fasting.complete.body", {
                days: completionFast.durationDays,
                range: formatFastRange(completionFast, language),
              })}</BodyText>
              <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>
                {t("fasting.complete.note")}
              </Text>
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
  language,
  now,
  onStart,
}: {
  error?: TranslationKey;
  fasts: Fast[];
  language: "en" | "sv";
  now: number;
  onStart: () => void;
}) {
  const { t } = useAppTranslation();
  const latest = latestFast(fasts);
  const latestPhase = latest ? fastPhase(latest, now) : undefined;

  return (
    <>
      <View style={{ gap: 6 }}>
        <BodyText muted>{t("fasting.description")}</BodyText>
      </View>

      {latest ? (
        <Card style={{ gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("fasting.lastFast")}</Text>
            <Text style={[typography.caption, { color: latestPhase === "ended" ? colors.muted : colors.accentRhythm }]}>
              {t(latestPhase === "ended" ? "fasting.history.ended" : "fasting.history.completed")}
            </Text>
          </View>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>
            {latest.durationDays === 1
              ? t("fasting.duration.one")
              : t("fasting.duration.other", { days: latest.durationDays })}
          </Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{formatFastRange(latest, language)}</Text>
        </Card>
      ) : (
        <Card style={{ gap: 6 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("fasting.noFast")}</Text>
          <BodyText muted>{t("fasting.noFastBody")}</BodyText>
        </Card>
      )}

      <PrimaryButton icon="plus" onPress={onStart}>
        {t("fasting.start")}
      </PrimaryButton>

      {!latest ? (
        <SecondaryButton icon="clock" onPress={onStart}>
          {t("fasting.continueCurrent")}
        </SecondaryButton>
      ) : null}

      {error ? <BodyText muted>{t(error)}</BodyText> : null}

      <View style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" }}>
        <Feather color={colors.muted} name="lock" size={12} />
        <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.privateNote")}</Text>
      </View>

      {fasts.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={[typography.heading, { color: colors.ink }]}>{t("fasting.history.title")}</Text>
          <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
            {fasts.map((fast, index) => {
              const phase = fastPhase(fast, now);
              return (
                <View key={fast.id}>
                  <View style={{ gap: 2, paddingHorizontal: 16, paddingVertical: 13 }}>
                    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text style={[typography.bodyMedium, { color: colors.ink }]}>
                        {fast.durationDays === 1
                          ? t("fasting.duration.one")
                          : t("fasting.duration.other", { days: fast.durationDays })}
                      </Text>
                      <Text style={[typography.caption, { color: phase === "ended" ? colors.muted : colors.accentRhythm }]}>
                        {t(phase === "ended" ? "fasting.history.ended" : "fasting.history.completed")}
                      </Text>
                    </View>
                    <Text style={[typography.caption, { color: colors.muted }]}>{formatFastRange(fast, language)}</Text>
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

function FastDashboard({
  alertStatus,
  error,
  fast,
  language,
  now,
  onEdit,
  onEnableAlerts,
  onEnd,
  onTest,
  testAt,
  testBusy,
}: {
  alertStatus?: FastingAlertStatus;
  error?: TranslationKey;
  fast: Fast;
  language: "en" | "sv";
  now: number;
  onEdit: () => void;
  onEnableAlerts: () => void;
  onEnd: () => void;
  onTest: () => void;
  testAt?: number;
  testBusy: boolean;
}) {
  const { t } = useAppTranslation();
  const { fontScale } = useWindowDimensions();
  const phase = fastPhase(fast, now);
  const remaining = fastRemainingMinutes(fast, now);
  const { days, hours, minutes } = splitFastMinutes(remaining);
  const percent = fastProgressPercent(fast, now);
  const stacked = fontScale >= 1.3;
  const scheduled = phase === "scheduled";
  const testLeft = testAt ? Math.max(0, Math.ceil((testAt - now) / 1000)) : 0;

  const alertReady = Boolean(alertStatus) && fast.alertEnabled && alertStatus?.permission === "granted" && alertStatus?.exact !== false;
  const alertProblem = !fast.alertEnabled
    ? "fasting.alert.disabled"
    : !alertStatus
      ? "fasting.alert.checking"
      : alertStatus.permission !== "granted"
        ? "fasting.alert.permission"
        : alertStatus.exact === false
          ? "fasting.alert.exactOff"
          : "fasting.alert.ready";
  const alertBody = !fast.alertEnabled
    ? "fasting.alert.disabledBody"
    : !alertStatus
      ? "fasting.alert.checkingBody"
      : alertStatus.permission !== "granted"
        ? "fasting.alert.permissionBody"
        : alertStatus.exact === false
          ? "fasting.alert.exactBody"
          : "fasting.alert.readyBody";

  return (
    <>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
          {t("fasting.dashboard.title")}
        </Text>
        <BodyText muted>
          {t("fasting.dashboard.subtitle", { days: fast.durationDays, phase: t(phaseKey(phase)) })}
        </BodyText>
      </View>

      <Card style={{ gap: 18 }}>
        <Text style={[typography.label, { color: colors.muted }]}>
          {t(scheduled ? "fasting.timer.startsIn" : "fasting.timer.remaining")}
        </Text>
        <View
          accessibilityLabel={t("fasting.timer.accessibility", {
            label: t(scheduled ? "fasting.timer.startsIn" : "fasting.timer.remaining"),
            days: t("fasting.timer.daysValue", { count: days }),
            hours: t("fasting.timer.hoursValue", { count: hours }),
            minutes: t("fasting.timer.minutesValue", { count: minutes }),
          })}
          accessible
          style={{ flexDirection: stacked ? "column" : "row", gap: stacked ? 8 : 4 }}
        >
          <CountdownUnit label={t("fasting.timer.days")} stacked={stacked} value={String(days)} />
          <CountdownUnit label={t("fasting.timer.hours")} stacked={stacked} value={String(hours).padStart(2, "0")} />
          <CountdownUnit label={t("fasting.timer.minutes")} stacked={stacked} value={String(minutes).padStart(2, "0")} />
        </View>

        <View style={{ gap: 6 }}>
          <View
            accessibilityLabel={t("fasting.progress.percent", { percent })}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: 100, min: 0, now: percent }}
            style={{ backgroundColor: shadcn.secondary, borderRadius: 999, height: 8, overflow: "hidden" }}
          >
            <View style={{ backgroundColor: colors.accentRhythm, borderRadius: 999, height: "100%", width: `${percent}%` }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {t("fasting.progress.percent", { percent })}
            </Text>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {t("fasting.progress.elapsed", { time: formatFastDuration(fastElapsedMinutes(fast, now), language) })}
            </Text>
          </View>
        </View>
      </Card>

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
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>{t("fasting.alert.title")}</Text>
        <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t(alertProblem)}</Text>
        <BodyText muted>{t(alertBody)}</BodyText>
        {!alertReady && fast.alertEnabled ? (
          <SecondaryButton icon="settings" onPress={onEnableAlerts}>
            {t(alertStatus?.permission !== "granted" ? "fasting.alert.enable" : "fasting.alert.exactEnable")}
          </SecondaryButton>
        ) : null}
        {fast.alertEnabled ? (
          <>
            <SecondaryButton disabled={testBusy} icon="bell" onPress={onTest}>
              {t("fasting.alert.test")}
            </SecondaryButton>
            <Text style={[typography.caption, { color: colors.muted }]}>
              {testLeft > 0
                ? t("fasting.alert.testCountdown", { seconds: testLeft })
                : t("fasting.alert.testHint")}
            </Text>
          </>
        ) : null}
      </Card>

      {error ? <BodyText muted>{t(error)}</BodyText> : null}

      <PrimaryButton icon="edit-3" onPress={onEdit}>{t("fasting.edit")}</PrimaryButton>
      <SecondaryButton icon="x-circle" onPress={onEnd} tone="danger">{t("fasting.end")}</SecondaryButton>
      <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>
        {t("fasting.schedule.timeZone", { zone: fast.timeZone })}
      </Text>
    </>
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
      <Text
        style={{
          color: colors.ink,
          fontFamily: "Montserrat_500Medium",
          fontSize: 40,
          fontVariant: ["tabular-nums"],
          lineHeight: 46,
        }}
      >
        {value}
      </Text>
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
