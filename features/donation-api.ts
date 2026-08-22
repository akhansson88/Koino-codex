import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

export type DonationFrequency = "one_time" | "monthly";

type CheckoutResult = { checkoutUrl: string };
type PortalResult = { portalUrl: string };
export type DonationVerification = {
  paid: boolean;
  amountSek: number;
  frequency: DonationFrequency;
  customerId: string | null;
};

function endpoint(path: string) {
  if (Platform.OS === "web") return path;
  const origin = process.env.EXPO_PUBLIC_DONATION_API_ORIGIN?.trim().replace(/\/$/, "");
  if (!origin) throw new Error("Betalning är inte konfigurerad för appen ännu.");
  return `${origin}${path}`;
}

async function donationRequest<T>(path: string, token: string | null, body: unknown): Promise<T> {
  if (!token) throw new Error("Logga in igen för att fortsätta med gåvan.");
  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Kunde inte nå betaltjänsten. Kontrollera anslutningen och försök igen.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Din inloggning har gått ut. Logga in igen och försök." : "Betalningen kunde inte startas. Försök igen om en stund.");
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
    platform: Platform.OS === "web" ? "web" : "native",
  });
  if (!result.checkoutUrl?.startsWith("https://checkout.stripe.com/")) {
    throw new Error("Betaltjänsten returnerade en ogiltig adress.");
  }
  if (Platform.OS === "web") {
    window.location.assign(result.checkoutUrl);
    return;
  }
  await WebBrowser.openBrowserAsync(result.checkoutUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}

export async function verifyDonation(token: string | null, sessionId: string) {
  return donationRequest<DonationVerification>("/api/donations/verify", token, { sessionId });
}

export async function openDonationPortal(token: string | null) {
  const result = await donationRequest<PortalResult>("/api/donations/portal", token, {
    platform: Platform.OS === "web" ? "web" : "native",
  });
  if (!result.portalUrl?.startsWith("https://billing.stripe.com/")) {
    throw new Error("Betaltjänsten returnerade en ogiltig adress.");
  }
  if (Platform.OS === "web") {
    window.location.assign(result.portalUrl);
    return;
  }
  await WebBrowser.openBrowserAsync(result.portalUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
