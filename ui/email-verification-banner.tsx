import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";

import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { BodyText, Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";
import type { TranslationKey } from "@/ui/translations/types";

const RESEND_SECONDS = 60;

export function EmailVerificationBanner() {
  const { authEmail, emailVerified } = useKoinoFields(["authEmail", "emailVerified"] as const);
  const { dispatch } = useKoinoActions();
  const { language, t } = useAppTranslation();
  const [pending, setPending] = useState<"send" | "check" | null>(null);
  const [message, setMessage] = useState<TranslationKey>();
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [cooldown > 0]);

  useEffect(() => {
    if (!authEmail || emailVerified) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void dispatch({ type: "refreshEmailVerification" }).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [authEmail, emailVerified, dispatch]);

  if (!authEmail || emailVerified) return null;

  async function sendAgain() {
    if (pending || cooldown > 0) return;
    setPending("send");
    setMessage(undefined);
    try {
      await dispatch({ type: "sendEmailVerification", language });
      setMessage("emailVerification.sent");
      setCooldown(RESEND_SECONDS);
    } catch {
      setMessage("emailVerification.sendFailed");
    } finally {
      setPending(null);
    }
  }

  async function checkVerified() {
    if (pending) return;
    setPending("check");
    setMessage(undefined);
    let verified = false;
    try {
      await dispatch({ type: "refreshEmailVerification", report: (value) => { verified = value; } });
      // The store updates emailVerified and this banner disappears once the
      // mailbox link has been opened; only an unverified account keeps it.
      if (!verified) setMessage("emailVerification.checkFailed");
    } catch {
      setMessage("emailVerification.checkFailed");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card style={{ borderColor: colors.olive, borderWidth: 1, gap: 10 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Feather name="mail" size={18} color={colors.olive} />
        <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{t("emailVerification.title")}</Text>
      </View>
      <BodyText muted>{t("emailVerification.body", { email: authEmail })}</BodyText>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.muted }]}>
          {t(message)}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PrimaryButton disabled={pending !== null || cooldown > 0} onPress={() => void sendAgain()} style={{ flex: 1 }}>
          {pending === "send"
            ? t("emailVerification.sending")
            : cooldown > 0
              ? t("emailVerification.resendIn", { seconds: cooldown })
              : t("emailVerification.resend")}
        </PrimaryButton>
        <SecondaryButton disabled={pending !== null} onPress={() => void checkVerified()} style={{ flex: 1 }}>
          {pending === "check" ? t("emailVerification.checking") : t("emailVerification.check")}
        </SecondaryButton>
      </View>
    </Card>
  );
}
