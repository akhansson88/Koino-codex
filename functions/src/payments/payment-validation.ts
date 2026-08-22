import {
  PAYMENT_CURRENCIES,
  PAYMENT_FREQUENCIES,
  PAYMENT_PROVIDERS,
  type PaymentCurrency,
  type PaymentFrequency,
  type PaymentProvider,
} from "./payment-types";

export const MIN_SUPPORT_PAYMENT_AMOUNT = 1_000;
export const MAX_SUPPORT_PAYMENT_AMOUNT = 10_000_000;

export type SupportPaymentRequest = {
  amount: number;
  currency: PaymentCurrency;
  frequency: PaymentFrequency;
};

type AuthContext = {
  uid?: unknown;
};

export class PaymentValidationError extends Error {
  constructor(
    readonly code: "unauthenticated" | "invalid-argument",
    message: string,
  ) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

export function requireAuthenticatedUser(auth: AuthContext | null | undefined): string {
  if (!auth || typeof auth.uid !== "string" || auth.uid.length === 0) {
    throw new PaymentValidationError("unauthenticated", "Firebase Authentication is required.");
  }

  return auth.uid;
}

export function validatePaymentProvider(value: unknown): PaymentProvider {
  if (!isAllowedValue(value, PAYMENT_PROVIDERS)) {
    throw new PaymentValidationError("invalid-argument", "Unsupported payment provider.");
  }

  return value;
}

export function validateSupportPaymentRequest(value: unknown): SupportPaymentRequest {
  if (!isRecord(value)) {
    throw new PaymentValidationError("invalid-argument", "Payment request must be an object.");
  }

  const allowedFields = new Set(["amount", "currency", "frequency"]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new PaymentValidationError("invalid-argument", "Payment request contains unsupported fields.");
  }

  const amount = value.amount;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount)) {
    throw new PaymentValidationError("invalid-argument", "Amount must be an integer in minor currency units.");
  }

  if (amount < MIN_SUPPORT_PAYMENT_AMOUNT || amount > MAX_SUPPORT_PAYMENT_AMOUNT) {
    throw new PaymentValidationError(
      "invalid-argument",
      `Amount must be between ${MIN_SUPPORT_PAYMENT_AMOUNT} and ${MAX_SUPPORT_PAYMENT_AMOUNT} minor units.`,
    );
  }

  if (!isAllowedValue(value.currency, PAYMENT_CURRENCIES)) {
    throw new PaymentValidationError("invalid-argument", "Unsupported payment currency.");
  }

  if (!isAllowedValue(value.frequency, PAYMENT_FREQUENCIES)) {
    throw new PaymentValidationError("invalid-argument", "Unsupported payment frequency.");
  }

  return {
    amount,
    currency: value.currency,
    frequency: value.frequency,
  };
}
