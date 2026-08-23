import {
  authenticatedUser,
  donationStatusForCustomer,
  findCustomer,
  jsonResponse,
  optionsResponse,
  safeErrorResponse,
  stripeClient,
} from "../lib/donation-shared.mjs";

const emptyDonationStatus = {
  hasCompletedDonation: false,
  hasSubscriptionHistory: false,
  hasManageableSubscription: false,
};

export default async function donationStatus(request) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const user = await authenticatedUser(request);
    const stripe = stripeClient();
    const customer = await findCustomer(stripe, user);
    if (!customer) return jsonResponse(emptyDonationStatus);
    return jsonResponse(await donationStatusForCustomer(stripe, customer.id, user.uid));
  } catch (error) {
    return safeErrorResponse(error);
  }
}
