import { HttpsError, onCall } from "firebase-functions/v2/https";

import { SupportPaymentRepository } from "./payment-repository";
import { getStripeServer, stripeSecretKey } from "./stripe";
import {
  PaymentValidationError,
  requireAuthenticatedUser,
  validateSupportPaymentRequest,
} from "./payment-validation";

const supportPaymentRepository = new SupportPaymentRepository();

export const createSupportPayment = onCall(
  {
    region: "europe-west1",
    secrets: [stripeSecretKey],
  },
  async (request) => {
    try {
      const userId = requireAuthenticatedUser(request.auth);
      const input = validateSupportPaymentRequest(request.data);

      // Initializes a sandbox-only server SDK instance. This pass intentionally
      // makes no Stripe API request and creates no PaymentIntent or charge.
      getStripeServer();

      const payment = await supportPaymentRepository.create({
        ...input,
        userId,
        provider: "stripe",
      });

      return {
        id: payment.id,
        paymentAttemptId: payment.paymentAttemptId,
        status: payment.status,
      };
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw new HttpsError(error.code, error.message);
      }

      throw error;
    }
  },
);

export {
  PAYMENT_CURRENCIES,
  PAYMENT_FREQUENCIES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  canTransitionPaymentStatus,
} from "./payment-types";
