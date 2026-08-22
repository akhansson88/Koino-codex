import type { Timestamp } from "firebase-admin/firestore";

export const PAYMENT_CURRENCIES = ["SEK"] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export const PAYMENT_FREQUENCIES = ["once", "monthly"] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

export const PAYMENT_STATUSES = ["created", "processing", "succeeded", "failed", "cancelled", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["stripe", "apple_iap", "external"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export type SupportPayment = {
  id: string;
  paymentAttemptId: string;
  userId: string;
  amount: number;
  currency: PaymentCurrency;
  frequency: PaymentFrequency;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  providerCustomerId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt: Timestamp | null;
  failedAt: Timestamp | null;
};

export type NewSupportPayment = Pick<SupportPayment, "userId" | "amount" | "currency" | "frequency" | "provider">;

const PAYMENT_STATUS_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  created: ["processing", "succeeded", "failed", "cancelled"],
  processing: ["succeeded", "failed", "cancelled"],
  succeeded: ["refunded"],
  failed: [],
  cancelled: [],
  refunded: [],
};

export function canTransitionPaymentStatus(current: PaymentStatus, next: PaymentStatus): boolean {
  return current === next || PAYMENT_STATUS_TRANSITIONS[current].includes(next);
}
