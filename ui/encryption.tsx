import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View, StyleSheet, useWindowDimensions, type StyleProp, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { router } from "expo-router";
import { auth } from "@/state/store/firebase";
import { useAppTranslation } from "@/ui/app-language";
import { colors, themes, typography } from "@/ui/theme";
import { useKoino } from "@/state/koino-store";
import { encodeAt } from "@/state/encryption/database";
import { crypto, session, sessionGeneration, identityRotationInProgress, lockSession, unlockExisting, draftAccount, confirmAccount, recoverAccount, requestDeviceApproval, approveDevice, approveGroupMember, rejectGroupJoinRequest, rotateGroup, listenRaw, type Vault, type PublicIdentity, draftRevocation, revokeDevice, type Account } from "@/state/encryption/session";
import { personalMigrationComplete, migratePersonal, migrateOwnedGroups } from "@/state/encryption/migration";
import { clearEncryptedImages } from "@/state/supabase-storage";
import { readOnboardingProgress, writeOnboardingProgress, type OnboardingProgress } from "@/state/onboarding-progress";
import { hasLegacyOnboardingProfile, hasOnboardingCommunity } from "@/state/store/profile-operations";
import { OnboardingProgressContext } from "@/ui/onboarding-progress";
import { confirmAction } from "@/ui/confirm";

function useWords() {
  const { language } = useAppTranslation();
  return (english: string, swedish: string) => language === "sv" ? swedish : english;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 24, paddingTop: 64, gap: 18 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  input: { borderColor: colors.ink, borderWidth: 1, borderRadius: 10, padding: 14, color: colors.ink, backgroundColor: colors.white },
  button: { backgroundColor: colors.ink, borderRadius: 10, padding: 15, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: colors.white, padding: 18, borderRadius: 12, gap: 12 },
  error: { color: "#A42323", fontSize: 15, lineHeight: 22 },
});
function Button({ label, onPress, disabled, labelStyle = styles.buttonText, allowFontScaling }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  allowFontScaling?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text allowFontScaling={allowFontScaling} style={labelStyle}>{label}</Text></Pressable>;
}

function RecoveryKeySetup({ recoveryKey, confirmation, onConfirmation, onConfirm, onSignOut, busy, error }: {
  recoveryKey: string;
  confirmation: string;
  onConfirmation: (value: string) => void;
  onConfirm: () => void;
  onSignOut: () => void;
  busy: boolean;
  error: string;
}) {
  const w = useWords();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const ios = Platform.OS === "ios";
  // Apply the live iOS preference to this screen's layout as well as its text.
  // Disable native multiplication here so that the preference is applied once.
  const scale = ios ? fontScale : 1;
  const scaled = (style: TextStyle & { fontSize: number; lineHeight: number }) => ({
    ...style,
    fontSize: style.fontSize * scale,
    lineHeight: style.lineHeight * scale,
  });
  const light = themes.light;
  const body = [scaled(typography.body), { color: light.ink }];
  const buttonLabel: StyleProp<TextStyle> = [scaled(typography.button), { alignSelf: "stretch", color: light.white, textAlign: "center" }];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      automaticallyAdjustKeyboardInsets={ios}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ alignSelf: "center", width: "100%", maxWidth: 430, gap: 18 }}>
        <Text accessibilityRole="header" allowFontScaling={!ios} style={[scaled(typography.screenTitle), { color: light.ink }]}>
          {w("Protect your KOINO account", "Skydda ditt KOINO-konto")}
        </Text>
        <Text allowFontScaling={!ios} style={body}>{w("Your personal and community content will be encrypted before upload. Save this recovery code somewhere private. It restores your content if you lose every device.", "Ditt personliga innehåll och innehållet i gemenskapen krypteras före uppladdning. Spara återställningskoden på en privat plats. Den återställer innehållet om du förlorar alla enheter.")}</Text>
        <View style={styles.card}>
          <Text selectable allowFontScaling={!ios} style={body}>{recoveryKey}</Text>
        </View>
        <Text allowFontScaling={!ios} style={[scaled(typography.label), { color: light.ink }]}>{w("Enter the last six characters to confirm you saved the code.", "Skriv de sista sex tecknen för att bekräfta att du sparat koden.")}</Text>
        <TextInput accessibilityLabel={w("Recovery code confirmation", "Bekräftelse av återställningskod")} allowFontScaling={!ios} autoCapitalize="none" autoCorrect={false} value={confirmation} onChangeText={onConfirmation} style={[styles.input, body, { minHeight: 52 }]} />
        <Button label={w("Enable encryption", "Aktivera kryptering")} labelStyle={buttonLabel} allowFontScaling={!ios} disabled={busy || confirmation !== recoveryKey.slice(-6)} onPress={onConfirm} />
        {error ? <Text accessibilityRole="alert" allowFontScaling={!ios} style={[scaled(typography.body), { color: light.danger }]}>{error}</Text> : null}
        <Button label={w("Sign out", "Logga ut")} labelStyle={buttonLabel} allowFontScaling={!ios} disabled={busy} onPress={onSignOut} />
      </View>
    </ScrollView>
  );
}

