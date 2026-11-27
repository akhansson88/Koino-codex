// The QR carries only the community invite code, never a group id, name or
// member data. The HTTPS link is the one QR payload: it opens the app through
// Universal Links / App Links when installed, and otherwise reaches the
// invite page that offers the app and the code.
export const JOIN_LINK_PREFIX = "koino://join?code=";
export const JOIN_HTTPS_PREFIX = "https://koinolabs.com/join/";

const inviteCodePattern = /^[A-Za-z0-9_-]{3,160}$/;

export function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase();
}

export function joinQrPayload(code: string) {
  const normalized = normalizeInviteCode(code);
  if (!inviteCodePattern.test(normalized)) throw new Error("That is not a KOINO invite code.");
  return `${JOIN_HTTPS_PREFIX}?code=${encodeURIComponent(normalized)}`;
}

/** Read a code from a bare code, a koino:// link or the https join page. */
export function parseJoinPayload(raw: string | null | undefined): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;

  if (inviteCodePattern.test(value)) return normalizeInviteCode(value);

  let path = "";
  let query = "";
  const schemeMatch = /^koino:(?:\/\/)?([^?#]*)(?:\?([^#]*))?/i.exec(value);
  if (schemeMatch) {
    path = schemeMatch[1];
    query = schemeMatch[2] ?? "";
  } else {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
      path = url.pathname;
      query = url.search.replace(/^\?/, "");
    } catch {
      return undefined;
    }
  }

  const params = new URLSearchParams(query);
  let fromQuery: string | null = null;
  params.forEach((value, name) => {
    if (!fromQuery && name.toLowerCase() === "code") fromQuery = value;
  });
  if (fromQuery && inviteCodePattern.test((fromQuery as string).trim())) return normalizeInviteCode(fromQuery as string);

  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  // A bare code is only accepted from a path segment after the /join route,
  // never from the route word itself.
  if (segments.length >= 2 && last && inviteCodePattern.test(decodeURIComponent(last))) {
    return normalizeInviteCode(decodeURIComponent(last));
  }
  return undefined;
}
