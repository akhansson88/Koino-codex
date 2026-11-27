import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { GroupFastCard } from "@/features/fasting/group-fast-card";
import { type FastDraft, FastingSetupSheet } from "@/features/fasting/fasting-setup-sheet";
import { formatFastDate } from "@/features/fasting/format";
import { fastModeTint } from "@/features/fasting/fasting-style";
import { FocusedScreenHeader } from "@/features/community/focused-header";
import { openFast } from "@/state/fasting";
import { fastModeConfig, fastModeOrder, intermittentModeOrder } from "@/state/fasting-modes";
import { groupFastParticipantList, participantCount, sortGroupFasts } from "@/state/group-fasting";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { FastMode, GroupFast } from "@/state/types";
import { AppSheet } from "@/ui/app-sheet";
import { AppScreen, Avatar, BodyText, Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { confirmAction } from "@/ui/confirm";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const fields = ["groupFasts", "groupFastsReady", "groups", "currentGroupId", "currentUserId", "users", "fasts", "fastsReady"] as const;

export function GroupFastingScreen() {
  const state = useKoinoFields(fields);
  const { dispatch } = useKoinoActions();
  const { t, language } = useAppTranslation();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [setupMode, setSetupMode] = useState<FastMode>();
  const [setupVisible, setSetupVisible] = useState(false);
  const [selected, setSelected] = useState<GroupFast>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TranslationKey>();

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const now = Date.now();
  const fasts = useMemo(() => sortGroupFasts(state.groupFasts), [state.groupFasts]);
  const active = fasts.filter((fast) => Date.parse(fast.startAt) <= now && Date.parse(fast.endAt) > now);
  const upcoming = fasts.filter((fast) => Date.parse(fast.startAt) > now);

  function hostName(fast: GroupFast) {
    return state.users.find((user) => user.id === fast.userId)?.name ?? t("fasting.group.participants");
  }

  function participantUsers(fast: GroupFast) {
    return groupFastParticipantList(fast).map((participant) => {
      const user = state.users.find((item) => item.id === participant.userId);
      return { name: user?.name ?? t("fasting.group.participants"), image: user?.image };
    });
  }

  function joined(fast: GroupFast) {
    return Boolean(state.currentUserId && fast.participants?.[state.currentUserId]);
  }

  function personalFast(fast: GroupFast) {
    return state.fasts.find((item) => item.sourceGroupFastId === fast.id && item.userId === state.currentUserId);
  }

  async function join(fast: GroupFast) {
    if (!state.currentGroupId || joined(fast)) return;
    const own = openFast(state.fasts);
    if (own) {
      confirmAction({
        title: t("fasting.group.conflictTitle"),
        message: t("fasting.group.conflictBody"),
        confirmText: t("fasting.group.conflictConfirm"),
        cancelText: t("common.cancel"),
        destructive: true,
        onConfirm: () => {
          void dispatch({ type: "joinGroupFast", groupId: state.currentGroupId!, fastId: fast.id, replaceOpenFast: true })
            .catch(() => setError("fasting.group.errorJoin"));
        },
      });
      return;
    }
    try {
      await dispatch({ type: "joinGroupFast", groupId: state.currentGroupId, fastId: fast.id });
    } catch {
      setError("fasting.group.errorJoin");
    }
  }

  function leave(fast: GroupFast) {
    if (!state.currentGroupId) return;
    const own = personalFast(fast);
    if (Date.now() >= fast.joinCutoffMs) {
      if (!own) return;
      confirmAction({
        title: t("fasting.group.leaveTitle"),
        message: t("fasting.endBody"),
        confirmText: t("fasting.endConfirm"),
        cancelText: t("common.cancel"),
        destructive: true,
        onConfirm: () => {
          void dispatch({ type: "endFast", id: own.id }).catch(() => setError("fasting.group.errorLeave"));
        },
      });
      return;
    }
    confirmAction({
      title: t("fasting.group.leaveTitle"),
      message: t("fasting.group.leaveBody"),
      confirmText: t("fasting.group.leaveConfirm"),
      cancelText: t("common.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "leaveGroupFast", groupId: state.currentGroupId!, fastId: fast.id })
          .catch(() => setError("fasting.group.errorLeave"));
      },
    });
  }

  function makePrivate(fast: GroupFast) {
    const count = participantCount(fast);
    confirmAction({
      title: t("fasting.group.unshareTitle"),
      message: t("fasting.group.unshareBody", { count }),
      confirmText: t("fasting.group.unshareConfirm"),
      cancelText: t("common.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "setFastVisibility", id: fast.id, shared: false })
          .catch(() => setError("fasting.group.errorShare"));
      },
    });
  }

  function endHosted(fast: GroupFast) {
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

  function removeGroupFast(fast: GroupFast) {
    if (!state.currentGroupId) return;
    confirmAction({
      title: t("fasting.group.removeTitle"),
      message: t("fasting.group.removeBody"),
      confirmText: t("fasting.group.removeConfirm"),
      cancelText: t("common.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "removeGroupFast", groupId: state.currentGroupId!, fastId: fast.id })
          .catch(() => setError("fasting.group.errorShare"));
      },
    });
  }

  async function saveFast(draft: FastDraft) {
    if (!setupMode || saving) return;
    setSaving(true);
    setError(undefined);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    try {
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
        shareWithGroup: true,
      });
      setSetupVisible(false);
      setSetupMode(undefined);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message.toLowerCase().includes("current fast") ? "fasting.error.overlap" : "fasting.error.save");
    } finally {
      setSaving(false);
    }
  }

  const header = <FocusedScreenHeader onBack={() => router.back()} title={t("fasting.group.title")} />;

  if (!state.groupFastsReady) {
    return (
      <AppScreen>
        {header}
        <Card><BodyText muted>{t("fasting.loading")}</BodyText></Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      {header}
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t("fasting.group.title")}</Text>
        <BodyText muted>{group ? group.name : t("fasting.group.emptyBody")}</BodyText>
      </View>

      {!group ? (
        <Card style={{ gap: 10 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("fasting.group.emptyTitle")}</Text>
          <BodyText muted>{t("fasting.group.emptyBody")}</BodyText>
        </Card>
      ) : (
        <>
          <PrimaryButton icon="plus" onPress={() => setPickerVisible(true)}>{t("fasting.group.plan")}</PrimaryButton>

          {error ? <BodyText muted>{t(error)}</BodyText> : null}

          {active.length ? (
            <View style={{ gap: 10 }}>
              <Text style={[typography.heading, { color: colors.ink }]}>{t("fasting.group.now")}</Text>
              {active.map((fast) => (
                <GroupFastCard
                  fast={fast}
                  hostName={hostName(fast)}
                  joined={joined(fast)}
                  key={fast.id}
                  now={now}
                  onJoin={() => void join(fast)}
                  onOpen={() => setSelected(fast)}
                  participantUsers={participantUsers(fast)}
                />
              ))}
            </View>
          ) : null}

          {upcoming.length ? (
            <View style={{ gap: 10 }}>
              <Text style={[typography.heading, { color: colors.ink }]}>{t("fasting.group.upcoming")}</Text>
              {upcoming.map((fast) => (
                <GroupFastCard
                  fast={fast}
                  hostName={hostName(fast)}
                  joined={joined(fast)}
                  key={fast.id}
                  now={now}
                  onJoin={() => void join(fast)}
                  onOpen={() => setSelected(fast)}
                  participantUsers={participantUsers(fast)}
                />
              ))}
            </View>
          ) : null}

          {!active.length && !upcoming.length ? (
            <Card style={{ gap: 8 }}>
              <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("fasting.group.emptyTitle")}</Text>
              <BodyText muted>{t("fasting.group.emptyBody")}</BodyText>
            </Card>
          ) : null}
        </>
      )}

      <AppSheet onClose={() => setPickerVisible(false)} title={t("fasting.choose.modes")} visible={pickerVisible}>
        <View style={{ gap: 8 }}>
          {[...new Set([...fastModeOrder, ...intermittentModeOrder])].map((mode) => {
            const config = fastModeConfig(mode);
            const tint = fastModeTint(mode);
            return (
              <Pressable
                accessibilityRole="button"
                key={mode}
                onPress={() => {
                  setPickerVisible(false);
                  setSetupMode(mode);
                  setSetupVisible(true);
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
                  <Feather color={tint.ink} name={config.icon as never} size={18} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t(config.titleKey as TranslationKey)}</Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>{t(config.shortKey as TranslationKey)}</Text>
                </View>
                <Feather color={colors.disabledText} name="chevron-right" size={17} />
              </Pressable>
            );
          })}
        </View>
      </AppSheet>

      <FastingSetupSheet
        defaultShare
        error={error}
        groupName={group?.name}
        mode={setupMode ?? "water"}
        onClose={() => {
          if (saving) return;
          setSetupVisible(false);
          setSetupMode(undefined);
        }}
        onSave={(draft) => void saveFast(draft)}
        saving={saving}
        visible={setupVisible}
      />

      <AppSheet
        onClose={() => setSelected(undefined)}
        scroll
        title={selected ? t(fastModeConfig(selected.mode).titleKey as TranslationKey) : t("fasting.group.title")}
        visible={Boolean(selected)}
      >
        {selected ? (
          <>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View style={{ alignItems: "center", backgroundColor: fastModeTint(selected.mode).soft, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 }}>
                <Feather color={fastModeTint(selected.mode).ink} name={fastModeConfig(selected.mode).icon as never} size={21} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.cardTitle, { color: colors.ink }]}>{t(fastModeConfig(selected.mode).titleKey as TranslationKey)}</Text>
                <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.group.host", { name: hostName(selected) })}</Text>
              </View>
            </View>
            <BodyText muted>{t(fastModeConfig(selected.mode).detailKey as TranslationKey)}</BodyText>
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.schedule.starts")}</Text>
                <Text style={[typography.bodyMedium, { color: colors.ink, flexShrink: 1, textAlign: "right" }]}>
                  {formatFastDate(selected.startAt, language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.schedule.ends")}</Text>
                <Text style={[typography.bodyMedium, { color: colors.ink, flexShrink: 1, textAlign: "right" }]}>
                  {formatFastDate(selected.endAt, language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              {selected.schedule.kind === "daily" ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.setup.window")}</Text>
                  <Text style={[typography.bodyMedium, { color: colors.ink }]}>
                    {t("fasting.dashboard.window", { start: selected.schedule.fastStart, end: selected.schedule.fastEnd })}
                  </Text>
                </View>
              ) : null}
            </Card>

            <View style={{ gap: 8 }}>
              <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("fasting.group.participants")}</Text>
              {participantUsers(selected).length ? (
                <View style={{ gap: 10 }}>
                  {groupFastParticipantList(selected).map((participant) => {
                    const user = state.users.find((item) => item.id === participant.userId);
                    return (
                      <View key={participant.userId} style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                        <Avatar image={user?.image} name={user?.name} size={34} />
                        <Text style={[typography.bodyMedium, { color: colors.ink, flex: 1 }]}>{user?.name ?? t("fasting.group.participants")}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <BodyText muted>{t("fasting.group.joinBefore")}</BodyText>
              )}
            </View>

            {selected.userId === state.currentUserId ? (
              <View style={{ gap: 8 }}>
                <SecondaryButton icon="lock" onPress={() => makePrivate(selected)}>{t("fasting.group.unshareConfirm")}</SecondaryButton>
                <SecondaryButton icon="x-circle" onPress={() => endHosted(selected)} tone="danger">{t("fasting.end")}</SecondaryButton>
              </View>
            ) : joined(selected) ? (
              <SecondaryButton icon="log-out" onPress={() => leave(selected)} tone="danger">
                {Date.now() >= selected.joinCutoffMs ? t("fasting.end") : t("fasting.group.leave")}
              </SecondaryButton>
            ) : Date.now() < selected.joinCutoffMs ? (
              <PrimaryButton icon="user-plus" onPress={() => { setSelected(undefined); void join(selected); }}>{t("fasting.group.join")}</PrimaryButton>
            ) : (
              <Text style={[typography.caption, { color: colors.muted }]}>{t("fasting.group.joinClosed")}</Text>
            )}

            {group?.ownerId === state.currentUserId && selected.userId !== state.currentUserId ? (
              <SecondaryButton icon="trash-2" onPress={() => removeGroupFast(selected)} tone="danger">{t("fasting.group.remove")}</SecondaryButton>
            ) : null}
          </>
        ) : null}
      </AppSheet>
    </AppScreen>
  );
}
