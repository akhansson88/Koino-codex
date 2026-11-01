import { AppSheet, type AppSheetHandle } from "@/ui/app-sheet";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";
import { useEffect, useRef, useState } from "react";
import { Platform, Text, useWindowDimensions, View } from "react-native";
import { SupportKoinoCard } from "@/features/donation-flow-screen";
import { useKoino } from "@/state/koino-store";
import { emulatorMode } from "@/state/store/firebase";
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
import { confirmAction } from "@/ui/confirm";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { colors } from "@/ui/theme";
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

function traceIdentity(event: string) {
  if (emulatorMode) console.info(`[KOINO Emulator UI] identity:${event}`);
}

export function IdentitySupportScreen({ presentation = "screen" }: { presentation?: IdentityPresentation } = {}) {
  const { state, dispatch } = useKoino();
  const { language, setLanguage, t } = useAppTranslation();
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
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, state.memberships.length || 1) : 0;
  useEffect(() => {
    traceIdentity(`state theme=${state.theme} language=${language} sheet=${activeSheet ?? "none"} switcher=${switcherVisible}`);
  }, [state.theme, language, activeSheet, switcherVisible]);
  useEffect(() => {
    traceIdentity("mounted");
    return () => traceIdentity("unmounted");
  }, []);
  const themeLabel = t(state.theme === "dark" ? "identity.appearance.night" : "identity.appearance.light");

  function openAvatarCropper(source: RoomImageCropSource) {
    if (Platform.OS === "web") {
      setAvatarCropSource(source);
      return;
    }

    setActiveSheet(undefined);
    setTimeout(() => setAvatarCropSource(source), Platform.OS === "ios" ? 500 : 250);
  }

  async function handleChooseAvatar() {
    if (emulatorMode) {
      setAvatarMessage(t("identity.avatar.emulatorUnavailable"));
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
    if (emulatorMode) throw new Error(t("identity.avatar.emulatorUnavailable"));
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
    if (emulatorMode) {
      setSecurityMessage(t("identity.security.emulatorUnavailable"));
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

  const content = (
    <>
      {presentation === "screen" ? (
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>{t("identity.title")}</Text>
          <BodyText muted>{t("identity.description")}</BodyText>
        </View>
      ) : null}

      <SettingsSection label={t("identity.section.identity")}>
        <SettingsRow icon="user" title={t("identity.profile.title")} subtitle={t("identity.profile.subtitle")} onPress={() => setActiveSheet("profile")} />
        <SettingsRow
          icon="sun"
          title={t("identity.appearance.title")}
          subtitle={t("identity.appearance.subtitle")}
          value={themeLabel}
          onPress={() => {
            traceIdentity("appearance.press");
            void dispatch({ type: "setTheme", theme: state.theme === "dark" ? "light" : "dark" });
          }}
          showDivider
        />
        <SettingsRow
          icon="globe"
          title={t("settings.language.title")}
          subtitle={t("settings.language.subtitle")}
          value={language === "en" ? t("settings.language.option.english") : t("settings.language.option.swedish")}
          onPress={() => { traceIdentity("language.press"); setActiveSheet("language"); }}
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
            onPress={() => { traceIdentity("community.press"); setSwitcherVisible(true); }}
          />
        </Card>
      </View>

      <SettingsSection label={t("identity.section.supportTrust")}>
        <SettingsRow icon="message-circle" title={t("identity.help.title")} subtitle={t("identity.help.subtitle")} onPress={() => setActiveSheet("help")} />
        <SettingsRow
          icon="lock"
          title={t("identity.security.title")}
          subtitle={t("identity.security.subtitle")}
          onPress={() => { traceIdentity("security.press"); setActiveSheet("security"); }}
          showDivider
        />
        <SettingsRow icon="lock" title={t("common.encryption")} onPress={() => { traceIdentity("encryption.push"); router.push("/encryption" as never); }} />
        <SettingsRow icon="shield" title={t("identity.privacy.title")} subtitle={t("identity.privacy.subtitle")} onPress={() => setActiveSheet("privacy")} showDivider />
        <SettingsRow
          icon="file-text"
          title={t("identity.terms.title")}
          subtitle={t("identity.terms.subtitle")}
          onPress={() => setActiveSheet("terms")}
          showDivider
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
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{user?.name ?? t("identity.profile.fallback")}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{state.authEmail ?? t("identity.profile.signedIn")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SecondaryButton disabled={emulatorMode} icon="image" onPress={handleChooseAvatar} style={{ flex: 1 }}>
            {t(user?.image ? "identity.profile.changeImage" : "identity.profile.chooseImage")}
          </SecondaryButton>
          {user?.image ? (
            <SecondaryButton icon="trash-2" onPress={handleDeleteAvatar} style={{ flex: 1 }} tone="danger">
              {t("common.delete")}
            </SecondaryButton>
          ) : null}
        </View>
        {emulatorMode ? <BodyText muted>{t("identity.avatar.emulatorUnavailable")}</BodyText> : null}
        {avatarMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{avatarMessage}</Text> : null}
      </BottomSheet>

      <BottomSheet
        title={t("settings.language.sheetTitle")}
        visible={activeSheet === "language"}
        onShow={() => traceIdentity("language.presented")}
        onClose={() => setActiveSheet(undefined)}
      >
        <BodyText muted>{t("settings.language.description")}</BodyText>
        <SettingsSection label={t("settings.language.options")}>
          <SettingsRow
            icon="globe"
            title={t("settings.language.option.english")}
            value={language === "en" ? t("settings.language.selected") : undefined}
            onPress={() => setLanguage("en")}
          />
          <SettingsRow
            icon="globe"
            title={t("settings.language.option.swedish")}
            value={language === "sv" ? t("settings.language.selected") : undefined}
            onPress={() => setLanguage("sv")}
            showDivider
          />
        </SettingsSection>
      </BottomSheet>

      <BottomSheet title={t("identity.account.title")} visible={activeSheet === "account"} onClose={() => setActiveSheet(undefined)}>
        <InfoLine label={t("identity.account.email")} value={state.authEmail ?? t("identity.account.noEmail")} />
        <InfoLine
          label={t("identity.account.notifications")}
          value={t(state.notificationPreferences.pushEnabled ? "notifications.preferences.enabled" : "notifications.preferences.disabled")}
        />
        <SecondaryButton
          icon="log-out"
          onPress={() => {
            setActiveSheet(undefined);
            dispatch({ type: "signOut" });
          }}
        >
          {t("common.logOut")}
        </SecondaryButton>
      </BottomSheet>

      <InfoSheet
        title={t("identity.help.title")}
        visible={activeSheet === "help"}
        onClose={() => setActiveSheet(undefined)}
        body={t("identity.help.body")}
      />

      <BottomSheet title={t("identity.security.title")} visible={activeSheet === "security"} onShow={() => traceIdentity("security.presented")} onClose={() => setActiveSheet(undefined)}>
        <BodyText muted>{t(emulatorMode ? "identity.security.emulatorUnavailable" : "identity.security.body")}</BodyText>
        <PrimaryButton disabled={emulatorMode} icon="mail" onPress={handleSendPasswordReset}>
          {t("identity.security.sendReset")}
        </PrimaryButton>
        {securityMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{securityMessage}</Text> : null}
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
