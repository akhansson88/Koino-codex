import {
  appOrigin,
  authenticatedUser,
  donationStatusForCustomer,
  findCustomer,
  jsonResponse,
  optionsResponse,
  parsePlatform,
  requestBody,
  safeErrorResponse,
  stripeClient,
} from "../lib/donation-shared.mjs";

export default async function donationPortal(request) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const [user, body] = await Promise.all([authenticatedUser(request), requestBody(request)]);
    const platform = parsePlatform(body?.platform);
    const stripe = stripeClient();
    const customer = await findCustomer(stripe, user);
    if (!customer) return jsonResponse({ error: "Donation account not found" }, 404);
    const status = await donationStatusForCustomer(stripe, customer.id, user.uid);
    if (!status.hasCompletedDonation) return jsonResponse({ error: "Completed donation not found" }, 404);
    const origin = appOrigin();
    const returnUrl = platform === "native"
      ? `${origin}/.netlify/functions/donation-return?result=portal`
      : `${origin}/me`;
    const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: returnUrl });
    return jsonResponse({ portalUrl: portal.url });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
