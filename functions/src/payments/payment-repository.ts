import { Timestamp } from "firebase-admin/firestore";

import { firestore } from "../firebase-admin";
import {
  canTransitionPaymentStatus,
  type NewSupportPayment,
  type PaymentStatus,
  type SupportPayment,
} from "./payment-types";

const SUPPORT_PAYMENTS_COLLECTION = "supportPayments";

export class SupportPaymentRepository {
  async create(input: NewSupportPayment): Promise<SupportPayment> {
    const paymentRef = firestore.collection(SUPPORT_PAYMENTS_COLLECTION).doc();
    const timestamp = Timestamp.now();
    const payment: SupportPayment = {
      id: paymentRef.id,
      paymentAttemptId: paymentRef.id,
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      frequency: input.frequency,
      status: "created",
      provider: input.provider,
      providerPaymentId: null,
      providerCustomerId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      confirmedAt: null,
      failedAt: null,
    };

    await paymentRef.create(payment);
    return payment;
  }

  async transitionStatus(paymentId: string, nextStatus: PaymentStatus): Promise<void> {
    const paymentRef = firestore.collection(SUPPORT_PAYMENTS_COLLECTION).doc(paymentId);

    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(paymentRef);
      if (!snapshot.exists) {
        throw new Error("Support payment does not exist.");
      }

      const payment = snapshot.data() as SupportPayment;
      if (!canTransitionPaymentStatus(payment.status, nextStatus)) {
        throw new Error(`Invalid payment status transition from ${payment.status} to ${nextStatus}.`);
      }

      const timestamp = Timestamp.now();
      transaction.update(paymentRef, {
        status: nextStatus,
        updatedAt: timestamp,
        ...(nextStatus === "succeeded" && payment.confirmedAt === null ? { confirmedAt: timestamp } : {}),
        ...(nextStatus === "failed" && payment.failedAt === null ? { failedAt: timestamp } : {}),
      });
    });
  }
}
