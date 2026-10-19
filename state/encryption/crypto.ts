import type sodium from "react-native-libsodium";

export type Sodium = typeof sodium;
export type EncryptedRecord = {
  v: 1;
  keyId: string;
  nonce: string;
  ciphertext: string;
  signer: string;
  signature: string;
  wrappedKey?: string;
  context?: string;
};
export type Identity = { publicKey: string; privateKey: string; signingPublicKey: string; signingPrivateKey: string };

// Keep cryptography separate from native storage and Firebase so it can be
// checked against the same libsodium implementation on desktop and devices.
export function createCrypto(sodium: Sodium) {
  const encode = (bytes: Uint8Array) => sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
  const decode = (value: string) => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
  const randomKey = () => encode(sodium.randombytes_buf(32));
  // Keep the existing English collation used by signed records. Constructing
  // an ICU collator for every localeCompare call is very expensive on Android.
  const compareKeys = new Intl.Collator("en").compare;
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => compareKeys(a, b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
    return JSON.stringify(value);
  };
  const fingerprint = (publicKey: string) => sodium.to_hex(sodium.crypto_generichash(20, decode(publicKey), null)).match(/.{1,8}/g)!.join(" ");
  const signature = (value: unknown, privateKey: string) => encode(sodium.crypto_sign_detached(canonical(value), decode(privateKey)));
  const verify = (value: unknown, signed: string, publicKey: string) => {
    try { return sodium.crypto_sign_verify_detached(decode(signed), canonical(value), decode(publicKey)); }
    catch { return false; }
  };
  function identity(): Identity {
    const box = sodium.crypto_box_keypair();
    const signing = sodium.crypto_sign_keypair();
    return { publicKey: encode(box.publicKey), privateKey: encode(box.privateKey), signingPublicKey: encode(signing.publicKey), signingPrivateKey: encode(signing.privateKey) };
  }
  function encrypt(value: unknown, path: string, keyId: string, key: string, signer: Identity, wrappedKey?: string, context?: string): EncryptedRecord {
    const nonce = encode(sodium.randombytes_buf(24));
    const header = { v: 1 as const, keyId, nonce, signer: signer.signingPublicKey, ...(wrappedKey ? { wrappedKey } : {}), ...(context ? { context } : {}) };
    const ciphertext = encode(sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(JSON.stringify(value), canonical({ path, ...header }), null, decode(nonce), decode(key)));
    return { ...header, ciphertext, signature: signature({ path, ...header, ciphertext }, signer.signingPrivateKey) };
  }
  function decrypt(value: EncryptedRecord, path: string, key: string, trustedSigners: ReadonlySet<string>): unknown {
    const { signature: signed, ...header } = value;
    if (value.v !== 1 || !trustedSigners.has(value.signer) || !verify({ path, ...header }, signed, value.signer)) throw new Error("Encrypted content could not be authenticated.");
    try {
      const { ciphertext, ...aad } = header;
      return JSON.parse(sodium.to_string(sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, decode(ciphertext), canonical({ path, ...aad }), decode(value.nonce), decode(key))));
    } catch { throw new Error("Encrypted content could not be decrypted."); }
  }
  const seal = (value: unknown, publicKey: string) => encode(sodium.crypto_box_seal(JSON.stringify(value), decode(publicKey)));
  const unseal = (value: string, recipient: Identity) => JSON.parse(sodium.to_string(sodium.crypto_box_seal_open(decode(value), decode(recipient.publicKey), decode(recipient.privateKey)))) as unknown;
  const opaqueId = (value: string, key: string) => sodium.to_hex(sodium.crypto_generichash(24, value, decode(key)));
  return { encode, decode, randomKey, canonical, fingerprint, signature, verify, identity, encrypt, decrypt, seal, unseal, opaqueId };
}
