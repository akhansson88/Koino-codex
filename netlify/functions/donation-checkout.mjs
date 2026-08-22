import {
  appOrigin,
  authenticatedUser,
  findOrCreateCustomer,
  jsonResponse,
  optionsResponse,
  parseDonation,
  requestBody,
  safeErrorResponse,
  stripeClient,
} from "../lib/donation-shared.mjs";

export default async function donationCheckout(request) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const [user, body] = await Promise.all([authenticatedUser(request), requestBody(request)]);
    const { amountSek, frequency, platform } = parseDonation(body);
    const stripe = stripeClient();
    const customer = await findOrCreateCustomer(stripe, user);
    const origin = appOrigin();
    const nativeReturn = `${origin}/.netlify/functions/donation-return`;
    const successUrl = platform === "native"
      ? `${nativeReturn}?result=success&session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/donation-thank-you?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = platform === "native"
      ? `${nativeReturn}?result=cancel&amount=${amountSek}&frequency=${frequency}`
      : `${origin}/donation-confirm?amount=${amountSek}&frequency=${frequency}&cancelled=1`;
    const metadata = { firebase_uid: user.uid, frequency, amount_sek: String(amountSek) };
    const recurring = frequency === "monthly" ? { interval: "month" } : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: frequency === "monthly" ? "subscription" : "payment",
      customer: customer.id,
      client_reference_id: user.uid,
      integration_identifier: "koino-donations-qmtxavpr",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "sek",
          unit_amount: amountSek * 100,
          product_data: { name: frequency === "monthly" ? "Månadsvis gåva till KOINO" : "Gåva till KOINO" },
          ...(recurring ? { recurring } : {}),
        },
      }],
      metadata,
      ...(frequency === "monthly"
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata }, invoice_creation: { enabled: true } }),
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: "sv",
    }, {
      idempotencyKey: `koino-checkout-${user.uid}-${frequency}-${amountSek}-${Math.floor(Date.now() / 30000)}`,
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return jsonResponse({ checkoutUrl: session.url });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