type ActiveOnboarding = {
  userId: string;
  generation: number;
  progress: Exclude<OnboardingProgress, { phase: "complete" }>;
};

export function EncryptionBoundary({ children }: PropsWithChildren) {
  const w = useWords();
  const authRevision = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<"loading" | "signedOut" | "setup" | "recovery" | "migrating" | "ready" | "error">("loading");
  const [draft, setDraft] = useState<Vault>();
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [onboarding, setOnboardingState] = useState<ActiveOnboarding>();
  const activeOnboarding = useRef<ActiveOnboarding | undefined>(undefined);
  const onboardingWrite = useRef<ActiveOnboarding | undefined>(undefined);
  function setOnboarding(value: ActiveOnboarding | undefined) {
    activeOnboarding.current = value;
    setOnboardingState(value);
  }
  async function showSetup(uid: string, isCurrent: () => boolean) {
    const saved = await readOnboardingProgress(uid);
    if (!isCurrent()) return;
    if (!saved) {
      // Auth can create an account before the UID marker is written. Only this
      // setup path lacks an encrypted identity; older users may have a legacy profile.
      const legacyProfile = await hasLegacyOnboardingProfile(uid);
      if (!isCurrent()) return;
      if (!legacyProfile) await writeOnboardingProgress(uid, { phase: "journey" });
      if (!isCurrent()) return;
    }
    const nextDraft = await draftAccount(uid);
    if (!isCurrent()) return;
    setDraft(nextDraft); setPhase("setup");
  }
  async function finish() {
    const uid = session().uid, token = sessionGeneration();
    const isCurrent = () => auth.currentUser?.uid === uid && token === sessionGeneration();
    setProgress("");
    try {
      let saved = await readOnboardingProgress(uid);
      if (!isCurrent()) return;
      const complete = await personalMigrationComplete();
      if (!isCurrent()) return;
      if (!complete) {
        setPhase("migrating");
        await migratePersonal((message) => { if (isCurrent()) setProgress(message); }, saved?.phase === "journey" ? saved.signupName : undefined);
      }
      if (!isCurrent()) return;
      await migrateOwnedGroups((message) => { if (isCurrent()) { setPhase("migrating"); setProgress(message); } });
      if (!isCurrent()) return;
      if (saved?.phase === "journey" && saved.creationGroupId) {
        const created = await hasOnboardingCommunity(uid, saved.creationGroupId).catch(() => false);
        if (!isCurrent()) return;
        if (created) {
          const guide = { phase: "guide", journey: "create" } as const;
          // A failed check or save leaves the same attempt available for retry.
          const persisted = await writeOnboardingProgress(uid, guide).then(() => true, () => false);
          if (!isCurrent()) return;
          if (persisted) saved = guide;
        }
      }
      setOnboarding(saved && saved.phase !== "complete" ? { userId: uid, generation: token, progress: saved } : undefined);
      setPhase("ready");
    } catch (problem) {
      if (!isCurrent()) return;
      setPhase("error");
      throw problem;
    }
  }
  async function advanceOnboarding(uid: string, next: Exclude<OnboardingProgress, { phase: "journey" }>) {
    const isCurrent = () => auth.currentUser?.uid === uid
      && sessionGeneration() === onboarding?.generation && activeOnboarding.current === onboarding;
    const expectedPhase = next.phase === "guide" ? "journey" : "guide";
    if (!onboarding || onboarding.userId !== uid || onboarding.progress.phase !== expectedPhase || !isCurrent()
      || phase !== "ready" || onboardingWrite.current === onboarding) {
      throw new Error("This onboarding session is no longer available.");
    }
    onboardingWrite.current = onboarding;
    try {
      await writeOnboardingProgress(uid, next);
      if (isCurrent()) setOnboarding(next.phase === "guide" ? { ...onboarding, progress: next } : undefined);
    } finally {
      if (onboardingWrite.current === onboarding) onboardingWrite.current = undefined;
    }
  }
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      const request = ++authRevision.current;
      lockSession(); clearEncryptedImages();
      setOnboarding(undefined);
      setUser(next); setDraft(undefined); setCode(""); setSavedCode(""); setFingerprint(""); setError(""); setBusy(false);
      if (!next) { setPhase("signedOut"); return; }
      const isCurrent = () => active && authRevision.current === request && auth.currentUser?.uid === next.uid;
      setPhase("loading");
      void unlockExisting(next.uid).then(async (result) => {
        if (!isCurrent()) return;
        if (result === "setup") await showSetup(next.uid, isCurrent);
        else if (result === "recovery") setPhase("recovery");
        else await finish();
      }).catch((problem: Error) => { if (isCurrent()) { setError(problem.message); setPhase("error"); } });
    });
    return () => { active = false; authRevision.current++; unsubscribe(); lockSession(); clearEncryptedImages(); };
  }, []);
  useEffect(() => {
    if (!user || phase !== "ready") return;
    const deviceId = session().device.id;
    let refreshing = false;
    return listenRaw(`e2eeAccounts/${user.uid}`, (value) => {
      if (auth.currentUser?.uid !== user.uid) return;
      const remote = value as Account | null;
      if (!remote?.devices[deviceId]?.active) { lockSession(); clearEncryptedImages(); setPhase("recovery"); return; }
      if (!refreshing && !identityRotationInProgress() && remote.signingPublicKey !== session().vault.identity.signingPublicKey) {
        const request = authRevision.current;
        const isCurrent = () => authRevision.current === request && auth.currentUser?.uid === user.uid;
        refreshing = true; setPhase("loading"); clearEncryptedImages();
        void unlockExisting(user.uid).then(async (result) => { if (!isCurrent()) return; if (result === "ready") await finish(); else setPhase("recovery"); }).catch((problem: Error) => { if (isCurrent()) { setError(problem.message); setPhase("error"); } });
      }
    });
  }, [user?.uid, phase]);
  async function work(action: (isCurrent: () => boolean) => Promise<void>) {
    const revision = authRevision.current;
    const isActive = () => revision === authRevision.current;
    const isCurrent = () => isActive() && auth.currentUser?.uid === user?.uid;
    setBusy(true); setError("");
    try { await action(isCurrent); }
    catch (problem) { if (isActive()) setError(problem instanceof Error ? problem.message : w("Encryption could not be unlocked. Try again.", "Krypteringen kunde inte låsas upp. Försök igen.")); }
    finally { if (isActive()) setBusy(false); }
  }
  if (phase === "signedOut" || phase === "ready") {
    return (
      <OnboardingProgressContext.Provider value={{
        userId: onboarding?.userId,
        pending: Boolean(onboarding),
        journey: onboarding?.progress.phase === "guide" ? onboarding.progress.journey : undefined,
        chooseJourney: (uid, journey) => advanceOnboarding(uid, { phase: "guide", journey }),
        complete: (uid) => advanceOnboarding(uid, { phase: "complete" }),
      }}>
        {children}
      </OnboardingProgressContext.Provider>
    );
  }
  if (phase === "loading") return <View style={[styles.screen, { alignItems: "center", justifyContent: "center", gap: 18 }]}>
    <Text accessibilityRole="header" style={styles.title}>KOINO</Text>
    <ActivityIndicator accessibilityLabel={w("Opening KOINO", "Öppnar KOINO")} color={colors.ink} />
  </View>;
  if (phase === "setup" && draft) return <RecoveryKeySetup
    recoveryKey={draft.recoveryKey}
    confirmation={savedCode}
    onConfirmation={setSavedCode}
    busy={busy}
    error={error}
    onConfirm={() => void work(async (isCurrent) => {
      if (!isCurrent()) return;
      await confirmAccount(draft);
      if (!isCurrent()) return;
      setDraft(undefined); setSavedCode(""); await finish();
    })}
    onSignOut={() => void work(async () => { await signOut(auth); })}
  />;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{phase === "migrating" ? w("Encrypting your history", "Krypterar din historik") : w("Protect your KOINO account", "Skydda ditt KOINO-konto")}</Text>
    {phase === "recovery" && user ? <>
      <Text style={styles.body}>{w("Unlock with your recovery code, or approve this device from an existing device under Encryption & devices. Resetting your login password does not recover encrypted history.", "Lås upp med återställningskoden, eller godkänn enheten från en befintlig enhet under Kryptering och enheter. En återställning av inloggningslösenordet återställer inte krypterad historik.")}</Text>
      <TextInput accessibilityLabel={w("Recovery code", "Återställningskod")} secureTextEntry autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} style={styles.input} />
      <Button label={w("Recover content", "Återställ innehåll")} disabled={busy || !code} onPress={() => void work(async (isCurrent) => {
        if (!isCurrent()) return;
        await recoverAccount(user.uid, code);
        if (isCurrent()) { setCode(""); await finish(); }
      })} />
      <Button label={w("Request device approval", "Begär godkännande av enheten")} disabled={busy} onPress={() => void work(async (isCurrent) => {
        if (!isCurrent()) return;
        const next = await requestDeviceApproval(user.uid);
        if (isCurrent()) setFingerprint(next);
      })} />
      {fingerprint ? <Text selectable style={styles.body}>{w("Compare this fingerprint on your existing device:", "Jämför detta fingeravtryck på din befintliga enhet:")} {fingerprint}</Text> : null}
      <Button label={w("Check approval", "Kontrollera godkännande")} disabled={busy} onPress={() => void work(async (isCurrent) => {
        if (!isCurrent()) return;
        const result = await unlockExisting(user.uid);
        if (!isCurrent()) return;
        if (result !== "ready") throw new Error(w("This device is still waiting for approval.", "Enheten väntar fortfarande på godkännande."));
        await finish();
      })} />
    </> : null}
    {phase === "migrating" ? <><ActivityIndicator color={colors.ink} /><Text style={styles.body}>{w("Encrypting your existing history. Keep the app open; interrupted migrations resume safely.", "Krypterar din befintliga historik. Håll appen öppen; avbrutna migreringar kan återupptas.")}</Text>{progress ? <Text style={styles.body}>{progress}</Text> : null}</> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {phase === "error" || (phase === "migrating" && error) ? <Button label={w("Retry", "Försök igen")} disabled={busy} onPress={() => void work(async (isCurrent) => {
      if (!user || !isCurrent()) return;
      const result = await unlockExisting(user.uid);
      if (!isCurrent()) return;
      if (result === "ready") await finish();
      else if (result === "recovery") setPhase("recovery");
      else await showSetup(user.uid, isCurrent);
    })} /> : null}
    {user ? <Button label={w("Sign out", "Logga ut")} disabled={busy} onPress={() => void work(async () => { await signOut(auth); })} /> : null}
  </ScrollView>;
}

