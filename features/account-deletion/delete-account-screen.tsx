import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  AppHeader,
  AppScreen,
  BodyText,
  BottomSheet,
  Card,
  PrimaryButton,
  Row,
  SecondaryButton,
  TextInputField,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { confirmAction } from "@/ui/confirm";
import { useKoino } from "@/state/koino-store";
import {
  accountDeletionCommunities,
  accountDeletionErrorCode,
  loadAccountDeletionPreflight,
  reauthenticateForDeletion,
  requestAccountDeletion,
  type AccountDeletionCommunity,
  type AccountDeletionPreflight,
} from "@/state/account-deletion";
import { colors, radius, shadcn, typography } from "@/ui/theme";

type Step = "loading" | "review" | "password" | "confirm" | "deleting" | "done" | "error";

export function DeleteAccountScreen() {
  const { dispatch } = useKoino();
  const { t } = useAppTranslation();
  const mounted = useRef(true);
  const [step, setStep] = useState<Step>("loading");
  const [preflight, setPreflight] = useState<AccountDeletionPreflight>({ communities: [], authTime: 0 });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyCommunity, setBusyCommunity] = useState<string>();
  const [transferCommunity, setTransferCommunity] = useState<AccountDeletionCommunity>();
  const [outcome, setOutcome] = useState<"completed" | "running">("completed");
  const phrase = t("identity.deleteAccount.phrase");
  const phraseMatches = confirmation.trim().replace(/\s+/g, " ").toUpperCase() === phrase.toUpperCase();
  const communities = useMemo(() => preflight.communities, [preflight.communities]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, []);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const result = await loadAccountDeletionPreflight();
      if (!mounted.current) return;
      setPreflight(result);
      setStep("review");
    } catch {
      if (!mounted.current) return;
      setStep("error");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function transferOwnership(community: AccountDeletionCommunity, member: { id: string; name: string }) {
    setTransferCommunity(undefined);
    confirmAction({
      title: t("identity.deleteAccount.transfer"),
      message: t("identity.deleteAccount.transferBody", { community: community.name, name: member.name }),
      confirmText: t("identity.deleteAccount.transfer"),
      onConfirm: () => {
        setBusyCommunity(community.id);
        void (async () => {
          try {
            await dispatch({ type: "transferGroupOwnership", groupId: community.id, userId: member.id });
            await refresh();
          } catch {
            if (mounted.current) setError(t("identity.deleteAccount.transferError"));
          } finally {
            if (mounted.current) setBusyCommunity(undefined);
          }
        })();
      },
    });
  }

  function deleteCommunity(community: AccountDeletionCommunity) {
    confirmAction({
      title: t("identity.deleteAccount.deleteCommunity"),
      message: t("identity.deleteAccount.deleteCommunityBody", { community: community.name }),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      destructive: true,
      onConfirm: () => {
        setBusyCommunity(community.id);
        void (async () => {
          try {
            await dispatch({ type: "deleteGroup", id: community.id });
            await refresh();
          } catch {
            if (mounted.current) setError(t("identity.deleteAccount.deleteCommunityError"));
          } finally {
            if (mounted.current) setBusyCommunity(undefined);
          }
        })();
      },
    });
  }

  function continueToPassword() {
    if (communities.length) {
      setError(t("identity.deleteAccount.ownedError"));
      return;
    }
    setError("");
    setStep("password");
  }

  async function submitPassword() {
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      await reauthenticateForDeletion(password);
      if (!mounted.current) return;
      setPassword("");
      setStep("confirm");
    } catch {
      if (mounted.current) setError(t("identity.deleteAccount.passwordError"));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function deleteNow() {
    if (!phraseMatches) return;
    setStep("deleting");
    setError("");
    try {
      const result = await requestAccountDeletion(confirmation);
      if (!mounted.current) return;
      setOutcome(result.status);
      setStep("done");
      setTimeout(() => {
        void dispatch({ type: "accountDeleted" });
      }, 1400);
    } catch (reason) {
      if (!mounted.current) return;
      const code = accountDeletionErrorCode(reason);
      const owned = accountDeletionCommunities(reason);
      if (code === "OWNED_COMMUNITIES") {
        setPreflight({ communities: owned, authTime: 0 });
        setStep("review");
        setError(t("identity.deleteAccount.ownedError"));
        return;
      }
      if (code === "REAUTH_REQUIRED") {
        setStep("password");
        setError(t("identity.deleteAccount.reauthRequired"));
        return;
      }
      setStep("confirm");
      setError(t("identity.deleteAccount.errorBody"));
    }
  }

  function close() {
    if (step === "deleting" || step === "done") return;
    router.back();
  }

  if (step === "loading") {
    return (
      <AppScreen>
        <AppHeader showBack onBack={close} />
        <View style={{ alignItems: "center", gap: 14, paddingVertical: 48 }}>
          <ActivityIndicator color={colors.ink} />
          <BodyText muted>{t("identity.deleteAccount.deletingBody")}</BodyText>
        </View>
      </AppScreen>
    );
  }

  if (step === "error") {
    return (
      <AppScreen>
        <AppHeader showBack onBack={close} />
        <Card>
          <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("identity.deleteAccount.errorTitle")}</Text>
          <BodyText muted>{t("identity.deleteAccount.errorBody")}</BodyText>
          <PrimaryButton icon="refresh-cw" onPress={() => void refresh()}>
            {t("identity.deleteAccount.retry")}
          </PrimaryButton>
          <SecondaryButton onPress={close}>{t("identity.deleteAccount.close")}</SecondaryButton>
        </Card>
      </AppScreen>
    );
  }

  if (step === "done") {
    return (
      <AppScreen>
        <View style={{ alignItems: "center", gap: 14, paddingVertical: 40 }}>
          <View style={{ alignItems: "center", backgroundColor: shadcn.successSoft, borderRadius: 40, height: 72, justifyContent: "center", width: 72 }}>
            <Feather name="check" size={32} color={shadcn.success} />
          </View>
          <Text style={[typography.screenTitle, { color: colors.ink, textAlign: "center" }]}>{t("identity.deleteAccount.doneTitle")}</Text>
          <BodyText muted style={{ textAlign: "center" }}>
            {t(outcome === "running" ? "identity.deleteAccount.runningBody" : "identity.deleteAccount.doneBody")}
          </BodyText>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <AppHeader showBack onBack={close} />

      {step === "review" ? (
        <>
          <View style={{ gap: 7 }}>
            <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("identity.deleteAccount.reviewTitle")}</Text>
            <BodyText muted>{t("identity.deleteAccount.reviewBody")}</BodyText>
          </View>

          <Card>
            <BodyText muted>{t("identity.deleteAccount.reviewRetains")}</BodyText>
          </Card>

          {communities.length ? (
            <View style={{ gap: 10 }}>
              <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("identity.deleteAccount.communitiesTitle")}</Text>
              <BodyText muted>{t("identity.deleteAccount.communitiesBody")}</BodyText>
              {communities.map((community) => (
                <Card key={community.id} style={{ gap: 10 }}>
                  <Text style={[typography.cardTitle, { color: colors.ink }]}>{community.name}</Text>
                  <BodyText muted>
                    {community.members.length
                      ? t("identity.deleteAccount.communityMembers", { count: community.members.length })
                      : t("identity.deleteAccount.communityNoMembers")}
                  </BodyText>
                  {busyCommunity === community.id ? <ActivityIndicator color={colors.ink} /> : null}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {community.members.length ? (
                      <SecondaryButton
                        disabled={Boolean(busyCommunity)}
                        icon="repeat"
                        onPress={() => setTransferCommunity(community)}
                        style={{ flex: 1 }}
                      >
                        {t("identity.deleteAccount.transfer")}
                      </SecondaryButton>
                    ) : null}
                    <SecondaryButton
                      disabled={Boolean(busyCommunity)}
                      icon="trash-2"
                      onPress={() => deleteCommunity(community)}
                      style={{ flex: 1 }}
                      tone="danger"
                    >
                      {t("identity.deleteAccount.deleteCommunity")}
                    </SecondaryButton>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}

          {error ? <BodyText accessibilityRole="alert" style={{ color: colors.danger }}>{error}</BodyText> : null}

          <PrimaryButton disabled={busy || communities.length > 0} icon="arrow-right" onPress={continueToPassword}>
            {t("identity.deleteAccount.continue")}
          </PrimaryButton>
        </>
      ) : null}

      {step === "password" ? (
        <>
          <View style={{ gap: 7 }}>
            <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("identity.deleteAccount.passwordTitle")}</Text>
            <BodyText muted>{t("identity.deleteAccount.passwordBody")}</BodyText>
          </View>
          <Card>
            <Text style={[typography.label, { color: colors.ink }]}>{t("identity.deleteAccount.passwordLabel")}</Text>
            <TextInputField
              autoCapitalize="none"
              autoComplete="current-password"
              onChangeText={setPassword}
              onSubmitEditing={() => void submitPassword()}
              placeholder={t("identity.deleteAccount.passwordPlaceholder")}
              returnKeyType="done"
              secureTextEntry
              value={password}
            />
            {error ? <BodyText accessibilityRole="alert" style={{ color: colors.danger }}>{error}</BodyText> : null}
            <PrimaryButton disabled={!password || busy} loading={busy} onPress={() => void submitPassword()}>
              {t("identity.deleteAccount.continue")}
            </PrimaryButton>
            <SecondaryButton onPress={close}>{t("common.cancel")}</SecondaryButton>
          </Card>
        </>
      ) : null}

      {step === "confirm" ? (
        <>
          <View style={{ gap: 7 }}>
            <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("identity.deleteAccount.confirmTitle")}</Text>
            <BodyText muted>{t("identity.deleteAccount.confirmBody", { phrase })}</BodyText>
          </View>
          <Card>
            <View style={{ backgroundColor: shadcn.secondary, borderRadius: radius.md, padding: 14 }}>
              <Text selectable style={[typography.bodyMedium, { color: colors.ink, fontWeight: "700" }]}>{phrase}</Text>
            </View>
            <Text style={[typography.label, { color: colors.ink }]}>{t("identity.deleteAccount.confirmLabel")}</Text>
            <TextInputField
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setConfirmation}
              onSubmitEditing={() => void deleteNow()}
              placeholder={phrase}
              returnKeyType="done"
              value={confirmation}
            />
            {confirmation && !phraseMatches ? (
              <BodyText muted>{t("identity.deleteAccount.confirmMismatch")}</BodyText>
            ) : null}
            {error ? <BodyText accessibilityRole="alert" style={{ color: colors.danger }}>{error}</BodyText> : null}
            <PrimaryButton disabled={!phraseMatches} icon="trash-2" onPress={() => void deleteNow()}>
              {t("identity.deleteAccount.confirmButton")}
            </PrimaryButton>
            <SecondaryButton onPress={() => setStep("password")}>{t("common.back")}</SecondaryButton>
          </Card>
        </>
      ) : null}

      {step === "deleting" ? (
        <View style={{ alignItems: "center", gap: 14, paddingVertical: 48 }}>
          <ActivityIndicator color={colors.ink} />
          <Text style={[typography.screenTitle, { color: colors.ink, textAlign: "center" }]}>{t("identity.deleteAccount.deletingTitle")}</Text>
          <BodyText muted style={{ textAlign: "center" }}>{t("identity.deleteAccount.deletingBody")}</BodyText>
        </View>
      ) : null}

      <BottomSheet
        title={t("identity.deleteAccount.chooseMember")}
        visible={Boolean(transferCommunity)}
        onClose={() => setTransferCommunity(undefined)}
      >
        <BodyText muted>{t("identity.deleteAccount.communitiesBody")}</BodyText>
        {transferCommunity?.members.map((member) => (
          <Pressable
            accessibilityRole="button"
            key={member.id}
            onPress={() => transferOwnership(transferCommunity, member)}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <Row icon="user">
              <Text style={[typography.bodyMedium, { color: colors.ink }]}>{member.name}</Text>
            </Row>
          </Pressable>
        ))}
      </BottomSheet>
    </AppScreen>
  );
}
