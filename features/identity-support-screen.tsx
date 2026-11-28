import { AppSheet, type AppSheetHandle } from "@/ui/app-sheet";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";
import { useRef, useState } from "react";
import { Platform, Text, useWindowDimensions, View } from "react-native";
import { SupportKoinoCard } from "@/features/donation-flow-screen";
import { useOpenFeedback } from "@/features/feedback";
import { useKoino } from "@/state/koino-store";
import { developmentMode } from "@/state/store/firebase";
import {
  AppHeader,
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  PrimaryButton,
  SecondaryButton,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { appLanguageInfo, appLanguages } from "@/ui/localization";
import { EmailVerificationBanner } from "@/ui/email-verification-banner";
import { confirmAction } from "@/ui/confirm";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { colors, typography } from "@/ui/theme";
import { useTheme } from "@/ui/theme-provider";
import { type IdentityPresentation, type IdentitySheet } from "@/features/identity/types";
import { roomMemberCount, selectedImageSize } from "@/features/identity/room-helpers";
import {
  SettingsSection,
  SettingsRow,
  SectionLabel,
  InfoLine,
  InfoSheet,
} from "@/features/identity/settings-components";
import { RoomSummaryCard } from "@/features/identity/room-cards";
import { RoomSwitcherSheet } from "@/features/identity/room-switcher";

function IdentityRouteSheet({ children, onDismiss, sheetRef }: PropsWithChildren<{ onDismiss: () => void; sheetRef: React.RefObject<AppSheetHandle | null> }>) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  return <AppSheet ref={sheetRef} modal={false} visible onClose={onDismiss} title={t("identity.title")} height={height * 0.92} backgroundColor={colors.cream} scroll>{children}</AppSheet>;
}