export function EncryptionSettings() {
  const w = useWords();
  const { state } = useKoino();
  const [devices, setDevices] = useState<Record<string, PublicIdentity>>({});
  const [members, setMembers] = useState<Record<string, PublicIdentity>>({});
  const [departures, setDepartures] = useState<Record<string, boolean>>({});
  const [registered, setRegistered] = useState<Account["devices"]>({});
  const [revocation, setRevocation] = useState<{ id: string; vault: Vault }>();
  const [codeConfirmation, setCodeConfirmation] = useState("");
  const [groupLocked, setGroupLocked] = useState(false);
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState("");
  const group = state.groups.find((item) => item.id === state.currentGroupId && item.ownerId === state.currentUserId);
  const uid = state.currentUserId;
  useEffect(() => uid ? listenRaw(`e2eeDeviceRequests/${uid}`, (value) => setDevices((value as Record<string, PublicIdentity>) ?? {})) : undefined, [uid]);
  useEffect(() => uid ? listenRaw(`e2eeAccounts/${uid}/devices`, (value) => setRegistered((value as Account["devices"]) ?? {})) : undefined, [uid]);
  useEffect(() => {
    setMembers({}); setDepartures({});
    if (!group) return;
    const joins = listenRaw(`e2eeJoinRequests/${group.id}`, (value) => setMembers((value as Record<string, PublicIdentity>) ?? {}));
    const leaves = listenRaw(`e2eeDepartures/${group.id}`, (value) => setDepartures((value as Record<string, boolean>) ?? {}));
    const locks = listenRaw(`e2eeGroupLocks/${group.id}`, (value) => setGroupLocked(value === true));
    return () => { joins(); leaves(); locks(); };
  }, [group?.id]);
  async function work(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true); setError("");
    try { await action(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : w("Encryption operation failed.", "Krypteringsåtgärden misslyckades.")); }
    finally { working.current = false; setBusy(false); }
  }
  function declineRequest(memberId: string) {
    if (!group || !uid || auth.currentUser?.uid !== uid || working.current) return;
    const generation = sessionGeneration();
    confirmAction({
      title: w("Decline access request?", "Avslå åtkomstförfrågan?"),
      message: w("This person will see that the request was declined and will not receive access.", "Personen får se att förfrågan avslogs och får ingen åtkomst."),
      confirmText: w("Decline request", "Avslå förfrågan"),
      cancelText: w("Cancel", "Avbryt"),
      destructive: true,
      onConfirm: () => {
        if (auth.currentUser?.uid !== uid || sessionGeneration() !== generation) return;
        void work(async () => {
          try { await rejectGroupJoinRequest(group.id, memberId); }
          catch { throw new Error(w("Couldn’t decline the request. Check the latest requests and try again.", "Det gick inte att avslå förfrågan. Kontrollera de senaste förfrågningarna och försök igen.")); }
        });
      },
    });
  }
  const requestCard = (id: string, identity: PublicIdentity, kind: "device" | "member") => <View key={`${kind}:${id}`} style={styles.card}>
    <Text style={styles.body}>{kind === "device" ? w("Device approval request", "Begäran om enhetsgodkännande") : w("Community access request", "Begäran om tillgång till gemenskapen")}</Text>
    <Text selectable style={styles.body}>{crypto.fingerprint(identity.signingPublicKey)}</Text>
    <Text style={styles.body}>{w("Compare the fingerprint with the person or device through a trusted channel, then enter it below.", "Jämför fingeravtrycket med personen eller enheten via en betrodd kanal och skriv det nedan.")}</Text>
    <TextInput accessibilityLabel={w("Verified fingerprint", "Verifierat fingeravtryck")} style={styles.input} autoCapitalize="none" autoCorrect={false} value={fingerprints[`${kind}:${id}`] ?? ""} onChangeText={(value) => setFingerprints((current) => ({ ...current, [`${kind}:${id}`]: value }))} />
    <Button label={kind === "device" ? w("Approve device", "Godkänn enheten") : w("Approve full history access", "Godkänn tillgång till hela historiken")} disabled={busy || !fingerprints[`${kind}:${id}`]} onPress={() => void work(async () => {
      if (kind === "device") await approveDevice(id, fingerprints[`${kind}:${id}`]);
      else if (group) await approveGroupMember(group.id, id, fingerprints[`${kind}:${id}`], (name) => {
        const membership = { id: `member_${crypto.randomKey()}`, userId: id, groupId: group.id, role: "member", userName: name, createdAt: new Date().toISOString() };
        return { membership: encodeAt(`groupMembers/${group.id}/${id}`, membership), userMembership: encodeAt(`userGroups/${id}/${group.id}`, membership) };
      });
    })} />
    {kind === "member" && group && !state.memberships.some((member) => member.groupId === group.id && member.userId === id)
      ? <Button disabled={busy} label={w("Decline request", "Avslå förfrågan")} onPress={() => declineRequest(id)} />
      : null}
  </View>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Button label={w("Back", "Tillbaka")} onPress={() => router.back()} />
    <Text style={styles.title}>{w("Encryption & devices", "Kryptering och enheter")}</Text>
    <Text style={styles.body}>{w("Personal and community content is encrypted on your devices. Account identity, membership, delivery routing, and payment records remain available to the services that need them.", "Personligt innehåll och gemenskapsinnehåll krypteras på dina enheter. Kontoidentitet, medlemskap, leveransinformation och betalningsuppgifter är tillgängliga för tjänsterna som behöver dem.")}</Text>
    <Text selectable style={styles.body}>{w("Your identity fingerprint:", "Ditt identitetsfingeravtryck:")} {crypto.fingerprint(session().vault.identity.signingPublicKey)}</Text>
    <Text style={styles.body}>{w("Keep your recovery code safe. Without an authorized device or that code, encrypted history cannot be recovered.", "Förvara återställningskoden säkert. Utan en godkänd enhet eller koden kan krypterad historik inte återställas.")}</Text>
    {Object.entries(devices).map(([id, identity]) => requestCard(id, identity, "device"))}
    {Object.entries(registered).filter(([, device]) => device.active).map(([id, device]) => <View key={id} style={styles.card}>
      <Text style={styles.body}>{id === session().device.id ? w("This device", "Denna enhet") : w("Authorized device", "Godkänd enhet")}</Text>
      <Text selectable style={styles.body}>{crypto.fingerprint(device.signingPublicKey)}</Text>
      {id !== session().device.id ? <Button label={w("Revoke device access", "Återkalla enhetens åtkomst")} disabled={busy} onPress={() => void work(async () => { setRevocation({ id, vault: await draftRevocation(id) }); setCodeConfirmation(""); })} /> : null}
    </View>)}
    {revocation ? <View style={styles.card}>
      <Text style={styles.body}>{w("Save this replacement recovery code. Revocation rotates your private keys and pauses communities until their owners approve the updated identity. The old code will stop working.", "Spara den nya återställningskoden. Återkallandet byter dina privata nycklar och pausar gemenskaper tills ägarna godkänner den nya identiteten. Den gamla koden slutar fungera.")}</Text>
      <Text selectable style={styles.body}>{revocation.vault.recoveryKey}</Text>
      <TextInput accessibilityLabel={w("Last six characters of the new recovery code", "De sista sex tecknen i den nya återställningskoden")} autoCapitalize="none" autoCorrect={false} style={styles.input} value={codeConfirmation} onChangeText={setCodeConfirmation} />
      <Button label={w("Confirm device revocation", "Bekräfta återkallandet")} disabled={busy || codeConfirmation !== revocation.vault.recoveryKey.slice(-6)} onPress={() => void work(async () => { const name = state.users.find((user) => user.id === uid)?.name ?? "KOINO member"; await revokeDevice(revocation.id, revocation.vault, name); setRevocation(undefined); setCodeConfirmation(""); })} />
      <Button label={w("Cancel", "Avbryt")} onPress={() => setRevocation(undefined)} disabled={busy} />
    </View> : null}
    {Object.entries(members).map(([id, identity]) => requestCard(id, identity, "member"))}
    {group && (Object.keys(departures).length || groupLocked) ? <Button disabled={busy} label={w("Rotate community encryption keys", "Byt gemenskapens krypteringsnycklar")} onPress={() => void work(() => rotateGroup(group.id))} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}
