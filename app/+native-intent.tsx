import { parseJoinPayload } from "@/state/join-qr";

/**
 * The invite QR and the HTTPS invite page both use `join?code=…`. On Android
 * the custom scheme arrives as `koino://join?code=…`, where `join` is the URL
 * host rather than a path; Expo Router would otherwise show "Unmatched Route".
 * Rewrite it to the real `/join` route before routing.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const code = parseJoinPayload(path);
    return code ? `/join?code=${encodeURIComponent(code)}` : path;
  } catch {
    return path;
  }
}
