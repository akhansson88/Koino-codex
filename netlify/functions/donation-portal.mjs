import {
  appOrigin,
  authenticatedUser,
  findOrCreateCustomer,
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
    const customer = await findOrCreateCustomer(stripe, user);
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
