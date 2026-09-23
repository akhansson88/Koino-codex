import { type DonationFrequency } from "@/features/donation-api";
import { type DonationAmountOption } from "@/features/donation/types";

export const donationAmountOptions: { label: string; value: DonationAmountOption }[] = [
  { label: "50 kr", value: "50" },
  { label: "100 kr", value: "100" },
  { label: "200 kr", value: "200" },
  { label: "500 kr", value: "500" },
  { label: "Valfritt", value: "custom" },
];

export function parseFrequency(value: unknown): DonationFrequency {
  return value === "monthly" ? "monthly" : "one_time";
}

export function cleanAmount(value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

export function parseAmount(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const cleaned = cleanAmount(typeof raw === "string" ? raw : "");
  return cleaned || "100";
}

export function amountLine(amount: string, frequency: DonationFrequency) {
  return frequency === "monthly" ? `${amount} kr / månad` : `${amount} kr`;
}
