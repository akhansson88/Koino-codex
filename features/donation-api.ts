import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

export type DonationFrequency = "one_time" | "monthly";
export type DonationStatus = {
  hasCompletedDonation: boolean;
  hasSubscriptionHistory: boolean;
  hasManageableSubscription: boolean;
};

type CheckoutResult = { checkoutUrl: string };
type PortalResult = { portalUrl: string };
export type DonationVerification = {
  paid: boolean;
  amountSek: number;
  frequency: DonationFrequency;
  customerId: string | null;
};

type DonationStatusCacheEntry = { expiresAt: number; value: DonationStatus };

const donationStatusCache = new Map<string, DonationStatusCacheEntry>();
const donationStatusRequests = new Map<string, Promise<DonationStatus>>();
const donationStatusCacheMs = 2 * 60 * 1000;

// Public API address, not a Stripe secret. Expo Go does not require a local .env.
const defaultDonationApiOrigin = "https://koino-community.netlify.app";

function endpoint(path: string) {
  const origin = process.env.EXPO_PUBLIC_DONATION_API_ORIGIN?.trim() || defaultDonationApiOrigin;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Betaltjänstens adress är felaktigt konfigurerad. Kontakta KOINO.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Betaltjänstens adress är felaktigt konfigurerad. Kontakta KOINO.");
  }
  return `${url.origin}${path}`;
}

async function openDonationBrowser(url: string) {
  await WebBrowser.openBrowserAsync(
    url,
    Platform.OS === "android"
      ? {
          // Keep Stripe's Chrome Custom Tab in KOINO's task. Expo's Android default
          // creates a separate task, which can leave edge-to-edge window insets stale
          // when the custom tab is dismissed and the app becomes active again.
          createTask: false,
        }
      : {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        },
  );
}

async function donationRequest<T>(path: string, token: string | null, body: unknown, fallbackMessage = "Betalningen kunde inte startas. Försök igen om en stund."): Promise<T> {
  if (!token) throw new Error("Logga in igen för att fortsätta med gåvan.");
  // Keep configuration errors distinct from connectivity failures.
  const requestUrl = endpoint(path);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Kunde inte nå betaltjänsten. Kontrollera anslutningen och försök igen.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? `: ${payload.error}` : "";
    console.warn(`Donation request failed (${response.status})${detail}`);
    throw new Error(response.status === 401 ? "Din inloggning har gått ut. Logga in igen och försök." : fallbackMessage);
  }
  return payload as T;
}

export async function startDonationCheckout(
  token: string | null,
  amountSek: number,
  frequency: DonationFrequency,
) {
  const result = await donationRequest<CheckoutResult>("/api/donations/checkout", token, {
    amountSek,
    frequency,
    platform: "native",
  });
  if (!result.checkoutUrl?.startsWith("https://checkout.stripe.com/")) {
    throw new Error("Betaltjänsten returnerade en ogiltig adress.");
  }
  await openDonationBrowser(result.checkoutUrl);
}

export async function verifyDonation(token: string | null, sessionId: string) {
  return donationRequest<DonationVerification>("/api/donations/verify", token, { sessionId });
}

export async function getDonationStatus(token: string | null, userId: string, force = false) {
  const cached = donationStatusCache.get(userId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = donationStatusRequests.get(userId);
  if (pending) return pending;

  const request = donationRequest<DonationStatus>(
    "/api/donations/status",
    token,
    {},
    "Kunde inte hämta ditt givande. Försök igen.",
  );
  donationStatusRequests.set(userId, request);
  try {
    const value = await request;
    donationStatusCache.set(userId, { expiresAt: Date.now() + donationStatusCacheMs, value });
    return value;
  } finally {
    donationStatusRequests.delete(userId);
  }
}

export function primeDonationStatus(userId: string, frequency: DonationFrequency) {
  donationStatusCache.set(userId, {
    expiresAt: Date.now() + donationStatusCacheMs,
    value: {
      hasCompletedDonation: true,
      hasSubscriptionHistory: frequency === "monthly",
      hasManageableSubscription: frequency === "monthly",
    },
  });
}

export async function openDonationPortal(token: string | null) {
  const result = await donationRequest<PortalResult>("/api/donations/portal", token, {
    platform: "native",
  }, "Kunde inte öppna gåvohanteringen. Försök igen.");
  if (!result.portalUrl?.startsWith("https://billing.stripe.com/")) {
    throw new Error("Betaltjänsten returnerade en ogiltig adress.");
  }
  await openDonationBrowser(result.portalUrl);
}
