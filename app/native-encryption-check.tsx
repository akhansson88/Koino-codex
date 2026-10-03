import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { Redirect } from "expo-router";
import sodium from "react-native-libsodium";
import { createCrypto } from "@/state/encryption/crypto";
import storage from "@/state/encryption/local-storage";

// Development-only native smoke test. Uses synthetic content and no account.
export default function NativeEncryptionCheck() {
  const [result, setResult] = useState("Running native encryption checks…");
  useEffect(() => {
    if (!__DEV__) return;
    let active = true;
    void (async () => {
      const crypto = createCrypto(sodium), identity = crypto.identity(), recipient = crypto.identity(), key = crypto.randomKey();
      const path = "native-check/content", value = { text: "Synthetic encryption check: Åäö 🙏", mood: 3 };
      const record = crypto.encrypt(value, path, "native:1", key, identity);
      const restored = crypto.decrypt(record, path, key, new Set([identity.signingPublicKey]));
      if (crypto.canonical(restored) !== crypto.canonical(value)) throw new Error("Native encryption round trip failed");
      let rejected = false;
      try { crypto.decrypt({ ...record, ciphertext: `${record.ciphertext.slice(0, -2)}AA` }, path, key, new Set([identity.signingPublicKey])); } catch { rejected = true; }
      if (!rejected) throw new Error("Native tampering was accepted");
      if ((crypto.unseal(crypto.seal({ key }, recipient.publicKey), recipient) as { key: string }).key !== key) throw new Error("Native sealed grant failed");
      const marker = "e2ee.native-smoke-test", previous = await storage.getItem(marker);
      await storage.setItem(marker, "synthetic-sqlcipher-persistence-check");
      if (await storage.getItem(marker) !== "synthetic-sqlcipher-persistence-check") throw new Error("Encrypted local storage failed");
      const summary = `PASS\nNative authenticated encryption\nTampering rejection\nSigned sealed key grants\nSQLCipher + SecureStore persistence\nRestart persistence: ${previous ? "PASS" : "restart to verify"}\nFingerprint: ${crypto.fingerprint(identity.signingPublicKey)}`;
      console.info("[native-encryption-check]", summary);
      if (active) setResult(summary);
    })().catch((error: Error) => { console.error("[native-encryption-check]", error.message); if (active) setResult(`FAIL: ${error.message}`); });
    return () => { active = false; };
  }, []);
  if (!__DEV__) return <Redirect href="/" />;
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 70, gap: 24 }}><Text style={{ fontSize: 24, fontWeight: "700" }}>Native encryption check</Text><Text selectable style={{ fontSize: 18, lineHeight: 30 }}>{result}</Text></ScrollView>;
}
