import { useEffect, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { router } from "expo-router";
import { auth } from "@/state/store/firebase";
import { useAppTranslation } from "@/ui/app-language";
import { colors } from "@/ui/theme";
import { useKoino } from "@/state/koino-store";
import { encodeAt } from "@/state/encryption/database";
import { crypto, session, identityRotationInProgress, lockSession, unlockExisting, draftAccount, confirmAccount, recoverAccount, requestDeviceApproval, approveDevice, approveGroupMember, rotateGroup, listenRaw, type Vault, type PublicIdentity, draftRevocation, revokeDevice, type Account } from "@/state/encryption/session";
import { migratePersonal, migrateOwnedGroups } from "@/state/encryption/migration";
import { clearEncryptedImages } from "@/state/supabase-storage";

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
function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

export function EncryptionBoundary({ children }: PropsWithChildren) {
  const w = useWords();
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<"loading" | "signedOut" | "setup" | "recovery" | "migrating" | "ready" | "error">("loading");
  const [draft, setDraft] = useState<Vault>();
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  async function finish() {
    const uid = auth.currentUser?.uid;
    setPhase("migrating");
    await migratePersonal(setProgress);
    await migrateOwnedGroups(setProgress);
    if (auth.currentUser?.uid === uid) setPhase("ready");
  }
  useEffect(() => {
    let revision = 0, active = true;
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      const request = ++revision;
      lockSession(); clearEncryptedImages();
      setUser(next); setDraft(undefined); setCode(""); setSavedCode(""); setFingerprint(""); setError("");
      if (!next) { setPhase("signedOut"); return; }
      setPhase("loading");
      void unlockExisting(next.uid).then(async (result) => {
        if (!active || revision !== request) return;
        if (result === "setup") { setDraft(await draftAccount(next.uid)); setPhase("setup"); }
        else if (result === "recovery") setPhase("recovery");
        else await finish();
      }).catch((problem: Error) => { if (active && revision === request) { setError(problem.message); setPhase("error"); } });
    });
    return () => { active = false; revision++; unsubscribe(); lockSession(); clearEncryptedImages(); };
  }, []);
  useEffect(() => {
    if (!user || phase !== "ready") return;
    const deviceId = session().device.id;
    let refreshing = false;
    return listenRaw(`e2eeAccounts/${user.uid}`, (value) => {
      const remote = value as Account | null;
      if (!remote?.devices[deviceId]?.active) { lockSession(); clearEncryptedImages(); setPhase("recovery"); return; }
      if (!refreshing && !identityRotationInProgress() && remote.signingPublicKey !== session().vault.identity.signingPublicKey) {
        refreshing = true; setPhase("loading"); clearEncryptedImages();
        void unlockExisting(user.uid).then(async (result) => { if (result === "ready") await finish(); else setPhase("recovery"); }).catch((problem: Error) => { setError(problem.message); setPhase("error"); });
      }
    });
  }, [user?.uid, phase]);
  async function work(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : w("Encryption could not be unlocked. Try again.", "Krypteringen kunde inte låsas upp. Försök igen.")); }
    finally { setBusy(false); }
  }
  if (phase === "signedOut" || phase === "ready") return children;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{w("Protect your KOINO account", "Skydda ditt KOINO-konto")}</Text>
    {phase === "setup" && draft ? <>
      <Text style={styles.body}>{w("Your personal and community content will be encrypted before upload. Save this recovery code somewhere private. It restores your content if you lose every device.", "Ditt personliga innehåll och innehållet i gemenskapen krypteras före uppladdning. Spara återställningskoden på en privat plats. Den återställer innehållet om du förlorar alla enheter.")}</Text>
      <View style={styles.card}><Text selectable style={styles.body}>{draft.recoveryKey}</Text></View>
      <Text style={styles.body}>{w("Enter the last six characters to confirm you saved the code.", "Skriv de sista sex tecknen för att bekräfta att du sparat koden.")}</Text>
      <TextInput accessibilityLabel={w("Recovery code confirmation", "Bekräftelse av återställningskod")} autoCapitalize="none" autoCorrect={false} value={savedCode} onChangeText={setSavedCode} style={styles.input} />
      <Button label={w("Enable encryption", "Aktivera kryptering")} disabled={busy || savedCode !== draft.recoveryKey.slice(-6)} onPress={() => void work(async () => { await confirmAccount(draft); setDraft(undefined); setSavedCode(""); await finish(); })} />
    </> : null}
    {phase === "recovery" && user ? <>
      <Text style={styles.body}>{w("Unlock with your recovery code, or approve this device from an existing device under Encryption & devices. Resetting your login password does not recover encrypted history.", "Lås upp med återställningskoden, eller godkänn enheten från en befintlig enhet under Kryptering och enheter. En återställning av inloggningslösenordet återställer inte krypterad historik.")}</Text>
      <TextInput accessibilityLabel={w("Recovery code", "Återställningskod")} secureTextEntry autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} style={styles.input} />
      <Button label={w("Recover content", "Återställ innehåll")} disabled={busy || !code} onPress={() => void work(async () => { await recoverAccount(user.uid, code); setCode(""); await finish(); })} />
      <Button label={w("Request device approval", "Begär godkännande av enheten")} disabled={busy} onPress={() => void work(async () => { setFingerprint(await requestDeviceApproval(user.uid)); })} />
      {fingerprint ? <Text selectable style={styles.body}>{w("Compare this fingerprint on your existing device:", "Jämför detta fingeravtryck på din befintliga enhet:")} {fingerprint}</Text> : null}
      <Button label={w("Check approval", "Kontrollera godkännande")} disabled={busy} onPress={() => void work(async () => { if (await unlockExisting(user.uid) !== "ready") throw new Error(w("This device is still waiting for approval.", "Enheten väntar fortfarande på godkännande.")); await finish(); })} />
    </> : null}
    {phase === "loading" || phase === "migrating" ? <><ActivityIndicator color={colors.ink} /><Text style={styles.body}>{phase === "migrating" ? w("Encrypting your existing history. Keep the app open; interrupted migrations resume safely.", "Krypterar din befintliga historik. Håll appen öppen; avbrutna migreringar kan återupptas.") : w("Unlocking encrypted content…", "Låser upp krypterat innehåll…")}</Text>{progress ? <Text style={styles.body}>{progress}</Text> : null}</> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {phase === "error" || (phase === "migrating" && error) ? <Button label={w("Retry", "Försök igen")} disabled={busy} onPress={() => void work(async () => { if (user && await unlockExisting(user.uid) === "ready") await finish(); else setPhase("recovery"); })} /> : null}
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
    setBusy(true); setError("");
    try { await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : "Encryption operation failed."); } finally { setBusy(false); }
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
