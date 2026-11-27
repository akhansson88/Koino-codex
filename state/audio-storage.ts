import * as FileSystem from "expo-file-system/legacy";
import { httpsCallable } from "firebase/functions";

import {
  AUDIO_MAX_BYTES,
  AUDIO_MIME,
  newAudioClipId,
  type AudioScope,
} from "@/state/audio";
import { functions } from "@/state/store/firebase";
import type { AudioClip } from "@/state/types";

type CreateUploadRequest = {
  operation: "createUpload";
  scope: AudioScope;
  groupId?: string;
  clipId: string;
  bytes: number;
};

type CreateUploadResponse = {
  path: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
};

type FinalizeUploadRequest = { operation: "finalizeUpload"; path: string };
type FinalizeUploadResponse = { bytes: number; contentType: string };

type DownloadRequest = { operation: "createDownload"; path: string };
type DownloadResponse = { url: string; expiresAt: string };

type DeleteRequest = { operation: "delete"; path: string };
type CopyRequest = { operation: "copyForShare"; sourcePath: string; groupId: string; clipId: string };
type CopyPrivateRequest = { operation: "copyForPrivate"; sourcePath: string; clipId: string };
type CopyResponse = { path: string };

type AudioRequest =
  | CreateUploadRequest
  | FinalizeUploadRequest
  | DownloadRequest
  | DeleteRequest
  | CopyRequest
  | CopyPrivateRequest;

const audioCallable = httpsCallable<AudioRequest, unknown>(functions, "koinoAudio");
const downloadTickets = new Map<string, { url: string; expiresAt: number }>();
const cacheMutations = new Map<string, Promise<string>>();

function audioCacheDirectory() {
  if (!FileSystem.cacheDirectory) throw new Error("Audio cache is unavailable.");
  return `${FileSystem.cacheDirectory}koino-audio/`;
}

function cachePathFor(clip: AudioClip) {
  return `${audioCacheDirectory()}${clip.id}.m4a`;
}

async function ensureCacheDirectory() {
  const directory = audioCacheDirectory();
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}

async function call<T>(request: AudioRequest): Promise<T> {
  const result = await audioCallable(request);
  return result.data as T;
}

async function localFileSize(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new Error("The recording is missing.");
  const size = info.size;
  if (!Number.isFinite(size) || size <= 0) throw new Error("The recording is empty.");
  if (size > AUDIO_MAX_BYTES) throw new Error("The recording is too large.");
  return size;
}

export type AudioDraft = {
  id: string;
  localUri: string;
  durationMs: number;
  peaks: string;
};

export async function uploadAudioDraft(
  draft: AudioDraft,
  scope: AudioScope,
  groupId?: string,
): Promise<AudioClip> {
  const bytes = await localFileSize(draft.localUri);
  let lastError: unknown;
  let ticket: CreateUploadResponse | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      ticket = await call<CreateUploadResponse>({
        operation: "createUpload",
        scope,
        ...(groupId ? { groupId } : {}),
        clipId: draft.id,
        bytes,
      });
      const result = await FileSystem.uploadAsync(ticket.uploadUrl, draft.localUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: ticket.headers,
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed with ${result.status}.`);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      ticket = undefined;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1_000 : 4_000));
    }
  }

  if (lastError || !ticket) throw lastError instanceof Error ? lastError : new Error("The recording could not be uploaded.");

  const finalized = await call<FinalizeUploadResponse>({ operation: "finalizeUpload", path: ticket.path });
  if (finalized.contentType !== AUDIO_MIME || finalized.bytes > AUDIO_MAX_BYTES) {
    await call({ operation: "delete", path: ticket.path }).catch(() => undefined);
    throw new Error("The uploaded recording is not valid.");
  }

  return {
    id: draft.id,
    path: ticket.path,
    durationMs: Math.round(draft.durationMs),
    bytes: finalized.bytes,
    mime: AUDIO_MIME,
    peaks: draft.peaks,
    createdAt: new Date().toISOString(),
  };
}

export async function copyAudioForShare(clip: AudioClip, groupId: string): Promise<AudioClip> {
  const clipId = newAudioClipId();
  const copied = await call<CopyResponse>({
    operation: "copyForShare",
    sourcePath: clip.path,
    groupId,
    clipId,
  });
  return { ...clip, id: clipId, path: copied.path, createdAt: new Date().toISOString() };
}

export async function copyAudioForPrivate(clip: AudioClip): Promise<AudioClip> {
  const clipId = newAudioClipId();
  const copied = await call<CopyResponse>({
    operation: "copyForPrivate",
    sourcePath: clip.path,
    clipId,
  });
  return { ...clip, id: clipId, path: copied.path, createdAt: new Date().toISOString() };
}

export async function deleteAudioClip(clip: AudioClip | undefined) {
  if (!clip) return;
  await call({ operation: "delete", path: clip.path }).catch(() => undefined);
}

export async function clearAudioCache() {
  downloadTickets.clear();
  cacheMutations.clear();
  try {
    const directory = audioCacheDirectory();
    const info = await FileSystem.getInfoAsync(directory);
    if (info.exists) await FileSystem.deleteAsync(directory, { idempotent: true });
  } catch {
    // A cache that cannot be cleared is never allowed to block sign-out.
  }
}

async function signedDownloadUrl(path: string) {
  const cached = downloadTickets.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const ticket = await call<DownloadResponse>({ operation: "createDownload", path });
  const expiresAt = Date.parse(ticket.expiresAt);
  downloadTickets.set(path, {
    url: ticket.url,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 10 * 60_000,
  });
  return ticket.url;
}

async function cacheClip(clip: AudioClip) {
  const existing = cacheMutations.get(clip.id);
  if (existing) return existing;

  const promise = (async () => {
    await ensureCacheDirectory();
    const destination = cachePathFor(clip);
    const info = await FileSystem.getInfoAsync(destination);
    if (info.exists && !info.isDirectory && info.size > 0) return destination;
    const url = await signedDownloadUrl(clip.path);
    const result = await FileSystem.downloadAsync(url, destination);
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
      throw new Error("The recording could not be downloaded.");
    }
    return destination;
  })();

  cacheMutations.set(clip.id, promise);
  try {
    return await promise;
  } finally {
    cacheMutations.delete(clip.id);
  }
}

/** Downloads the clip once and returns a local file URI for instant, offline-safe playback. */
export async function prepareAudioClip(clip: AudioClip) {
  return cacheClip(clip);
}

