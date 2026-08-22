import {
  authenticatedUser,
  jsonResponse,
  optionsResponse,
  requestBody,
  safeErrorResponse,
  stripeClient,
} from "../lib/donation-shared.mjs";

export default async function donationVerify(request) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const [user, body] = await Promise.all([authenticatedUser(request), requestBody(request)]);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!/^cs_(?:test_|live_)[A-Za-z0-9]+$/.test(sessionId)) {
      return jsonResponse({ error: "Invalid Checkout session" }, 400);
    }
    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== user.uid) return jsonResponse({ error: "Checkout session not found" }, 404);
    const amountSek = Number(session.metadata?.amount_sek);
    const frequency = session.metadata?.frequency;
    const paid = session.status === "complete" && session.payment_status === "paid";
    return jsonResponse({
      paid,
      amountSek: Number.isSafeInteger(amountSek) ? amountSek : Math.round((session.amount_total || 0) / 100),
      frequency: frequency === "monthly" ? "monthly" : "one_time",
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
    });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
