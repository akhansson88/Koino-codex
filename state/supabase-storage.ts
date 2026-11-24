export const roomImagesBucket = "room-images";
export const userAvatarsBucket = "user-avatars";
export type ImageEncryption = { key: string; keyId: string; signer: string };
export type UploadedImage = { url: string; encryptedUri?: string; encryption?: ImageEncryption };
const images = new Map<string, Promise<string>>();
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function clearEncryptedImages() { images.clear(); }
export function roomImagePublicUrl(path: string) { return `koino-image://room-images/${path}`; }
export function userAvatarPublicUrl(path: string) { return `koino-image://user-avatars/${path}`; }

function base64(bytes: Uint8Array) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index], second = bytes[index + 1], third = bytes[index + 2];
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    output += second === undefined ? "=" : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    output += third === undefined ? "=" : alphabet[third & 63];
  }
  return output;
}

// Images live with their record as a data URL, so any signed-in device can show
// them after a reinstall without a vault or a storage credential.
async function upload(_bucket: string, _path: string, body: ArrayBuffer): Promise<UploadedImage> {
  if (body.byteLength > 1_500_000) throw new Error("Choose an image smaller than 1.5 MB.");
  const url = `data:image/webp;base64,${base64(new Uint8Array(body))}`;
  return { url, encryptedUri: url };
}

export const uploadRoomImage = (path: string, body: ArrayBuffer) => upload(roomImagesBucket, path, body);
export const uploadUserAvatar = (path: string, body: ArrayBuffer) => upload(userAvatarsBucket, path, body);
export const deleteRoomImage = async (_path: string) => undefined;
export const deleteUserAvatar = async (_path: string) => undefined;

// Older records referenced encrypted objects that only the retired vault could
// fetch. Hide those references instead of rendering a broken placeholder.
export async function resolveEncryptedImages(value: unknown): Promise<unknown> {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return Promise.all(value.map((child) => resolveEncryptedImages(child)));
  const object = value as Record<string, unknown>;
  if (typeof object.url === "string" && object.url.startsWith("koino-encrypted://")) {
    return { ...object, encryptedUri: object.url, url: undefined };
  }
  return Object.fromEntries(await Promise.all(Object.entries(object).map(async ([key, child]) => [key, await resolveEncryptedImages(child)])));
}