export function IdentitySupportScreen({ presentation = "screen" }: { presentation?: IdentityPresentation } = {}) {
  const { state, dispatch } = useKoino();
  const { language, rtlRestartRequired, setLanguage, t } = useAppTranslation();
  const { preference, setPreference } = useTheme();
  const openFeedback = useOpenFeedback("identity");
  const identitySheetRef = useRef<AppSheetHandle>(null);
  const navigateFromIdentity = (path: "/room-details" | "/donation-amount") => {
    if (presentation === "sheet") identitySheetRef.current?.dismiss(() => router.push(path));
    else router.push(path);
  };
  const [activeSheet, setActiveSheet] = useState<IdentitySheet>();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [avatarCropSource, setAvatarCropSource] = useState<RoomImageCropSource>();
  const [avatarMessage, setAvatarMessage] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const logoutPending = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, state.memberships.length || 1) : 0;

  function openAvatarCropper(source: RoomImageCropSource) {
    if (Platform.OS === "web") {
      setAvatarCropSource(source);
      return;
    }

    setActiveSheet(undefined);
    setTimeout(() => setAvatarCropSource(source), Platform.OS === "ios" ? 500 : 250);
  }

  async function handleChooseAvatar() {
    if (developmentMode) {
      setAvatarMessage(t("identity.avatar.devUnavailable"));
      return;
    }
    setAvatarMessage("");

    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setAvatarMessage(t("identity.avatar.permission"));
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 1,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setAvatarMessage(t("identity.avatar.readError"));
        return;
      }

      const size = await selectedImageSize(asset);
      openAvatarCropper({ ...size, uri: asset.uri });
    } catch {
      setAvatarMessage(t("identity.avatar.openError"));
    }
  }

  async function handleSaveAvatar(localUri: string) {
    if (developmentMode) {
      throw new Error(t("identity.avatar.devUnavailable"));
    }
    await dispatch({ type: "uploadUserAvatar", localUri });
    setAvatarCropSource(undefined);
    setAvatarMessage(t("identity.avatar.updated"));
  }

  function handleDeleteAvatar() {
    if (!user?.image) return;
    confirmAction({
      title: t("identity.avatar.deleteTitle"),
      message: t("identity.avatar.deleteBody"),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteUserAvatar" })
          .then(() => setAvatarMessage(t("identity.avatar.deleted")))
          .catch(() => setAvatarMessage(t("identity.avatar.deleteError")));
      },
    });
  }

  async function handleSendPasswordReset() {
    if (developmentMode) {
      setSecurityMessage(t("onboarding.account.resetUnavailableDev"));
      return;
    }
    if (!state.authEmail) {
      setSecurityMessage(t("identity.security.noEmail"));
      return;
    }

    try {
      await dispatch({ type: "requestPasswordReset", email: state.authEmail });
      setSecurityMessage(t("identity.security.resetSent"));
    } catch {
      setSecurityMessage(t("identity.security.error"));
    }
  }

  async function handleLogOut() {
    if (logoutPending.current || !state.currentUserId) return;
    logoutPending.current = true;
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      await dispatch({ type: "signOut", expectedUserId: state.currentUserId });
    } catch {
      setLogoutFailed(true);
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  }

  const content = (
    <>
      {presentation === "screen" ? (
        <View style={{ gap: 7 }}>
          <Text style={[typography.screenTitle, { color: colors.ink }]}>{t("identity.title")}</Text>
          <BodyText muted>{t("identity.description")}</BodyText>
        </View>
      ) : null}

      <EmailVerificationBanner />

      <SettingsSection label={t("identity.section.identity")}>
        <SettingsRow icon="user" title={t("identity.profile.title")} subtitle={t("identity.profile.subtitle")} onPress={() => setActiveSheet("profile")} />
        <SettingsRow
          icon="globe"
          title={t("settings.language.title")}
          subtitle={t("settings.language.subtitle")}
          value={appLanguageInfo[language].label}
          onPress={() => setActiveSheet("language")}
          showDivider
        />
        <SettingsRow
          icon={preference === "dark" ? "moon" : preference === "light" ? "sun" : "smartphone"}
          title={t("settings.appearance.title")}
          subtitle={t("settings.appearance.subtitle")}
          value={preference === "system"
            ? t("settings.appearance.option.system")
            : preference === "dark"
              ? t("settings.appearance.option.dark")
              : t("settings.appearance.option.light")}
          onPress={() => setActiveSheet("appearance")}
          showDivider
        />
        <SettingsRow
          icon="settings"
          title={t("identity.account.title")}
          subtitle={t("identity.account.subtitle")}
          onPress={() => setActiveSheet("account")}
          showDivider
        />
      </SettingsSection>

      <View style={{ gap: 10 }}>
        <SectionLabel>{t("community.page.community")}</SectionLabel>
        <RoomSummaryCard group={group} memberCount={memberCount} onDetails={() => navigateFromIdentity("/room-details")} />
        <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          <SettingsRow
            icon="repeat"
            title={t("community.rooms.joinOrCreate")}
            subtitle={t("community.identity.joinOrCreateBody")}
            onPress={() => setSwitcherVisible(true)}
          />
        </Card>
      </View>

      <SettingsSection label={t("identity.section.supportTrust")}>
        <SettingsRow
          icon="message-square"
          title={t("identity.feedback.title")}
          subtitle={t("identity.feedback.subtitle")}
          onPress={openFeedback}
        />
        <SettingsRow icon="message-circle" title={t("identity.help.title")} subtitle={t("identity.help.subtitle")} onPress={() => setActiveSheet("help")} showDivider />
        <SettingsRow
          icon="lock"
          title={t("identity.security.title")}
          subtitle={t("identity.security.subtitle")}
          onPress={() => setActiveSheet("security")}
          showDivider
        />
        <SettingsRow icon="shield" title={t("identity.privacy.title")} subtitle={t("identity.privacy.subtitle")} onPress={() => setActiveSheet("privacy")} showDivider />
        <SettingsRow
          icon="file-text"
          title={t("identity.terms.title")}
          subtitle={t("identity.terms.subtitle")}
          onPress={() => setActiveSheet("terms")}
          showDivider
        />
      </SettingsSection>

      <SettingsSection label={t("identity.deleteAccount.section")}>
        <SettingsRow
          icon="trash-2"
          title={t("identity.deleteAccount.title")}
          subtitle={t("identity.deleteAccount.rowSubtitle")}
          tone="danger"
          onPress={() => router.push("/delete-account" as never)}
        />
      </SettingsSection>

      <SupportKoinoCard onPress={() => navigateFromIdentity("/donation-amount")} />
    </>
  );

  return (
    <>
      {presentation === "sheet" ? (
        <IdentityRouteSheet sheetRef={identitySheetRef} onDismiss={() => router.back()}>{content}</IdentityRouteSheet>
      ) : (
        <AppScreen>
          <AppHeader showBack onBack={() => router.back()} />
          {content}
        </AppScreen>
      )}

      <BottomSheet title={t("identity.profile.title")} visible={activeSheet === "profile"} onClose={() => setActiveSheet(undefined)}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={86} tone="pink" />
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={[typography.title, { color: colors.ink }]}>{user?.name ?? t("identity.profile.fallback")}</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>{state.authEmail ?? t("identity.profile.signedIn")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SecondaryButton disabled={developmentMode} icon="image" onPress={handleChooseAvatar} style={{ flex: 1 }}>
            {t(user?.image ? "identity.profile.changeImage" : "identity.profile.chooseImage")}
          </SecondaryButton>
          {user?.image ? (
            <SecondaryButton disabled={developmentMode} icon="trash-2" onPress={handleDeleteAvatar} style={{ flex: 1 }} tone="danger">
              {t("common.delete")}
            </SecondaryButton>
          ) : null}
        </View>
        {developmentMode ? (
          <BodyText muted>{t("identity.avatar.devUnavailable")}</BodyText>
        ) : null}
        {avatarMessage ? <Text style={[typography.caption, { color: colors.muted }]}>{avatarMessage}</Text> : null}
      </BottomSheet>

      <BottomSheet
        title={t("settings.language.sheetTitle")}
        visible={activeSheet === "language"}
        onClose={() => setActiveSheet(undefined)}
      >
        <BodyText muted>{t("settings.language.description")}</BodyText>
        {rtlRestartRequired ? <BodyText muted>{t("settings.language.rtlRestart")}</BodyText> : null}
        <SettingsSection label={t("settings.language.options")}>
          {appLanguages.map((option, index) => (
            <SettingsRow
              key={option}
              icon="globe"
              title={appLanguageInfo[option].label}
              value={language === option ? t("settings.language.selected") : undefined}
              onPress={() => setLanguage(option)}
              showDivider={index < appLanguages.length - 1}
            />
          ))}
        </SettingsSection>
      </BottomSheet>

      <BottomSheet
        title={t("settings.appearance.sheetTitle")}
        visible={activeSheet === "appearance"}
        onClose={() => setActiveSheet(undefined)}
      >
        <BodyText muted>{t("settings.appearance.description")}</BodyText>
        <SettingsSection label={t("settings.appearance.options")}>
          <SettingsRow
            icon="smartphone"
            title={t("settings.appearance.option.system")}
            value={preference === "system" ? t("settings.appearance.selected") : undefined}
            onPress={() => setPreference("system")}
          />
          <SettingsRow
            icon="sun"
            title={t("settings.appearance.option.light")}
            value={preference === "light" ? t("settings.appearance.selected") : undefined}
            onPress={() => setPreference("light")}
            showDivider
          />
          <SettingsRow
            icon="moon"
            title={t("settings.appearance.option.dark")}
            value={preference === "dark" ? t("settings.appearance.selected") : undefined}
            onPress={() => setPreference("dark")}
            showDivider
          />
        </SettingsSection>
      </BottomSheet>

      <BottomSheet
        dismissible={!loggingOut}
        title={t("identity.account.title")}
        visible={activeSheet === "account"}
        onClose={() => {
          setActiveSheet(undefined);
          setLogoutFailed(false);
        }}
      >
        <InfoLine label={t("identity.account.email")} value={state.authEmail ?? t("identity.account.noEmail")} />
        <InfoLine
          label={t("identity.account.notifications")}
          value={t(state.notificationPreferences.pushEnabled ? "notifications.preferences.enabled" : "notifications.preferences.disabled")}
        />
        <SecondaryButton disabled={loggingOut} icon="log-out" onPress={handleLogOut}>
          {t(loggingOut ? "identity.account.loggingOut" : "common.logOut")}
        </SecondaryButton>
        <SecondaryButton
          icon="trash-2"
          tone="danger"
          onPress={() => {
            setActiveSheet(undefined);
            router.push("/delete-account" as never);
          }}
        >
          {t("identity.deleteAccount.title")}
        </SecondaryButton>
        {logoutFailed ? <BodyText accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: colors.danger }}>{t("identity.account.logoutError")}</BodyText> : null}
      </BottomSheet>

      <InfoSheet
        title={t("identity.help.title")}
        visible={activeSheet === "help"}
        onClose={() => setActiveSheet(undefined)}
        body={t("identity.help.body")}
      />

      <BottomSheet title={t("identity.security.title")} visible={activeSheet === "security"} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>{t(developmentMode ? "onboarding.account.resetUnavailableDev" : "identity.security.body")}</BodyText>
        <PrimaryButton disabled={developmentMode} icon="mail" onPress={handleSendPasswordReset}>
          {t("identity.security.sendReset")}
        </PrimaryButton>
        {securityMessage ? <Text style={[typography.caption, { color: colors.muted }]}>{securityMessage}</Text> : null}
      </BottomSheet>

      <InfoSheet
        title={t("identity.privacy.title")}
        visible={activeSheet === "privacy"}
        onClose={() => setActiveSheet(undefined)}
        body={t("identity.privacy.body")}
      />

      <InfoSheet
        title={t("identity.terms.title")}
        visible={activeSheet === "terms"}
        onClose={() => setActiveSheet(undefined)}
        body={t("identity.terms.body")}
      />

      <RoomSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
      <RoomImageCropper
        source={avatarCropSource}
        title={t("identity.profile.cropImage")}
        visible={Boolean(avatarCropSource)}
        onCancel={() => setAvatarCropSource(undefined)}
        onSave={handleSaveAvatar}
      />
    </>
  );
}

export { RoomDetailsScreen } from "@/features/identity/room-details-screen";
