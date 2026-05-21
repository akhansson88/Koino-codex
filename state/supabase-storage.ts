const supabaseUrl = "https://prumjueusdyqnwwovpen.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBydW1qdWV1c2R5cW53d292cGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwMTEzMzIsImV4cCI6MjA1MjU4NzMzMn0.O9DuG9qUeYtfe2Y8e0ykOdg6qoeTqT8bI_i7SwLBh50";

export const roomImagesBucket = "room-images";
export const userAvatarsBucket = "user-avatars";

function encodedPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function storageError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return new Error(parsed.message || parsed.error || `Supabase Storage request failed with ${response.status}.`);
  } catch {
    return new Error(body || `Supabase Storage request failed with ${response.status}.`);
  }
}

function storageHeaders(extra?: Record<string, string>) {
  return {
    apikey: supabaseAnonKey,
    authorization: `Bearer ${supabaseAnonKey}`,
    ...extra,
  };
}

function publicUrl(bucket: string, path: string) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath(path)}`;
}

async function uploadStorageImage(bucket: string, path: string, body: ArrayBuffer) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath(path)}`, {
    body,
    headers: storageHeaders({
      "cache-control": "max-age=3600",
      "content-type": "image/webp",
      "x-upsert": "false",
    }),
    method: "POST",
  });

  if (!response.ok) {
    throw await storageError(response);
  }
}

async function deleteStorageImage(bucket: string, path: string) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
    body: JSON.stringify({ prefixes: [path] }),
    headers: storageHeaders({
      "content-type": "application/json",
    }),
    method: "DELETE",
  });

  if (!response.ok) {
    throw await storageError(response);
  }
}

export function roomImagePublicUrl(path: string) {
  return publicUrl(roomImagesBucket, path);
}

export function userAvatarPublicUrl(path: string) {
  return publicUrl(userAvatarsBucket, path);
}

export async function uploadRoomImage(path: string, body: ArrayBuffer) {
  await uploadStorageImage(roomImagesBucket, path, body);
}

export async function uploadUserAvatar(path: string, body: ArrayBuffer) {
  await uploadStorageImage(userAvatarsBucket, path, body);
}

export async function deleteRoomImage(path: string) {
  await deleteStorageImage(roomImagesBucket, path);
}

export async function deleteUserAvatar(path: string) {
  await deleteStorageImage(userAvatarsBucket, path);
}
