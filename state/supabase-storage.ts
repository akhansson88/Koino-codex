import { crypto, session, sessionGeneration, encryptedOperation } from "@/state/encryption/session";
import type { EncryptedRecord } from "@/state/encryption/crypto";
export const roomImagesBucket = "room-images";
export const userAvatarsBucket = "user-avatars";
export type ImageEncryption = { key: string; keyId: string; signer: string };
export type UploadedImage = { url: string; encryptedUri: string; encryption: ImageEncryption };
const images = new Map<string, Promise<string>>();
const diagnosticClock = () => globalThis.performance?.now?.() ?? Date.now();
export function clearEncryptedImages() { images.clear(); }
export function roomImagePublicUrl(path: string) { return `koino-encrypted://room-images/${path}`; }
export function userAvatarPublicUrl(path: string) { return `koino-encrypted://user-avatars/${path}`; }
async function upload(bucket: string, path: string, body: ArrayBuffer): Promise<UploadedImage> {
  if (body.byteLength > 2 * 1024 * 1024) throw new Error("Choose an image smaller than 2 MB.");
  const state = session();
  const key = crypto.randomKey(), keyId = `image:${crypto.randomKey()}`;
  const record = crypto.encrypt(crypto.encode(new Uint8Array(body)), `images/${bucket}/${path}`, keyId, key, state.device.identity);
  await encryptedOperation("imageUpload", { bucket, path, record });
  const url = `koino-encrypted://${bucket}/${path}`;
  return { url, encryptedUri: url, encryption: { key, keyId, signer: state.device.identity.signingPublicKey } };
}
export const uploadRoomImage = (path: string, body: ArrayBuffer) => upload(roomImagesBucket, path, body);
export const uploadUserAvatar = (path: string, body: ArrayBuffer) => upload(userAvatarsBucket, path, body);
export const deleteRoomImage = (path: string) => encryptedOperation("imageDelete", { bucket: roomImagesBucket, path });
export const deleteUserAvatar = (path: string) => encryptedOperation("imageDelete", { bucket: userAvatarsBucket, path });
export async function resolveEncryptedImages(value: unknown, groupId?: string): Promise<unknown> {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return Promise.all(value.map((child) => resolveEncryptedImages(child, groupId)));
  const object = value as Record<string, unknown>;
  if (typeof object.url === "string" && object.url.startsWith("koino-encrypted://")) {
    const url = object.url, [, bucket, path] = /^koino-encrypted:\/\/([^/]+)\/(.+)$/.exec(url) ?? [];
    const encryption = object.encryption as ImageEncryption | undefined;
    if (!bucket || !path || !encryption) throw new Error("Encrypted image metadata is incomplete.");
    const token = sessionGeneration(), cacheKey = `${token}:${url}:${encryption.keyId}`;
    let loading = images.get(cacheKey);
    if (!loading) {
      loading = (async () => {
        const { record } = await encryptedOperation<{ record: EncryptedRecord }>("imageDownload", { bucket, path, ...(groupId ? { groupId } : {}) });
        if (token !== sessionGeneration()) throw new Error("The image session changed.");
        if (record.keyId !== encryption.keyId || record.signer !== encryption.signer) throw new Error("Image identity could not be verified.");
        const decryptStarted = diagnosticClock();
        const image = crypto.decrypt(record, `images/${bucket}/${path}`, encryption.key, new Set([encryption.signer])) as string;
        const base64Started = diagnosticClock();
        const encoded = crypto.encode(crypto.decode(image));
        const standard = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encoded.length % 4) % 4);
        const completed = diagnosticClock();
        if (completed - decryptStarted > 50) console.info("[encryption] image decode", {
          imageType: bucket === userAvatarsBucket ? "avatar" : "room",
          ciphertextChars: record.ciphertext.length,
          decryptMs: Math.round(base64Started - decryptStarted),
          base64Ms: Math.round(completed - base64Started),
          elapsedMs: Math.round(completed - decryptStarted),
        });
        return `data:image/webp;base64,${standard}`;
      })().catch((error) => { images.delete(cacheKey); throw error; });
      images.set(cacheKey, loading);
    }
    try { return { ...object, encryptedUri: url, url: await loading }; }
    catch { return { ...object, encryptedUri: url, url: undefined }; }
  }
  return Object.fromEntries(await Promise.all(Object.entries(object).map(async ([key, child]) => [key, await resolveEncryptedImages(child, groupId)])));
}
